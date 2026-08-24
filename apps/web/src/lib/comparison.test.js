import { describe, expect, it } from 'vitest'
import { compareProductAccounts } from './comparison'

const TODAY = '2026-08-24'
const PLATFORM = 'shopee'
const CATEGORY = 'category-1'

function feeRule(id, accountType, commissionPct) {
  return {
    id,
    platform_id: PLATFORM,
    marketplace_category_id: CATEGORY,
    category_scope: 'exact',
    category: null,
    listing_type: null,
    account_type: accountType,
    price_min: 0,
    price_max: null,
    commission_pct: commissionPct,
    fixed_fee: 0,
    valid_from: '2026-01-01',
    valid_to: null,
    source_kind: 'official',
    confidence_status: 'confirmed',
    calculation_config: {},
  }
}

function listing(id, accountId, documentType, price) {
  return {
    id,
    product_id: 'product-1',
    platform_id: PLATFORM,
    marketplace_account_id: accountId,
    marketplace_account: {
      id: accountId,
      name: documentType === 'cnpj' ? 'Principal' : 'Secundária',
      document_type: documentType,
      profile_config: {},
      is_default: documentType === 'cnpj',
    },
    sale_price: price,
    shipping_revenue: 0,
    marketplace_category_ref_id: CATEGORY,
    marketplace_category_name: 'Categoria',
    marketplace_category_path_ids: [CATEGORY],
    program_config: {},
    active: true,
  }
}

describe('compareProductAccounts', () => {
  it('mantém duas contas do mesmo marketplace como operações separadas', () => {
    const product = { id: 'product-1', category: 'Interna', cost_price: 50 }
    const deps = {
      listings: [
        listing('l-cnpj', 'account-cnpj', 'cnpj', 100),
        listing('l-cpf', 'account-cpf', 'cpf', 100),
      ],
      feeRules: [
        feeRule('rule-cnpj', 'cnpj', 10),
        feeRule('rule-cpf', 'cpf', 20),
      ],
      promotions: [],
      listingCostComponents: [],
      costComponents: [],
      asOf: TODAY,
    }

    const result = compareProductAccounts(
      product,
      [{ id: PLATFORM, name: 'Shopee' }],
      deps,
      20,
    )

    expect(result.rows).toHaveLength(2)
    expect(result.best.account.id).toBe('account-cnpj')
    expect(result.rows[0].rank).toBe(1)
    expect(result.rows[1].rank).toBe(2)
    expect(result.rows[0].marginPct).toBeCloseTo(40, 6)
    expect(result.rows[1].marginPct).toBeCloseTo(30, 6)
  })

  it('compara preços diferentes e calcula alvo individualmente por conta', () => {
    const product = { id: 'product-1', category: 'Interna', cost_price: 60 }
    const deps = {
      listings: [
        listing('l-cnpj', 'account-cnpj', 'cnpj', 90),
        listing('l-cpf', 'account-cpf', 'cpf', 110),
      ],
      feeRules: [
        feeRule('rule-cnpj', 'cnpj', 10),
        feeRule('rule-cpf', 'cpf', 20),
      ],
      promotions: [],
      listingCostComponents: [],
      costComponents: [],
      asOf: TODAY,
    }

    const result = compareProductAccounts(
      product,
      [{ id: PLATFORM, name: 'Shopee' }],
      deps,
      20,
    )

    const cnpj = result.rows.find((row) => row.account.id === 'account-cnpj')
    const cpf = result.rows.find((row) => row.account.id === 'account-cpf')

    expect(cnpj.targetPrice).toBe(85.72)
    expect(cpf.targetPrice).toBe(100)
    expect(cnpj.priceAdjustmentToTarget).toBeCloseTo(-4.28, 6)
    expect(cpf.priceAdjustmentToTarget).toBeCloseTo(-10, 6)
  })

  it('mantém operações sem regra oficial na tabela, mas fora do ranking', () => {
    const product = { id: 'product-1', category: 'Interna', cost_price: 50 }
    const deps = {
      listings: [
        listing('l-cnpj', 'account-cnpj', 'cnpj', 100),
        listing('l-cpf', 'account-cpf', 'cpf', 100),
      ],
      feeRules: [feeRule('rule-cnpj', 'cnpj', 10)],
      promotions: [],
      listingCostComponents: [],
      costComponents: [],
      asOf: TODAY,
    }

    const result = compareProductAccounts(
      product,
      [{ id: PLATFORM, name: 'Shopee' }],
      deps,
      20,
    )

    expect(result.rows).toHaveLength(2)
    expect(result.rows[0].status).toBe('ok')
    expect(result.rows[1].status).toBe('sem_regra')
    expect(result.rows[1].rank).toBeNull()
  })
})
