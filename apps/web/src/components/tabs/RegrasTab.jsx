import React from 'react'
import { Plus } from 'lucide-react'

export function RegrasTab({ platforms, feeRules, showNewRuleForm, setShowNewRuleForm, resolvingGapId, setResolvingGapId, newRule, setNewRule, handleCreateRule }) {
  return (
    <>
          <div>
            <div className="mb-4 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">Regras de Taxa</h2>
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
                      onChange={(e) => setNewRule({ ...newRule, platform_id: e.target.value })}
                      required
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="">Plataforma...</option>
                      {platforms.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="Categoria (vazio = geral)"
                      value={newRule.category}
                      onChange={(e) => setNewRule({ ...newRule, category: e.target.value })}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <select
                      value={newRule.listing_type}
                      onChange={(e) => setNewRule({ ...newRule, listing_type: e.target.value })}
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
                      onChange={(e) => setNewRule({ ...newRule, price_min: e.target.value })}
                      step="0.01"
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <input
                      type="number"
                      placeholder="Preço máx. (vazio = sem limite)"
                      value={newRule.price_max}
                      onChange={(e) => setNewRule({ ...newRule, price_max: e.target.value })}
                      step="0.01"
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <input
                      type="number"
                      placeholder="Comissão %"
                      value={newRule.commission_pct}
                      onChange={(e) => setNewRule({ ...newRule, commission_pct: e.target.value })}
                      required
                      step="0.01"
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <input
                      type="number"
                      placeholder="Taxa fixa R$"
                      value={newRule.fixed_fee}
                      onChange={(e) => setNewRule({ ...newRule, fixed_fee: e.target.value })}
                      step="0.01"
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Fonte (link oficial ou nota 'ESTIMATIVA - motivo')"
                    value={newRule.source_url}
                    onChange={(e) => setNewRule({ ...newRule, source_url: e.target.value })}
                    required
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-full"
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm"
                    >
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {feeRules
                    .filter((r) => !r.valid_to || new Date(r.valid_to) >= new Date())
                    .sort((a, b) => new Date(b.valid_from) - new Date(a.valid_from))
                    .map((rule) => {
                      const platform = platforms.find((p) => p.id === rule.platform_id)
                      const isEstimate =
                        rule.source_url?.toUpperCase().includes('ESTIMATIVA') ||
                        rule.source_url?.toUpperCase().includes('A VALIDAR')
                      return (
                        <tr key={rule.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">{platform?.name || '—'}</td>
                          <td className="px-4 py-3">{rule.category || 'Geral'}</td>
                          <td className="px-4 py-3">{rule.listing_type || '—'}</td>
                          <td className="px-4 py-3">
                            R$ {rule.price_min} – {rule.price_max ?? '∞'}
                          </td>
                          <td className="px-4 py-3">{rule.commission_pct}%</td>
                          <td className="px-4 py-3">R$ {rule.fixed_fee}</td>
                          <td className="px-4 py-3 text-gray-500">
                            desde {new Date(rule.valid_from).toLocaleDateString('pt-BR')}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full ${
                                isEstimate
                                  ? 'bg-orange-100 text-orange-700'
                                  : 'bg-green-100 text-green-700'
                              }`}
                            >
                              {isEstimate ? '⚠️ Estimativa' : '✅ Confirmada'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
              </div>
            </div>
          </div>
    </>
  )
}
