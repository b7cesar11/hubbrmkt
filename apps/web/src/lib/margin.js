/**
 * margin.js — motor puro de cálculo de margem projetada.
 * Regra de produto: o cálculo operacional usa somente tarifas oficiais confirmadas.
 * Estimativas permanecem no banco para pesquisa/auditoria, mas não entram na margem.
 */

export function getListing(productId, platformId, listings, marketplaceAccountId = null) {
  const candidates = listings.filter(
    (listing) =>
      listing.product_id === productId &&
      listing.platform_id === platformId &&
      (!marketplaceAccountId || listing.marketplace_account_id === marketplaceAccountId)
  )

  if (marketplaceAccountId) return candidates[0]
  return candidates.find((listing) => listing.marketplace_account?.is_default) || candidates[0]
}

/** Retorna YYYY-MM-DD usando o calendário local do navegador, sem conversão UTC. */
export function localDateKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function normalizeText(value) {
  if (value == null) return null
  return String(value)
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
}

export function isOfficialFeeRule(rule) {
  // Compatibilidade com fixtures antigas dos testes; em produção as colunas existem.
  if (rule?.source_kind == null && rule?.confidence_status == null) return true
  return rule?.source_kind === 'official' && rule?.confidence_status === 'confirmed'
}

function ruleSpecificity(rule, category, listingType) {
  let score = 0
  if (rule.account_type !== null && rule.account_type !== undefined) score += 8
  if (rule.category !== null) score += normalizeText(rule.category) === normalizeText(category) ? 4 : -100
  if (rule.listing_type !== null) score += normalizeText(rule.listing_type) === normalizeText(listingType) ? 2 : -100
  return score
}

export function findApplicableRule(
  platformId,
  category,
  price,
  listingType,
  feeRules,
  asOf = new Date(),
  accountType = null,
) {
  const today = typeof asOf === 'string' ? asOf : localDateKey(asOf)

  return feeRules
    .filter((rule) => {
      if (rule.platform_id !== platformId) return false
      if (rule.account_type != null && normalizeText(rule.account_type) !== normalizeText(accountType)) return false
      if (rule.category !== null && normalizeText(rule.category) !== normalizeText(category)) return false
      if (rule.listing_type !== null && normalizeText(rule.listing_type) !== normalizeText(listingType)) return false
      if (rule.valid_from && today < rule.valid_from) return false
      if (rule.valid_to && today > rule.valid_to) return false

      const min = rule.price_min == null ? null : Number(rule.price_min)
      const max = rule.price_max == null ? null : Number(rule.price_max)
      if (min !== null && price < min) return false
      if (max !== null && price >= max) return false
      return true
    })
    .sort((a, b) => {
      const specificity = ruleSpecificity(b, category, listingType) - ruleSpecificity(a, category, listingType)
      if (specificity !== 0) return specificity
      const validFrom = String(b.valid_from || '').localeCompare(String(a.valid_from || ''))
      if (validFrom !== 0) return validFrom
      return String(b.created_at || '').localeCompare(String(a.created_at || ''))
    })[0]
}

export function getApplicablePromotions(platformId, category, promotions, asOf = new Date()) {
  const today = typeof asOf === 'string' ? asOf : localDateKey(asOf)
  return promotions.filter((promo) => {
    if (promo.platform_id !== platformId) return false
    if (promo.category !== null && normalizeText(promo.category) !== normalizeText(category)) return false
    return today >= promo.starts_at && today <= promo.ends_at
  })
}

export function getCalculationBasisAmount(component, listing) {
  const basis = component.calculation_basis || component.basis || 'sale_price'
  const candidates = {
    sale_price: listing.sale_price,
    seller_discount_price: listing.seller_discount_price,
    actual_paid: listing.actual_paid_amount,
    affiliate_base: listing.affiliate_commission_base,
    order_total: listing.order_total,
    shipping_amount: listing.shipping_amount,
  }
  const selected = Number(candidates[basis])
  return Number.isFinite(selected) ? selected : Number(listing.sale_price) || 0
}

export function calculateCostComponent(component, value, listing) {
  let amount
  if (component.calc_type === 'percentage') {
    amount = (getCalculationBasisAmount(component, listing) * Number(value || 0)) / 100
  } else {
    amount = Number(value || 0)
  }

  if (component.min_amount != null) amount = Math.max(amount, Number(component.min_amount))
  if (component.cap_amount != null) amount = Math.min(amount, Number(component.cap_amount))
  return amount
}

function evaluateRuleChargeCondition(charge, listing) {
  const condition = charge?.condition
  if (!condition) return { applies: true, warning: null }

  if (condition.program_key) {
    const value = listing.program_config?.[condition.program_key] ?? 'unknown'
    if (value === condition.equals) return { applies: true, warning: null }
    if (value === 'unknown' || value == null) {
      return {
        applies: charge.unknown_policy === 'apply',
        warning: charge.unknown_message || null,
      }
    }
    return { applies: false, warning: null }
  }

  return { applies: false, warning: null }
}

function validateOfficialRuleContext(rule, listing) {
  const config = rule?.calculation_config || {}
  const profile = listing.program_config || {}
  const salePrice = Number(listing.sale_price || 0)

  for (const requirement of config.required_profile_fields || []) {
    const value = profile[requirement.key]
    const allowed = Array.isArray(requirement.allowed) ? requirement.allowed : []
    if (value == null || value === 'unknown' || (allowed.length > 0 && !allowed.includes(value))) {
      return {
        status: 'configuracao_conta_pendente',
        reason: requirement.message || `Complete o campo ${requirement.key} no cadastro da conta.`,
        field: requirement.key,
      }
    }
  }

  const below = config.unsupported_below_price
  if (below?.threshold != null && salePrice < Number(below.threshold)) {
    return {
      status: 'taxa_oficial_incompleta',
      reason: below.message || 'A fonte oficial consultada não expõe fórmula completa para esta faixa.',
    }
  }

  const unsupportedExactPrices = Array.isArray(config.unsupported_exact_prices)
    ? config.unsupported_exact_prices.map(Number)
    : []
  if (unsupportedExactPrices.some((value) => Math.abs(value - salePrice) < 0.000001)) {
    return {
      status: 'taxa_oficial_incompleta',
      reason:
        config.unsupported_exact_prices_message ||
        'A fonte oficial não deixa explícito o enquadramento deste valor exato.',
    }
  }

  return null
}

/** Interpreta fórmulas declaradas em platform_fee_rules.calculation_config. */
export function calculateRuleCharges(rule, listing) {
  const config = rule?.calculation_config || {}
  const salePrice = Number(listing.sale_price || 0)
  let fixedFee = Number(rule?.fixed_fee || 0)
  let fixedFeeLabel = null
  const charges = []
  const warnings = []

  const fixedOverride = config.fixed_fee_override
  if (
    fixedOverride?.type === 'percentage_of_sale_price_below' &&
    Number.isFinite(Number(fixedOverride.threshold)) &&
    salePrice < Number(fixedOverride.threshold)
  ) {
    fixedFee = (salePrice * Number(fixedOverride.percentage || 0)) / 100
    fixedFeeLabel = fixedOverride.name || null
  }

  for (const charge of config.additional_charges || []) {
    const condition = evaluateRuleChargeCondition(charge, listing)
    if (condition.warning) warnings.push(condition.warning)
    if (!condition.applies) continue

    const amount = calculateCostComponent(
      {
        calc_type: charge.calc_type,
        basis: charge.basis || 'sale_price',
        min_amount: charge.min_amount,
        cap_amount: charge.cap_amount,
      },
      charge.value,
      listing,
    )

    if (amount <= 0) continue
    charges.push({
      code: charge.code || null,
      name: charge.name || 'Cobrança adicional da plataforma',
      amount,
      calcType: charge.calc_type,
      value: Number(charge.value || 0),
      calculationBasis: charge.basis || 'sale_price',
      capAmount: charge.cap_amount ?? null,
      minAmount: charge.min_amount ?? null,
      kind: 'platform',
    })
  }

  return {
    fixedFee,
    fixedFeeLabel,
    charges,
    chargesTotal: charges.reduce((sum, charge) => sum + charge.amount, 0),
    warnings,
  }
}

export function computeMargin(product, platformId, deps) {
  const {
    listings,
    feeRules,
    promotions,
    listingCostComponents,
    costComponents,
    liveFee = null,
    allowLiveFee = false,
    marketplaceAccountId = null,
    asOf = new Date(),
  } = deps

  const listing = getListing(product.id, platformId, listings, marketplaceAccountId)
  if (!listing) return { status: 'sem_preco' }

  const account = listing.marketplace_account || null
  const accountType = account?.document_type || listing.account_type || null
  const effectiveListing = {
    ...listing,
    program_config: {
      ...(account?.profile_config || {}),
      ...(listing.program_config || {}),
    },
  }

  const category = listing.platform_category_name || product.category
  const officialRules = feeRules.filter(isOfficialFeeRule)
  const staticRule = findApplicableRule(
    platformId,
    category,
    Number(listing.sale_price),
    listing.listing_type,
    officialRules,
    asOf,
    accountType,
  )

  // Integrações não fazem parte do fluxo comercial atual. Este caminho fica apenas
  // para diagnóstico explícito e nunca é ativado automaticamente pelo dashboard.
  const hasLiveFee =
    allowLiveFee && liveFee && Number.isFinite(Number(liveFee.commission_pct))

  const rule = hasLiveFee
    ? {
        ...(staticRule || {}),
        commission_pct: Number(liveFee.commission_pct),
        fixed_fee: Number(liveFee.fixed_fee || 0),
        source_kind: 'api',
        confidence_status: liveFee.confidence || 'account_specific',
        live_fee_source: liveFee.source,
        fetched_at: liveFee.fetched_at,
        exact: liveFee.exact ?? null,
        warning: liveFee.warning ?? null,
      }
    : staticRule

  if (!rule) {
    const platformOfficialRules = officialRules.filter((candidate) => candidate.platform_id === platformId)
    const requiresAccountType = platformOfficialRules.some((candidate) => candidate.account_type != null)
    return {
      status: 'sem_regra',
      reason:
        requiresAccountType && !accountType
          ? 'Complete o tipo da conta (CPF/CNPJ) antes de calcular.'
          : 'Não há uma regra oficial confirmada aplicável a este anúncio.',
      officialOnly: true,
    }
  }

  if (!hasLiveFee) {
    const contextIssue = validateOfficialRuleContext(rule, effectiveListing)
    if (contextIssue) return { ...contextIssue, officialOnly: true, rule }
  }

  const salePrice = Number(listing.sale_price)
  const commission = (salePrice * Number(rule.commission_pct || 0)) / 100
  const ruleCharges = calculateRuleCharges(rule, effectiveListing)
  const fixedFee = ruleCharges.fixedFee

  const applicablePromotions = getApplicablePromotions(platformId, category, promotions, asOf)
  const promoBenefits = []
  let commissionExemptionRemaining = commission

  applicablePromotions.forEach((promo) => {
    if (promo.benefit_type === 'commission_exemption') {
      const requested = promo.value_pct != null
        ? commission * (Number(promo.value_pct) / 100)
        : commission
      const reduction = Math.max(0, Math.min(requested, commissionExemptionRemaining))
      commissionExemptionRemaining -= reduction
      if (reduction > 0) promoBenefits.push({ name: 'Isenção de comissão (promoção)', amount: reduction })
    } else if (promo.benefit_type === 'shipping_subsidy' || promo.benefit_type === 'cashback') {
      const amount = promo.value_fixed != null
        ? Number(promo.value_fixed)
        : promo.value_pct != null
          ? (salePrice * Number(promo.value_pct)) / 100
          : 0
      if (amount > 0) {
        promoBenefits.push({
          name: promo.benefit_type === 'shipping_subsidy' ? 'Subsídio de frete (promoção)' : 'Cashback (promoção)',
          amount,
        })
      }
    }
  })
  const promoBenefitsTotal = promoBenefits.reduce((sum, benefit) => sum + benefit.amount, 0)

  const operationalCosts = listingCostComponents
    .filter((lcc) => lcc.product_listing_id === listing.id)
    .map((lcc) => {
      const component = costComponents.find((candidate) => candidate.id === lcc.cost_component_id)
      if (!component) return null
      const value = lcc.value_override ?? component.default_value
      const amount = calculateCostComponent(component, value, effectiveListing)
      return {
        name: component.name,
        amount,
        calcType: component.calc_type,
        value,
        calculationBasis: component.calculation_basis || 'sale_price',
        capAmount: component.cap_amount ?? null,
        minAmount: component.min_amount ?? null,
        kind: 'operational',
      }
    })
    .filter(Boolean)

  const operationalCostsTotal = operationalCosts.reduce((sum, cost) => sum + cost.amount, 0)
  const appliedCosts = [...ruleCharges.charges, ...operationalCosts]
  const additionalCostsTotal = ruleCharges.chargesTotal + operationalCostsTotal
  const costPrice = Number(product.cost_price || 0)
  const netMargin =
    salePrice -
    costPrice -
    commission -
    fixedFee -
    additionalCostsTotal +
    promoBenefitsTotal
  const marginPct = salePrice > 0 ? (netMargin / salePrice) * 100 : 0

  return {
    status: 'ok',
    calculationMode: hasLiveFee ? 'api_diagnostic' : 'official_rule',
    salePrice,
    commission,
    fixedFee,
    fixedFeeLabel: ruleCharges.fixedFeeLabel,
    platformCharges: ruleCharges.charges,
    platformChargesTotal: ruleCharges.chargesTotal,
    operationalCosts,
    operationalCostsTotal,
    calculationWarnings: [rule.warning, ...ruleCharges.warnings].filter(Boolean),
    appliedCosts,
    additionalCostsTotal,
    promoBenefits,
    promoBenefitsTotal,
    netMargin,
    marginPct,
    rule,
    marketplaceAccount: account,
    officialOnly: !hasLiveFee,
  }
}
