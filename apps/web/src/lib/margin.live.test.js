import { describe, expect, it } from 'vitest'
import { computeMargin } from './margin'

const product = { id: 'p1', category: 'Casa', cost_price: 50 }
const rule = {
  id: 'r1',
  platform_id: 'ml',
  category: null,
  listing_type: null,
  valid_from: '2026-01-01',
  valid_to: null,
  price_min: 0,
  price_max: null,
  commission_pct: 10,
  fixed_fee: 5,
}

function deps(listing, extra = {}) {
  return {
    listings: [listing],
    feeRules: [rule],
    promotions: [],
    listingCostComponents: [],
    costComponents: [],
    asOf: '2026-08-23',
    ...extra,
  }
}

describe('computeMargin e integrações live', () => {
  it('não promove live_fee_override do cache automaticamente para o cálculo', () => {
    const listing = {
      id: 'l1',
      product_id: 'p1',
      platform_id: 'ml',
      sale_price: 100,
      listing_type: null,
      live_fee_override: {
        commission_pct: 13,
        fixed_fee: 8,
        source: 'cache',
        exact: true,
        confidence: 'account_specific',
      },
    }
    const result = computeMargin(product, 'ml', deps(listing))
    expect(result.calculationMode).toBe('official_rule')
    expect(result.commission).toBe(10)
    expect(result.fixedFee).toBe(5)
    expect(result.netMargin).toBe(35)
  })

  it('só usa consulta live quando ativada explicitamente para diagnóstico', () => {
    const listing = { id: 'l1', product_id: 'p1', platform_id: 'ml', sale_price: 100, listing_type: null }
    const result = computeMargin(product, 'ml', deps(listing, {
      allowLiveFee: true,
      liveFee: {
        commission_pct: 12,
        fixed_fee: 7,
        source: 'live',
        exact: false,
        confidence: 'partial_logistics',
        warning: 'Logística incompleta',
      },
    }))
    expect(result.calculationMode).toBe('api_diagnostic')
    expect(result.rule.warning).toBe('Logística incompleta')
  })
})
