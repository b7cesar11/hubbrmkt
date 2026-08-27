import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  BadgeDollarSign,
  Pencil,
  Plus,
  Save,
  Target,
  TrendingUp,
  Users,
  WalletCards,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { calculateOperationPeopleAnalytics } from '../../lib/peopleAnalytics'

const EMPTY_PERSON = {
  name: '',
  role_title: '',
  fixed_monthly_cost: '',
  commission_pct: '',
  applies_to_all_products: false,
  active: true,
  product_ids: [],
}

function money(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return Number(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  })
}

function categoryLabel(category) {
  return {
    affiliate_commission: 'Comissão de afiliado',
    marketing_commission: 'Comissão de marketing',
    ads_cost: 'Custo de ads',
    other: 'Outro',
  }[category] || category
}

export function CustosTab({
  costComponents,
  showNewCostComponent,
  setShowNewCostComponent,
  newCostComponent,
  setNewCostComponent,
  editingCostComponentId,
  setEditingCostComponentId,
  editCostComponentForm,
  setEditCostComponentForm,
  handleCreateCostComponentStandalone,
  handleUpdateCostComponent,
  handleToggleCostComponentActive,
}) {
  const manualCostComponents = useMemo(
    () => costComponents.filter((component) => component.origin !== 'person'),
    [costComponents],
  )

  const [people, setPeople] = useState([])
  const [products, setProducts] = useState([])
  const [productPeople, setProductPeople] = useState([])
  const [listings, setListings] = useState([])
  const [platforms, setPlatforms] = useState([])
  const [accounts, setAccounts] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [forecastDraft, setForecastDraft] = useState({})
  const [loadingPeople, setLoadingPeople] = useState(true)
  const [peopleError, setPeopleError] = useState(null)
  const [canManagePeople, setCanManagePeople] = useState(false)
  const [showPersonForm, setShowPersonForm] = useState(false)
  const [editingPersonId, setEditingPersonId] = useState(null)
  const [personForm, setPersonForm] = useState(EMPTY_PERSON)
  const [savingPerson, setSavingPerson] = useState(false)
  const [savingForecast, setSavingForecast] = useState(false)

  const loadOperationData = useCallback(async () => {
    setLoadingPeople(true)
    setPeopleError(null)
    try {
      const [
        peopleRes,
        productPeopleRes,
        productsRes,
        listingsRes,
        platformsRes,
        accountsRes,
        rulesRes,
        promotionsRes,
        linksRes,
        costsRes,
        roleRes,
      ] = await Promise.all([
        supabase.from('operation_people').select('*').order('name'),
        supabase.from('product_people').select('*'),
        supabase.from('products').select('*').order('name'),
        supabase.from('product_listings').select('*'),
        supabase.from('platforms').select('*'),
        supabase.from('marketplace_accounts').select('*'),
        supabase.from('platform_fee_rules').select('*'),
        supabase.from('platform_promotions').select('*'),
        supabase.from('listing_cost_components').select('*'),
        supabase.from('cost_components').select('*'),
        supabase.rpc('fn_current_role'),
      ])

      const responses = [
        peopleRes,
        productPeopleRes,
        productsRes,
        listingsRes,
        platformsRes,
        accountsRes,
        rulesRes,
        promotionsRes,
        linksRes,
        costsRes,
      ]
      const failed = responses.find((response) => response.error)
      if (failed?.error) throw failed.error

      const peopleRows = peopleRes.data || []
      const productRows = productsRes.data || []
      const productPeopleRows = productPeopleRes.data || []
      const listingRows = listingsRes.data || []
      const platformRows = platformsRes.data || []
      const accountRows = accountsRes.data || []

      setPeople(peopleRows)
      setProducts(productRows)
      setProductPeople(productPeopleRows)
      setListings(listingRows)
      setPlatforms(platformRows)
      setAccounts(accountRows)
      setForecastDraft(
        Object.fromEntries(
          listingRows.map((listing) => [listing.id, String(listing.monthly_units_forecast ?? 0)]),
        ),
      )
      setCanManagePeople(['company_admin', 'super_admin'].includes(roleRes.data))
      setAnalytics(
        calculateOperationPeopleAnalytics({
          people: peopleRows,
          productPeople: productPeopleRows,
          products: productRows,
          listings: listingRows,
          marketplaceAccounts: accountRows,
          feeRules: rulesRes.data || [],
          promotions: promotionsRes.data || [],
          listingCostComponents: linksRes.data || [],
          costComponents: costsRes.data || [],
        }),
      )
    } catch (error) {
      setPeopleError(error.message || 'Não foi possível carregar os custos da equipe.')
    } finally {
      setLoadingPeople(false)
    }
  }, [])

  useEffect(() => {
    loadOperationData()
  }, [loadOperationData])

  const productById = useMemo(
    () => new Map(products.map((product) => [String(product.id), product])),
    [products],
  )
  const platformById = useMemo(
    () => new Map(platforms.map((platform) => [String(platform.id), platform])),
    [platforms],
  )
  const accountById = useMemo(
    () => new Map(accounts.map((account) => [String(account.id), account])),
    [accounts],
  )
  const activeProducts = products.filter((product) => product.active !== false)
  const activeListings = listings.filter(
    (listing) => listing.active !== false && productById.get(String(listing.product_id))?.active !== false,
  )

  function resetPersonForm() {
    setEditingPersonId(null)
    setPersonForm(EMPTY_PERSON)
    setShowPersonForm(false)
    setPeopleError(null)
  }

  function editPerson(person) {
    const productIds = productPeople
      .filter((link) => String(link.person_id) === String(person.id))
      .map((link) => String(link.product_id))
    setEditingPersonId(person.id)
    setPersonForm({
      name: person.name,
      role_title: person.role_title,
      fixed_monthly_cost: String(person.fixed_monthly_cost ?? 0),
      commission_pct: String(person.commission_pct ?? 0),
      applies_to_all_products: Boolean(person.applies_to_all_products),
      active: person.active !== false,
      product_ids: productIds,
    })
    setShowPersonForm(true)
    setPeopleError(null)
  }

  function togglePersonProduct(productId) {
    setPersonForm((previous) => {
      const current = previous.product_ids || []
      const exists = current.includes(String(productId))
      return {
        ...previous,
        product_ids: exists
          ? current.filter((id) => id !== String(productId))
          : [...current, String(productId)],
      }
    })
  }

  async function savePerson(event) {
    event.preventDefault()
    setPeopleError(null)

    const fixed = Number(personForm.fixed_monthly_cost || 0)
    const commission = Number(personForm.commission_pct || 0)
    if (!personForm.name.trim() || !personForm.role_title.trim()) {
      setPeopleError('Informe o nome e o cargo/função da pessoa.')
      return
    }
    if (!Number.isFinite(fixed) || fixed < 0) {
      setPeopleError('Informe um custo fixo mensal válido.')
      return
    }
    if (!Number.isFinite(commission) || commission < 0 || commission > 100) {
      setPeopleError('A comissão precisa estar entre 0% e 100%.')
      return
    }

    setSavingPerson(true)
    try {
      const { data: personId, error } = await supabase.rpc('fn_upsert_operation_person', {
        p_person_id: editingPersonId || null,
        p_name: personForm.name.trim(),
        p_role_title: personForm.role_title.trim(),
        p_fixed_monthly_cost: fixed,
        p_commission_pct: commission,
        p_commission_basis: 'sale_price',
        p_applies_to_all_products: Boolean(personForm.applies_to_all_products),
        p_active: Boolean(personForm.active),
      })
      if (error) throw error

      const { error: linkError } = await supabase.rpc('fn_set_operation_person_products', {
        p_person_id: personId,
        p_product_ids: personForm.applies_to_all_products ? [] : personForm.product_ids || [],
      })
      if (linkError) throw linkError

      resetPersonForm()
      await loadOperationData()
      window.dispatchEvent(new CustomEvent('margemhub:data-changed'))
    } catch (error) {
      setPeopleError(error.message || 'Não foi possível salvar a pessoa.')
    } finally {
      setSavingPerson(false)
    }
  }

  async function togglePersonActive(person) {
    setPeopleError(null)
    try {
      const { error } = await supabase.rpc('fn_upsert_operation_person', {
        p_person_id: person.id,
        p_name: person.name,
        p_role_title: person.role_title,
        p_fixed_monthly_cost: Number(person.fixed_monthly_cost || 0),
        p_commission_pct: Number(person.commission_pct || 0),
        p_commission_basis: person.commission_basis || 'sale_price',
        p_applies_to_all_products: Boolean(person.applies_to_all_products),
        p_active: !person.active,
      })
      if (error) throw error
      await loadOperationData()
      window.dispatchEvent(new CustomEvent('margemhub:data-changed'))
    } catch (error) {
      setPeopleError(error.message || 'Não foi possível alterar o status da pessoa.')
    }
  }

  async function saveForecasts() {
    setPeopleError(null)
    const payload = activeListings.map((listing) => {
      const value = Number(forecastDraft[listing.id] || 0)
      if (!Number.isFinite(value) || value < 0) {
        throw new Error('Todas as projeções mensais precisam ser números maiores ou iguais a zero.')
      }
      return { listing_id: listing.id, monthly_units_forecast: value }
    })

    setSavingForecast(true)
    try {
      const { error } = await supabase.rpc('fn_update_listing_forecasts', {
        p_forecasts: payload,
      })
      if (error) throw error
      await loadOperationData()
      window.dispatchEvent(new CustomEvent('margemhub:data-changed'))
    } catch (error) {
      setPeopleError(error.message || 'Não foi possível salvar as projeções mensais.')
    } finally {
      setSavingForecast(false)
    }
  }

  const summary = analytics?.summary

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Users className="h-6 w-6 text-blue-600" />
              <h2 className="text-xl font-semibold text-gray-900">Equipe & Operação</h2>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-gray-500">
              Cadastre quem participa da operação. O custo fixo mensal é rateado pelos produtos vinculados e a comissão entra automaticamente em cada venda.
            </p>
          </div>
          {canManagePeople && (
            <button
              type="button"
              onClick={() => {
                resetPersonForm()
                setShowPersonForm(true)
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" /> Nova pessoa
            </button>
          )}
        </div>

        {peopleError && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <span>{peopleError}</span>
          </div>
        )}

        {showPersonForm && canManagePeople && (
          <form onSubmit={savePerson} className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-slate-900">
                {editingPersonId ? 'Editar pessoa / posição' : 'Cadastrar pessoa / posição'}
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Em “custo fixo mensal”, informe salário ou o custo completo da posição. A comissão é calculada sobre o preço vendido dos produtos vinculados.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <label>
                <span className="mb-1 block text-xs font-medium text-slate-600">Nome</span>
                <input value={personForm.name} onChange={(event) => setPersonForm({ ...personForm, name: event.target.value })} placeholder="Ex.: Fernanda" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-slate-600">Cargo / função</span>
                <input value={personForm.role_title} onChange={(event) => setPersonForm({ ...personForm, role_title: event.target.value })} placeholder="Ex.: Auxiliar operacional" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-slate-600">Custo fixo mensal</span>
                <div className="relative"><span className="absolute left-3 top-2 text-sm text-slate-400">R$</span><input type="number" min="0" step="0.01" value={personForm.fixed_monthly_cost} onChange={(event) => setPersonForm({ ...personForm, fixed_monthly_cost: event.target.value })} placeholder="0,00" className="w-full rounded-lg border border-slate-300 py-2 pl-10 pr-3 text-sm" /></div>
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-slate-600">Comissão sobre vendas</span>
                <div className="relative"><input type="number" min="0" max="100" step="0.01" value={personForm.commission_pct} onChange={(event) => setPersonForm({ ...personForm, commission_pct: event.target.value })} placeholder="0" className="w-full rounded-lg border border-slate-300 py-2 pl-3 pr-8 text-sm" /><span className="absolute right-3 top-2 text-sm text-slate-400">%</span></div>
              </label>
            </div>

            <label className="mt-4 flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={personForm.applies_to_all_products} onChange={(event) => setPersonForm({ ...personForm, applies_to_all_products: event.target.checked })} />
              Aplicar automaticamente a todos os produtos
            </label>

            {!personForm.applies_to_all_products && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Produtos onde este custo entra</div>
                {activeProducts.length === 0 ? (
                  <div className="text-xs text-slate-400">Cadastre produtos para criar vínculos.</div>
                ) : (
                  <div className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                    {activeProducts.map((product) => (
                      <label key={product.id} className="flex cursor-pointer items-start gap-2 rounded-lg bg-white px-3 py-2 text-xs text-slate-700">
                        <input type="checkbox" className="mt-0.5" checked={(personForm.product_ids || []).includes(String(product.id))} onChange={() => togglePersonProduct(product.id)} />
                        <span><strong>{product.sku}</strong><br />{product.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button type="submit" disabled={savingPerson} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">{savingPerson ? 'Salvando…' : 'Salvar pessoa'}</button>
              <button type="button" onClick={resetPersonForm} className="rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-600">Cancelar</button>
            </div>
          </form>
        )}

        {loadingPeople ? (
          <div className="rounded-xl bg-white p-6 text-sm text-slate-500 shadow-sm">Calculando custo da operação…</div>
        ) : (
          <>
            <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-xs font-medium text-slate-500"><WalletCards className="h-4 w-4" /> Custo fixo mensal</div><div className="mt-2 text-2xl font-bold text-slate-900">{money(summary?.fixedMonthlyTotal || 0)}</div><div className="mt-1 text-xs text-slate-400">{summary?.peopleCount || 0} pessoa(s) ativa(s)</div></div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-xs font-medium text-slate-500"><BadgeDollarSign className="h-4 w-4" /> Comissões projetadas</div><div className="mt-2 text-2xl font-bold text-slate-900">{money(summary?.projectedCommissionTotal || 0)}</div><div className="mt-1 text-xs text-slate-400">Com base nas vendas/mês informadas</div></div>
              <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 shadow-sm"><div className="flex items-center gap-2 text-xs font-medium text-blue-600"><TrendingUp className="h-4 w-4" /> Custo mensal da equipe</div><div className="mt-2 text-2xl font-bold text-blue-900">{money(summary?.projectedPeopleCostTotal || 0)}</div><div className="mt-1 text-xs text-blue-600/80">{summary?.peopleCostPctRevenue != null ? `${summary.peopleCostPctRevenue.toFixed(1)}% do faturamento projetado` : 'Informe vendas/mês para projetar'}</div></div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-sm"><div className="flex items-center gap-2 text-xs font-medium text-emerald-700"><Target className="h-4 w-4" /> Faturamento para pagar a operação</div><div className="mt-2 text-2xl font-bold text-emerald-900">{money(summary?.operationBreakEvenRevenue)}</div><div className="mt-1 text-xs text-emerald-700/80">Mantendo o mix e as margens atuais</div></div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50"><tr><th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Pessoa / posição</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Fixo</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Comissão</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Produtos</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Custo projetado</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Faturamento p/ pagar</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Cobertura</th><th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">Ações</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {people.length === 0 ? <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Nenhuma pessoa da operação cadastrada ainda.</td></tr> : people.map((person) => {
                      const row = analytics?.rows.find((candidate) => candidate.person.id === person.id)
                      return <tr key={person.id} className={person.active ? '' : 'opacity-50'}><td className="px-4 py-3"><div className="font-semibold text-slate-900">{person.name}</div><div className="text-xs text-slate-500">{person.role_title}</div></td><td className="px-4 py-3">{money(person.fixed_monthly_cost)}</td><td className="px-4 py-3">{Number(person.commission_pct || 0).toFixed(2)}%</td><td className="px-4 py-3 text-xs text-slate-600">{person.applies_to_all_products ? 'Todos automaticamente' : `${row?.linkedProductsCount || 0} vinculado(s)`}</td><td className="px-4 py-3"><div className="font-medium">{money(row?.projectedTotalCost ?? person.fixed_monthly_cost)}</div>{row?.projectedCommission > 0 && <div className="text-[11px] text-slate-400">inclui {money(row.projectedCommission)} de comissão</div>}</td><td className="px-4 py-3"><div className="font-medium">{money(row?.breakEvenRevenue)}</div>{row?.breakEvenBasis === 'average_current_listings' && <div className="text-[10px] text-amber-600">estimado pelas margens atuais</div>}</td><td className="px-4 py-3">{row?.coverageRatio != null ? <span className={`rounded-full px-2 py-1 text-xs font-semibold ${row.coverageRatio >= 1.5 ? 'bg-emerald-100 text-emerald-700' : row.coverageRatio >= 1 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{row.coverageRatio.toFixed(2)}×</span> : <span className="text-xs text-slate-400">sem projeção</span>}</td><td className="px-4 py-3 text-right">{canManagePeople && <div className="flex justify-end gap-3"><button type="button" onClick={() => editPerson(person)} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"><Pencil className="h-3 w-3" /> editar</button><button type="button" onClick={() => togglePersonActive(person)} className={`text-xs hover:underline ${person.active ? 'text-red-600' : 'text-emerald-600'}`}>{person.active ? 'desativar' : 'reativar'}</button></div>}</td></tr>
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </section>

      <section className="border-t border-slate-200 pt-7">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Planejamento mensal</h2>
            <p className="mt-1 text-sm text-gray-500">Informe quantas unidades espera vender por mês em cada conta. Esse volume distribui o custo fixo das pessoas entre os produtos vinculados.</p>
          </div>
          {canManagePeople && activeListings.length > 0 && <button type="button" onClick={saveForecasts} disabled={savingForecast} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"><Save className="h-4 w-4" /> {savingForecast ? 'Salvando…' : 'Salvar projeções'}</button>}
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50"><tr><th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Produto</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Operação</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Preço atual</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Vendas projetadas/mês</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {activeListings.length === 0 ? <tr><td colSpan={4} className="px-4 py-7 text-center text-slate-400">Nenhum anúncio ativo para projetar.</td></tr> : activeListings.map((listing) => {
                  const product = productById.get(String(listing.product_id))
                  const platform = platformById.get(String(listing.platform_id))
                  const account = accountById.get(String(listing.marketplace_account_id))
                  return <tr key={listing.id}><td className="px-4 py-3"><div className="font-semibold text-slate-900">{product?.sku}</div><div className="text-xs text-slate-500">{product?.name}</div></td><td className="px-4 py-3"><div className="font-medium text-slate-700">{platform?.name || 'Marketplace'}</div><div className="text-xs text-slate-400">{account?.name || 'Conta'}</div></td><td className="px-4 py-3">{money(listing.sale_price)}</td><td className="px-4 py-3"><input type="number" min="0" step="1" disabled={!canManagePeople} value={forecastDraft[listing.id] ?? '0'} onChange={(event) => setForecastDraft((previous) => ({ ...previous, [listing.id]: event.target.value }))} className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50" /></td></tr>
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {summary?.forecastConfigured && (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-xl bg-slate-900 p-4 text-white"><div className="text-xs text-slate-400">Faturamento mensal projetado</div><div className="mt-1 text-xl font-bold">{money(summary.projectedRevenue)}</div></div>
          <div className="rounded-xl bg-slate-900 p-4 text-white"><div className="text-xs text-slate-400">Margem antes da equipe</div><div className="mt-1 text-xl font-bold">{money(summary.projectedContribution)}</div></div>
          <div className="rounded-xl bg-slate-900 p-4 text-white"><div className="text-xs text-slate-400">Resultado após equipe</div><div className={`mt-1 text-xl font-bold ${summary.projectedOperatingProfit >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{money(summary.projectedOperatingProfit)}</div></div>
        </section>
      )}

      <section className="border-t border-slate-200 pt-7">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div><h2 className="text-xl font-semibold text-gray-900">Outros custos adicionais</h2><p className="mt-1 text-sm text-gray-500">Ads, afiliados, taxas internas e outros custos não relacionados à equipe.</p></div>
          <button onClick={() => setShowNewCostComponent(!showNewCostComponent)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"><Plus className="h-4 w-4" /> Novo custo</button>
        </div>

        {showNewCostComponent && (
          <div className="mb-6 rounded-xl bg-white p-6 shadow-md"><form onSubmit={handleCreateCostComponentStandalone} className="space-y-3"><div className="grid grid-cols-1 gap-3 sm:grid-cols-4"><input type="text" placeholder="Nome (ex: Comissão Creator)" value={newCostComponent.name} onChange={(event) => setNewCostComponent({ ...newCostComponent, name: event.target.value })} required className="rounded-lg border border-gray-300 px-3 py-2 text-sm" /><select value={newCostComponent.category} onChange={(event) => setNewCostComponent({ ...newCostComponent, category: event.target.value })} className="rounded-lg border border-gray-300 px-3 py-2 text-sm"><option value="affiliate_commission">Comissão de afiliado</option><option value="marketing_commission">Comissão de marketing</option><option value="ads_cost">Custo de ads</option><option value="other">Outro</option></select><select value={newCostComponent.calc_type} onChange={(event) => setNewCostComponent({ ...newCostComponent, calc_type: event.target.value })} className="rounded-lg border border-gray-300 px-3 py-2 text-sm"><option value="percentage">% do preço</option><option value="fixed">R$ fixo</option></select><input type="number" placeholder="Valor padrão" value={newCostComponent.default_value} onChange={(event) => setNewCostComponent({ ...newCostComponent, default_value: event.target.value })} step="0.01" required className="rounded-lg border border-gray-300 px-3 py-2 text-sm" /></div><div className="flex gap-2"><button type="submit" className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white">Salvar</button><button type="button" onClick={() => setShowNewCostComponent(false)} className="rounded-lg bg-gray-200 px-4 py-2 text-sm text-gray-700">Cancelar</button></div></form></div>
        )}

        <div className="overflow-hidden rounded-xl bg-white shadow-md"><div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200 text-sm"><thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Nome</th><th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Categoria</th><th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Tipo</th><th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Valor</th><th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th><th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Ações</th></tr></thead><tbody className="divide-y divide-gray-200">{manualCostComponents.length === 0 ? <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Nenhum custo adicional cadastrado ainda.</td></tr> : manualCostComponents.map((component) => {
          const isEditing = editingCostComponentId === component.id
          return <tr key={component.id} className={!component.active ? 'opacity-50' : ''}>{isEditing ? <><td className="px-4 py-2"><input type="text" value={editCostComponentForm[component.id]?.name ?? component.name} onChange={(event) => setEditCostComponentForm((previous) => ({ ...previous, [component.id]: { ...previous[component.id], name: event.target.value } }))} className="w-full rounded border px-2 py-1" /></td><td className="px-4 py-2"><select value={editCostComponentForm[component.id]?.category ?? component.category} onChange={(event) => setEditCostComponentForm((previous) => ({ ...previous, [component.id]: { ...previous[component.id], category: event.target.value } }))} className="rounded border px-2 py-1"><option value="affiliate_commission">Afiliado</option><option value="marketing_commission">Marketing</option><option value="ads_cost">Ads</option><option value="other">Outro</option></select></td><td className="px-4 py-2"><select value={editCostComponentForm[component.id]?.calc_type ?? component.calc_type} onChange={(event) => setEditCostComponentForm((previous) => ({ ...previous, [component.id]: { ...previous[component.id], calc_type: event.target.value } }))} className="rounded border px-2 py-1"><option value="percentage">%</option><option value="fixed">R$</option></select></td><td className="px-4 py-2"><input type="number" step="0.01" value={editCostComponentForm[component.id]?.default_value ?? component.default_value} onChange={(event) => setEditCostComponentForm((previous) => ({ ...previous, [component.id]: { ...previous[component.id], default_value: event.target.value } }))} className="w-24 rounded border px-2 py-1" /></td><td className="px-4 py-2">{component.active ? 'Ativo' : 'Inativo'}</td><td className="space-x-2 px-4 py-2"><button onClick={() => handleUpdateCostComponent(component.id)} className="text-xs text-green-600">salvar</button><button onClick={() => setEditingCostComponentId(null)} className="text-xs text-gray-500">cancelar</button></td></> : <><td className="px-4 py-3">{component.name}</td><td className="px-4 py-3 text-gray-500">{categoryLabel(component.category)}</td><td className="px-4 py-3">{component.calc_type === 'percentage' ? '%' : 'R$ fixo'}</td><td className="px-4 py-3">{component.calc_type === 'percentage' ? `${component.default_value}%` : money(component.default_value)}</td><td className="px-4 py-3">{component.active ? 'Ativo' : 'Inativo'}</td><td className="space-x-3 px-4 py-3"><button onClick={() => { setEditingCostComponentId(component.id); setEditCostComponentForm((previous) => ({ ...previous, [component.id]: { ...component } })) }} className="text-xs text-blue-600">editar</button><button onClick={() => handleToggleCostComponentActive(component)} className={`text-xs ${component.active ? 'text-red-600' : 'text-green-600'}`}>{component.active ? 'desativar' : 'reativar'}</button></td></>}</tr>
        })}</tbody></table></div></div>
      </section>
    </div>
  )
}
