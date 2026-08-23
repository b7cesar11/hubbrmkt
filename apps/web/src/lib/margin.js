/**
 * margin.js — motor puro de cálculo de margem projetada.
 * Sem dependências de React/Supabase; testável com Vitest.
 */

export function getListing(productId, platformId, listings) {
  return listings.find((l) => l.product_id === productId && l.platform_id === platformId)
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

function ruleSpecificity(rule, category, listingType) {
  let score = 0
  if (rule.category !== null) score += normalizeText(rule.category) === normalizeText(category) ? 4 : -100
  if (rule.listing_type !== null) score += normalizeText(rule.listing_type) === normalizeText(listingType) ? 2 : -100
  return score
}

/**
 * Resolve a regra aplicável de forma determinística.
 * Prioridade: categoria específica > fallback; listing_type específico > fallback;
 * em empate, regra mais recente (valid_from/created_at) vence.
 */
export function findApplicableRule(
  platformId,
  category,
  price,
  listingType,
  feeRules,
  asOf = new Date(),
) {
  const today = typeof asOf === 'string' ? asOf : localDateKey(asOf)

  return feeRules
    .filter((rule) => {
      if (rule.platform_id !== platformId) return false
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
  const basis = component.calculation_basis || 'sale_price'
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

/**
 * Calcula margem projetada.
 * Uma liveFee passada explicitamente (ex.: prévia do cadastro) tem precedência.
 * Na operação normal, o hook de dados pode anexar `listing.live_fee_override`
 * quando encontrar um cache vigente e exato para aquele anúncio.
 */
export function computeMargin(product, platformId, deps) {
  const {
    listings,
    feeRules,
    promotions,
    listingCostComponents,
    costComponents,
    liveFee = null,
    asOf = new Date(),
  } = deps

  const listing = getListing(product.id, platformId, listings)
  if (!listing) return { status: 'sem_preco' }

  const effectiveLiveFee = liveFee || listing.live_fee_override || null
  const category = listing.platform_category_name || product.category
  const staticRule = findApplicableRule(
    platformId,
    category,
    Number(listing.sale_price),
    listing.listing_type,
    feeRules,
    asOf,
  )

  const hasLiveFee = effectiveLiveFee && Number.isFinite(Number(effectiveLiveFee.commission_pct))
  const rule = hasLiveFee
    ? {
        ...(staticRule || {}),
        commission_pct: Number(effectiveLiveFee.commission_pct),
        fixed_fee: Number(effectiveLiveFee.fixed_fee || 0),
        source_kind: 'api',
        confidence_status: effectiveLiveFee.confidence || 'account_specific',
        live_fee_source: effectiveLiveFee.source,
        fetched_at: effectiveLiveFee.fetched_at,
        exact: effectiveLiveFee.exact ?? null,
        warning: effectiveLiveFee.warning ?? null,
      }
    : staticRule

  if (!rule) return { status: 'sem_regra' }

  const salePrice = Number(listing.sale_price)
  const commission = (salePrice * Number(rule.commission_pct || 0)) / 100
  const fixedFee = Number(rule.fixed_fee || 0)

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
  const promoBenefitsTotal = promoBenefits.reduce((sum, b) => sum + b.amount, 0)

  const appliedCosts = listingCostComponents
    .filter((lcc) => lcc.product_listing_id === listing.id)
    .map((lcc) => {
      const component = costComponents.find((c) => c.id === lcc.cost_component_id)
      if (!component) return null
      const value = lcc.value_override ?? component.default_value
      const amount = calculateCostComponent(component, value, listing)
      return {
        name: component.name,
        amount,
        calcType: component.calc_type,
        value,
        calculationBasis: component.calculation_basis || 'sale_price',
        capAmount: component.cap_amount ?? null,
        minAmount: component.min_amount ?? null,
      }
    })
    .filter(Boolean)

  const additionalCostsTotal = appliedCosts.reduce((sum, c) => sum + c.amount, 0)
  const costPrice = Number(product.cost_price || 0)
  const netMargin = salePrice - costPrice - commission - fixedFee - additionalCostsTotal + promoBenefitsTotal
  const marginPct = salePrice > 0 ? (netMargin / salePrice) * 100 : 0

  return {
    status: 'ok',
    calculationMode: hasLiveFee
      ? rule.exact === false
        ? 'api_partial'
        : 'api_live_or_cache'
      : 'static_rule',
    salePrice,
    commission,
    fixedFee,
    appliedCosts,
    additionalCostsTotal,
    promoBenefits,
    promoBenefitsTotal,
    netMargin,
    marginPct,
    rule,
  }
}
