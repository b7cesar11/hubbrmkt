import React from 'react'
import { findApplicableRule } from '../../lib/margin'

export function ProductForm({ platforms, feeRules, costComponents, editingProductId, newProduct, setNewProduct, newListings, setNewListings, toggleListingPlatform, setListingPrice, toggleListingCost, closeProductForm, handleSubmitProduct, availableCategories }) {
  return (
          <div className="bg-white rounded-xl shadow-md p-6 mb-6">
            <h3 className="text-base font-semibold text-gray-900 mb-4">
              {editingProductId ? 'Editar produto' : 'Novo produto'}
            </h3>
            <form onSubmit={handleSubmitProduct} className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Dados do produto</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <input
                    type="text"
                    placeholder="SKU"
                    value={newProduct.sku}
                    onChange={(e) => setNewProduct({ ...newProduct, sku: e.target.value })}
                    required
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <input
                    type="text"
                    placeholder="Nome"
                    value={newProduct.name}
                    onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                    required
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <input
                    type="text"
                    placeholder="Categoria"
                    list="categorias-existentes"
                    value={newProduct.category}
                    onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                    required
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <datalist id="categorias-existentes">
                    {availableCategories.map((cat) => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                  <input
                    type="number"
                    placeholder="Custo (R$)"
                    value={newProduct.cost_price}
                    onChange={(e) => setNewProduct({ ...newProduct, cost_price: e.target.value })}
                    required
                    step="0.01"
                    min="0"
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <input
                    type="number"
                    placeholder="Peso (kg)"
                    value={newProduct.weight_kg}
                    onChange={(e) => setNewProduct({ ...newProduct, weight_kg: e.target.value })}
                    step="0.01"
                    min="0"
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-1">
                  Presença por plataforma
                </h3>
                <p className="text-xs text-gray-500 mb-3">
                  Marque as plataformas onde esse produto será vendido e informe o preço de
                  venda real — sem preço, a margem não pode ser calculada.
                </p>
                <div className="space-y-2">
                  {platforms.map((p) => (
                    <div key={p.id} className="border border-gray-100 rounded-lg p-2">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={!!newListings[p.id]?.enabled}
                          onChange={() => toggleListingPlatform(p.id)}
                          className="w-4 h-4 rounded border-gray-300"
                        />
                        <span className="w-36 text-sm text-gray-700">{p.name}</span>
                        <input
                          type="number"
                          placeholder="Preço de venda (R$)"
                          disabled={!newListings[p.id]?.enabled}
                          value={newListings[p.id]?.sale_price || ''}
                          onChange={(e) => setListingPrice(p.id, e.target.value)}
                          step="0.01"
                          min="0"
                          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100 disabled:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        {p.name === 'Mercado Livre' && newListings[p.id]?.enabled && (
                          <select
                            value={newListings[p.id]?.listing_type || ''}
                            onChange={(e) =>
                              setNewListings((prev) => ({
                                ...prev,
                                [p.id]: { ...prev[p.id], listing_type: e.target.value },
                              }))
                            }
                            className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
                          >
                            <option value="">Tipo de anúncio...</option>
                            <option value="classico">Clássico</option>
                            <option value="premium">Premium</option>
                          </select>
                        )}
                      </div>
                      {newListings[p.id]?.enabled && costComponents.filter((c) => c.active).length > 0 && (
                        <div className="ml-7 mt-2 flex flex-wrap gap-2">
                          {costComponents.filter((c) => c.active).map((c) => (
                            <label
                              key={c.id}
                              className="flex items-center gap-1 text-xs bg-gray-50 rounded px-2 py-1 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={
                                  !!newListings[p.id]?.selectedCosts?.includes(c.id)
                                }
                                onChange={() => toggleListingCost(p.id, c.id)}
                                className="w-3 h-3"
                              />
                              {c.name} (
                              {c.calc_type === 'percentage'
                                ? `${c.default_value}%`
                                : `R$${c.default_value}`}
                              )
                            </label>
                          ))}
                        </div>
                      )}
                      {newListings[p.id]?.enabled &&
                        newListings[p.id]?.sale_price &&
                        newProduct.cost_price &&
                        (() => {
                          const price = parseFloat(newListings[p.id].sale_price)
                          const cost = parseFloat(newProduct.cost_price)
                          if (isNaN(price) || isNaN(cost) || price <= 0) return null

                          const rule = findApplicableRule(
                            p.id,
                            newProduct.category,
                            price,
                            newListings[p.id]?.listing_type || null,
                            feeRules
                          )
                          if (!rule) {
                            return (
                              <p className="ml-7 mt-2 text-xs text-orange-600">
                                ⚠️ Sem regra de taxa pra "{newProduct.category || 'essa categoria'}"
                                nessa plataforma ainda — vai ficar registrado como pendência.
                              </p>
                            )
                          }

                          const commission = (price * rule.commission_pct) / 100
                          const fixedFee = rule.fixed_fee || 0
                          const selectedCostsTotal = (newListings[p.id]?.selectedCosts || [])
                            .map((id) => costComponents.find((c) => c.id === id))
                            .filter(Boolean)
                            .reduce(
                              (sum, c) =>
                                sum +
                                (c.calc_type === 'percentage' ? (price * c.default_value) / 100 : c.default_value),
                              0
                            )
                          const previewMargin = price - cost - commission - fixedFee - selectedCostsTotal
                          const previewPct = (previewMargin / price) * 100

                          return (
                            <p
                              className={`ml-7 mt-2 text-xs font-medium ${
                                previewPct > 10
                                  ? 'text-green-600'
                                  : previewPct > 0
                                  ? 'text-yellow-600'
                                  : 'text-red-600'
                              }`}
                            >
                              Prévia: margem de R$ {previewMargin.toFixed(2)} ({previewPct.toFixed(1)}%)
                              {rule.source_url?.toUpperCase().includes('ESTIMATIVA') && ' — taxa ainda é estimativa'}
                            </p>
                          )
                        })()}
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-xs text-gray-400">
                Precisa de um tipo de custo que ainda não existe (comissão de afiliado, ads,
                etc.)? Cadastre o produto primeiro e adicione o custo direto no detalhe dele
                (clique na linha do produto na tabela).
              </p>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  {editingProductId ? 'Salvar alterações' : 'Salvar'}
                </button>
                <button
                  type="button"
                  onClick={closeProductForm}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
  )
}
