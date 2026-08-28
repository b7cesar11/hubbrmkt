import { describe, expect, it } from 'vitest'
import { computeMargin } from './margin'

const product = { id: 'p1', category: 'Geral', cost_price: 50 }

function shopeeRule(accountType, overrides = {}) {
  return {
    id: `shopee-${accountType}`,
    platform_id: 'shopee',
    account_type: accountType,
    category: null,
    listing_type: null,
    valid_from: '2026-03-01',
    valid_to: null,
    price_min: 100,
    price_max: 200,
    commission_pct: 14,
    fixed_fee: 20,
    source_kind: 'official',
    confidence_status: 'confirmed',
    calculation_config:
      accountType === 'cpf'
        ? {
            required_profile_fields: [
              {
                key: 'shopee_cpf_order_band',
                allowed: ['under_450', 'over_450'],
                message: 'Informe a faixa de pedidos.',
              },
            ],
            additional_charges: [
              {
                code: 'cpf-high-volume',
                name: 'Adicional CPF',
                calc_type: 'fixed',
                value: 3,
                condition: {
                  program_key: 'shopee_cpf_order_band',
                  equals: 'over_450',
                },
                unknown_policy: 'skip',
              },
            ],
            unsupported_below_price: {
              threshold: 12,
              message: 'Fórmula oficial incompleta abaixo de R$12.',
            },
            unsupported_exact_prices: [80, 100, 200, 500],
            unsupported_exact_prices_message: 'Limite exato não explicitado.',
          }
        : {
            unsupported_exact_prices: [80, 100, 200, 500],
            unsupported_exact_prices_message: 'Limite exato não explicitado.',
          },
    ...overrides,
  }
}

function listing(id, account, price = 150) {
  return {
    id,
    product_id: 'p1',
    platform_id: 'shopee',
    marketplace_account_id: account.id,
    marketplace_account: account,
    sale_price: price,
    listing_type: null,
    program_config: {},
  }
}

function deps(listings, feeRules, extra = {}) {
  return {
    listings,
    feeRules,
    promotions: [],
    listingCostComponents: [],
    costComponents: [],
    asOf: '2026-08-23',
    ...extra,
  }
}

describe('motor por conta e somente taxas oficiais', () => {
  it('ignora regra estimada mesmo quando ela seria numericamente aplicável', () => {
    const account = { id: 'a1', document_type: 'cnpj', profile_config: {}, is_default: true }
    const estimate = {
      ...shopeeRule('cnpj'),
      id: 'estimate',
      commission_pct: 1,
      fixed_fee: 0,
      source_kind: 'static',
      confidence_status: 'estimate',
    }
    const result = computeMargin(
      product,
      'shopee',
      deps([listing('l1', account)], [estimate, shopeeRule('cnpj')])
    )
    expect(result.status).toBe('ok')
    expect(result.rule.id).toBe('shopee-cnpj')
    expect(result.commission).toBe(21)
    expect(result.fixedFee).toBe(20)
  })

  it('calcula o mesmo SKU de forma diferente em conta CNPJ e CPF acima de 450 pedidos', () => {
    const cnpj = { id: 'cnpj', document_type: 'cnpj', profile_config: {}, is_default: true }
    const cpf = {
      id: 'cpf',
      document_type: 'cpf',
      profile_config: { shopee_cpf_order_band: 'over_450' },
      is_default: false,
    }
    const listings = [listing('l-cnpj', cnpj), listing('l-cpf', cpf)]
    const rules = [shopeeRule('cnpj'), shopeeRule('cpf')]

    const cnpjMargin = computeMargin(product, 'shopee', deps(listings, rules, { marketplaceAccountId: 'cnpj' }))
    const cpfMargin = computeMargin(product, 'shopee', deps(listings, rules, { marketplaceAccountId: 'cpf' }))

    expect(cnpjMargin.status).toBe('ok')
    expect(cpfMargin.status).toBe('ok')
    expect(cnpjMargin.additionalCostsTotal).toBe(0)
    expect(cpfMargin.platformChargesTotal).toBe(3)
    expect(cpfMargin.netMargin).toBe(cnpjMargin.netMargin - 3)
  })

  it('bloqueia CPF sem informação de volume em 90 dias', () => {
    const cpf = { id: 'cpf', document_type: 'cpf', profile_config: {}, is_default: true }
    const result = computeMargin(product, 'shopee', deps([listing('l1', cpf)], [shopeeRule('cpf')]))
    expect(result.status).toBe('configuracao_conta_pendente')
    expect(result.reason).toContain('faixa de pedidos')
  })

  it('não infere fórmula CPF abaixo de R$12 quando a fonte oficial não a expõe por completo', () => {
    const cpf = {
      id: 'cpf',
      document_type: 'cpf',
      profile_config: { shopee_cpf_order_band: 'under_450' },
      is_default: true,
    }
    const lowRule = shopeeRule('cpf', { price_min: 0, price_max: 80, commission_pct: 20, fixed_fee: 4 })
    const result = computeMargin(product, 'shopee', deps([listing('l1', cpf, 10)], [lowRule]))
    expect(result.status).toBe('taxa_oficial_incompleta')
    expect(result.reason).toContain('abaixo de R$12')
  })

  it('não escolhe silenciosamente um lado em limite oficial escrito como “acima de”', () => {
    const cnpj = { id: 'cnpj', document_type: 'cnpj', profile_config: {}, is_default: true }
    const lower = shopeeRule('cnpj', { price_min: 0, price_max: 100, commission_pct: 14, fixed_fee: 16 })
    const result = computeMargin(product, 'shopee', deps([listing('l1', cnpj, 80)], [lower]))
    expect(result.status).toBe('taxa_oficial_incompleta')
    expect(result.reason).toContain('Limite exato')
  })
})
