function numberOrZero(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

export function personAppliesToProduct(person, productId, productPeople = []) {
  if (!person?.active || !productId) return false
  if (person.applies_to_all_products) return true
  return productPeople.some(
    (link) => String(link.person_id) === String(person.id) && String(link.product_id) === String(productId),
  )
}

export function getPersonAllocationUnits(person, listings = [], productPeople = [], products = []) {
  if (!person?.active) return 0

  const linkedProductIds = person.applies_to_all_products
    ? null
    : new Set(
        productPeople
          .filter((link) => String(link.person_id) === String(person.id))
          .map((link) => String(link.product_id)),
      )

  const activeProductIds = products.length > 0
    ? new Set(products.filter((product) => product.active !== false).map((product) => String(product.id)))
    : null

  return listings.reduce((total, listing) => {
    if (listing.active === false) return total
    const productId = String(listing.product_id)
    if (activeProductIds && !activeProductIds.has(productId)) return total
    if (linkedProductIds && !linkedProductIds.has(productId)) return total
    return total + Math.max(0, numberOrZero(listing.monthly_units_forecast))
  }, 0)
}

/**
 * Gera custos derivados de pessoas somente em memória. Eles nunca são persistidos
 * em cost_components/listing_cost_components, evitando duas fontes da verdade.
 *
 * `listingPeopleCosts` é a representação preferencial para o motor de margem:
 * cada listing recebe sua lista privada de custos de pessoas. Os arrays legados
 * `costComponents`/`listingCostComponents` permanecem no retorno apenas para
 * testes/consumidores internos e não devem ser usados como registros editáveis.
 */
export function buildPeopleCostArtifacts({
  people = [],
  productPeople = [],
  listings = [],
  products = [],
} = {}) {
  const costComponents = []
  const listingCostComponents = []
  const listingPeopleCosts = []
  const allocationByPerson = new Map()

  for (const person of people.filter((candidate) => candidate.active !== false)) {
    const applicableListings = listings.filter(
      (listing) =>
        listing.active !== false &&
        personAppliesToProduct(person, listing.product_id, productPeople) &&
        (products.length === 0 ||
          products.some(
            (product) => String(product.id) === String(listing.product_id) && product.active !== false,
          )),
    )

    if (applicableListings.length === 0) continue

    const allocationUnits = getPersonAllocationUnits(person, listings, productPeople, products)
    const fixedMonthlyCost = Math.max(0, numberOrZero(person.fixed_monthly_cost))
    const commissionPct = Math.max(0, numberOrZero(person.commission_pct))
    const allocationPending = fixedMonthlyCost > 0 && allocationUnits <= 0
    const fixedPerUnit = allocationUnits > 0 ? fixedMonthlyCost / allocationUnits : 0

    allocationByPerson.set(String(person.id), {
      allocationUnits,
      fixedPerUnit,
      allocationPending,
      applicableListingCount: applicableListings.length,
    })

    if (fixedMonthlyCost > 0) {
      const id = `person:${person.id}:fixed`
      const component = {
        id,
        company_id: person.company_id,
        name: allocationPending
          ? `${person.name} — custo fixo pendente (informe vendas/mês)`
          : `${person.name} — fixo rateado`,
        category: 'people_cost',
        calc_type: 'fixed',
        default_value: fixedPerUnit,
        calculation_basis: 'sale_price',
        active: true,
        origin: 'person',
        person_id: person.id,
        person_name: person.name,
        role_title: person.role_title,
        cost_part: 'fixed',
        fixed_monthly_cost: fixedMonthlyCost,
        allocation_units: allocationUnits,
        allocation_pending: allocationPending,
      }
      costComponents.push(component)

      for (const listing of applicableListings) {
        listingCostComponents.push({
          id: `${id}:${listing.id}`,
          product_listing_id: listing.id,
          cost_component_id: id,
          value_override: null,
          origin: 'person',
          person_id: person.id,
        })
        listingPeopleCosts.push({
          product_listing_id: listing.id,
          component,
        })
      }
    }

    if (commissionPct > 0) {
      const id = `person:${person.id}:commission`
      const component = {
        id,
        company_id: person.company_id,
        name: `${person.name} — comissão`,
        category: 'people_cost',
        calc_type: 'percentage',
        default_value: commissionPct,
        calculation_basis:
          person.commission_basis === 'gross_revenue'
            ? 'sale_price_plus_shipping_revenue'
            : 'sale_price',
        active: true,
        origin: 'person',
        person_id: person.id,
        person_name: person.name,
        role_title: person.role_title,
        cost_part: 'commission',
        commission_pct: commissionPct,
      }
      costComponents.push(component)

      for (const listing of applicableListings) {
        listingCostComponents.push({
          id: `${id}:${listing.id}`,
          product_listing_id: listing.id,
          cost_component_id: id,
          value_override: null,
          origin: 'person',
          person_id: person.id,
        })
        listingPeopleCosts.push({
          product_listing_id: listing.id,
          component,
        })
      }
    }
  }

  return {
    costComponents,
    listingCostComponents,
    listingPeopleCosts,
    allocationByPerson,
  }
}
