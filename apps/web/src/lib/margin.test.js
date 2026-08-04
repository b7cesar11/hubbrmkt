import { describe, it, expect } from 'vitest'
import {
  getListing,
  findApplicableRule,
  getApplicablePromotions,
  computeMargin,
} from './margin'

// ---------------------------------------------------------------------------
// Fixtures / helpers
// ---------------------------------------------------------------------------
const FUTURE = '2999-12-31'
const PAST = '2000-01-01'

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

// ---------------------------------------------------------------------------
// getListing
// ---------------------------------------------------------------------------
describe('getListing', () => {
  it('encontra o listing pelo par produto/plataforma', () => {
    const listings = [makeListing(), makeListing({ id: 'l2', platform_id: 'plat-2' })]
    expect(getListing('prod-1', 'plat-1', listings)?.id).toBe('listing-1')
    expect(getListing('prod-1', 'plat-2', listings)?.id).toBe('l2')
  })

  it('retorna undefined quando não há listing', () => {
    expect(getListing('prod-1', 'inexistente', [makeListing()])).toBeUndefined()
    expect(getListing('prod-1', 'plat-1', [])).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// findApplicableRule
// ---------------------------------------------------------------------------
describe('findApplicableRule', () => {
  it('retorna a regra quando plataforma e vigência batem (category/listing_type null = curinga)', () => {
    const rules = [makeRule()]
    const r = findApplicableRule('plat-1', 'eletronicos', 100, null, rules)
    expect(r?.id).toBe('rule-1')
  })

  it('ignora regra de outra plataforma', () => {
    const rules = [makeRule({ platform_id: 'outra' })]
    expect(findApplicableRule('plat-1', 'eletronicos', 100, null, rules)).toBeUndefined()
  })

  it('respeita categoria específica', () => {
    const rules = [makeRule({ category: 'moda' })]
    expect(findApplicableRule('plat-1', 'eletronicos', 100, null, rules)).toBeUndefined()
    expect(findApplicableRule('plat-1', 'moda', 100, null, rules)?.id).toBe('rule-1')
  })

  it('respeita listing_type específico', () => {
    const rules = [makeRule({ listing_type: 'premium' })]
    expect(findApplicableRule('plat-1', 'x', 100, 'classico', rules)).toBeUndefined()
    expect(findApplicableRule('plat-1', 'x', 100, 'premium', rules)?.id).toBe('rule-1')
  })

  it('respeita faixa de preço [min, max) — max é exclusivo', () => {
    const rules = [makeRule({ price_min: 50, price_max: 100 })]
    expect(findApplicableRule('plat-1', 'x', 49.99, null, rules)).toBeUndefined() // abaixo do min
    expect(findApplicableRule('plat-1', 'x', 50, null, rules)?.id).toBe('rule-1') // no min (incluso)
    expect(findApplicableRule('plat-1', 'x', 99.99, null, rules)?.id).toBe('rule-1')
    expect(findApplicableRule('plat-1', 'x', 100, null, rules)).toBeUndefined() // no max (excluso)
  })

  it('descarta regras fora da vigência', () => {
    const futura = [makeRule({ valid_from: FUTURE })]
    const expirada = [makeRule({ valid_from: PAST, valid_to: PAST })]
    expect(findApplicableRule('plat-1', 'x', 100, null, futura)).toBeUndefined()
    expect(findApplicableRule('plat-1', 'x', 100, null, expirada)).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// getApplicablePromotions
// ---------------------------------------------------------------------------
describe('getApplicablePromotions', () => {
  const promoAtiva = {
    platform_id: 'plat-1',
    category: null,
    starts_at: PAST,
    ends_at: FUTURE,
  }

  it('retorna promoção vigente da plataforma', () => {
    expect(getApplicablePromotions('plat-1', 'x', [promoAtiva])).toHaveLength(1)
  })

  it('exclui promoção de outra plataforma ou categoria', () => {
    expect(
      getApplicablePromotions('outra', 'x', [promoAtiva])
    ).toHaveLength(0)
    expect(
      getApplicablePromotions('plat-1', 'x', [{ ...promoAtiva, category: 'moda' }])
    ).toHaveLength(0)
  })

  it('exclui promoção fora da janela de datas', () => {
    const expirada = { ...promoAtiva, starts_at: PAST, ends_at: PAST }
    expect(getApplicablePromotions('plat-1', 'x', [expirada])).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// computeMargin
// ---------------------------------------------------------------------------
describe('computeMargin', () => {
  const baseDeps = {
    listings: [makeListing()],
    feeRules: [makeRule()],
    promotions: [],
    listingCostComponents: [],
    costComponents: [],
  }

  it('status "sem_preco" quando não há listing', () => {
    const r = computeMargin(baseProduct, 'plat-1', { ...baseDeps, listings: [] })
    expect(r.status).toBe('sem_preco')
  })

  it('status "sem_regra" quando não há regra de taxa', () => {
    const r = computeMargin(baseProduct, 'plat-1', { ...baseDeps, feeRules: [] })
    expect(r.status).toBe('sem_regra')
  })

  it('calcula margem base corretamente (preço 100, custo 40, 10% + R$5)', () => {
    // netMargin = 100 - 40 - (100*10%) - 5 = 45 ; marginPct = 45%
    const r = computeMargin(baseProduct, 'plat-1', baseDeps)
    expect(r.status).toBe('ok')
    expect(r.salePrice).toBe(100)
    expect(r.commission).toBe(10)
    expect(r.fixedFee).toBe(5)
    expect(r.netMargin).toBeCloseTo(45, 5)
    expect(r.marginPct).toBeCloseTo(45, 5)
  })

  it('desconta custos adicionais percentuais e fixos', () => {
    const deps = {
      ...baseDeps,
      listingCostComponents: [
        { product_listing_id: 'listing-1', cost_component_id: 'c1', value_override: null },
        { product_listing_id: 'listing-1', cost_component_id: 'c2', value_override: null },
      ],
      costComponents: [
        { id: 'c1', name: 'Frete', calc_type: 'fixed', default_value: 8 },
        { id: 'c2', name: 'Imposto', calc_type: 'percentage', default_value: 10 },
      ],
    }
    // additional = 8 (fixo) + 10 (10% de 100) = 18 ; netMargin = 45 - 18 = 27
    const r = computeMargin(baseProduct, 'plat-1', deps)
    expect(r.additionalCostsTotal).toBeCloseTo(18, 5)
    expect(r.netMargin).toBeCloseTo(27, 5)
  })

  it('usa value_override quando presente', () => {
    const deps = {
      ...baseDeps,
      listingCostComponents: [
        { product_listing_id: 'listing-1', cost_component_id: 'c1', value_override: 20 },
      ],
      costComponents: [{ id: 'c1', name: 'Frete', calc_type: 'fixed', default_value: 8 }],
    }
    const r = computeMargin(baseProduct, 'plat-1', deps)
    expect(r.additionalCostsTotal).toBeCloseTo(20, 5) // override, não 8
  })

  it('aplica isenção de comissão (promoção) somando de volta o benefício', () => {
    const deps = {
      ...baseDeps,
      promotions: [
        {
          platform_id: 'plat-1',
          category: null,
          starts_at: PAST,
          ends_at: FUTURE,
          benefit_type: 'commission_exemption',
          value_pct: 100,
        },
      ],
    }
    // comissão 10 é 100% isenta -> netMargin base 45 + 10 = 55
    const r = computeMargin(baseProduct, 'plat-1', deps)
    expect(r.promoBenefitsTotal).toBeCloseTo(10, 5)
    expect(r.netMargin).toBeCloseTo(55, 5)
  })

  it('detecta margem negativa (prejuízo)', () => {
    const deps = {
      ...baseDeps,
      listings: [makeListing({ sale_price: 45 })], // preço abaixo do custo+taxas
      feeRules: [makeRule({ commission_pct: 10, fixed_fee: 5 })],
    }
    // 45 - 40 - 4.5 - 5 = -4.5
    const r = computeMargin({ ...baseProduct, cost_price: 40 }, 'plat-1', deps)
    expect(r.netMargin).toBeLessThan(0)
  })
})
