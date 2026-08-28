import { personAppliesToProduct } from './peopleCosts'

function numberOrZero(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function activeProductIds(products) {
  return products.filter((product) => product.active !== false).map((product) => String(product.id))
}

function selectedIdsForCost(cost, productMonthlyCosts, products) {
  const activeIds = new Set(activeProductIds(products))
  if (cost.applies_to_all_products) return [...activeIds]
  return productMonthlyCosts
    .filter((link) => String(link.monthly_cost_id) === String(cost.id))
    .map((link) => String(link.product_id))
    .filter((id) => activeIds.has(id))
}

/**
 * Distribui cada obrigação mensal igualmente entre os SKUs ativos aos quais ela
 * se aplica. O rateio é por SKU, nunca por anúncio/conta, evitando duplicar o
 * custo quando o mesmo produto é vendido em mais de um marketplace.
 */
export function allocateMonthlyCostsByProduct({
  products = [],
  people = [],
  productPeople = [],
  monthlyCosts = [],
  productMonthlyCosts = [],
} = {}) {
  const ids = activeProductIds(products)
  const allocation = new Map(
    ids.map((id) => [id, { team: 0, overhead: 0, paidTraffic: 0, total: 0, items: [] }]),
  )

  for (const person of people.filter((candidate) => candidate.active !== false)) {
    const applicableIds = ids.filter((productId) =>
      personAppliesToProduct(person, productId, productPeople),
    )
    const monthlyAmount = Math.max(0, numberOrZero(person.fixed_monthly_cost))
    if (monthlyAmount <= 0 || applicableIds.length === 0) continue
    const share = monthlyAmount / applicableIds.length
    for (const productId of applicableIds) {
      const row = allocation.get(productId)
      row.team += share
      row.total += share
      row.items.push({
        id: `person:${person.id}`,
        name: `${person.name} — ${person.role_title}`,
        category: 'team',
        monthlyAmount,
        productShare: share,
      })
    }
  }

  for (const cost of monthlyCosts.filter((candidate) => candidate.active !== false)) {
    const applicableIds = selectedIdsForCost(cost, productMonthlyCosts, products)
    const monthlyAmount = Math.max(0, numberOrZero(cost.monthly_amount))
    if (monthlyAmount <= 0 || applicableIds.length === 0) continue
    const share = monthlyAmount / applicableIds.length
    const bucket = cost.category === 'paid_traffic' ? 'paidTraffic' : 'overhead'
    for (const productId of applicableIds) {
      const row = allocation.get(productId)
      row[bucket] += share
      row.total += share
      row.items.push({
        id: `monthly:${cost.id}`,
        name: cost.name,
        category: cost.category,
        monthlyAmount,
        productShare: share,
      })
    }
  }

  return allocation
}

function roundedGoal(value) {
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.ceil(value)
}

/**
 * Converte margem de contribuição unitária + obrigações mensais em metas.
 * O usuário não informa projeção: o próprio motor devolve ponto de equilíbrio
 * e uma meta saudável para a margem líquida desejada.
 */
export function calculateProductPredictability(margin, allocation, targetNetMarginPct = 10) {
  if (margin?.status !== 'ok') return { status: margin?.status || 'sem_margem' }

  const revenuePerUnit = Math.max(0, numberOrZero(margin.grossRevenue))
  const contributionPerUnit = numberOrZero(margin.netMargin)
  const monthlyFixed = Math.max(0, numberOrZero(allocation?.total))
  const paidTrafficBudget = Math.max(0, numberOrZero(allocation?.paidTraffic))
  const targetRate = Math.max(0, numberOrZero(targetNetMarginPct)) / 100

  if (revenuePerUnit <= 0 || contributionPerUnit <= 0) {
    return {
      status: 'sem_contribuicao',
      revenuePerUnit,
      contributionPerUnit,
      monthlyFixed,
      paidTrafficBudget,
    }
  }

  const breakEvenUnits = monthlyFixed > 0 ? roundedGoal(monthlyFixed / contributionPerUnit) : 0
  const targetContributionAvailable = contributionPerUnit - revenuePerUnit * targetRate
  const targetUnits = monthlyFixed > 0
    ? roundedGoal(monthlyFixed / targetContributionAvailable)
    : 0
  const breakEvenRevenue = breakEvenUnits * revenuePerUnit
  const targetRevenue = targetUnits == null ? null : targetUnits * revenuePerUnit
  const targetProfit = targetUnits == null
    ? null
    : contributionPerUnit * targetUnits - monthlyFixed

  return {
    status: targetUnits == null ? 'meta_inviavel' : 'ok',
    revenuePerUnit,
    contributionPerUnit,
    contributionPct: revenuePerUnit > 0 ? (contributionPerUnit / revenuePerUnit) * 100 : 0,
    monthlyFixed,
    teamMonthly: Math.max(0, numberOrZero(allocation?.team)),
    overheadMonthly: Math.max(0, numberOrZero(allocation?.overhead)),
    paidTrafficBudget,
    breakEvenUnits,
    breakEvenRevenue,
    fixedCostPerUnitAtBreakEven:
      breakEvenUnits > 0 ? monthlyFixed / breakEvenUnits : 0,
    targetNetMarginPct: targetRate * 100,
    targetUnits,
    targetRevenue,
    targetProfit,
    fixedCostPerUnitAtTarget: targetUnits > 0 ? monthlyFixed / targetUnits : 0,
    projectedNetPerUnitAtTarget:
      targetUnits > 0 ? contributionPerUnit - monthlyFixed / targetUnits : contributionPerUnit,
    breakEvenRoas:
      paidTrafficBudget > 0 ? breakEvenRevenue / paidTrafficBudget : null,
    targetRoas:
      paidTrafficBudget > 0 && targetRevenue != null ? targetRevenue / paidTrafficBudget : null,
    trafficCostPerUnitAtTarget:
      paidTrafficBudget > 0 && targetUnits > 0 ? paidTrafficBudget / targetUnits : 0,
    items: allocation?.items || [],
  }
}
