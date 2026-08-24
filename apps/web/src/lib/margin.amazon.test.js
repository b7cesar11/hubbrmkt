import { describe, expect, it } from 'vitest'
import { calculateCommission, computeMargin } from './margin'

const TODAY = '2026-08-24'
const PLATFORM = 'amazon-platform'
const CATEGORY = 'amazon-category'

function amazonRule(overrides = {}) {
  return {
    id: 'amazon-rule',
    platform_id: PLATFORM,
    marketplace_category_id: CATEGORY,
    category_scope: 'exact',
    category: null,
    listing_type: null,
    account_type: null,
    price_min: 0,
    price_max: null,
    commission_pct: 12,
    fixed_fee: 0,
    valid_from: '2025-01-20',
    valid_to: null,
    source_kind: 'official',
    confidence_status: 'confirmed',
    calculation_config: {
      commission_basis: 'sale_price_plus_shipping_revenue',
      minimum_commission: 2,
      required_profile_fields: [
        {
          key: 'amazon_selling_plan',
          allowed: ['individual', 'professional'],
          message: 'Informe o plano Amazon.',
        },
      ],
      additional_charges: [
        {
          code: 'amazon_individual_per_item',
          name: 'Plano Individual — tarifa por item',
          calc_type: 'fixed',
          value: 2,
          basis: 'sale_price',
          condition: { program_key: 'amazon_selling_plan', equals: 'individual' },
        },
      ],
    },
    ...overrides,
  }
}

function listing(overrides = {}) {
  return {
    id: 'listing-1',
    product_id: 'product-1',
    platform_id: PLATFORM,
    marketplace_account_id: 'account-1',
    sale_price: 100,
    shipping_revenue: 0,
    marketplace_category_ref_id: CATEGORY,
    marketplace_category_name: 'Casa',
    marketplace_category_path_ids: [CATEGORY],
    program_config: {},
    ...overrides,
  }
}

function deps(account, row, rules = [amazonRule()]) {
  return {
    listings: [{ ...row, marketplace_account: account }],
    feeRules: rules,
    promotions: [],
    listingCostComponents: [],
    costComponents: [],
    marketplaceAccountId: account.id,
    asOf: TODAY,
  }
}

describe('Amazon — comissão oficial', () => {
  it('inclui frete cobrado do comprador na base da comissão', () => {
    const result = calculateCommission(
      amazonRule({ commission_pct: 12 }),
      listing({ sale_price: 100, shipping_revenue: 20 }),
    )

    expect(result.basisAmount).toBe(120)
    expect(result.amount).toBeCloseTo(14.4, 6)
    expect(result.effectivePct).toBeCloseTo(12, 6)
  })

  it('aplica comissão mínima quando o percentual fica abaixo do piso', () => {
    const result = calculateCommission(
      amazonRule({ commission_pct: 10 }),
      listing({ sale_price: 5, shipping_revenue: 0 }),
    )

    expect(result.amount).toBe(2)
    expect(result.minimumApplied).toBe(true)
  })

  it('calcula acessórios eletrônicos em faixas progressivas', () => {
    const result = calculateCommission(
      amazonRule({
        commission_pct: 15,
        calculation_config: {
          commission_basis: 'sale_price_plus_shipping_revenue',
          minimum_commission: 2,
          progressive_commission: { threshold: 100, base_pct: 15, excess_pct: 10 },
        },
      }),
      listing({ sale_price: 150 }),
    )

    expect(result.amount).toBeCloseTo(20, 6)
    expect(result.breakdown).toHaveLength(2)
    expect(result.effectivePct).toBeCloseTo(13.333333, 5)
  })

  it('calcula móveis em faixas progressivas', () => {
    const result = calculateCommission(
      amazonRule({
        commission_pct: 15,
        calculation_config: {
          commission_basis: 'sale_price_plus_shipping_revenue',
          minimum_commission: 2,
          progressive_commission: { threshold: 200, base_pct: 15, excess_pct: 10 },
        },
      }),
      listing({ sale_price: 300 }),
    )

    expect(result.amount).toBeCloseTo(40, 6)
  })
})

describe('Amazon — perfil da conta e margem', () => {
  const product = { id: 'product-1', category: 'Casa', cost_price: 50 }

  it('cobra R$2 por item apenas no Plano Individual', () => {
    const individual = {
      id: 'account-1',
      profile_config: { amazon_selling_plan: 'individual' },
      is_default: true,
    }
    const professional = {
      id: 'account-1',
      profile_config: { amazon_selling_plan: 'professional' },
      is_default: true,
    }
    const row = listing({ sale_price: 100 })

    const individualResult = computeMargin(product, PLATFORM, deps(individual, row))
    const professionalResult = computeMargin(product, PLATFORM, deps(professional, row))

    expect(individualResult.status).toBe('ok')
    expect(individualResult.platformChargesTotal).toBe(2)
    expect(individualResult.netMargin).toBeCloseTo(36, 6)

    expect(professionalResult.status).toBe('ok')
    expect(professionalResult.platformChargesTotal).toBe(0)
    expect(professionalResult.netMargin).toBeCloseTo(38, 6)
  })

  it('inclui receita de frete no resultado e na base da comissão', () => {
    const account = {
      id: 'account-1',
      profile_config: { amazon_selling_plan: 'professional' },
      is_default: true,
    }
    const row = listing({ sale_price: 100, shipping_revenue: 20 })

    const result = computeMargin(product, PLATFORM, deps(account, row))

    expect(result.status).toBe('ok')
    expect(result.grossRevenue).toBe(120)
    expect(result.commission).toBeCloseTo(14.4, 6)
    expect(result.netMargin).toBeCloseTo(55.6, 6)
    expect(result.marginPct).toBeCloseTo(46.333333, 5)
  })

  it('bloqueia o cálculo até o plano da conta ser informado', () => {
    const account = { id: 'account-1', profile_config: {}, is_default: true }
    const result = computeMargin(product, PLATFORM, deps(account, listing()))

    expect(result.status).toBe('configuracao_conta_pendente')
    expect(result.reason).toContain('plano Amazon')
  })
})
