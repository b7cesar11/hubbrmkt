import React, { useState } from 'react'
import { Pencil, Plus, Save, X } from 'lucide-react'
import { localDateKey } from '../../lib/margin'
import { supabase } from '../../lib/supabase'

function ruleStatus(rule) {
  if (rule.confidence_status === 'verified') return { label: '✅ Verificada', cls: 'bg-green-100 text-green-700' }
  if (rule.confidence_status === 'account_specific') return { label: '🔐 Conta/API', cls: 'bg-blue-100 text-blue-700' }
  return { label: '⚠️ Estimativa', cls: 'bg-orange-100 text-orange-700' }
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
  handleCreateRule,
}) {
  const [editingRuleId, setEditingRuleId] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const today = localDateKey()

  function beginEdit(rule) {
    setEditingRuleId(rule.id)
    setError(null)
    setEditForm({
      commission_pct: String(rule.commission_pct ?? ''),
      fixed_fee: String(rule.fixed_fee ?? '0'),
      source_url: rule.source_url || '',
      source_kind: rule.source_kind || 'estimate',
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

  const activeRules = feeRules
    .filter((rule) => !rule.valid_to || rule.valid_to >= today)
    .sort((a, b) => String(b.valid_from || '').localeCompare(String(a.valid_from || '')))

  return (
    <div>
      <div className="mb-4 flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Regras de Taxa</h2>
          <p className="text-xs text-gray-500 mt-1">
            Edições são versionadas de forma atômica no banco; a versão anterior permanece no histórico.
          </p>
        </div>
        <button
          onClick={() => {
            setResolvingGapId(null)
            setShowNewRuleForm(true)
          }}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nova Regra
        </button>
      </div>

      {showNewRuleForm && (
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            {resolvingGapId ? 'Resolver lacuna — nova regra' : 'Nova regra de taxa'}
          </h3>
          <form onSubmit={handleCreateRule} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <select
                value={newRule.platform_id}
                onChange={(event) => setNewRule({ ...newRule, platform_id: event.target.value })}
                required
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">Plataforma...</option>
                {platforms.map((platform) => (
                  <option key={platform.id} value={platform.id}>{platform.name}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Categoria (vazio = geral)"
                value={newRule.category}
                onChange={(event) => setNewRule({ ...newRule, category: event.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <select
                value={newRule.listing_type}
                onChange={(event) => setNewRule({ ...newRule, listing_type: event.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">Tipo de anúncio (opcional)</option>
                <option value="classico">Clássico</option>
                <option value="premium">Premium</option>
              </select>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <input
                type="number"
                placeholder="Preço mín."
                value={newRule.price_min}
                onChange={(event) => setNewRule({ ...newRule, price_min: event.target.value })}
                step="0.01"
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <input
                type="number"
                placeholder="Preço máx. (vazio = sem limite)"
                value={newRule.price_max}
                onChange={(event) => setNewRule({ ...newRule, price_max: event.target.value })}
                step="0.01"
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <input
                type="number"
                placeholder="Comissão %"
                value={newRule.commission_pct}
                onChange={(event) => setNewRule({ ...newRule, commission_pct: event.target.value })}
                required
                step="0.01"
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <input
                type="number"
                placeholder="Taxa fixa R$"
                value={newRule.fixed_fee}
                onChange={(event) => setNewRule({ ...newRule, fixed_fee: event.target.value })}
                step="0.01"
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <input
              type="text"
              placeholder="Fonte oficial ou nota de estimativa"
              value={newRule.source_url}
              onChange={(event) => setNewRule({ ...newRule, source_url: event.target.value })}
              required
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-full"
            />
            <div className="flex gap-2">
              <button type="submit" className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm">
                Salvar
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowNewRuleForm(false)
                  setResolvingGapId(null)
                }}
                className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm"
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

      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plataforma</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categoria</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Faixa preço</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Comissão</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tx. fixa</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vigência</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {activeRules.map((rule) => {
                const platform = platforms.find((item) => item.id === rule.platform_id)
                const status = ruleStatus(rule)
                const editing = editingRuleId === rule.id

                return (
                  <React.Fragment key={rule.id}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-4 py-3">{platform?.name || '—'}</td>
                      <td className="px-4 py-3">{rule.category || 'Geral'}</td>
                      <td className="px-4 py-3">{rule.listing_type || '—'}</td>
                      <td className="px-4 py-3">R$ {rule.price_min} – {rule.price_max ?? '∞'}</td>
                      <td className="px-4 py-3">{rule.commission_pct}%</td>
                      <td className="px-4 py-3">R$ {rule.fixed_fee}</td>
                      <td className="px-4 py-3 text-gray-500">desde {rule.valid_from}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${status.cls}`}>{status.label}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => beginEdit(rule)}
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                        >
                          <Pencil className="w-3.5 h-3.5" /> Editar
                        </button>
                      </td>
                    </tr>

                    {editing && editForm && (
                      <tr>
                        <td colSpan={9} className="bg-blue-50 px-4 py-4">
                          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                            <input
                              type="number"
                              step="0.01"
                              value={editForm.commission_pct}
                              onChange={(event) => setEditForm({ ...editForm, commission_pct: event.target.value })}
                              placeholder="Comissão %"
                              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            />
                            <input
                              type="number"
                              step="0.01"
                              value={editForm.fixed_fee}
                              onChange={(event) => setEditForm({ ...editForm, fixed_fee: event.target.value })}
                              placeholder="Taxa fixa"
                              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            />
                            <select
                              value={editForm.source_kind}
                              onChange={(event) => setEditForm({ ...editForm, source_kind: event.target.value })}
                              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                            >
                              <option value="official">Oficial</option>
                              <option value="seller_panel">Painel seller</option>
                              <option value="api">API</option>
                              <option value="estimate">Estimativa</option>
                              <option value="manual">Manual</option>
                            </select>
                            <select
                              value={editForm.confidence_status}
                              onChange={(event) => setEditForm({ ...editForm, confidence_status: event.target.value })}
                              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                            >
                              <option value="verified">Verificada</option>
                              <option value="account_specific">Específica da conta</option>
                              <option value="estimate">Estimativa</option>
                              <option value="needs_validation">A validar</option>
                            </select>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => saveVersion(rule)}
                                className="inline-flex items-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-3 py-2 rounded-lg text-sm"
                              >
                                <Save className="w-4 h-4" /> Salvar versão
                              </button>
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => {
                                  setEditingRuleId(null)
                                  setEditForm(null)
                                  setError(null)
                                }}
                                className="inline-flex items-center gap-1 bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          <input
                            type="text"
                            value={editForm.source_url}
                            onChange={(event) => setEditForm({ ...editForm, source_url: event.target.value })}
                            placeholder="Fonte/justificativa"
                            className="mt-3 px-3 py-2 border border-gray-300 rounded-lg text-sm w-full"
                          />
                          <p className="mt-2 text-xs text-blue-700">
                            Salvar é atômico: a versão anterior é encerrada e a nova nasce na mesma transação. Se qualquer etapa falhar, nada é alterado.
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
