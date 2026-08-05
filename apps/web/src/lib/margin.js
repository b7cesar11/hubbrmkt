/**
 * margin.js — Módulo puro de cálculo de margens.
 * Sem dependências de React ou Supabase; totalmente testável com Vitest.
 */

/**
 * Retorna o listing de um produto em uma plataforma específica.
 * @param {string} productId
 * @param {string} platformId
 * @param {Array} listings
 * @returns {object|undefined}
 */
export function getListing(productId, platformId, listings) {
  return listings.find((l) => l.product_id === productId && l.platform_id === platformId)
}

/**
 * Encontra a regra de taxa aplicável a um listing.
 * Lógica preservada identicamente ao Dashboard original.
 *
 * @param {string} platformId
 * @param {string} category
 * @param {number} price
 * @param {string|null} listingType
 * @param {Array} feeRules
 * @returns {object|undefined}
 */
export function findApplicableRule(platformId, category, price, listingType, feeRules) {
  const today = new Date()
  return feeRules.find((rule) => {
    if (rule.platform_id !== platformId) return false
    if (rule.category !== null && rule.category !== category) return false
    if (rule.listing_type !== null && rule.listing_type !== listingType) return false

    const validFrom = new Date(rule.valid_from)
    const validTo = rule.valid_to ? new Date(rule.valid_to) : null
    if (today < validFrom) return false
    if (validTo && today > validTo) return false

    if (rule.price_min !== null && price < rule.price_min) return false
    if (rule.price_max !== null && price >= rule.price_max) return false

    return true
  })
}

/**
 * Retorna promoções ativas para uma plataforma/categoria na data atual.
 *
 * @param {string} platformId
 * @param {string} category
 * @param {Array} promotions
 * @returns {Array}
 */
export function getApplicablePromotions(platformId, category, promotions) {
  const today = new Date().toISOString().slice(0, 10)
  return promotions.filter((promo) => {
    if (promo.platform_id !== platformId) return false
    if (promo.category !== null && promo.category !== category) return false
    return today >= promo.starts_at && today <= promo.ends_at
  })
}

/**
 * Calcula a margem líquida de um produto em uma plataforma.
 * Lógica preservada identicamente ao Dashboard original.
 *
 * @param {object} product         - { id, cost_price, category, ... }
 * @param {string} platformId
 * @param {object} deps            - { listings, feeRules, promotions, listingCostComponents, costComponents }
 * @returns {object}               - { status, salePrice, commission, fixedFee, appliedCosts,
 *                                     additionalCostsTotal, promoBenefits, promoBenefitsTotal,
 *                                     netMargin, marginPct, rule }
 */
export function computeMargin(product, platformId, deps) {
  const { listings, feeRules, promotions, listingCostComponents, costComponents } = deps

  const listing = getListing(product.id, platformId, listings)
  if (!listing) return { status: 'sem_preco' }

  const rule = findApplicableRule(
    platformId,
    product.category,
    listing.sale_price,
    listing.listing_type,
    feeRules
  )
  if (!rule) return { status: 'sem_regra' }

  let commission = (listing.sale_price * rule.commission_pct) / 100
  const fixedFee = rule.fixed_fee || 0

  const applicablePromotions = getApplicablePromotions(platformId, product.category, promotions)
  const promoBenefits = []
  applicablePromotions.forEach((promo) => {
    if (promo.benefit_type === 'commission_exemption') {
      const reduction = promo.value_pct ? commission * (promo.value_pct / 100) : commission
      promoBenefits.push({ name: 'Isenção de comissão (promoção)', amount: reduction })
    } else if (promo.benefit_type === 'shipping_subsidy') {
      const amount =
        promo.value_fixed || (promo.value_pct ? (listing.sale_price * promo.value_pct) / 100 : 0)
      if (amount > 0) promoBenefits.push({ name: 'Subsídio de frete (promoção)', amount })
    } else if (promo.benefit_type === 'cashback') {
      const amount =
        promo.value_fixed || (promo.value_pct ? (listing.sale_price * promo.value_pct) / 100 : 0)
      if (amount > 0) promoBenefits.push({ name: 'Cashback (promoção)', amount })
    }
    // 'other' fica só informativo — não entra em cálculo automático
  })
  const promoBenefitsTotal = promoBenefits.reduce((sum, b) => sum + b.amount, 0)

  const appliedCosts = listingCostComponents
    .filter((lcc) => lcc.product_listing_id === listing.id)
    .map((lcc) => {
      const component = costComponents.find((c) => c.id === lcc.cost_component_id)
      if (!component) return null
      const value = lcc.value_override ?? component.default_value
      const amount =
        component.calc_type === 'percentage' ? (listing.sale_price * value) / 100 : value
      return { name: component.name, amount, calcType: component.calc_type, value }
    })
    .filter(Boolean)

  const additionalCostsTotal = appliedCosts.reduce((sum, c) => sum + c.amount, 0)

  const netMargin =
    listing.sale_price -
    product.cost_price -
    commission -
    fixedFee -
    additionalCostsTotal +
    promoBenefitsTotal
  const marginPct = (netMargin / listing.sale_price) * 100

  return {
    status: 'ok',
    salePrice: listing.sale_price,
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
