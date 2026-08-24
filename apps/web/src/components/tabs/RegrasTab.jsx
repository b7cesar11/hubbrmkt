import React, { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Save, X } from 'lucide-react'
import { localDateKey } from '../../lib/margin'
import { supabase } from '../../lib/supabase'
import { MarketplaceCategoryPicker } from '../MarketplaceCategoryPicker'
import { MarketplaceTaxonomyManager } from '../MarketplaceTaxonomyManager'

function ruleStatus(rule) {
  if (rule.confidence_status === 'confirmed' && rule.source_kind === 'official') {
    return { label: '✅ Oficial confirmada', cls: 'bg-green-100 text-green-700' }
  }
  if (rule.confidence_status === 'account_specific') {
    return { label: '🔐 Conta/API', cls: 'bg-blue-100 text-blue-700' }
  }
  if (rule.confidence_status === 'deprecated') {
    return { label: '⏸️ Descontinuada', cls: 'bg-gray-100 text-gray-600' }
  }
  return { label: '⚠️ Não operacional', cls: 'bg-orange-100 text-orange-700' }
}

function categorySnapshot(category) {
  if (!category?.id) return null
  return {
    id: category.id,
    name: category.name,
    path: category.full_path,
    pathIds: category.path_ids,
    externalCategoryId: category.external_category_id,
    sourceUrl: category.source_url,
  }
}

const EMPTY_RULE = {
  platform_id: '',
  category: '',
  marketplace_category_id: '',
  _categoryMeta: null,
  category_scope: 'exact',
  account_type: '',
  listing_type: '',
  price_min: '0',
  price_max: '',
  commission_pct: '',
  fixed_fee: '0',
  source_url: '',
}

export function RegrasTab({
  platforms,
  feeRules,
  showNewRuleForm,
  setShowNewRuleForm,
  resolvingGapId,
  setResolvingGapId,
  newRule,
  setNewRule,
}) {
  const [editingRuleId, setEditingRuleId] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)
  const [categoryById, setCategoryById] = useState(new Map())
  const today = localDateKey()

  useEffect(() => {
    let cancelled = false
    async function loadRuleCategories() {
      const ids = [...new Set(feeRules.map((rule) => rule.marketplace_category_id).filter(Boolean))]
      if (ids.length === 0) {
        setCategoryById(new Map())
        return
      }
      const { data, error: categoryError } = await supabase
        .from('marketplace_categories')
        .select('id, name, full_path, path_ids, external_category_id, source_url')
        .in('id', ids)
      if (!cancelled && !categoryError) {
        setCategoryById(new Map((data || []).map((category) => [category.id, category])))
      }
    }
    loadRuleCategories()
    return () => {
      cancelled = true
    }
  }, [feeRules])

  function beginEdit(rule) {
    setEditingRuleId(rule.id)
    setError(null)
    setEditForm({
      commission_pct: String(rule.commission_pct ?? ''),
      fixed_fee: String(rule.fixed_fee ?? '0'),
      source_url: rule.source_url || '',
      source_kind: rule.source_kind || 'static',
      confidence_status: rule.confidence_status || 'estimate',
    })
  }

  async function saveVersion(rule) {
    const commissionPct = Number(editForm.commission_pct)
    const fixedFee = Number(editForm.fixed_fee)
    if (!Number.isFinite(commissionPct) || commissionPct < 0 || commissionPct > 100) {
      setError('Informe uma comissão válida entre 0% e 100%.')
      return
    }
    if (!Number.isFinite(fixedFee) || fixedFee < 0) {
      setError('Informe uma taxa fixa válida.')
      return
    }
    if (!editForm.source_url.trim()) {
      setError('A fonte/justificativa da regra é obrigatória.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const { error: rpcError } = await supabase.rpc('fn_version_fee_rule', {
        p_rule_id: rule.id,
        p_commission_pct: commissionPct,
        p_fixed_fee: fixedFee,
        p_source_url: editForm.source_url.trim(),
        p_source_kind: editForm.source_kind || null,
        p_confidence_status: editForm.confidence_status || null,
        p_calculation_config: rule.calculation_config || {},
      })
      if (rpcError) throw rpcError

      setEditingRuleId(null)
      setEditForm(null)
      window.dispatchEvent(new CustomEvent('margemhub:data-changed'))
    } catch (saveError) {
      setError(saveError.message || 'Não foi possível versionar a regra.')
    } finally {
      setSaving(false)
    }
  }

  async function createOfficialRule(event) {
    event.preventDefault()
    setError(null)

    const commissionPct = Number(newRule.commission_pct)
    const fixedFee = Number(newRule.fixed_fee || 0)
    const priceMin = Number(newRule.price_min || 0)
    const priceMax = newRule.price_max === '' || newRule.price_max == null ? null : Number(newRule.price_max)

    if (!newRule.platform_id) {
      setError('Selecione o marketplace.')
      return
    }
    if (!Number.isFinite(commissionPct) || commissionPct < 0 || commissionPct > 100) {
      setError('Informe uma comissão válida entre 0% e 100%.')
      return
    }
    if (!Number.isFinite(fixedFee) || fixedFee < 0) {
      setError('Informe uma taxa fixa válida.')
      return
    }
    if (!newRule.source_url?.trim()) {
      setError('Informe a fonte oficial da regra.')
      return
    }

    setCreating(true)
    try {
      const { error: rpcError } = await supabase.rpc('fn_create_official_fee_rule', {
        p_platform_id: newRule.platform_id,
        p_marketplace_category_id: newRule.marketplace_category_id || null,
        p_category_scope: newRule.marketplace_category_id ? newRule.category_scope || 'exact' : 'exact',
        p_account_type: newRule.account_type || null,
        p_listing_type: newRule.listing_type || null,
        p_price_min: priceMin,
        p_price_max: priceMax,
        p_commission_pct: commissionPct,
        p_fixed_fee: fixedFee,
        p_source_url: newRule.source_url.trim(),
        p_calculation_config: {},
      })
      if (rpcError) throw rpcError

      setNewRule(EMPTY_RULE)
      setShowNewRuleForm(false)
      setResolvingGapId(null)
      window.dispatchEvent(new CustomEvent('margemhub:data-changed'))
    } catch (createError) {
      setError(createError.message || 'Não foi possível criar a regra oficial.')
    } finally {
      setCreating(false)
    }
  }

  const activeRules = useMemo(
    () =>
      feeRules
        .filter((rule) => !rule.valid_to || rule.valid_to >= today)
        .sort((a, b) => String(b.valid_from || '').localeCompare(String(a.valid_from || ''))),
    [feeRules, today]
  )

  return (
    <div>
      <MarketplaceTaxonomyManager platforms={platforms} />

      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Regras de Taxa</h2>
          <p className="mt-1 text-xs text-gray-500">
            O motor operacional usa somente regras com fonte oficial confirmada. Regras por categoria podem valer apenas no nó ou em seus descendentes.
          </p>
        </div>
        <button
          onClick={() => {
            setResolvingGapId(null)
            setNewRule({ ...EMPTY_RULE })
            setShowNewRuleForm(true)
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Nova Regra Oficial
        </button>
      </div>

      {showNewRuleForm && (
        <div className="mb-6 rounded-xl bg-white p-6 shadow-md">
          <h3 className="mb-1 text-sm font-semibold text-gray-800">
            {resolvingGapId ? 'Resolver lacuna — regra oficial' : 'Nova regra oficial de taxa'}
          </h3>
          <p className="mb-4 text-xs text-gray-500">
            Selecione a categoria normalizada quando a taxa variar por categoria. Deixe sem categoria somente quando a fonte oficial realmente definir uma regra geral.
          </p>
          <form onSubmit={createOfficialRule} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <select
                value={newRule.platform_id || ''}
                onChange={(event) =>
                  setNewRule({
                    ...newRule,
                    platform_id: event.target.value,
                    marketplace_category_id: '',
                    _categoryMeta: null,
                  })
                }
                required
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Plataforma...</option>
                {platforms.map((platform) => (
                  <option key={platform.id} value={platform.id}>{platform.name}</option>
                ))}
              </select>
              <select
                value={newRule.account_type || ''}
                onChange={(event) => setNewRule({ ...newRule, account_type: event.target.value })}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">Perfil de conta: geral</option>
                <option value="cpf">CPF</option>
                <option value="cnpj">CNPJ</option>
              </select>
              <select
                value={newRule.listing_type || ''}
                onChange={(event) => setNewRule({ ...newRule, listing_type: event.target.value })}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Tipo de anúncio: geral</option>
                <option value="classico">Clássico</option>
                <option value="premium">Premium</option>
              </select>
            </div>

            {newRule.platform_id && (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_220px]">
                <div>
                  <div className="mb-1.5 text-xs font-medium text-gray-600">Categoria oficial (opcional para regra geral)</div>
                  <MarketplaceCategoryPicker
                    platformId={newRule.platform_id}
                    value={newRule.marketplace_category_id || ''}
                    snapshot={newRule._categoryMeta}
                    onSelect={(category) =>
                      setNewRule({
                        ...newRule,
                        marketplace_category_id: category?.id || '',
                        _categoryMeta: categorySnapshot(category),
                      })
                    }
                  />
                </div>
                <label>
                  <span className="mb-1.5 block text-xs font-medium text-gray-600">Escopo</span>
                  <select
                    value={newRule.category_scope || 'exact'}
                    disabled={!newRule.marketplace_category_id}
                    onChange={(event) => setNewRule({ ...newRule, category_scope: event.target.value })}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm disabled:bg-gray-100"
                  >
                    <option value="exact">Somente esta categoria</option>
                    <option value="descendants">Categoria + subcategorias</option>
                  </select>
                </label>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <input
                type="number"
                placeholder="Preço mín."
                value={newRule.price_min ?? '0'}
                onChange={(event) => setNewRule({ ...newRule, price_min: event.target.value })}
                step="0.01"
                min="0"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                type="number"
                placeholder="Preço máx. (sem limite)"
                value={newRule.price_max ?? ''}
                onChange={(event) => setNewRule({ ...newRule, price_max: event.target.value })}
                step="0.01"
                min="0"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                type="number"
                placeholder="Comissão %"
                value={newRule.commission_pct ?? ''}
                onChange={(event) => setNewRule({ ...newRule, commission_pct: event.target.value })}
                required
                step="0.01"
                min="0"
                max="100"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                type="number"
                placeholder="Taxa fixa R$"
                value={newRule.fixed_fee ?? '0'}
                onChange={(event) => setNewRule({ ...newRule, fixed_fee: event.target.value })}
                step="0.01"
                min="0"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <input
              type="text"
              placeholder="URL/fonte oficial que comprova a regra"
              value={newRule.source_url || ''}
              onChange={(event) => setNewRule({ ...newRule, source_url: event.target.value })}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <div className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">
              Esta tela cria somente regras <strong>official + confirmed</strong>. Pesquisas e estimativas podem permanecer no histórico, mas não entram no cálculo do cliente.
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={creating}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-60"
              >
                {creating ? 'Salvando…' : 'Salvar regra oficial'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowNewRuleForm(false)
                  setResolvingGapId(null)
                  setNewRule({ ...EMPTY_RULE })
                }}
                className="rounded-lg bg-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-300"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl bg-white shadow-md">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Plataforma</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Categoria / escopo</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Conta / tipo</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Faixa preço</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Comissão</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Tx. fixa</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Vigência</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {activeRules.map((rule) => {
                const platform = platforms.find((item) => item.id === rule.platform_id)
                const status = ruleStatus(rule)
                const editing = editingRuleId === rule.id
                const linkedCategory = rule.marketplace_category_id
                  ? categoryById.get(rule.marketplace_category_id)
                  : null
                const categoryLabel = linkedCategory?.full_path || rule.category || 'Geral'

                return (
                  <React.Fragment key={rule.id}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-4 py-3">{platform?.name || '—'}</td>
                      <td className="max-w-sm px-4 py-3">
                        <div className="text-gray-800">{categoryLabel}</div>
                        {rule.marketplace_category_id && (
                          <div className="mt-0.5 text-[11px] text-indigo-600">
                            {rule.category_scope === 'descendants' ? 'inclui subcategorias' : 'somente esta categoria'}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div>{rule.account_type ? rule.account_type.toUpperCase() : 'Geral'}</div>
                        <div className="text-[11px] text-gray-400">{rule.listing_type || 'qualquer anúncio'}</div>
                      </td>
                      <td className="px-4 py-3">R$ {rule.price_min} – {rule.price_max ?? '∞'}</td>
                      <td className="px-4 py-3">{rule.commission_pct}%</td>
                      <td className="px-4 py-3">R$ {rule.fixed_fee}</td>
                      <td className="px-4 py-3 text-gray-500">desde {rule.valid_from}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${status.cls}`}>{status.label}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => beginEdit(rule)}
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Editar
                        </button>
                      </td>
                    </tr>

                    {editing && editForm && (
                      <tr>
                        <td colSpan={9} className="bg-blue-50 px-4 py-4">
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
                            <input
                              type="number"
                              step="0.01"
                              value={editForm.commission_pct}
                              onChange={(event) => setEditForm({ ...editForm, commission_pct: event.target.value })}
                              placeholder="Comissão %"
                              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            />
                            <input
                              type="number"
                              step="0.01"
                              value={editForm.fixed_fee}
                              onChange={(event) => setEditForm({ ...editForm, fixed_fee: event.target.value })}
                              placeholder="Taxa fixa"
                              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            />
                            <select
                              value={editForm.source_kind}
                              onChange={(event) => setEditForm({ ...editForm, source_kind: event.target.value })}
                              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                            >
                              <option value="official">Oficial</option>
                              <option value="seller_panel">Painel seller</option>
                              <option value="api">API</option>
                              <option value="static">Regra estática</option>
                              <option value="manual">Manual</option>
                            </select>
                            <select
                              value={editForm.confidence_status}
                              onChange={(event) => setEditForm({ ...editForm, confidence_status: event.target.value })}
                              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                            >
                              <option value="confirmed">Confirmada</option>
                              <option value="account_specific">Específica da conta</option>
                              <option value="estimate">Estimativa</option>
                              <option value="deprecated">Descontinuada</option>
                            </select>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => saveVersion(rule)}
                                className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
                              >
                                <Save className="h-4 w-4" /> Salvar versão
                              </button>
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => {
                                  setEditingRuleId(null)
                                  setEditForm(null)
                                  setError(null)
                                }}
                                className="inline-flex items-center gap-1 rounded-lg bg-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-300"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                          <input
                            type="text"
                            value={editForm.source_url}
                            onChange={(event) => setEditForm({ ...editForm, source_url: event.target.value })}
                            placeholder="Fonte/justificativa"
                            className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          />
                          <p className="mt-2 text-xs text-blue-700">
                            Salvar é atômico: categoria, escopo e perfil da regra são preservados na nova versão. Se a confiança deixar de ser oficial/confirmada, o motor para de utilizá-la automaticamente.
                          </p>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
