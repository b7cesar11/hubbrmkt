import React, { useMemo } from 'react'
import { ProductForm } from './ProductForm'
import { Plus, Trash2, Pencil, Package, TrendingUp, AlertCircle } from 'lucide-react'
import { computeMargin, getListing } from '../../lib/margin'
import { supabase } from '../../lib/supabase'
import { allocateMonthlyCostsByProduct, calculateProductPredictability } from '../../lib/predictability'
import { PageHeader } from '../ui/PageHeader'

export function ProdutosTab({ products, setProducts, platforms, feeRules, listings, costComponents, listingCostComponents, operationPeople = [], productPeople = [], monthlyOperationCosts = [], productMonthlyOperationCosts = [], userRole, showNewProduct, setShowNewProduct, editingProductId, setEditingProductId, selectedPlatform, setSelectedPlatform, searchText, setSearchText, categoryFilter, setCategoryFilter, statusFilter, setStatusFilter, editRuleForm, setEditRuleForm, newProduct, setNewProduct, newListings, setNewListings, expandedProductId, setExpandedProductId, addCostForm, setAddCostForm, newComponentForm, setNewComponentForm, handleUpdateRule, handleMarkRuleConfirmed, toggleListingPlatform, setListingPrice, toggleListingCost, openEditProduct, closeProductForm, handleSubmitProduct, handleDeactivateProduct, getMarginDeps, handleAddCostToListing, handleRemoveCostFromListing, handleCreateCostComponent, availableCategories, displayedProducts, onSimulate }) {
  const monthlyAllocation = useMemo(
    () => allocateMonthlyCostsByProduct({
      products,
      people: operationPeople,
      productPeople,
      monthlyCosts: monthlyOperationCosts,
      productMonthlyCosts: productMonthlyOperationCosts,
    }),
    [products, operationPeople, productPeople, monthlyOperationCosts, productMonthlyOperationCosts],
  )

  function money(value) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  return (
    <>
        <>
        <PageHeader
          eyebrow="Catálogo e canais"
          title="Produtos e margens"
          description={`${displayedProducts.length} produto${displayedProducts.length === 1 ? '' : 's'} no resultado atual. Compare preços, margens e metas por marketplace.`}
          actions={<>
            <select
              value={selectedPlatform}
              onChange={(e) => setSelectedPlatform(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500 sm:w-auto"
            >
              <option value="all">Todas as plataformas</option>
              {platforms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                setEditingProductId(null)
                setShowNewProduct(true)
              }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 sm:w-auto"
            >
              <Plus className="w-4 h-4" />
              Novo Produto
            </button>
          </>}
        />

        <div className="mb-6 flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Buscar por SKU ou nome..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm flex-1 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          >
            <option value="all">Todas as categorias</option>
            {availableCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          >
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
            <option value="all">Todos</option>
          </select>
        </div>

        {showNewProduct && (
          <ProductForm platforms={platforms} feeRules={feeRules} costComponents={costComponents} editingProductId={editingProductId} newProduct={newProduct} setNewProduct={setNewProduct} newListings={newListings} setNewListings={setNewListings} toggleListingPlatform={toggleListingPlatform} setListingPrice={setListingPrice} toggleListingCost={toggleListingCost} closeProductForm={closeProductForm} handleSubmitProduct={handleSubmitProduct} availableCategories={availableCategories} />
        )}

        {displayedProducts.length === 0 ? (
          <div className="bg-white rounded-xl shadow-md p-12 text-center">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum produto cadastrado</h3>
            <p className="text-gray-500 mb-4">Comece cadastrando seu primeiro produto</p>
            <button
              onClick={() => setShowNewProduct(true)}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-colors"
            >
              <Plus className="w-5 h-5" />
              Cadastrar Produto
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="divide-y divide-slate-100 md:hidden">
              {displayedProducts.map((product) => {
                const margin = selectedPlatform !== 'all'
                  ? computeMargin(product, selectedPlatform, getMarginDeps())
                  : null
                const productListings = listings.filter(
                  (listing) => String(listing.product_id) === String(product.id) && listing.active !== false,
                )
                return (
                  <article key={product.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><div className="flex items-center gap-2"><span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">{product.sku}</span>{!product.active && <span className="text-[10px] font-medium text-red-600">Inativo</span>}</div><h3 className="mt-2 truncate font-semibold text-slate-900">{product.name}</h3><p className="mt-1 text-xs text-slate-500">{product.category} · {productListings.length} conta{productListings.length === 1 ? '' : 's'}</p></div>
                      <button type="button" onClick={() => openEditProduct(product)} aria-label={`Editar ${product.name}`} className="rounded-lg border border-slate-200 p-2 text-blue-600"><Pencil className="h-4 w-4" /></button>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3">
                      <div><p className="text-[10px] uppercase tracking-wide text-slate-400">Custo</p><p className="mt-1 text-sm font-semibold text-slate-800">{money(product.cost_price)}</p></div>
                      <div><p className="text-[10px] uppercase tracking-wide text-slate-400">Margem no filtro</p>{selectedPlatform === 'all' ? <p className="mt-1 text-xs text-slate-500">Escolha uma plataforma</p> : margin?.status === 'ok' ? <p className={`mt-1 text-sm font-semibold ${margin.marginPct > 10 ? 'text-emerald-700' : margin.marginPct > 0 ? 'text-amber-700' : 'text-red-700'}`}>{margin.marginPct.toFixed(1)}% · {money(margin.netMargin)}</p> : <p className="mt-1 text-xs text-amber-700">Previsão incompleta</p>}</div>
                    </div>
                    {productListings.length > 0 && <button type="button" onClick={() => onSimulate(product, selectedPlatform !== 'all' ? selectedPlatform : productListings[0].platform_id)} className="mt-3 w-full rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm font-semibold text-blue-700">Simular preço e margem</button>}
                  </article>
                )
              })}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Categoria</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Custo</th>
                    {selectedPlatform !== 'all' && (
                      <>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Preço venda</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contribuição</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">% Margem</th>
                      </>
                    )}
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {displayedProducts.map((product) => {
                    const margin =
                      selectedPlatform !== 'all' ? computeMargin(product, selectedPlatform, getMarginDeps()) : null

                    return (
                      <React.Fragment key={product.id}>
                        <tr
                          className="hover:bg-gray-50 cursor-pointer"
                          onClick={() =>
                            setExpandedProductId(
                              expandedProductId === product.id ? null : product.id
                            )
                          }
                        >
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{product.sku}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{product.name}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{product.category}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            R$ {product.cost_price?.toFixed(2)}
                          </td>
                          {selectedPlatform !== 'all' && (
                            <>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {margin?.status === 'ok' ? `R$ ${margin.salePrice.toFixed(2)}` : '—'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                {margin?.status === 'ok' ? (
                                  <div className="flex flex-col">
                                    <span
                                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium w-fit ${
                                        margin.netMargin > 0
                                          ? 'bg-green-100 text-green-800'
                                          : 'bg-red-100 text-red-800'
                                      }`}
                                    >
                                      R$ {margin.netMargin.toFixed(2)}
                                    </span>
                                    {margin.appliedCosts.length > 0 && (
                                      <span className="text-[11px] text-gray-400 mt-1">
                                        inclui {margin.appliedCosts.map((c) => c.name).join(', ')} (
                                        -R$ {margin.additionalCostsTotal.toFixed(2)})
                                      </span>
                                    )}
                                    {margin.promoBenefits.length > 0 && (
                                      <span className="text-[11px] text-green-600 mt-1">
                                        🎁 promoção ativa (+R$ {margin.promoBenefitsTotal.toFixed(2)})
                                      </span>
                                    )}
                                  </div>
                                ) : margin?.status === 'sem_preco' ? (
                                  <span className="text-xs text-gray-400">— sem preço cadastrado</span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-xs text-orange-600">
                                    <AlertCircle className="w-3 h-3" />
                                    Sem regra de taxa
                                  </span>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                {margin?.status === 'ok' ? (
                                  <span
                                    className={`text-sm font-medium ${
                                      margin.marginPct > 10
                                        ? 'text-green-600'
                                        : margin.marginPct > 0
                                        ? 'text-yellow-600'
                                        : 'text-red-600'
                                    }`}
                                  >
                                    {margin.marginPct.toFixed(1)}%
                                  </span>
                                ) : (
                                  <span className="text-sm text-gray-400">—</span>
                                )}
                              </td>
                            </>
                          )}
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex justify-end gap-3">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openEditProduct(product)
                                }}
                                title="Editar produto"
                                className="text-blue-600 hover:text-blue-900 transition-colors"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              {product.active ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleDeactivateProduct(product.id, product.name)
                                  }}
                                  title="Desativar produto (não apaga o histórico)"
                                  className="text-red-600 hover:text-red-900 transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              ) : (
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation()
                                    const { error } = await supabase
                                      .from('products')
                                      .update({ active: true })
                                      .eq('id', product.id)
                                    if (error) {
                                      alert('Erro ao reativar: ' + error.message)
                                      return
                                    }
                                    setProducts(
                                      products.map((p) =>
                                        p.id === product.id ? { ...p, active: true } : p
                                      )
                                    )
                                  }}
                                  title="Reativar produto"
                                  className="text-green-600 hover:text-green-900 text-xs font-medium"
                                >
                                  Reativar
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {expandedProductId === product.id && (
                          <tr>
                            <td colSpan={selectedPlatform !== 'all' ? 8 : 5} className="bg-gray-50 px-6 py-5">
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {platforms.map((platform) => {
                                  const listing = getListing(product.id, platform.id, listings)
                                  if (!listing) {
                                    return (
                                      <div
                                        key={platform.id}
                                        className="bg-white rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-400"
                                      >
                                        {platform.name} — não vendido nesta plataforma
                                      </div>
                                    )
                                  }

                                  const m = computeMargin(product, platform.id, getMarginDeps())
                                  const predictability = calculateProductPredictability(
                                    m,
                                    monthlyAllocation.get(String(product.id)),
                                    10,
                                  )
                                  const isEstimate =
                                    m.status === 'ok' &&
                                    (m.rule.source_url?.toUpperCase().includes('ESTIMATIVA') ||
                                      m.rule.source_url?.toUpperCase().includes('A VALIDAR'))
                                  const appliedIds = new Set(
                                    listingCostComponents
                                      .filter((lcc) => lcc.product_listing_id === listing.id)
                                      .map((lcc) => lcc.cost_component_id)
                                  )
                                  const availableComponents = costComponents.filter(
                                    (c) => !appliedIds.has(c.id) && c.active
                                  )
                                  const listingLccs = listingCostComponents.filter(
                                    (lcc) => lcc.product_listing_id === listing.id
                                  )

                                  return (
                                    <div key={platform.id} className="bg-white rounded-lg border border-gray-200 p-4">
                                      <div className="flex items-center justify-between mb-2">
                                        <h4 className="font-semibold text-gray-900 text-sm">{platform.name}</h4>
                                        {m.status === 'ok' && (
                                          <span
                                            className={`text-[11px] px-2 py-0.5 rounded-full ${
                                              isEstimate
                                                ? 'bg-orange-100 text-orange-700'
                                                : 'bg-green-100 text-green-700'
                                            }`}
                                          >
                                            {isEstimate ? '⚠️ Estimativa' : '✅ Confirmada'}
                                          </span>
                                        )}
                                      </div>

                                      {m.status !== 'ok' ? (
                                        <p className="text-xs text-gray-400">
                                          {m.status === 'sem_preco'
                                            ? 'Sem preço de venda cadastrado.'
                                            : 'Sem regra de taxa cadastrada para esta categoria/plataforma.'}
                                        </p>
                                      ) : (
                                        <>
                                          <div className="text-xs text-gray-600 space-y-1 mb-3">
                                            <div className="flex justify-between">
                                              <span>Preço de venda</span>
                                              <span>R$ {m.salePrice.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                              <span>Custo do produto</span>
                                              <span>- R$ {product.cost_price.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                              <span>Comissão plataforma ({m.rule.commission_pct}%)</span>
                                              <span>- R$ {m.commission.toFixed(2)}</span>
                                            </div>
                                            {m.fixedFee > 0 && (
                                              <div className="flex justify-between">
                                                <span>Taxa fixa</span>
                                                <span>- R$ {m.fixedFee.toFixed(2)}</span>
                                              </div>
                                            )}
                                            {m.appliedCosts.map((c, i) => (
                                              <div key={i} className="flex justify-between">
                                                <span>
                                                  {c.name}{' '}
                                                  {c.calcType === 'percentage' ? `(${c.value}%)` : '(fixo)'}
                                                </span>
                                                <span>- R$ {c.amount.toFixed(2)}</span>
                                              </div>
                                            ))}
                                            {m.promoBenefits.map((b, i) => (
                                              <div key={i} className="flex justify-between text-green-700">
                                                <span>🎁 {b.name}</span>
                                                <span>+ R$ {b.amount.toFixed(2)}</span>
                                              </div>
                                            ))}
                                            <div className="flex justify-between font-semibold text-gray-900 border-t pt-1 mt-1">
                                              <span>Margem de contribuição</span>
                                              <span>
                                                R$ {m.netMargin.toFixed(2)} ({m.marginPct.toFixed(1)}%)
                                              </span>
                                            </div>
                                          </div>

                                          {predictability.monthlyFixed > 0 && (
                                            <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-950">
                                              <div className="mb-2 font-semibold">Previsibilidade deste SKU</div>
                                              <div className="grid grid-cols-2 gap-2">
                                                <div><span className="text-blue-600">Custos mensais rateados</span><div className="font-bold">{money(predictability.monthlyFixed)}</div></div>
                                                <div><span className="text-blue-600">Impacto na meta</span><div className="font-bold">{predictability.targetUnits ? money(predictability.fixedCostPerUnitAtTarget) + '/un.' : 'Meta inviável'}</div></div>
                                                <div><span className="text-blue-600">Mínimo para se pagar</span><div className="font-bold">{predictability.breakEvenUnits ?? '—'} un./mês</div></div>
                                                <div><span className="text-blue-600">Meta com 10% líquido</span><div className="font-bold">{predictability.targetUnits ?? '—'} un./mês</div></div>
                                              </div>
                                              {predictability.paidTrafficBudget > 0 && (
                                                <div className="mt-2 border-t border-blue-200 pt-2">
                                                  Tráfego rateado: <strong>{money(predictability.paidTrafficBudget)}/mês</strong> · ROAS mínimo: <strong>{predictability.breakEvenRoas?.toFixed(2) ?? '—'}</strong> · ROAS para 10%: <strong>{predictability.targetRoas?.toFixed(2) ?? '—'}</strong>
                                                </div>
                                              )}
                                            </div>
                                          )}

                                          {/* Edição de taxa — só super_admin, afeta todas as empresas que usam essa regra */}
                                          {userRole === 'super_admin' && (
                                            <div
                                              className="mb-3 border-t pt-2"
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              {editRuleForm[m.rule.id] ? (
                                                <div className="space-y-1 bg-yellow-50 rounded p-2">
                                                  <p className="text-[10px] text-yellow-800 mb-1">
                                                    ⚠️ Isso cria uma nova versão da regra a partir de
                                                    hoje e afeta todos os produtos desta categoria
                                                    nesta plataforma, em qualquer empresa.
                                                  </p>
                                                  <div className="flex gap-1">
                                                    <input
                                                      type="number"
                                                      placeholder="Comissão %"
                                                      value={editRuleForm[m.rule.id]?.commission_pct ?? m.rule.commission_pct}
                                                      onChange={(e) =>
                                                        setEditRuleForm((prev) => ({
                                                          ...prev,
                                                          [m.rule.id]: {
                                                            ...prev[m.rule.id],
                                                            commission_pct: e.target.value,
                                                          },
                                                        }))
                                                      }
                                                      className="text-xs border border-gray-300 rounded px-2 py-1 w-20"
                                                    />
                                                    <input
                                                      type="number"
                                                      placeholder="Taxa fixa R$"
                                                      value={editRuleForm[m.rule.id]?.fixed_fee ?? m.rule.fixed_fee}
                                                      onChange={(e) =>
                                                        setEditRuleForm((prev) => ({
                                                          ...prev,
                                                          [m.rule.id]: {
                                                            ...prev[m.rule.id],
                                                            fixed_fee: e.target.value,
                                                          },
                                                        }))
                                                      }
                                                      className="text-xs border border-gray-300 rounded px-2 py-1 w-20"
                                                    />
                                                  </div>
                                                  <input
                                                    type="text"
                                                    placeholder="Fonte (link oficial ou nota)"
                                                    value={editRuleForm[m.rule.id]?.source_url || ''}
                                                    onChange={(e) =>
                                                      setEditRuleForm((prev) => ({
                                                        ...prev,
                                                        [m.rule.id]: {
                                                          ...prev[m.rule.id],
                                                          source_url: e.target.value,
                                                        },
                                                      }))
                                                    }
                                                    className="text-xs border border-gray-300 rounded px-2 py-1 w-full"
                                                  />
                                                  <div className="flex gap-1">
                                                    <button
                                                      onClick={() => handleUpdateRule(m.rule)}
                                                      className="text-xs bg-yellow-600 text-white px-2 py-1 rounded hover:bg-yellow-700"
                                                    >
                                                      Salvar nova versão
                                                    </button>
                                                    <button
                                                      onClick={() =>
                                                        setEditRuleForm((prev) => ({
                                                          ...prev,
                                                          [m.rule.id]: null,
                                                        }))
                                                      }
                                                      className="text-xs bg-gray-200 px-2 py-1 rounded hover:bg-gray-300"
                                                    >
                                                      Cancelar
                                                    </button>
                                                  </div>
                                                </div>
                                              ) : (
                                                <div className="flex gap-2">
                                                  <button
                                                    onClick={() =>
                                                      setEditRuleForm((prev) => ({
                                                        ...prev,
                                                        [m.rule.id]: {
                                                          commission_pct: m.rule.commission_pct,
                                                          fixed_fee: m.rule.fixed_fee,
                                                          source_url: '',
                                                        },
                                                      }))
                                                    }
                                                    className="text-xs text-blue-600 hover:underline"
                                                  >
                                                    editar taxa
                                                  </button>
                                                  {isEstimate && (
                                                    <button
                                                      onClick={() => {
                                                        const url = window.prompt(
                                                          'Link da fonte oficial:'
                                                        )
                                                        if (url) handleMarkRuleConfirmed(m.rule, url)
                                                      }}
                                                      className="text-xs text-green-600 hover:underline"
                                                    >
                                                      marcar como confirmada
                                                    </button>
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                          )}

                                          {/* Custos adicionais aplicados — remover */}
                                          {listingLccs.length > 0 && (
                                            <div className="space-y-1 mb-2">
                                              {listingLccs.map((lcc) => {
                                                const comp = costComponents.find(
                                                  (c) => c.id === lcc.cost_component_id
                                                )
                                                return (
                                                  <div
                                                    key={lcc.id}
                                                    className="flex items-center justify-between text-xs bg-gray-50 rounded px-2 py-1"
                                                  >
                                                    <span>{comp?.name || '—'}</span>
                                                    <button
                                                      onClick={(e) => {
                                                        e.stopPropagation()
                                                        handleRemoveCostFromListing(lcc.id)
                                                      }}
                                                      className="text-red-500 hover:text-red-700"
                                                    >
                                                      remover
                                                    </button>
                                                  </div>
                                                )
                                              })}
                                            </div>
                                          )}

                                          {/* Adicionar custo existente */}
                                          {availableComponents.length > 0 && (
                                            <div
                                              className="flex gap-1 mb-2"
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              <select
                                                value={addCostForm[listing.id]?.componentId || ''}
                                                onChange={(e) =>
                                                  setAddCostForm((prev) => ({
                                                    ...prev,
                                                    [listing.id]: {
                                                      ...prev[listing.id],
                                                      componentId: e.target.value,
                                                    },
                                                  }))
                                                }
                                                className="text-xs border border-gray-300 rounded px-2 py-1 flex-1"
                                              >
                                                <option value="">+ adicionar custo...</option>
                                                {availableComponents.map((c) => (
                                                  <option key={c.id} value={c.id}>
                                                    {c.name} (
                                                    {c.calc_type === 'percentage'
                                                      ? `${c.default_value}%`
                                                      : `R$${c.default_value}`}
                                                    )
                                                  </option>
                                                ))}
                                              </select>
                                              <button
                                                onClick={() => handleAddCostToListing(listing.id)}
                                                className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
                                              >
                                                Add
                                              </button>
                                            </div>
                                          )}

                                          {/* Criar novo tipo de custo, direto daqui */}
                                          <div onClick={(e) => e.stopPropagation()}>
                                            {!newComponentForm[listing.id]?.show ? (
                                              <button
                                                onClick={() =>
                                                  setNewComponentForm((prev) => ({
                                                    ...prev,
                                                    [listing.id]: { show: true },
                                                  }))
                                                }
                                                className="text-xs text-blue-600 hover:underline"
                                              >
                                                + criar novo tipo de custo
                                              </button>
                                            ) : (
                                              <div className="space-y-1 bg-blue-50 rounded p-2 mt-1">
                                                <input
                                                  type="text"
                                                  placeholder="Nome (ex: Comissão Creator)"
                                                  value={newComponentForm[listing.id]?.name || ''}
                                                  onChange={(e) =>
                                                    setNewComponentForm((prev) => ({
                                                      ...prev,
                                                      [listing.id]: {
                                                        ...prev[listing.id],
                                                        name: e.target.value,
                                                      },
                                                    }))
                                                  }
                                                  className="text-xs border border-gray-300 rounded px-2 py-1 w-full"
                                                />
                                                <div className="flex gap-1">
                                                  <select
                                                    value={newComponentForm[listing.id]?.category || 'other'}
                                                    onChange={(e) =>
                                                      setNewComponentForm((prev) => ({
                                                        ...prev,
                                                        [listing.id]: {
                                                          ...prev[listing.id],
                                                          category: e.target.value,
                                                        },
                                                      }))
                                                    }
                                                    className="text-xs border border-gray-300 rounded px-1 py-1"
                                                  >
                                                    <option value="affiliate_commission">Afiliado</option>
                                                    <option value="marketing_commission">Marketing</option>
                                                    <option value="ads_cost">Ads</option>
                                                    <option value="other">Outro</option>
                                                  </select>
                                                  <select
                                                    value={newComponentForm[listing.id]?.calc_type || 'percentage'}
                                                    onChange={(e) =>
                                                      setNewComponentForm((prev) => ({
                                                        ...prev,
                                                        [listing.id]: {
                                                          ...prev[listing.id],
                                                          calc_type: e.target.value,
                                                        },
                                                      }))
                                                    }
                                                    className="text-xs border border-gray-300 rounded px-1 py-1"
                                                  >
                                                    <option value="percentage">%</option>
                                                    <option value="fixed">R$ fixo</option>
                                                  </select>
                                                  <input
                                                    type="number"
                                                    placeholder="Valor"
                                                    value={newComponentForm[listing.id]?.default_value || ''}
                                                    onChange={(e) =>
                                                      setNewComponentForm((prev) => ({
                                                        ...prev,
                                                        [listing.id]: {
                                                          ...prev[listing.id],
                                                          default_value: e.target.value,
                                                        },
                                                      }))
                                                    }
                                                    className="text-xs border border-gray-300 rounded px-2 py-1 w-16"
                                                  />
                                                </div>
                                                <div className="flex gap-1">
                                                  <button
                                                    onClick={() => handleCreateCostComponent(listing.id)}
                                                    className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700"
                                                  >
                                                    Criar e usar
                                                  </button>
                                                  <button
                                                    onClick={() =>
                                                      setNewComponentForm((prev) => ({
                                                        ...prev,
                                                        [listing.id]: { show: false },
                                                      }))
                                                    }
                                                    className="text-xs bg-gray-200 px-2 py-1 rounded hover:bg-gray-300"
                                                  >
                                                    Cancelar
                                                  </button>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
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
        )}

        {selectedPlatform !== 'all' && (
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <TrendingUp className="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-blue-900 mb-1">Como a margem é calculada</h4>
                <p className="text-sm text-blue-700">
                  Usa o preço de venda real cadastrado por plataforma e a regra de taxa vigente
                  (comissão + taxa fixa) para essa categoria. Sem preço ou sem regra cadastrada,
                  o sistema mostra "—" em vez de um valor estimado.
                </p>
              </div>
            </div>
          </div>
        )}
        </>
    </>
  )
}
