import { describe, expect, it } from 'vitest'
import { calculateRuleCharges, computeMargin } from './margin'

function tiktokRule() {
  return {
    id: 'tt-rule',
    platform_id: 'tiktok',
    category: null,
    listing_type: null,
    valid_from: '2026-07-15',
    valid_to: null,
    price_min: 50,
    price_max: null,
    commission_pct: 6,
    fixed_fee: 6,
    calculation_config: {
      additional_charges: [
        {
          code: 'tiktok_shipping_fee_program',
          name: 'Programa de Taxas de Envio TikTok',
          calc_type: 'percentage',
          value: 6,
          basis: 'sale_price',
          cap_amount: 50,
          condition: {
            program_key: 'tiktok_shipping_fee_program',
            equals: 'enrolled',
          },
          unknown_message: 'Confirme participação no programa.',
        },
      ],
    },
  }
}

function shopeeRule() {
  return {
    id: 'shopee-rule',
    platform_id: 'shopee',
    category: null,
    listing_type: null,
    valid_from: '2026-03-01',
    valid_to: null,
    price_min: 0,
    price_max: 80,
    commission_pct: 20,
    fixed_fee: 4,
    calculation_config: {
      fixed_fee_override: {
        type: 'percentage_of_sale_price_below',
        threshold: 8,
        percentage: 50,
        name: 'Adicional por item Shopee abaixo de R$8',
      },
    },
  }
}

describe('calculateRuleCharges', () => {
  it('TikTok Shipping Fee Program aplica 6% com teto de R$50 quando enrolled', () => {
    const result = calculateRuleCharges(tiktokRule(), {
      sale_price: 1000,
      program_config: { tiktok_shipping_fee_program: 'enrolled' },
    })
    expect(result.charges).toHaveLength(1)
    expect(result.charges[0].amount).toBe(50)
    expect(result.chargesTotal).toBe(50)
  })

  it('TikTok não cobra programa quando status é unknown e gera aviso', () => {
    const result = calculateRuleCharges(tiktokRule(), {
      sale_price: 100,
      program_config: { tiktok_shipping_fee_program: 'unknown' },
    })
    expect(result.chargesTotal).toBe(0)
    expect(result.warnings).toContain('Confirme participação no programa.')
  })

  it('TikTok não cobra programa quando conta fez opt-out', () => {
    const result = calculateRuleCharges(tiktokRule(), {
      sale_price: 100,
      program_config: { tiktok_shipping_fee_program: 'opted_out' },
    })
    expect(result.chargesTotal).toBe(0)
    expect(result.warnings).toHaveLength(0)
  })

  it('Shopee abaixo de R$8 substitui taxa fixa por metade do preço', () => {
    const result = calculateRuleCharges(shopeeRule(), { sale_price: 7.5 })
    expect(result.fixedFee).toBe(3.75)
    expect(result.fixedFeeLabel).toBe('Adicional por item Shopee abaixo de R$8')
  })

  it('Shopee em R$8 mantém taxa fixa normal', () => {
    const result = calculateRuleCharges(shopeeRule(), { sale_price: 8 })
    expect(result.fixedFee).toBe(4)
    expect(result.fixedFeeLabel).toBeNull()
  })
})

describe('computeMargin com cobranças condicionais', () => {
  it('desconta programa TikTok separado dos custos operacionais', () => {
    const product = { id: 'p1', category: 'utilidades', cost_price: 40 }
    const listing = {
      id: 'l1',
      product_id: 'p1',
      platform_id: 'tiktok',
      sale_price: 100,
      listing_type: null,
      program_config: { tiktok_shipping_fee_program: 'enrolled' },
    }
    const result = computeMargin(product, 'tiktok', {
      listings: [listing],
      feeRules: [tiktokRule()],
      promotions: [],
      listingCostComponents: [],
      costComponents: [],
      asOf: '2026-08-23',
    })

    // 100 - 40 - 6% comissão - R$6 fixo - 6% programa = 42
    expect(result.netMargin).toBe(42)
    expect(result.platformChargesTotal).toBe(6)
    expect(result.additionalCostsTotal).toBe(0)
  })
})
