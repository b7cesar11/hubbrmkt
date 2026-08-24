import { describe, expect, it } from 'vitest'
import { findPriceForTargetMargin, getPricingRecommendations } from './pricing'

const TODAY = '2026-08-24'
const PLATFORM = 'platform-1'
const ACCOUNT = 'account-1'
const CATEGORY = 'category-1'

function rule(overrides = {}) {
  return {
    id: 'rule-1',
    platform_id: PLATFORM,
    marketplace_category_id: CATEGORY,
    category_scope: 'exact',
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
    ...overrides,
  }
}

function context({ cost = 50, price = 100, rules = [rule()], account = {}, listing = {} } = {}) {
  const product = { id: 'product-1', category: 'Interna', cost_price: cost }
  const marketplaceAccount = {
    id: ACCOUNT,
    profile_config: {},
    is_default: true,
    ...account,
  }
  const row = {
    id: 'listing-1',
    product_id: product.id,
    platform_id: PLATFORM,
    marketplace_account_id: ACCOUNT,
    marketplace_account: marketplaceAccount,
    sale_price: price,
    shipping_revenue: 0,
    marketplace_category_ref_id: CATEGORY,
    marketplace_category_name: 'Categoria',
    marketplace_category_path_ids: [CATEGORY],
    program_config: {},
    ...listing,
  }
  const deps = {
    listings: [row],
    feeRules: rules,
    promotions: [],
    listingCostComponents: [],
    costComponents: [],
    marketplaceAccountId: ACCOUNT,
    asOf: TODAY,
  }
  return { product, deps }
}

describe('findPriceForTargetMargin', () => {
  it('encontra o preço mínimo sem prejuízo com comissão percentual', () => {
    const { product, deps } = context({ cost: 50, rules: [rule({ commission_pct: 10 })] })
    const result = findPriceForTargetMargin(product, PLATFORM, deps, 0)

    expect(result.status).toBe('ok')
    expect(result.price).toBe(55.56)
    expect(result.margin.netMargin).toBeGreaterThanOrEqual(0)
  })

  it('considera taxa fixa ao resolver uma margem alvo', () => {
    const { product, deps } = context({
      cost: 50,
      rules: [rule({ commission_pct: 10, fixed_fee: 5 })],
    })
    const result = findPriceForTargetMargin(product, PLATFORM, deps, 20)

    // p - 50 - 10%p - 5 >= 20%p => 70%p >= 55
    expect(result.status).toBe('ok')
    expect(result.price).toBe(78.58)
  })

  it('não pula a melhor oportunidade antes de um salto de taxa', () => {
    const { product, deps } = context({
      cost: 55,
      rules: [
        rule({ id: 'low', price_min: 0, price_max: 80, commission_pct: 20, fixed_fee: 4 }),
        rule({ id: 'high', price_min: 80, price_max: null, commission_pct: 14, fixed_fee: 16 }),
      ],
    })

    const result = findPriceForTargetMargin(product, PLATFORM, deps, 6)

    expect(result.status).toBe('ok')
    expect(result.price).toBeLessThan(80)
    expect(result.price).toBe(79.73)
    expect(result.margin.rule.id).toBe('low')
  })

  it('resolve margem alvo atravessando comissão progressiva Amazon-like', () => {
    const { product, deps } = context({
      cost: 100,
      account: { profile_config: { amazon_selling_plan: 'professional' } },
      rules: [
        rule({
          commission_pct: 15,
          calculation_config: {
            commission_basis: 'sale_price_plus_shipping_revenue',
            minimum_commission: 2,
            progressive_commission: { threshold: 200, base_pct: 15, excess_pct: 10 },
            required_profile_fields: [
              {
                key: 'amazon_selling_plan',
                allowed: ['individual', 'professional'],
              },
            ],
          },
        }),
      ],
    })

    const result = findPriceForTargetMargin(product, PLATFORM, deps, 50)

    expect(result.status).toBe('ok')
    expect(result.price).toBe(275)
    expect(result.margin.commission).toBe(37.5)
  })

  it('propaga bloqueio de configuração oficial quando não há cálculo válido', () => {
    const { product, deps } = context({
      rules: [
        rule({
          calculation_config: {
            required_profile_fields: [
              { key: 'programa', allowed: ['sim'], message: 'Configure o programa.' },
            ],
          },
        }),
      ],
    })

    const result = findPriceForTargetMargin(product, PLATFORM, deps, 20, { maxPrice: 1000 })

    expect(result.status).toBe('configuracao_conta_pendente')
    expect(result.reason).toContain('Configure o programa')
  })
})

describe('getPricingRecommendations', () => {
  it('retorna break-even, preço-alvo e margem atual no mesmo contexto', () => {
    const { product, deps } = context({ cost: 60, price: 100, rules: [rule({ commission_pct: 10 })] })
    const recommendation = getPricingRecommendations(product, PLATFORM, deps, 20)

    expect(recommendation.status).toBe('ok')
    expect(recommendation.breakEven.price).toBe(66.67)
    expect(recommendation.target.price).toBe(85.72)
    expect(recommendation.current.marginPct).toBeCloseTo(30, 6)
  })
})
