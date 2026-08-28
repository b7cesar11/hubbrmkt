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

function summarizeScope(rows, targetNetMarginPct = 10, allocationOverride = null) {
  const validRows = rows.filter((row) => row.margin?.status === 'ok')
  const allocation = allocationOverride || rows.reduce(
    (total, row) => ({
      team: total.team + numberOrZero(row.allocation?.team),
      overhead: total.overhead + numberOrZero(row.allocation?.overhead),
      paidTraffic: total.paidTraffic + numberOrZero(row.allocation?.paidTraffic),
      total: total.total + numberOrZero(row.allocation?.total),
    }),
    { team: 0, overhead: 0, paidTraffic: 0, total: 0 },
  )

  if (validRows.length === 0) {
    return {
      status: 'sem_margem',
      listingCount: rows.length,
      validListingCount: 0,
      pendingCount: rows.length,
      ...allocation,
    }
  }

  const revenuePerOrder = validRows.reduce(
    (sum, row) => sum + numberOrZero(row.margin.grossRevenue), 0,
  ) / validRows.length
  const contributionPerOrder = validRows.reduce(
    (sum, row) => sum + numberOrZero(row.margin.netMargin), 0,
  ) / validRows.length
  const targetRate = Math.max(0, numberOrZero(targetNetMarginPct)) / 100
  const targetContributionAvailable = contributionPerOrder - revenuePerOrder * targetRate
  const breakEvenOrders = contributionPerOrder > 0
    ? roundedGoal(allocation.total / contributionPerOrder) || 0
    : null
  const targetOrders = targetContributionAvailable > 0
    ? roundedGoal(allocation.total / targetContributionAvailable) || 0
    : null
  const breakEvenRevenue = breakEvenOrders == null ? null : breakEvenOrders * revenuePerOrder
  const targetRevenue = targetOrders == null ? null : targetOrders * revenuePerOrder

  return {
    status: contributionPerOrder <= 0
      ? 'sem_contribuicao'
      : targetOrders == null ? 'meta_inviavel' : 'ok',
    listingCount: rows.length,
    validListingCount: validRows.length,
    pendingCount: rows.length - validRows.length,
    revenuePerOrder,
    contributionPerOrder,
    contributionPct: revenuePerOrder > 0 ? (contributionPerOrder / revenuePerOrder) * 100 : 0,
    monthlyFixed: allocation.total,
    teamMonthly: allocation.team,
    overheadMonthly: allocation.overhead,
    paidTrafficBudget: allocation.paidTraffic,
    breakEvenOrders,
    breakEvenRevenue,
    targetNetMarginPct: targetRate * 100,
    targetOrders,
    targetRevenue,
    targetProfit: targetOrders == null
      ? null
      : contributionPerOrder * targetOrders - allocation.total,
    breakEvenRoas:
      allocation.paidTraffic > 0 && breakEvenRevenue != null
        ? breakEvenRevenue / allocation.paidTraffic : null,
    targetRoas:
      allocation.paidTraffic > 0 && targetRevenue != null
        ? targetRevenue / allocation.paidTraffic : null,
  }
}

/**
 * Consolida a previsibilidade em três níveis: negócio, plataforma e conta.
 * Como não há histórico de vendas, a meta usa um pedido médio equivalente,
 * calculado pela média simples dos anúncios válidos. O custo de cada SKU é
 * dividido entre seus anúncios ativos para não ser duplicado entre contas.
 */
export function buildBusinessPredictability({
  products = [],
  listings = [],
  platforms = [],
  marketplaceAccounts = [],
  allocationByProduct = new Map(),
  calculateMargin,
  targetNetMarginPct = 10,
} = {}) {
  const activeProducts = new Map(
    products.filter((product) => product.active !== false)
      .map((product) => [String(product.id), product]),
  )
  const activeListings = listings.filter(
    (listing) => listing.active !== false && activeProducts.has(String(listing.product_id)),
  )
  const listingCountByProduct = activeListings.reduce((counts, listing) => {
    const id = String(listing.product_id)
    counts.set(id, (counts.get(id) || 0) + 1)
    return counts
  }, new Map())

  const rows = activeListings.map((listing) => {
    const productId = String(listing.product_id)
    const productAllocation = allocationByProduct.get(productId) || {}
    const divisor = listingCountByProduct.get(productId) || 1
    return {
      listing,
      product: activeProducts.get(productId),
      margin: calculateMargin(activeProducts.get(productId), listing),
      allocation: {
        team: numberOrZero(productAllocation.team) / divisor,
        overhead: numberOrZero(productAllocation.overhead) / divisor,
        paidTraffic: numberOrZero(productAllocation.paidTraffic) / divisor,
        total: numberOrZero(productAllocation.total) / divisor,
      },
    }
  })

  const generalAllocation = [...allocationByProduct.values()].reduce(
    (total, allocation) => ({
      team: total.team + numberOrZero(allocation.team),
      overhead: total.overhead + numberOrZero(allocation.overhead),
      paidTraffic: total.paidTraffic + numberOrZero(allocation.paidTraffic),
      total: total.total + numberOrZero(allocation.total),
    }),
    { team: 0, overhead: 0, paidTraffic: 0, total: 0 },
  )
  const allocatedToListings = rows.reduce(
    (sum, row) => sum + numberOrZero(row.allocation.total), 0,
  )

  const platformRows = platforms.map((platform) => {
    const scoped = rows.filter((row) => String(row.listing.platform_id) === String(platform.id))
    return {
      id: platform.id,
      name: platform.name,
      ...summarizeScope(scoped, targetNetMarginPct),
    }
  }).filter((row) => row.listingCount > 0)

  const accountRows = marketplaceAccounts.map((account) => {
    const scoped = rows.filter(
      (row) => String(row.listing.marketplace_account_id) === String(account.id),
    )
    const platform = platforms.find(
      (candidate) => String(candidate.id) === String(account.platform_id),
    )
    return {
      id: account.id,
      name: account.name,
      platformId: account.platform_id,
      platformName: platform?.name || 'Marketplace',
      ...summarizeScope(scoped, targetNetMarginPct),
    }
  }).filter((row) => row.listingCount > 0)

  return {
    general: {
      ...summarizeScope(rows, targetNetMarginPct, generalAllocation),
      productCount: activeProducts.size,
      unallocatedMonthly: Math.max(0, generalAllocation.total - allocatedToListings),
    },
    platforms: platformRows,
    accounts: accountRows,
  }
}
