import { describe, expect, it } from 'vitest'
import { computeMargin, findApplicableRule } from './margin'

const TODAY = '2026-08-24'

function rule(overrides = {}) {
  return {
    id: 'global',
    platform_id: 'platform-1',
    category: null,
    marketplace_category_id: null,
    category_scope: 'exact',
    listing_type: null,
    account_type: null,
    valid_from: '2026-01-01',
    valid_to: null,
    price_min: 0,
    price_max: null,
    commission_pct: 20,
    fixed_fee: 0,
    source_kind: 'official',
    confidence_status: 'confirmed',
    calculation_config: {},
    ...overrides,
  }
}

const path = ['root', 'furniture', 'office', 'chairs']

describe('findApplicableRule com taxonomia hierárquica', () => {
  it('prefere a regra mais específica da subcategoria', () => {
    const selected = findApplicableRule(
      'platform-1',
      'Cadeiras',
      100,
      null,
      [
        rule(),
        rule({
          id: 'furniture-rule',
          marketplace_category_id: 'furniture',
          category_scope: 'descendants',
          commission_pct: 15,
        }),
        rule({
          id: 'chairs-rule',
          marketplace_category_id: 'chairs',
          category_scope: 'exact',
          commission_pct: 12,
        }),
      ],
      TODAY,
      null,
      'chairs',
      path,
    )

    expect(selected.id).toBe('chairs-rule')
    expect(selected.commission_pct).toBe(12)
  })

  it('herda uma regra do ancestral somente quando scope=descendants', () => {
    const descendantRule = rule({
      id: 'ancestor-descendants',
      marketplace_category_id: 'office',
      category_scope: 'descendants',
      commission_pct: 14,
    })
    const exactRule = rule({
      id: 'ancestor-exact',
      marketplace_category_id: 'office',
      category_scope: 'exact',
      commission_pct: 10,
    })

    expect(
      findApplicableRule(
        'platform-1',
        'Cadeiras',
        100,
        null,
        [descendantRule],
        TODAY,
        null,
        'chairs',
        path,
      )?.id,
    ).toBe('ancestor-descendants')

    expect(
      findApplicableRule(
        'platform-1',
        'Cadeiras',
        100,
        null,
        [exactRule],
        TODAY,
        null,
        'chairs',
        path,
      ),
    ).toBeUndefined()
  })
})

describe('computeMargin com categoria oficial', () => {
  const product = { id: 'p1', category: 'Móveis', cost_price: 50 }
  const account = { id: 'a1', document_type: 'cnpj', profile_config: {}, is_default: true }

  function deps(listing, rules) {
    return {
      listings: [{ ...listing, marketplace_account: account }],
      feeRules: rules,
      promotions: [],
      listingCostComponents: [],
      costComponents: [],
      asOf: TODAY,
      marketplaceAccountId: 'a1',
    }
  }

  it('calcula usando a tarifa da subcategoria selecionada', () => {
    const listing = {
      id: 'l1',
      product_id: 'p1',
      platform_id: 'platform-1',
      marketplace_account_id: 'a1',
      sale_price: 100,
      listing_type: null,
      marketplace_category_ref_id: 'chairs',
      marketplace_category_name: 'Cadeiras de escritório',
      marketplace_category_path: 'Casa › Móveis › Escritório › Cadeiras de escritório',
      marketplace_category_path_ids: path,
      program_config: {},
    }

    const result = computeMargin(
      product,
      'platform-1',
      deps(listing, [
        rule(),
        rule({
          id: 'chairs-rule',
          marketplace_category_id: 'chairs',
          category_scope: 'exact',
          commission_pct: 12,
        }),
      ]),
    )

    expect(result.status).toBe('ok')
    expect(result.rule.id).toBe('chairs-rule')
    expect(result.commission).toBe(12)
    expect(result.netMargin).toBe(38)
    expect(result.marketplaceCategory.path).toContain('Cadeiras de escritório')
  })

  it('explica quando uma plataforma tem regra por categoria mas nenhuma categoria foi escolhida', () => {
    const listing = {
      id: 'l1',
      product_id: 'p1',
      platform_id: 'platform-1',
      marketplace_account_id: 'a1',
      sale_price: 100,
      listing_type: null,
      marketplace_category_ref_id: null,
      marketplace_category_path_ids: [],
      program_config: {},
    }

    const result = computeMargin(
      product,
      'platform-1',
      deps(listing, [
        rule({
          id: 'chairs-rule',
          marketplace_category_id: 'chairs',
          category_scope: 'exact',
          commission_pct: 12,
        }),
      ]),
    )

    expect(result.status).toBe('sem_regra')
    expect(result.reason).toContain('Selecione a categoria oficial')
  })
})
