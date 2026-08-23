import { describe, it, expect } from 'vitest'
import {
  getListing,
  findApplicableRule,
  getApplicablePromotions,
  getCalculationBasisAmount,
  calculateCostComponent,
  computeMargin,
} from './margin'

const FUTURE = '2999-12-31'
const PAST = '2000-01-01'
const TODAY = '2026-08-23'

function makeListing(overrides = {}) {
  return {
    id: 'listing-1',
    product_id: 'prod-1',
    platform_id: 'plat-1',
    sale_price: 100,
    listing_type: null,
    ...overrides,
  }
}

function makeRule(overrides = {}) {
  return {
    id: 'rule-1',
    platform_id: 'plat-1',
    category: null,
    listing_type: null,
    reputation_level: 'padrao',
    valid_from: PAST,
    valid_to: null,
    price_min: null,
    price_max: null,
    commission_pct: 10,
    fixed_fee: 5,
    ...overrides,
  }
}

const baseProduct = { id: 'prod-1', category: 'eletronicos', cost_price: 40 }
const baseDeps = {
  listings: [makeListing()],
  feeRules: [makeRule()],
  promotions: [],
  listingCostComponents: [],
  costComponents: [],
  asOf: TODAY,
}

describe('getListing', () => {
  it('encontra listing por produto/plataforma', () => {
    expect(getListing('prod-1', 'plat-1', [makeListing()])?.id).toBe('listing-1')
  })
})

describe('findApplicableRule', () => {
  it('respeita faixa [min,max)', () => {
    const rule = makeRule({ price_min: 50, price_max: 100 })
    expect(findApplicableRule('plat-1', 'x', 50, null, [rule], TODAY)?.id).toBe('rule-1')
    expect(findApplicableRule('plat-1', 'x', 99.99, null, [rule], TODAY)?.id).toBe('rule-1')
    expect(findApplicableRule('plat-1', 'x', 100, null, [rule], TODAY)).toBeUndefined()
  })

  it('trata valid_to como data inteira inclusiva', () => {
    const rule = makeRule({ valid_from: '2026-08-01', valid_to: TODAY })
    expect(findApplicableRule('plat-1', 'x', 100, null, [rule], TODAY)?.id).toBe('rule-1')
  })

  it('prefere categoria específica ao fallback independentemente da ordem', () => {
    const fallback = makeRule({ id: 'fallback', category: null, commission_pct: 20 })
    const specific = makeRule({ id: 'specific', category: 'Eletrônicos', commission_pct: 12 })
    const result = findApplicableRule('plat-1', 'eletrônicos', 100, null, [fallback, specific], TODAY)
    expect(result?.id).toBe('specific')
  })

  it('prefere listing_type específico ao fallback', () => {
    const fallback = makeRule({ id: 'fallback', listing_type: null })
    const premium = makeRule({ id: 'premium', listing_type: 'premium' })
    expect(findApplicableRule('plat-1', 'x', 100, 'premium', [fallback, premium], TODAY)?.id).toBe('premium')
  })

  it('em empate prefere a regra com valid_from mais recente', () => {
    const oldRule = makeRule({ id: 'old', valid_from: '2026-01-01' })
    const newRule = makeRule({ id: 'new', valid_from: '2026-08-01' })
    expect(findApplicableRule('plat-1', 'x', 100, null, [oldRule, newRule], TODAY)?.id).toBe('new')
  })
})

describe('getApplicablePromotions', () => {
  it('inclui promoção no último dia de vigência', () => {
    const promo = { platform_id: 'plat-1', category: null, starts_at: '2026-08-01', ends_at: TODAY }
    expect(getApplicablePromotions('plat-1', 'x', [promo], TODAY)).toHaveLength(1)
  })
})

describe('cost calculation', () => {
  it('usa a base monetária configurada', () => {
    const listing = makeListing({ sale_price: 100, actual_paid_amount: 80 })
    expect(getCalculationBasisAmount({ calculation_basis: 'actual_paid' }, listing)).toBe(80)
  })

  it('faz fallback para sale_price quando a base projetada não existe', () => {
    expect(getCalculationBasisAmount({ calculation_basis: 'affiliate_base' }, makeListing())).toBe(100)
  })

  it('aplica teto em custo percentual (ex.: 6% com cap R$50)', () => {
    const component = { calc_type: 'percentage', calculation_basis: 'sale_price', cap_amount: 50 }
    expect(calculateCostComponent(component, 6, makeListing({ sale_price: 1000 }))).toBe(50)
  })

  it('aplica piso monetário', () => {
    const component = { calc_type: 'percentage', calculation_basis: 'sale_price', min_amount: 2 }
    expect(calculateCostComponent(component, 1, makeListing({ sale_price: 100 }))).toBe(2)
  })
})

describe('computeMargin', () => {
  it('status sem_preco quando não há listing', () => {
    expect(computeMargin(baseProduct, 'plat-1', { ...baseDeps, listings: [] }).status).toBe('sem_preco')
  })

  it('status sem_regra quando não há regra nem liveFee', () => {
    expect(computeMargin(baseProduct, 'plat-1', { ...baseDeps, feeRules: [] }).status).toBe('sem_regra')
  })

  it('calcula margem estática corretamente', () => {
    const r = computeMargin(baseProduct, 'plat-1', baseDeps)
    expect(r.calculationMode).toBe('static_rule')
    expect(r.commission).toBe(10)
    expect(r.fixedFee).toBe(5)
    expect(r.netMargin).toBeCloseTo(45, 5)
  })

  it('liveFee tem precedência sobre regra estática', () => {
    const r = computeMargin(baseProduct, 'plat-1', {
      ...baseDeps,
      liveFee: { commission_pct: 12, fixed_fee: 7, source: 'live' },
    })
    expect(r.calculationMode).toBe('api_live_or_cache')
    expect(r.commission).toBe(12)
    expect(r.fixedFee).toBe(7)
    expect(r.rule.source_kind).toBe('api')
  })

  it('aplica custo adicional percentual com cap', () => {
    const r = computeMargin(baseProduct, 'plat-1', {
      ...baseDeps,
      listings: [makeListing({ sale_price: 1000 })],
      listingCostComponents: [{ product_listing_id: 'listing-1', cost_component_id: 'c1', value_override: null }],
      costComponents: [{
        id: 'c1', name: 'Programa de frete', calc_type: 'percentage', default_value: 6,
        calculation_basis: 'sale_price', cap_amount: 50,
      }],
    })
    expect(r.additionalCostsTotal).toBe(50)
  })

  it('nunca devolve mais isenção do que a comissão cobrada', () => {
    const promotions = [
      { platform_id: 'plat-1', category: null, starts_at: PAST, ends_at: FUTURE, benefit_type: 'commission_exemption', value_pct: 100 },
      { platform_id: 'plat-1', category: null, starts_at: PAST, ends_at: FUTURE, benefit_type: 'commission_exemption', value_pct: 100 },
    ]
    const r = computeMargin(baseProduct, 'plat-1', { ...baseDeps, promotions })
    expect(r.commission).toBe(10)
    expect(r.promoBenefitsTotal).toBe(10)
  })

  it('detecta margem negativa', () => {
    const r = computeMargin(baseProduct, 'plat-1', {
      ...baseDeps,
      listings: [makeListing({ sale_price: 45 })],
    })
    expect(r.netMargin).toBeLessThan(0)
  })
})
