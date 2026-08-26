import { computeMargin } from './margin'
import { personAppliesToProduct } from './peopleCosts'

function numberOrZero(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(value))
  if (valid.length === 0) return null
  return valid.reduce((sum, value) => sum + value, 0) / valid.length
}

function commissionBaseForMargin(person, margin) {
  return person.commission_basis === 'gross_revenue'
    ? numberOrZero(margin.grossRevenue)
    : numberOrZero(margin.salePrice)
}

/**
 * Consolida custo mensal da equipe e cobertura das posições.
 * O cálculo parte da margem de contribuição já existente no MargemHub
 * (produto + marketplace + custos adicionais manuais) e só depois desconta
 * salários/custos fixos e comissões das pessoas.
 */
export function calculateOperationPeopleAnalytics({
  people = [],
  productPeople = [],
  products = [],
  listings = [],
  marketplaceAccounts = [],
  feeRules = [],
  promotions = [],
  listingCostComponents = [],
  costComponents = [],
  asOf = new Date(),
} = {}) {
  const activePeople = people.filter((person) => person.active !== false)
  const activeProducts = products.filter((product) => product.active !== false)
  const activeProductById = new Map(activeProducts.map((product) => [String(product.id), product]))
  const accountById = new Map(marketplaceAccounts.map((account) => [String(account.id), account]))
  const manualCostComponents = costComponents.filter((component) => component.origin !== 'person')
  const manualCostIds = new Set(manualCostComponents.map((component) => String(component.id)))
  const manualListingCostComponents = listingCostComponents.filter((link) =>
    manualCostIds.has(String(link.cost_component_id)),
  )

  const activeListings = listings
    .filter((listing) => listing.active !== false && activeProductById.has(String(listing.product_id)))
    .map((listing) => ({
      ...listing,
      marketplace_account:
        listing.marketplace_account || accountById.get(String(listing.marketplace_account_id)) || null,
    }))

  const marginByListingId = new Map()
  for (const listing of activeListings) {
    const product = activeProductById.get(String(listing.product_id))
    const margin = computeMargin(product, listing.platform_id, {
      listings: activeListings,
      feeRules,
      promotions,
      listingCostComponents: manualListingCostComponents,
      costComponents: manualCostComponents,
      marketplaceAccountId: listing.marketplace_account_id,
      asOf,
    })
    marginByListingId.set(String(listing.id), margin)
  }

  let projectedRevenue = 0
  let projectedContribution = 0
  let projectedUnits = 0
  const companyVariableRateSamples = []

  for (const listing of activeListings) {
    const margin = marginByListingId.get(String(listing.id))
    if (margin?.status !== 'ok') continue
    const units = Math.max(0, numberOrZero(listing.monthly_units_forecast))
    projectedUnits += units
    projectedRevenue += numberOrZero(margin.grossRevenue) * units
    projectedContribution += numberOrZero(margin.netMargin) * units

    const variablePeoplePerSale = activePeople.reduce((sum, person) => {
      if (!personAppliesToProduct(person, listing.product_id, productPeople)) return sum
      return (
        sum +
        (commissionBaseForMargin(person, margin) * Math.max(0, numberOrZero(person.commission_pct))) / 100
      )
    }, 0)
    const grossRevenue = numberOrZero(margin.grossRevenue)
    if (grossRevenue > 0) {
      companyVariableRateSamples.push((numberOrZero(margin.netMargin) - variablePeoplePerSale) / grossRevenue)
    }
  }

  const rows = activePeople.map((person) => {
    const linkedListings = activeListings.filter((listing) =>
      personAppliesToProduct(person, listing.product_id, productPeople),
    )
    const linkedProductIds = new Set(linkedListings.map((listing) => String(listing.product_id)))

    let personProjectedRevenue = 0
    let personProjectedContribution = 0
    let personProjectedCommission = 0
    let personProjectedUnits = 0
    const afterCommissionRateSamples = []

    for (const listing of linkedListings) {
      const margin = marginByListingId.get(String(listing.id))
      if (margin?.status !== 'ok') continue
      const units = Math.max(0, numberOrZero(listing.monthly_units_forecast))
      const commissionPerSale =
        (commissionBaseForMargin(person, margin) * Math.max(0, numberOrZero(person.commission_pct))) / 100
      const grossRevenue = numberOrZero(margin.grossRevenue)
      const contribution = numberOrZero(margin.netMargin)

      personProjectedUnits += units
      personProjectedRevenue += grossRevenue * units
      personProjectedContribution += contribution * units
      personProjectedCommission += commissionPerSale * units

      if (grossRevenue > 0) {
        afterCommissionRateSamples.push((contribution - commissionPerSale) / grossRevenue)
      }
    }

    const fixedMonthlyCost = Math.max(0, numberOrZero(person.fixed_monthly_cost))
    const projectedTotalCost = fixedMonthlyCost + personProjectedCommission
    const contributionAfterCommission = personProjectedContribution - personProjectedCommission
    const coverageRatio = projectedTotalCost > 0 ? personProjectedContribution / projectedTotalCost : null

    let breakEvenRevenue = null
    let breakEvenBasis = null
    if (fixedMonthlyCost === 0) {
      breakEvenRevenue = 0
      breakEvenBasis = 'no_fixed_cost'
    } else if (personProjectedRevenue > 0 && contributionAfterCommission > 0) {
      breakEvenRevenue =
        personProjectedRevenue * (fixedMonthlyCost / contributionAfterCommission)
      breakEvenBasis = 'projected_mix'
    } else {
      const averageRate = average(afterCommissionRateSamples)
      if (averageRate != null && averageRate > 0) {
        breakEvenRevenue = fixedMonthlyCost / averageRate
        breakEvenBasis = 'average_current_listings'
      }
    }

    return {
      person,
      linkedProductsCount: linkedProductIds.size,
      linkedListingsCount: linkedListings.length,
      projectedUnits: personProjectedUnits,
      projectedRevenue: personProjectedRevenue,
      projectedContribution: personProjectedContribution,
      projectedCommission: personProjectedCommission,
      fixedMonthlyCost,
      projectedTotalCost,
      contributionAfterCommission,
      coverageRatio,
      breakEvenRevenue,
      breakEvenBasis,
      forecastConfigured: personProjectedUnits > 0,
    }
  })

  const fixedMonthlyTotal = rows.reduce((sum, row) => sum + row.fixedMonthlyCost, 0)
  const projectedCommissionTotal = rows.reduce((sum, row) => sum + row.projectedCommission, 0)
  const projectedPeopleCostTotal = fixedMonthlyTotal + projectedCommissionTotal
  const contributionAfterVariablePeople = projectedContribution - projectedCommissionTotal
  const projectedOperatingProfit = contributionAfterVariablePeople - fixedMonthlyTotal

  let operationBreakEvenRevenue = null
  let operationBreakEvenBasis = null
  if (fixedMonthlyTotal === 0) {
    operationBreakEvenRevenue = 0
    operationBreakEvenBasis = 'no_fixed_cost'
  } else if (projectedRevenue > 0 && contributionAfterVariablePeople > 0) {
    operationBreakEvenRevenue =
      projectedRevenue * (fixedMonthlyTotal / contributionAfterVariablePeople)
    operationBreakEvenBasis = 'projected_mix'
  } else {
    const averageRate = average(companyVariableRateSamples)
    if (averageRate != null && averageRate > 0) {
      operationBreakEvenRevenue = fixedMonthlyTotal / averageRate
      operationBreakEvenBasis = 'average_current_listings'
    }
  }

  return {
    rows,
    summary: {
      peopleCount: activePeople.length,
      fixedMonthlyTotal,
      projectedCommissionTotal,
      projectedPeopleCostTotal,
      projectedRevenue,
      projectedContribution,
      projectedUnits,
      contributionAfterVariablePeople,
      projectedOperatingProfit,
      peopleCostPctRevenue:
        projectedRevenue > 0 ? (projectedPeopleCostTotal / projectedRevenue) * 100 : null,
      coverageRatio:
        projectedPeopleCostTotal > 0 ? projectedContribution / projectedPeopleCostTotal : null,
      operationBreakEvenRevenue,
      operationBreakEvenBasis,
      forecastConfigured: projectedUnits > 0,
    },
  }
}
