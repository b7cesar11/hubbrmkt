import React from 'react'
import { Plus } from 'lucide-react'

export function CustosTab({ costComponents, showNewCostComponent, setShowNewCostComponent, newCostComponent, setNewCostComponent, editingCostComponentId, setEditingCostComponentId, editCostComponentForm, setEditCostComponentForm, handleCreateCostComponentStandalone, handleUpdateCostComponent, handleToggleCostComponentActive }) {
  return (
    <>
          <div>
            <div className="mb-4 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">Custos Adicionais</h2>
              <button
                onClick={() => setShowNewCostComponent(!showNewCostComponent)}
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Novo Custo
              </button>
            </div>

            {showNewCostComponent && (
              <div className="bg-white rounded-xl shadow-md p-6 mb-6">
                <form onSubmit={handleCreateCostComponentStandalone} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <input
                      type="text"
                      placeholder="Nome (ex: Comissão Creator)"
                      value={newCostComponent.name}
                      onChange={(e) => setNewCostComponent({ ...newCostComponent, name: e.target.value })}
                      required
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <select
                      value={newCostComponent.category}
                      onChange={(e) => setNewCostComponent({ ...newCostComponent, category: e.target.value })}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="affiliate_commission">Comissão de afiliado</option>
                      <option value="marketing_commission">Comissão de marketing</option>
                      <option value="ads_cost">Custo de ads</option>
                      <option value="other">Outro</option>
                    </select>
                    <select
                      value={newCostComponent.calc_type}
                      onChange={(e) => setNewCostComponent({ ...newCostComponent, calc_type: e.target.value })}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="percentage">% do preço</option>
                      <option value="fixed">R$ fixo</option>
                    </select>
                    <input
                      type="number"
                      placeholder="Valor padrão"
                      value={newCostComponent.default_value}
                      onChange={(e) => setNewCostComponent({ ...newCostComponent, default_value: e.target.value })}
                      step="0.01"
                      required
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm">
                      Salvar
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowNewCostComponent(false)}
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
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nome</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categoria</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Valor padrão</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {costComponents.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                          Nenhum custo adicional cadastrado ainda.
                        </td>
                      </tr>
                    ) : (
                      costComponents.map((c) => {
                        const isEditing = editingCostComponentId === c.id
                        return (
                          <tr key={c.id} className={!c.active ? 'opacity-50' : ''}>
                            {isEditing ? (
                              <>
                                <td className="px-4 py-2">
                                  <input
                                    type="text"
                                    value={editCostComponentForm[c.id]?.name ?? c.name}
                                    onChange={(e) =>
                                      setEditCostComponentForm((prev) => ({
                                        ...prev,
                                        [c.id]: { ...prev[c.id], name: e.target.value },
                                      }))
                                    }
                                    className="px-2 py-1 border border-gray-300 rounded text-sm w-full"
                                  />
                                </td>
                                <td className="px-4 py-2">
                                  <select
                                    value={editCostComponentForm[c.id]?.category ?? c.category}
                                    onChange={(e) =>
                                      setEditCostComponentForm((prev) => ({
                                        ...prev,
                                        [c.id]: { ...prev[c.id], category: e.target.value },
                                      }))
                                    }
                                    className="px-2 py-1 border border-gray-300 rounded text-sm"
                                  >
                                    <option value="affiliate_commission">Afiliado</option>
                                    <option value="marketing_commission">Marketing</option>
                                    <option value="ads_cost">Ads</option>
                                    <option value="other">Outro</option>
                                  </select>
                                </td>
                                <td className="px-4 py-2">
                                  <select
                                    value={editCostComponentForm[c.id]?.calc_type ?? c.calc_type}
                                    onChange={(e) =>
                                      setEditCostComponentForm((prev) => ({
                                        ...prev,
                                        [c.id]: { ...prev[c.id], calc_type: e.target.value },
                                      }))
                                    }
                                    className="px-2 py-1 border border-gray-300 rounded text-sm"
                                  >
                                    <option value="percentage">%</option>
                                    <option value="fixed">R$ fixo</option>
                                  </select>
                                </td>
                                <td className="px-4 py-2">
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={editCostComponentForm[c.id]?.default_value ?? c.default_value}
                                    onChange={(e) =>
                                      setEditCostComponentForm((prev) => ({
                                        ...prev,
                                        [c.id]: { ...prev[c.id], default_value: e.target.value },
                                      }))
                                    }
                                    className="px-2 py-1 border border-gray-300 rounded text-sm w-24"
                                  />
                                </td>
                                <td className="px-4 py-2 text-xs text-gray-400">
                                  {c.active ? 'Ativo' : 'Inativo'}
                                </td>
                                <td className="px-4 py-2 space-x-2">
                                  <button
                                    onClick={() => handleUpdateCostComponent(c.id)}
                                    className="text-xs text-green-600 hover:underline"
                                  >
                                    salvar
                                  </button>
                                  <button
                                    onClick={() => setEditingCostComponentId(null)}
                                    className="text-xs text-gray-500 hover:underline"
                                  >
                                    cancelar
                                  </button>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="px-4 py-3">{c.name}</td>
                                <td className="px-4 py-3 text-gray-500">
                                  {{
                                    affiliate_commission: 'Comissão de afiliado',
                                    marketing_commission: 'Comissão de marketing',
                                    ads_cost: 'Custo de ads',
                                    other: 'Outro',
                                  }[c.category] || c.category}
                                </td>
                                <td className="px-4 py-3">{c.calc_type === 'percentage' ? '%' : 'R$ fixo'}</td>
                                <td className="px-4 py-3">
                                  {c.calc_type === 'percentage' ? `${c.default_value}%` : `R$ ${c.default_value}`}
                                </td>
                                <td className="px-4 py-3">
                                  <span
                                    className={`text-xs px-2 py-0.5 rounded-full ${
                                      c.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                                    }`}
                                  >
                                    {c.active ? 'Ativo' : 'Inativo'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 space-x-3">
                                  <button
                                    onClick={() => {
                                      setEditingCostComponentId(c.id)
                                      setEditCostComponentForm((prev) => ({ ...prev, [c.id]: { ...c } }))
                                    }}
                                    className="text-xs text-blue-600 hover:underline"
                                  >
                                    editar
                                  </button>
                                  <button
                                    onClick={() => handleToggleCostComponentActive(c)}
                                    className={`text-xs hover:underline ${
                                      c.active ? 'text-red-600' : 'text-green-600'
                                    }`}
                                  >
                                    {c.active ? 'desativar' : 'reativar'}
                                  </button>
                                </td>
                              </>
                            )}
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-3">
              Desativar não apaga custos já aplicados em produtos — só some da lista de opções pra
              aplicar em produtos novos.
            </p>
          </div>
    </>
  )
}
