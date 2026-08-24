import React, { useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Package,
  Sparkles,
  Store,
  Tags,
} from 'lucide-react'
import { computeMargin, isOfficialFeeRule } from '../../lib/margin'
import { supabase } from '../../lib/supabase'
import { MarketplaceCategoryPicker } from '../MarketplaceCategoryPicker'

const SHOPEE = 'Shopee'
const TIKTOK = 'TikTok Shop'
const MERCADO_LIVRE = 'Mercado Livre'

const STEPS = [
  { id: 1, label: 'Produto', icon: Package },
  { id: 2, label: 'Contas', icon: Store },
  { id: 3, label: 'Categorias e preços', icon: Tags },
  { id: 4, label: 'Revisão', icon: BarChart3 },
]

function numberOrBlank(value) {
  return value == null ? '' : String(value)
}

function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase('pt-BR')
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

function toCategorySnapshot(category) {
  if (!category?.id) return null
  return {
    id: category.id,
    name: category.name || category.marketplace_category_name || null,
    path: category.full_path || category.path || category.marketplace_category_path || category.name || null,
    pathIds: category.path_ids || category.pathIds || category.marketplace_category_path_ids || [],
    externalCategoryId:
      category.external_category_id || category.externalCategoryId || category.platform_category_id || null,
    sourceUrl: category.source_url || category.sourceUrl || null,
  }
}

function statusMessage(preview) {
  if (!preview) return 'Informe preço e custo para visualizar a margem.'
  if (preview.status === 'ok') return null
  return preview.reason || 'Não há informação oficial suficiente para calcular este anúncio.'
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
  const [step, setStep] = useState(1)
  const [promotions, setPromotions] = useState([])
  const [accounts, setAccounts] = useState([])
  const [categoryPreferences, setCategoryPreferences] = useState([])
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

  const officialRules = useMemo(() => feeRules.filter(isOfficialFeeRule), [feeRules])

  const selectedAccounts = useMemo(
    () => accounts.filter((account) => newListings[account.id]?.enabled),
    [accounts, newListings]
  )

  const visibleSelectedAccounts = selectedAccounts.filter(
    (account) => accountFilter === 'all' || account.id === accountFilter
  )

  async function loadAccounts() {
    const { data, error } = await supabase
      .from('marketplace_accounts')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: true })
    if (error) throw error
    setAccounts(data || [])
    return data || []
  }

  async function loadCategoryPreferences() {
    const { data, error } = await supabase
      .from('company_category_preferences')
      .select('platform_id, internal_category, marketplace_category_id, usage_count, last_used_at')
      .order('usage_count', { ascending: false })
      .order('last_used_at', { ascending: false })
    if (!error) setCategoryPreferences(data || [])
  }

  useEffect(() => {
    let cancelled = false

    async function loadSupportingData() {
      const [promotionsResult, accountsResult, preferencesResult] = await Promise.allSettled([
        supabase.from('platform_promotions').select('*'),
        supabase.from('marketplace_accounts').select('*').eq('active', true).order('created_at', { ascending: true }),
        supabase
          .from('company_category_preferences')
          .select('platform_id, internal_category, marketplace_category_id, usage_count, last_used_at')
          .order('usage_count', { ascending: false }),
      ])

      if (cancelled) return
      if (promotionsResult.status === 'fulfilled' && !promotionsResult.value.error) {
        setPromotions(promotionsResult.value.data || [])
      }
      if (accountsResult.status === 'fulfilled' && !accountsResult.value.error) {
        setAccounts(accountsResult.value.data || [])
      }
      if (preferencesResult.status === 'fulfilled' && !preferencesResult.value.error) {
        setCategoryPreferences(preferencesResult.value.data || [])
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
          'id, platform_id, marketplace_account_id, sale_price, listing_type, platform_category_id, marketplace_category_ref_id, marketplace_category_name, marketplace_category_path, marketplace_category_path_ids, logistic_type, shipping_mode, billable_weight_kg, length_cm, width_cm, height_cm, program_config'
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
          marketplace_category_ref_id: listing.marketplace_category_ref_id || '',
          _categoryMeta: listing.marketplace_category_ref_id
            ? toCategorySnapshot({
                id: listing.marketplace_category_ref_id,
                name: listing.marketplace_category_name,
                path: listing.marketplace_category_path,
                pathIds: listing.marketplace_category_path_ids,
                platform_category_id: listing.platform_category_id,
              })
            : null,
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

  function setCategoryForAccount(accountId, category) {
    const snapshot = toCategorySnapshot(category)
    setNewListings((previous) => ({
      ...previous,
      [accountId]: {
        ...previous[accountId],
        marketplace_category_ref_id: snapshot?.id || '',
        platform_category_id: snapshot?.externalCategoryId || '',
        _categoryMeta: snapshot,
      },
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
      const { data: savedAccountId, error } = await supabase.rpc('fn_upsert_marketplace_account', {
        p_account_id: editingAccountId || null,
        p_platform_id: accountForm.platform_id,
        p_name: accountForm.name.trim(),
        p_document_type: accountForm.document_type || null,
        p_profile_config: profileConfig,
        p_is_default: Boolean(accountForm.is_default),
      })
      if (error) throw error

      await loadAccounts()
      if (!editingAccountId && savedAccountId) {
        setListingField(savedAccountId, 'enabled', true)
      }
      window.dispatchEvent(new CustomEvent('margemhub:data-changed'))
      resetAccountForm()
    } catch (error) {
      setAccountError(error.message || 'Não foi possível salvar a conta.')
    } finally {
      setAccountSaving(false)
    }
  }

  function preferredCategoryIdsFor(platformId) {
    const internal = normalize(newProduct.category)
    return categoryPreferences
      .filter(
        (preference) =>
          preference.platform_id === platformId && normalize(preference.internal_category) === internal
      )
      .sort(
        (a, b) =>
          Number(b.usage_count || 0) - Number(a.usage_count || 0) ||
          String(b.last_used_at || '').localeCompare(String(a.last_used_at || ''))
      )
      .map((preference) => preference.marketplace_category_id)
  }

  function platformHasCategorySpecificRules(platformId) {
    return officialRules.some(
      (rule) => rule.platform_id === platformId && rule.marketplace_category_id != null
    )
  }

  function platformHasOfficialRules(platformId) {
    return officialRules.some((rule) => rule.platform_id === platformId)
  }

  function platformHasListingTypeRules(platformId) {
    return officialRules.some(
      (rule) => rule.platform_id === platformId && rule.listing_type != null
    )
  }

  function previewForAccount(account) {
    const platform = platformById.get(account.platform_id)
    const entry = newListings[account.id]
    const price = Number(entry?.sale_price)
    const cost = Number(newProduct.cost_price)
    if (!platform || !entry?.enabled || !Number.isFinite(price) || price <= 0 || !Number.isFinite(cost)) {
      return null
    }

    const categoryMeta = entry._categoryMeta || null
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
      marketplace_category_ref_id: entry.marketplace_category_ref_id || null,
      marketplace_category_name: categoryMeta?.name || null,
      marketplace_category_path: categoryMeta?.path || null,
      marketplace_category_path_ids: categoryMeta?.pathIds || [],
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

  function validateStep1() {
    if (!newProduct.sku.trim() || !newProduct.name.trim() || !newProduct.category.trim()) {
      setSaveError('Preencha SKU, nome e categoria interna para continuar.')
      return false
    }
    const cost = Number(newProduct.cost_price)
    if (!Number.isFinite(cost) || cost < 0) {
      setSaveError('Informe um custo de produto válido.')
      return false
    }
    setSaveError(null)
    return true
  }

  function validateStep2() {
    if (selectedAccounts.length === 0) {
      setSaveError('Selecione ao menos uma conta de marketplace para este produto.')
      return false
    }
    for (const account of selectedAccounts) {
      const platform = platformById.get(account.platform_id)
      const issue = accountNeedsConfiguration(account, platform?.name)
      if (issue) {
        setSaveError(`${accountLabel(account, platform)}: ${issue}`)
        return false
      }
    }
    setSaveError(null)
    return true
  }

  function validateStep3() {
    for (const account of selectedAccounts) {
      const platform = platformById.get(account.platform_id)
      const entry = newListings[account.id] || {}
      const price = Number(entry.sale_price)
      if (!Number.isFinite(price) || price <= 0) {
        setSaveError(`${accountLabel(account, platform)}: informe um preço de venda válido.`)
        return false
      }
      if (platformHasCategorySpecificRules(account.platform_id) && !entry.marketplace_category_ref_id) {
        setSaveError(
          `${accountLabel(account, platform)}: selecione a categoria oficial para aplicar a tarifa correta.`
        )
        return false
      }
      if (platformHasListingTypeRules(account.platform_id) && !entry.listing_type) {
        setSaveError(`${accountLabel(account, platform)}: selecione o tipo de anúncio.`)
        return false
      }
    }
    setSaveError(null)
    return true
  }

  function goNext() {
    const valid = step === 1 ? validateStep1() : step === 2 ? validateStep2() : validateStep3()
    if (valid) setStep((current) => Math.min(4, current + 1))
  }

  function goBack() {
    setSaveError(null)
    setStep((current) => Math.max(1, current - 1))
  }

  async function handleTransactionalSave() {
    if (!validateStep1() || !validateStep2() || !validateStep3()) return

    setSaving(true)
    setSaveError(null)

    const listingsPayload = accounts.map((account) => {
      const entry = newListings[account.id] || {}
      return {
        marketplace_account_id: account.id,
        platform_id: account.platform_id,
        enabled: Boolean(entry.enabled),
        sale_price: entry.sale_price || '',
        listing_type: entry.listing_type || '',
        platform_category_id: entry.platform_category_id || '',
        marketplace_category_ref_id: entry.marketplace_category_ref_id || '',
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

      await loadCategoryPreferences()
      window.dispatchEvent(new CustomEvent('margemhub:data-changed'))
      closeProductForm()
    } catch (error) {
      setSaveError(error.message || 'Não foi possível salvar o produto.')
    } finally {
      setSaving(false)
    }
  }

  const accountFormPlatform = platformById.get(accountForm.platform_id)
  const previews = selectedAccounts.map((account) => ({ account, preview: previewForAccount(account) }))
  const validMargins = previews.filter(({ preview }) => preview?.status === 'ok')
  const bestMargin = validMargins.length
    ? validMargins.reduce((best, current) =>
        current.preview.marginPct > best.preview.marginPct ? current : best
      )
    : null

  return (
    <div className="mb-6 overflow-hidden rounded-2xl bg-white shadow-md">
      <div className="border-b border-slate-100 bg-gradient-to-r from-slate-950 to-slate-800 px-5 py-5 text-white sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">Cadastro inteligente</div>
            <h3 className="mt-1 text-xl font-semibold">
              {editingProductId ? 'Editar produto e canais' : 'Novo produto'}
            </h3>
            <p className="mt-1 max-w-2xl text-xs text-slate-300">
              O MargemHub cruza conta, categoria oficial, tipo de anúncio e faixa de preço antes de calcular a margem.
            </p>
          </div>
          <div className="rounded-lg bg-white/10 px-3 py-2 text-xs text-slate-200">
            Taxas estimadas não entram no resultado oficial.
          </div>
        </div>
      </div>

      <div className="border-b border-slate-100 px-4 py-4 sm:px-6">
        <div className="grid grid-cols-4 gap-2">
          {STEPS.map((item) => {
            const Icon = item.icon
            const active = step === item.id
            const completed = step > item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id < step) {
                    setSaveError(null)
                    setStep(item.id)
                  }
                }}
                className={`rounded-xl border px-2 py-2 text-center transition-colors ${
                  active
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : completed
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-slate-50 text-slate-400'
                }`}
              >
                <div className="mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-sm">
                  {completed ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <div className="hidden text-[11px] font-medium sm:block">{item.label}</div>
                <div className="text-[10px] sm:hidden">{item.id}</div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="p-5 sm:p-6">
        {step === 1 && (
          <section>
            <div className="mb-5">
              <h4 className="text-base font-semibold text-slate-900">1. Dados do produto</h4>
              <p className="mt-1 text-xs text-slate-500">
                A categoria interna organiza seu catálogo; a categoria oficial de cada marketplace será escolhida depois.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-slate-600">SKU</span>
                <input
                  type="text"
                  value={newProduct.sku}
                  onChange={(event) => setNewProduct({ ...newProduct, sku: event.target.value })}
                  placeholder="Ex.: CAD-PRES-001"
                  className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-slate-600">Nome do produto</span>
                <input
                  type="text"
                  value={newProduct.name}
                  onChange={(event) => setNewProduct({ ...newProduct, name: event.target.value })}
                  placeholder="Ex.: Cadeira Presidente Ergonômica"
                  className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-slate-600">Categoria interna</span>
                <input
                  type="text"
                  list="categorias-existentes"
                  value={newProduct.category}
                  onChange={(event) => setNewProduct({ ...newProduct, category: event.target.value })}
                  placeholder="Ex.: Cadeiras"
                  className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
                <datalist id="categorias-existentes">
                  {availableCategories.map((category) => (
                    <option key={category} value={category} />
                  ))}
                </datalist>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-slate-600">Custo unitário</span>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-sm text-slate-400">R$</span>
                  <input
                    type="number"
                    value={newProduct.cost_price}
                    onChange={(event) => setNewProduct({ ...newProduct, cost_price: event.target.value })}
                    step="0.01"
                    min="0"
                    placeholder="0,00"
                    className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </label>
              <label className="block sm:col-span-2 sm:max-w-sm">
                <span className="mb-1.5 block text-xs font-medium text-slate-600">Peso padrão (kg)</span>
                <input
                  type="number"
                  value={newProduct.weight_kg}
                  onChange={(event) => setNewProduct({ ...newProduct, weight_kg: event.target.value })}
                  step="0.001"
                  min="0"
                  placeholder="Opcional"
                  className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>
            </div>
          </section>
        )}

        {step === 2 && (
          <section>
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h4 className="text-base font-semibold text-slate-900">2. Em quais contas este produto será vendido?</h4>
                <p className="mt-1 text-xs text-slate-500">
                  Cada conta mantém seu próprio perfil de taxas. Uma empresa pode ter várias contas no mesmo marketplace.
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

            {accounts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-blue-200 bg-blue-50 p-5 text-sm text-slate-600">
                Cadastre sua primeira conta de marketplace para continuar. O perfil da conta é preenchido uma vez e reutilizado em todos os produtos.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {accounts.map((account) => {
                  const platform = platformById.get(account.platform_id)
                  const issue = accountNeedsConfiguration(account, platform?.name)
                  const enabled = Boolean(newListings[account.id]?.enabled)
                  return (
                    <div
                      key={account.id}
                      className={`rounded-xl border p-4 transition-colors ${
                        enabled ? 'border-blue-300 bg-blue-50/60' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={() => setListingField(account.id, 'enabled', !enabled)}
                          className="mt-1 h-4 w-4 rounded border-slate-300"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-slate-900">{platform?.name}</span>
                            <span className="text-xs text-slate-600">{account.name}</span>
                            {account.document_type && (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                {account.document_type.toUpperCase()}
                              </span>
                            )}
                            {account.is_default && (
                              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">Padrão</span>
                            )}
                          </div>
                          {issue ? (
                            <div className="mt-2 text-xs text-amber-700">⚠️ {issue}</div>
                          ) : (
                            <div className="mt-2 flex items-center gap-1 text-xs text-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Perfil pronto para regras oficiais conhecidas
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => editAccount(account)}
                          className="text-xs font-medium text-blue-600 hover:underline"
                        >
                          Editar
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {showAccountForm && (
              <form
                onSubmit={saveMarketplaceAccount}
                className="mt-5 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex items-center justify-between">
                  <h5 className="text-sm font-semibold text-slate-900">
                    {editingAccountId ? 'Editar perfil da conta' : 'Nova conta de marketplace'}
                  </h5>
                  <span className="text-[11px] text-slate-500">Dados usados para escolher a política correta</span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <select
                    value={accountForm.platform_id}
                    onChange={(event) => setAccountForm({ ...accountForm, platform_id: event.target.value })}
                    required
                    disabled={Boolean(editingAccountId)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
                  >
                    <option value="">Marketplace...</option>
                    {platforms.map((platform) => (
                      <option key={platform.id} value={platform.id}>{platform.name}</option>
                    ))}
                  </select>
                  <input
                    value={accountForm.name}
                    onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })}
                    placeholder="Nome da conta (ex.: Principal, Outlet...)"
                    required
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <select
                    value={accountForm.document_type}
                    onChange={(event) =>
                      setAccountForm({
                        ...accountForm,
                        document_type: event.target.value,
                        shopee_cpf_order_band:
                          event.target.value === 'cpf' ? accountForm.shopee_cpf_order_band : '',
                      })
                    }
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">CPF/CNPJ não aplicável ou não informado</option>
                    <option value="cpf">CPF</option>
                    <option value="cnpj">CNPJ</option>
                  </select>

                  {accountFormPlatform?.name === SHOPEE && accountForm.document_type === 'cpf' && (
                    <select
                      value={accountForm.shopee_cpf_order_band}
                      onChange={(event) =>
                        setAccountForm({ ...accountForm, shopee_cpf_order_band: event.target.value })
                      }
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
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
                      onChange={(event) =>
                        setAccountForm({
                          ...accountForm,
                          tiktok_shipping_fee_program: event.target.value,
                        })
                      }
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
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
                  <button
                    type="button"
                    onClick={resetAccountForm}
                    className="px-3 py-2 text-xs text-slate-500"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </section>
        )}

        {step === 3 && (
          <section>
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h4 className="text-base font-semibold text-slate-900">3. Classificação e preço por conta</h4>
                <p className="mt-1 text-xs text-slate-500">
                  Confirme a categoria oficial de cada canal. O sistema aprende suas escolhas e passa a priorizá-las nos próximos produtos.
                </p>
              </div>
              {selectedAccounts.length > 1 && (
                <select
                  value={accountFilter}
                  onChange={(event) => setAccountFilter(event.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="all">Todas as contas selecionadas</option>
                  {selectedAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {accountLabel(account, platformById.get(account.platform_id))}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-4">
              {visibleSelectedAccounts.map((account) => {
                const platform = platformById.get(account.platform_id)
                const entry = newListings[account.id] || {}
                const preview = previewForAccount(account)
                const categoryRequired = platformHasCategorySpecificRules(account.platform_id)
                const hasOfficial = platformHasOfficialRules(account.platform_id)
                const message = statusMessage(preview)

                return (
                  <div key={account.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h5 className="text-sm font-semibold text-slate-900">{platform?.name} · {account.name}</h5>
                          {account.document_type && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                              {account.document_type.toUpperCase()}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {categoryRequired
                            ? 'A tarifa oficial deste canal depende da categoria selecionada.'
                            : 'A categoria pode ser cadastrada para classificação, mesmo quando a tarifa atual é global.'}
                        </p>
                      </div>
                      {hasOfficial ? (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                          Regras oficiais disponíveis
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                          Sem regra oficial exata
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <div>
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="text-xs font-medium text-slate-600">Categoria oficial</span>
                          <span className={`text-[10px] font-semibold ${categoryRequired ? 'text-blue-700' : 'text-slate-400'}`}>
                            {categoryRequired ? 'Obrigatória para tarifa exata' : 'Opcional na regra atual'}
                          </span>
                        </div>
                        <MarketplaceCategoryPicker
                          platformId={account.platform_id}
                          value={entry.marketplace_category_ref_id || ''}
                          snapshot={entry._categoryMeta}
                          productName={newProduct.name}
                          internalCategory={newProduct.category}
                          preferredCategoryIds={preferredCategoryIdsFor(account.platform_id)}
                          onSelect={(category) => setCategoryForAccount(account.id, category)}
                        />
                      </div>

                      <div className="space-y-3">
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-medium text-slate-600">Preço de venda</span>
                          <div className="relative">
                            <span className="absolute left-3 top-2.5 text-sm text-slate-400">R$</span>
                            <input
                              type="number"
                              value={entry.sale_price || ''}
                              onChange={(event) => setListingPrice(account.id, event.target.value)}
                              step="0.01"
                              min="0.01"
                              placeholder="0,00"
                              className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                            />
                          </div>
                        </label>

                        {(platform?.name === MERCADO_LIVRE || platformHasListingTypeRules(account.platform_id)) && (
                          <label className="block">
                            <span className="mb-1.5 block text-xs font-medium text-slate-600">Tipo de anúncio</span>
                            <select
                              value={entry.listing_type || ''}
                              onChange={(event) => setListingField(account.id, 'listing_type', event.target.value)}
                              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                            >
                              <option value="">Selecione...</option>
                              <option value="classico">Clássico</option>
                              <option value="premium">Premium</option>
                            </select>
                          </label>
                        )}
                      </div>
                    </div>

                    {costComponents.filter((component) => component.active).length > 0 && (
                      <div className="mt-4 border-t border-slate-100 pt-3">
                        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          Custos operacionais adicionais
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {costComponents.filter((component) => component.active).map((component) => (
                            <label
                              key={component.id}
                              className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600"
                            >
                              <input
                                type="checkbox"
                                checked={Boolean(entry.selectedCosts?.includes(component.id))}
                                onChange={() => toggleListingCost(account.id, component.id)}
                                className="h-3.5 w-3.5"
                              />
                              {component.name} ({component.calc_type === 'percentage' ? `${component.default_value}%` : `R$ ${component.default_value}`})
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className={`mt-4 rounded-xl p-3 ${preview?.status === 'ok' ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                      {preview?.status === 'ok' ? (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="flex items-center gap-1 text-xs font-semibold text-emerald-700">
                              <CheckCircle2 className="h-4 w-4" /> Tarifa oficial aplicada
                            </div>
                            <div className="mt-1 text-[11px] text-slate-600">
                              Comissão {Number(preview.rule.commission_pct || 0).toFixed(2)}%
                              {preview.fixedFee > 0 ? ` · taxa fixa R$ ${preview.fixedFee.toFixed(2)}` : ''}
                            </div>
                          </div>
                          <div className="text-left sm:text-right">
                            <div className={`text-lg font-bold ${preview.marginPct >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                              {preview.marginPct.toFixed(1)}%
                            </div>
                            <div className="text-xs text-slate-500">R$ {preview.netMargin.toFixed(2)} de margem</div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-amber-800">⚠️ {message}</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {step === 4 && (
          <section>
            <div className="mb-5">
              <h4 className="text-base font-semibold text-slate-900">4. Revise antes de salvar</h4>
              <p className="mt-1 text-xs text-slate-500">
                Confira qual categoria e qual regra oficial foram usadas em cada conta. O mesmo SKU pode ter resultados diferentes por operação.
              </p>
            </div>

            {bestMargin && validMargins.length > 1 && (
              <div className="mb-4 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
                <Sparkles className="mt-0.5 h-5 w-5 text-blue-600" />
                <div>
                  <div className="text-sm font-semibold text-blue-900">Melhor margem entre as contas selecionadas</div>
                  <div className="mt-1 text-xs text-blue-700">
                    {accountLabel(bestMargin.account, platformById.get(bestMargin.account.platform_id))}: {bestMargin.preview.marginPct.toFixed(1)}% · R$ {bestMargin.preview.netMargin.toFixed(2)}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {previews.map(({ account, preview }) => {
                const platform = platformById.get(account.platform_id)
                const entry = newListings[account.id] || {}
                const categoryPath = entry._categoryMeta?.path || 'Regra global / categoria oficial não selecionada'
                return (
                  <div key={account.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-5 md:items-center">
                      <div className="md:col-span-2">
                        <div className="text-sm font-semibold text-slate-900">{accountLabel(account, platform)}</div>
                        <div className="mt-1 text-[11px] text-slate-500">{categoryPath}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-slate-400">Preço</div>
                        <div className="mt-1 text-sm font-medium text-slate-800">R$ {Number(entry.sale_price || 0).toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-slate-400">Taxa</div>
                        {preview?.status === 'ok' ? (
                          <div className="mt-1 text-sm font-medium text-emerald-700">{Number(preview.rule.commission_pct || 0).toFixed(2)}% oficial</div>
                        ) : (
                          <div className="mt-1 text-xs text-amber-700">Não calculada</div>
                        )}
                      </div>
                      <div className="md:text-right">
                        <div className="text-[10px] uppercase tracking-wide text-slate-400">Margem</div>
                        {preview?.status === 'ok' ? (
                          <>
                            <div className={`mt-1 text-lg font-bold ${preview.marginPct >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                              {preview.marginPct.toFixed(1)}%
                            </div>
                            <div className="text-[11px] text-slate-500">R$ {preview.netMargin.toFixed(2)}</div>
                          </>
                        ) : (
                          <div className="mt-1 text-xs text-amber-700">{statusMessage(preview)}</div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
              Produto, anúncios, categorias e custos são salvos em uma única transação. A classificação confirmada alimenta apenas as sugestões futuras da sua empresa; ela nunca cria ou altera tarifas.
            </div>
          </section>
        )}

        {saveError && (
          <div className="mt-5 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
            {saveError}
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={closeProductForm}
              disabled={saving}
              className="rounded-lg px-4 py-2 text-sm text-slate-500 hover:bg-slate-50 disabled:opacity-60"
            >
              Cancelar
            </button>
            {step > 1 && (
              <button
                type="button"
                onClick={goBack}
                disabled={saving}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                <ChevronLeft className="h-4 w-4" /> Voltar
              </button>
            )}
          </div>

          {step < 4 ? (
            <button
              type="button"
              onClick={goNext}
              className="inline-flex items-center justify-center gap-1 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Continuar <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleTransactionalSave}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? 'Salvando…' : editingProductId ? 'Salvar alterações' : 'Salvar produto e anúncios'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
