import { describe, expect, it } from 'vitest'
import { calculateOperationPeopleAnalytics } from './peopleAnalytics'

const PLATFORM = 'platform-1'
const ACCOUNT = 'account-1'

function deps(overrides = {}) {
  return {
    people: [
      {
        id: 'fernanda',
        name: 'Fernanda',
        role_title: 'Auxiliar operacional',
        fixed_monthly_cost: 3000,
        commission_pct: 5,
        commission_basis: 'sale_price',
        applies_to_all_products: false,
        active: true,
      },
    ],
    productPeople: [{ product_id: 'product-1', person_id: 'fernanda' }],
    products: [
      { id: 'product-1', company_id: 'company', category: 'Interna', cost_price: 50, active: true },
    ],
    listings: [
      {
        id: 'listing-1',
        product_id: 'product-1',
        platform_id: PLATFORM,
        marketplace_account_id: ACCOUNT,
        sale_price: 100,
        shipping_revenue: 0,
        monthly_units_forecast: 100,
        listing_type: null,
        marketplace_category_ref_id: null,
        marketplace_category_path_ids: [],
        active: true,
      },
    ],
    marketplaceAccounts: [
      { id: ACCOUNT, platform_id: PLATFORM, name: 'Principal', profile_config: {}, active: true },
    ],
    feeRules: [
      {
        id: 'rule-1',
        platform_id: PLATFORM,
        category: null,
        listing_type: null,
        account_type: null,
        price_min: 0,
        price_max: null,
        commission_pct: 10,
        fixed_fee: 0,
        valid_from: '2026-01-01',
        valid_to: null,
        source_kind: 'official',
        confidence_status: 'confirmed',
        calculation_config: {},
      },
    ],
    promotions: [],
    listingCostComponents: [],
    costComponents: [],
    asOf: '2026-08-26',
    ...overrides,
  }
}

describe('calculateOperationPeopleAnalytics', () => {
  it('calculates monthly fixed + commission cost and revenue required to pay a person', () => {
    const result = calculateOperationPeopleAnalytics(deps())
    const fernanda = result.rows[0]

    // Base contribution: R$ 100 - 50 product - 10 marketplace = R$ 40 per sale.
    expect(fernanda.projectedContribution).toBeCloseTo(4000, 8)
    expect(fernanda.projectedCommission).toBeCloseTo(500, 8)
    expect(fernanda.projectedTotalCost).toBeCloseTo(3500, 8)
    expect(fernanda.coverageRatio).toBeCloseTo(4000 / 3500, 8)
    expect(fernanda.breakEvenRevenue).toBeCloseTo(10000 * (3000 / 3500), 6)
    expect(fernanda.breakEvenBasis).toBe('projected_mix')
  })

  it('calculates operation monthly cost and break-even using the configured sales mix', () => {
    const result = calculateOperationPeopleAnalytics(deps())

    expect(result.summary.fixedMonthlyTotal).toBe(3000)
    expect(result.summary.projectedCommissionTotal).toBeCloseTo(500, 8)
    expect(result.summary.projectedPeopleCostTotal).toBeCloseTo(3500, 8)
    expect(result.summary.projectedRevenue).toBeCloseTo(10000, 8)
    expect(result.summary.projectedOperatingProfit).toBeCloseTo(500, 8)
    expect(result.summary.operationBreakEvenRevenue).toBeCloseTo(10000 * (3000 / 3500), 6)
  })

  it('falls back to the current listing economics when monthly forecast is still zero', () => {
    const input = deps({
      listings: [
        {
          ...deps().listings[0],
          monthly_units_forecast: 0,
        },
      ],
    })
    const result = calculateOperationPeopleAnalytics(input)

    expect(result.summary.forecastConfigured).toBe(false)
    expect(result.rows[0].breakEvenBasis).toBe('average_current_listings')
    // Contribution after Fernanda commission is 35% of revenue.
    expect(result.rows[0].breakEvenRevenue).toBeCloseTo(3000 / 0.35, 6)
  })
})
