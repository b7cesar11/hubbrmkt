import { describe, expect, it } from 'vitest'
import { attachExactLiveFees } from './liveFeeCache'

const listing = {
  id: 'listing-1',
  product_id: 'product-1',
  platform_id: 'ml',
  platform_category_id: 'MLB123',
  listing_type: 'classico',
  sale_price: 100,
  logistic_type: 'drop_off',
  shipping_mode: 'me2',
  billable_weight_kg: 1.25,
}

function fee(overrides = {}) {
  return {
    id: 'fee-1',
    platform_id: 'ml',
    category_id: 'MLB123',
    listing_type: 'classico',
    price: 100,
    logistic_type: 'drop_off',
    shipping_mode: 'me2',
    billable_weight_kg: 1.25,
    commission_pct: 13,
    fixed_fee: 7,
    fetched_at: '2026-08-23T10:00:00Z',
    is_exact: true,
    confidence_status: 'account_specific',
    warning: null,
    ...overrides,
  }
}

describe('attachExactLiveFees', () => {
  it('anexa taxa exata quando todos os parâmetros do anúncio coincidem', () => {
    const [result] = attachExactLiveFees([listing], [fee()])
    expect(result.live_fee_override).toMatchObject({
      commission_pct: 13,
      fixed_fee: 7,
      exact: true,
      confidence: 'account_specific',
    })
  })

  it('não promove cache parcial para cálculo automático', () => {
    const [result] = attachExactLiveFees([listing], [fee({ is_exact: false })])
    expect(result.live_fee_override).toBeUndefined()
  })

  it('não reutiliza taxa de outro peso/logística/preço', () => {
    const [result] = attachExactLiveFees(
      [listing],
      [fee({ billable_weight_kg: 2 }), fee({ logistic_type: 'fulfillment' }), fee({ price: 101 })]
    )
    expect(result.live_fee_override).toBeUndefined()
  })

  it('escolhe o cache exato mais recente quando há mais de um match', () => {
    const [result] = attachExactLiveFees(
      [listing],
      [
        fee({ id: 'old', fixed_fee: 5, fetched_at: '2026-08-23T09:00:00Z' }),
        fee({ id: 'new', fixed_fee: 8, fetched_at: '2026-08-23T11:00:00Z' }),
      ]
    )
    expect(result.live_fee_override.fixed_fee).toBe(8)
  })
})
