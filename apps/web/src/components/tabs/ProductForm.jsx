import React, { useEffect, useMemo, useState } from 'react'
import { computeMargin } from '../../lib/margin'
import { supabase } from '../../lib/supabase'

const SHOPEE = 'Shopee'
const TIKTOK = 'TikTok Shop'
const MERCADO_LIVRE = 'Mercado Livre'

function numberOrBlank(value) {
  return value == null ? '' : String(value)
}

function accountLabel(account, platform) {
  const type = account.document_type ? ` · ${account.document_type.toUpperCase()}` : ''
  return `${platform?.name || 'Marketplace'} · ${account.name}${type}`
}

function accountNeedsConfiguration(account, platformName) {
  if (platformName === SHOPEE) {
    if (!['cpf', 'cnpj'].includes(account.document_type)) return 'Informe se a conta Shopee é CPF ou CNPJ.'
    if (
      account.document_type === 'cpf' &&
      !['under_450', 'over_450'].includes(account.profile_config?.shopee_cpf_order_band)
    ) {
      return 'Informe a faixa de pedidos da conta CPF nos últimos 90 dias.'
    }
  }

  if (
    platformName === TIKTOK &&
    !['enrolled', 'opted_out'].includes(account.profile_config?.tiktok_shipping_fee_program)
  ) {
    return 'Informe se a conta participa do Programa de Taxas de Envio do TikTok.'
  }

  return null
}

export function ProductForm({
  platforms,
  feeRules,
  costComponents,
  editingProductId,
  newProduct,
  setNewProduct,
  newListings,
  setNewListings,
  setListingPrice,
  toggleListingCost,
  closeProductForm,
  availableCategories,
}) {
  const [promotions, setPromotions] = useState([])
  const [accounts, setAccounts] = useState([])
  const [accountFilter, setAccountFilter] = useState('all')
  const [showAccountForm, setShowAccountForm] = useState(false)
  const [editingAccountId, setEditingAccountId] = useState(null)
  const [accountForm, setAccountForm] = useState({
    platform_id: '',
    name: '',
    document_type: '',
    shopee_cpf_order_band: '',
    tiktok_shipping_fee_program: '',
    is_default: false,
  })
  const [accountSaving, setAccountSaving] = useState(false)
  const [accountError, setAccountError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const platformById = useMemo(
    () => new Map(platforms.map((platform) => [platform.id, platform])),
    [platforms]
  )

  async function loadAccounts() {
    const { data, error } = await supabase
      .from('marketplace_accounts')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: true })
    if (error) throw error
    setAccounts(data || [])
  }

  useEffect(() => {
    let cancelled = false

    async function loadSupportingData() {
      const [promotionsResult, accountsResult] = await Promise.allSettled([
        supabase.from('platform_promotions').select('*'),
        supabase.from('marketplace_accounts').select('*').eq('active', true).order('created_at', { ascending: true }),
      ])

      if (cancelled) return
      if (promotionsResult.status === 'fulfilled' && !promotionsResult.value.error) {
        setPromotions(promotionsResult.value.data || [])
      }
      if (accountsResult.status === 'fulfilled' && !accountsResult.value.error) {
        setAccounts(accountsResult.value.data || [])
      }
    }

    loadSupportingData()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!editingProductId) return undefined
    let cancelled = false

    async function hydrateListings() {
      const { data: listingRows, error: listingsError } = await supabase
        .from('product_listings')
        .select(
          'id, platform_id, marketplace_account_id, sale_price, listing_type, platform_category_id, logistic_type, shipping_mode, billable_weight_kg, length_cm, width_cm, height_cm, program_config'
        )
        .eq('product_id', editingProductId)

      if (cancelled || listingsError) return
      const listingIds = (listingRows || []).map((listing) => listing.id)
      let costLinks = []
      if (listingIds.length > 0) {
        const { data } = await supabase
          .from('listing_cost_components')
          .select('product_listing_id, cost_component_id')
          .in('product_listing_id', listingIds)
        costLinks = data || []
      }

      const next = {}
      for (const listing of listingRows || []) {
        next[listing.marketplace_account_id] = {
          enabled: true,
          sale_price: numberOrBlank(listing.sale_price),
          listing_type: listing.listing_type || '',
          platform_category_id: listing.platform_category_id || '',
          logistic_type: listing.logistic_type || '',
          shipping_mode: listing.shipping_mode || '',
          billable_weight_kg: numberOrBlank(listing.billable_weight_kg),
          length_cm: numberOrBlank(listing.length_cm),
          width_cm: numberOrBlank(listing.width_cm),
          height_cm: numberOrBlank(listing.height_cm),
          program_config: listing.program_config || {},
          selectedCosts: costLinks
            .filter((link) => link.product_listing_id === listing.id)
            .map((link) => link.cost_component_id),
          _listingId: listing.id,
        }
      }
      setNewListings(next)
    }

    hydrateListings()
    return () => {
      cancelled = true
    }
  }, [editingProductId, setNewListings])

  function setListingField(accountId, field, value) {
    setNewListings((previous) => ({
      ...previous,
      [accountId]: { ...previous[accountId], [field]: value },
    }))
  }

  function resetAccountForm() {
    setEditingAccountId(null)
    setAccountForm({
      platform_id: '',
      name: '',
      document_type: '',
      shopee_cpf_order_band: '',
      tiktok_shipping_fee_program: '',
      is_default: false,
    })
    setAccountError(null)
    setShowAccountForm(false)
  }

  function editAccount(account) {
    setEditingAccountId(account.id)
    setAccountForm({
      platform_id: account.platform_id,
      name: account.name,
      document_type: account.document_type || '',
      shopee_cpf_order_band: account.profile_config?.shopee_cpf_order_band || '',
      tiktok_shipping_fee_program: account.profile_config?.tiktok_shipping_fee_program || '',
      is_default: Boolean(account.is_default),
    })
    setAccountError(null)
    setShowAccountForm(true)
  }

  async function saveMarketplaceAccount(event) {
    event.preventDefault()
    setAccountError(null)

    const platform = platformById.get(accountForm.platform_id)
    if (!platform || !accountForm.name.trim()) {
      setAccountError('Informe o marketplace e um nome para identificar a conta.')
      return
    }
    if (platform.name === SHOPEE && !['cpf', 'cnpj'].includes(accountForm.document_type)) {
      setAccountError('Na Shopee, informe se a conta é CPF ou CNPJ.')
      return
    }
    if (
      platform.name === SHOPEE &&
      accountForm.document_type === 'cpf' &&
      !['under_450', 'over_450'].includes(accountForm.shopee_cpf_order_band)
    ) {
      setAccountError('Para CPF, informe se a conta ultrapassou 450 pedidos nos últimos 90 dias.')
      return
    }
    if (
      platform.name === TIKTOK &&
      !['enrolled', 'opted_out'].includes(accountForm.tiktok_shipping_fee_program)
    ) {
      setAccountError('Informe a situação do Programa de Taxas de Envio do TikTok.')
      return
    }

    const profileConfig = {}
    if (platform.name === SHOPEE && accountForm.document_type === 'cpf') {
      profileConfig.shopee_cpf_order_band = accountForm.shopee_cpf_order_band
    }
    if (platform.name === TIKTOK) {
      profileConfig.tiktok_shipping_fee_program = accountForm.tiktok_shipping_fee_program
    }

    setAccountSaving(true)
    try {
      const { error } = await supabase.rpc('fn_upsert_marketplace_account', {
        p_account_id: editingAccountId || null,
        p_platform_id: accountForm.platform_id,
        p_name: accountForm.name.trim(),
        p_document_type: accountForm.document_type || null,
        p_profile_config: profileConfig,
        p_is_default: Boolean(accountForm.is_default),
      })
      if (error) throw error

      await loadAccounts()
      window.dispatchEvent(new CustomEvent('margemhub:data-changed'))
      resetAccountForm()
    } catch (error) {
      setAccountError(error.message || 'Não foi possível salvar a conta.')
    } finally {
      setAccountSaving(false)
    }
  }

  function previewForAccount(account) {
    const platform = platformById.get(account.platform_id)
    const entry = newListings[account.id]
    const price = Number(entry?.sale_price)
    const cost = Number(newProduct.cost_price)
    if (!platform || !entry?.enabled || !Number.isFinite(price) || price <= 0 || !Number.isFinite(cost)) return null

    const previewProduct = {
      id: 'preview-product',
      category: newProduct.category,
      cost_price: cost,
    }
    const previewListingId = `preview-${account.id}`
    const previewListing = {
      id: previewListingId,
      product_id: previewProduct.id,
      platform_id: platform.id,
      marketplace_account_id: account.id,
      marketplace_account: account,
      sale_price: price,
      listing_type: entry.listing_type || null,
      platform_category_id: entry.platform_category_id || null,
      program_config: entry.program_config || {},
    }
    const selectedCosts = (entry.selectedCosts || []).map((costId) => ({
      product_listing_id: previewListingId,
      cost_component_id: costId,
      value_override: null,
    }))

    return computeMargin(previewProduct, platform.id, {
      listings: [previewListing],
      feeRules,
      promotions,
      listingCostComponents: selectedCosts,
      costComponents,
      marketplaceAccountId: account.id,
    })
  }

  async function handleTransactionalSave(event) {
    event.preventDefault()
    setSaving(true)
    setSaveError(null)

    const enabledAccounts = accounts.filter((account) => newListings[account.id]?.enabled)
    for (const account of enabledAccounts) {
      const platform = platformById.get(account.platform_id)
      const issue = accountNeedsConfiguration(account, platform?.name)
      if (issue) {
        setSaveError(`${accountLabel(account, platform)}: ${issue}`)
        setSaving(false)
        return
      }
    }

    const listingsPayload = accounts.map((account) => {
      const entry = newListings[account.id] || {}
      return {
        marketplace_account_id: account.id,
        platform_id: account.platform_id,
        enabled: Boolean(entry.enabled),
        sale_price: entry.sale_price || '',
        listing_type: entry.listing_type || '',
        platform_category_id: entry.platform_category_id || '',
        logistic_type: entry.logistic_type || '',
        shipping_mode: entry.shipping_mode || '',
        billable_weight_kg: entry.billable_weight_kg || '',
        length_cm: entry.length_cm || '',
        width_cm: entry.width_cm || '',
        height_cm: entry.height_cm || '',
        program_config: entry.program_config || {},
        selectedCosts: entry.selectedCosts || [],
      }
    })

    try {
      const { error } = await supabase.rpc('fn_save_product_with_listings', {
        p_product_id: editingProductId || null,
        p_product: {
          sku: newProduct.sku,
          name: newProduct.name,
          category: newProduct.category,
          cost_price: newProduct.cost_price,
          weight_kg: newProduct.weight_kg || '',
        },
        p_listings: listingsPayload,
      })
      if (error) throw error

      window.dispatchEvent(new CustomEvent('margemhub:data-changed'))
      closeProductForm()
    } catch (error) {
      setSaveError(error.message || 'Não foi possível salvar o produto.')
    } finally {
      setSaving(false)
    }
  }

  const visibleAccounts = accounts.filter(
    (account) => accountFilter === 'all' || account.id === accountFilter
  )
  const accountFormPlatform = platformById.get(accountForm.platform_id)

  return (
    <div className="bg-white rounded-xl shadow-md p-6 mb-6">
      <div className="flex flex-col gap-1 mb-5">
        <h3 className="text-base font-semibold text-gray-900">
          {editingProductId ? 'Editar produto' : 'Novo produto'}
        </h3>
        <p className="text-xs text-gray-500">
          Primeiro configure as contas da operação. Cada conta recebe seu próprio preço e sua própria regra oficial.
        </p>
      </div>

      <section className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">Contas de marketplace</h4>
            <p className="text-xs text-slate-600 mt-1">
              Não armazenamos o número do CPF/CNPJ; apenas o perfil necessário para escolher a política oficial correta.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              resetAccountForm()
              setShowAccountForm(true)
            }}
            className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
          >
            + Adicionar conta
          </button>
        </div>

        {accounts.length > 0 ? (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
            {accounts.map((account) => {
              const platform = platformById.get(account.platform_id)
              const issue = accountNeedsConfiguration(account, platform?.name)
              return (
                <div key={account.id} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium text-slate-900">{accountLabel(account, platform)}</div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        {account.is_default ? 'Conta padrão para este marketplace' : 'Conta adicional'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => editAccount(account)}
                      className="text-xs font-medium text-blue-600 hover:underline"
                    >
                      Editar
                    </button>
                  </div>
                  {issue ? (
                    <div className="mt-2 text-xs text-amber-700">⚠️ {issue}</div>
                  ) : (
                    <div className="mt-2 text-xs text-green-700">✓ Perfil suficiente para regras oficiais conhecidas</div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-blue-200 bg-white p-4 text-xs text-slate-600">
            Cadastre ao menos uma conta antes de associar o produto a um marketplace.
          </div>
        )}

        {showAccountForm && (
          <form onSubmit={saveMarketplaceAccount} className="mt-4 rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select
                value={accountForm.platform_id}
                onChange={(event) => setAccountForm({ ...accountForm, platform_id: event.target.value })}
                required
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              >
                <option value="">Marketplace...</option>
                {platforms.map((platform) => (
                  <option key={platform.id} value={platform.id}>{platform.name}</option>
                ))}
              </select>
              <input
                value={accountForm.name}
                onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })}
                placeholder="Nome da conta (ex.: Shopee Principal)"
                required
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select
                value={accountForm.document_type}
                onChange={(event) =>
                  setAccountForm({
                    ...accountForm,
                    document_type: event.target.value,
                    shopee_cpf_order_band: event.target.value === 'cpf' ? accountForm.shopee_cpf_order_band : '',
                  })
                }
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              >
                <option value="">CPF/CNPJ não aplicável ou não informado</option>
                <option value="cpf">CPF</option>
                <option value="cnpj">CNPJ</option>
              </select>

              {accountFormPlatform?.name === SHOPEE && accountForm.document_type === 'cpf' && (
                <select
                  value={accountForm.shopee_cpf_order_band}
                  onChange={(event) => setAccountForm({ ...accountForm, shopee_cpf_order_band: event.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                  required
                >
                  <option value="">Pedidos nos últimos 90 dias...</option>
                  <option value="under_450">Até 450 pedidos</option>
                  <option value="over_450">Mais de 450 pedidos</option>
                </select>
              )}

              {accountFormPlatform?.name === TIKTOK && (
                <select
                  value={accountForm.tiktok_shipping_fee_program}
                  onChange={(event) => setAccountForm({ ...accountForm, tiktok_shipping_fee_program: event.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                  required
                >
                  <option value="">Programa de Taxas de Envio...</option>
                  <option value="enrolled">Participa</option>
                  <option value="opted_out">Não participa / opt-out</option>
                </select>
              )}
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={accountForm.is_default}
                onChange={(event) => setAccountForm({ ...accountForm, is_default: event.target.checked })}
              />
              Usar como conta padrão deste marketplace
            </label>

            {accountError && <div className="text-xs text-red-700">{accountError}</div>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={accountSaving}
                className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
              >
                {accountSaving ? 'Salvando…' : editingAccountId ? 'Salvar conta' : 'Cadastrar conta'}
              </button>
              <button type="button" onClick={resetAccountForm} className="px-3 py-2 text-xs text-slate-500">
                Cancelar
              </button>
            </div>
          </form>
        )}
      </section>

      <form onSubmit={handleTransactionalSave} className="space-y-6">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Dados do produto</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="SKU"
              value={newProduct.sku}
              onChange={(event) => setNewProduct({ ...newProduct, sku: event.target.value })}
              required
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <input
              type="text"
              placeholder="Nome"
              value={newProduct.name}
              onChange={(event) => setNewProduct({ ...newProduct, name: event.target.value })}
              required
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <input
              type="text"
              placeholder="Categoria interna"
              list="categorias-existentes"
              value={newProduct.category}
              onChange={(event) => setNewProduct({ ...newProduct, category: event.target.value })}
              required
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <datalist id="categorias-existentes">
              {availableCategories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
            <input
              type="number"
              placeholder="Custo (R$)"
              value={newProduct.cost_price}
              onChange={(event) => setNewProduct({ ...newProduct, cost_price: event.target.value })}
              required
              step="0.01"
              min="0"
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <input
              type="number"
              placeholder="Peso do produto (kg)"
              value={newProduct.weight_kg}
              onChange={(event) => setNewProduct({ ...newProduct, weight_kg: event.target.value })}
              step="0.001"
              min="0"
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-700">Preço e margem por conta</h3>
              <p className="text-xs text-gray-500 mt-1">
                Uma empresa pode ter várias contas do mesmo marketplace; cada uma é calculada separadamente.
              </p>
            </div>
            {accounts.length > 1 && (
              <select
                value={accountFilter}
                onChange={(event) => setAccountFilter(event.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              >
                <option value="all">Todas as contas</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {accountLabel(account, platformById.get(account.platform_id))}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-3">
            {visibleAccounts.map((account) => {
              const platform = platformById.get(account.platform_id)
              const entry = newListings[account.id] || {}
              const preview = previewForAccount(account)
              const configurationIssue = accountNeedsConfiguration(account, platform?.name)

              return (
                <div key={account.id} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      type="checkbox"
                      checked={Boolean(entry.enabled)}
                      onChange={() => setListingField(account.id, 'enabled', !entry.enabled)}
                      className="w-4 h-4 rounded border-gray-300"
                    />
                    <span className="min-w-52 text-sm font-medium text-gray-700">
                      {accountLabel(account, platform)}
                    </span>
                    <input
                      type="number"
                      placeholder="Preço de venda (R$)"
                      disabled={!entry.enabled}
                      value={entry.sale_price || ''}
                      onChange={(event) => setListingPrice(account.id, event.target.value)}
                      step="0.01"
                      min="0"
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100 disabled:text-gray-400"
                    />
                    {platform?.name === MERCADO_LIVRE && entry.enabled && (
                      <select
                        value={entry.listing_type || ''}
                        onChange={(event) => setListingField(account.id, 'listing_type', event.target.value)}
                        className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
                      >
                        <option value="">Tipo de anúncio...</option>
                        <option value="classico">Clássico</option>
                        <option value="premium">Premium</option>
                      </select>
                    )}
                  </div>

                  {configurationIssue && entry.enabled && (
                    <div className="ml-7 mt-2 text-xs text-amber-700">⚠️ {configurationIssue}</div>
                  )}

                  {platform?.name === MERCADO_LIVRE && entry.enabled && (
                    <div className="ml-7 mt-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600">
                      O Mercado Livre publica oficialmente uma faixa de comissão por tipo de anúncio, mas o percentual exato varia por categoria. Sem uma tabela oficial pública exata, o MargemHub não usa estimativas no cálculo.
                    </div>
                  )}

                  {entry.enabled && costComponents.filter((component) => component.active).length > 0 && (
                    <div className="ml-7 mt-2 flex flex-wrap gap-2">
                      {costComponents.filter((component) => component.active).map((component) => (
                        <label key={component.id} className="flex items-center gap-1 text-xs bg-gray-50 rounded px-2 py-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(entry.selectedCosts?.includes(component.id))}
                            onChange={() => toggleListingCost(account.id, component.id)}
                            className="w-3 h-3"
                          />
                          {component.name} ({component.calc_type === 'percentage' ? `${component.default_value}%` : `R$${component.default_value}`})
                        </label>
                      ))}
                    </div>
                  )}

                  {preview?.status === 'ok' && (
                    <div className="ml-7 mt-2 text-xs">
                      <span className={`font-medium ${preview.marginPct > 10 ? 'text-green-600' : preview.marginPct > 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                        Margem oficial: R$ {preview.netMargin.toFixed(2)} ({preview.marginPct.toFixed(1)}%)
                      </span>
                      <span className="ml-2 text-green-700">· taxa oficial confirmada</span>
                      {preview.fixedFeeLabel && (
                        <div className="text-gray-600 mt-1">Taxa por item: R$ {preview.fixedFee.toFixed(2)} · {preview.fixedFeeLabel}</div>
                      )}
                      {preview.platformCharges?.map((charge) => (
                        <div key={charge.code || charge.name} className="text-gray-600 mt-1">
                          {charge.name}: -R$ {charge.amount.toFixed(2)}
                        </div>
                      ))}
                    </div>
                  )}

                  {preview && preview.status !== 'ok' && (
                    <div className="ml-7 mt-2 text-xs text-amber-700">
                      ⚠️ {preview.reason || 'Não há taxa oficial confirmada suficiente para calcular este anúncio.'}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {saveError && (
          <div className="rounded-lg bg-red-50 border border-red-100 p-3 text-sm text-red-700">{saveError}</div>
        )}

        <p className="text-xs text-gray-400">
          Produto e anúncios são salvos em uma única transação. Estimativas de marketplace não entram no cálculo oficial.
        </p>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg transition-colors"
          >
            {saving ? 'Salvando…' : editingProductId ? 'Salvar alterações' : 'Salvar'}
          </button>
          <button
            type="button"
            onClick={closeProductForm}
            disabled={saving}
            className="flex-1 bg-gray-200 hover:bg-gray-300 disabled:opacity-60 text-gray-700 px-4 py-2 rounded-lg transition-colors"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}
