import { describe, expect, it } from 'vitest'
import {
  buildPeopleCostArtifacts,
  getPersonAllocationUnits,
  personAppliesToProduct,
} from './peopleCosts'

const PEOPLE = [
  {
    id: 'fernanda',
    company_id: 'company',
    name: 'Fernanda',
    role_title: 'Auxiliar operacional',
    fixed_monthly_cost: 3000,
    commission_pct: 5,
    commission_basis: 'sale_price',
    applies_to_all_products: false,
    active: true,
  },
  {
    id: 'bruno',
    company_id: 'company',
    name: 'Bruno',
    role_title: 'Marketing',
    fixed_monthly_cost: 1500,
    commission_pct: 3,
    commission_basis: 'sale_price',
    applies_to_all_products: true,
    active: true,
  },
]

const LINKS = [
  { product_id: 'p1', person_id: 'fernanda' },
  { product_id: 'p2', person_id: 'fernanda' },
]

const LISTINGS = [
  { id: 'l1', product_id: 'p1', monthly_units_forecast: 100, active: true },
  { id: 'l2', product_id: 'p2', monthly_units_forecast: 200, active: true },
  { id: 'l3', product_id: 'p3', monthly_units_forecast: 300, active: true },
]

describe('people costs', () => {
  it('applies selected people only to linked products and global people to all products', () => {
    expect(personAppliesToProduct(PEOPLE[0], 'p1', LINKS)).toBe(true)
    expect(personAppliesToProduct(PEOPLE[0], 'p3', LINKS)).toBe(false)
    expect(personAppliesToProduct(PEOPLE[1], 'p3', LINKS)).toBe(true)
  })

  it('allocates fixed monthly cost across projected units of applicable products', () => {
    expect(getPersonAllocationUnits(PEOPLE[0], LISTINGS, LINKS)).toBe(300)
    expect(getPersonAllocationUnits(PEOPLE[1], LISTINGS, LINKS)).toBe(600)

    const artifacts = buildPeopleCostArtifacts({
      people: PEOPLE,
      productPeople: LINKS,
      listings: LISTINGS,
    })

    const fernandaFixed = artifacts.costComponents.find(
      (component) => component.person_id === 'fernanda' && component.cost_part === 'fixed',
    )
    const brunoFixed = artifacts.costComponents.find(
      (component) => component.person_id === 'bruno' && component.cost_part === 'fixed',
    )

    expect(fernandaFixed.default_value).toBeCloseTo(10, 8)
    expect(brunoFixed.default_value).toBeCloseTo(2.5, 8)
    expect(fernandaFixed.allocation_pending).toBe(false)
  })

  it('creates percentage commission components without duplicating salary records', () => {
    const artifacts = buildPeopleCostArtifacts({
      people: PEOPLE,
      productPeople: LINKS,
      listings: LISTINGS,
    })

    const fernandaCommission = artifacts.costComponents.find(
      (component) => component.person_id === 'fernanda' && component.cost_part === 'commission',
    )
    const fernandaLinks = artifacts.listingCostComponents.filter(
      (link) => link.person_id === 'fernanda' && link.cost_component_id.includes(':commission'),
    )

    expect(fernandaCommission.calc_type).toBe('percentage')
    expect(fernandaCommission.default_value).toBe(5)
    expect(fernandaLinks.map((link) => link.product_listing_id).sort()).toEqual(['l1', 'l2'])
  })

  it('marks fixed allocation as pending when no projected volume exists', () => {
    const artifacts = buildPeopleCostArtifacts({
      people: [PEOPLE[0]],
      productPeople: [{ product_id: 'p1', person_id: 'fernanda' }],
      listings: [{ id: 'l1', product_id: 'p1', monthly_units_forecast: 0, active: true }],
    })

    const fixed = artifacts.costComponents.find((component) => component.cost_part === 'fixed')
    expect(fixed.default_value).toBe(0)
    expect(fixed.allocation_pending).toBe(true)
    expect(fixed.name).toContain('pendente')
  })
})
