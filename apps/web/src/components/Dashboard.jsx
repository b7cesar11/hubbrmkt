import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, Package, TrendingUp, AlertCircle } from 'lucide-react'

export default function Dashboard({ user, onLogout }) {
  const [products, setProducts] = useState([])
  const [platforms, setPlatforms] = useState([])
  const [feeRules, setFeeRules] = useState([])
  const [listings, setListings] = useState([]) // product_listings reais
  const [loading, setLoading] = useState(true)
  const [showNewProduct, setShowNewProduct] = useState(false)
  const [selectedPlatform, setSelectedPlatform] = useState('all')
  const [newProduct, setNewProduct] = useState({
    sku: '',
    name: '',
    category: '',
    cost_price: '',
    weight_kg: '',
  })
  // Seção B: presença por plataforma no cadastro — { [platform_id]: { enabled: bool, sale_price: string } }
  const [newListings, setNewListings] = useState({})

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [productsRes, platformsRes, rulesRes, listingsRes] = await Promise.all([
        supabase.from('products').select('*').eq('active', true),
        supabase.from('platforms').select('*'),
        supabase.from('platform_fee_rules').select('*'),
        supabase.from('product_listings').select('*'),
      ])

      if (productsRes.error) throw productsRes.error
      if (platformsRes.error) throw platformsRes.error
      if (rulesRes.error) throw rulesRes.error
      if (listingsRes.error) throw listingsRes.error

      setProducts(productsRes.data || [])
      setPlatforms(platformsRes.data || [])
      setFeeRules(rulesRes.data || [])
      setListings(listingsRes.data || [])
    } catch (err) {
      console.error('Erro ao carregar dados:', err)
    } finally {
      setLoading(false)
    }
  }

  function toggleListingPlatform(platformId) {
    setNewListings((prev) => ({
      ...prev,
      [platformId]: {
        enabled: !prev[platformId]?.enabled,
        sale_price: prev[platformId]?.sale_price || '',
      },
    }))
  }

  function setListingPrice(platformId, value) {
    setNewListings((prev) => ({
      ...prev,
      [platformId]: { ...prev[platformId], sale_price: value },
    }))
  }

  async function handleCreateProduct(e) {
    e.preventDefault()

    const productData = {
      ...newProduct,
      cost_price: parseFloat(newProduct.cost_price),
      weight_kg: newProduct.weight_kg ? parseFloat(newProduct.weight_kg) : null,
      active: true,
    }

    const { data, error } = await supabase
      .from('products')
      .insert([productData])
      .select()

    if (error) {
      alert('Erro ao criar produto: ' + error.message)
      return
    }

    const createdProduct = data[0]

    // Seção B: cria um product_listing real para cada plataforma marcada com preço
    const listingsToInsert = Object.entries(newListings)
      .filter(([, v]) => v.enabled && v.sale_price)
      .map(([platformId, v]) => ({
        product_id: createdProduct.id,
        platform_id: platformId,
        sale_price: parseFloat(v.sale_price),
      }))

    let insertedListings = []
    if (listingsToInsert.length > 0) {
      const { data: listingsData, error: listingsError } = await supabase
        .from('product_listings')
        .insert(listingsToInsert)
        .select()

      if (listingsError) {
        alert(
          'Produto criado, mas houve erro ao salvar preços por plataforma: ' +
            listingsError.message
        )
      } else {
        insertedListings = listingsData || []
      }
    }

    setProducts([...products, createdProduct])
    setListings([...listings, ...insertedListings])
    setNewProduct({ sku: '', name: '', category: '', cost_price: '', weight_kg: '' })
    setNewListings({})
    setShowNewProduct(false)
  }

  // Nunca exclui de verdade — desativa, preservando histórico de custo e auditoria.
  async function handleDeactivateProduct(id, name) {
    const confirmed = window.confirm(
      `Desativar "${name}"? Isso não apaga o histórico do produto, só remove ele das listagens ativas. Pode ser reativado depois.`
    )
    if (!confirmed) return

    const { error } = await supabase
      .from('products')
      .update({ active: false })
      .eq('id', id)

    if (error) {
      alert('Erro ao desativar: ' + error.message)
      return
    }
    setProducts(products.filter((p) => p.id !== id))
  }

  // Espelha a lógica real do banco (fn_check_fee_coverage): plataforma + categoria
  // (ou categoria nula como fallback) + faixa de preço + vigência.
  function findApplicableRule(platformId, category, price) {
    const today = new Date()
    return feeRules.find((rule) => {
      if (rule.platform_id !== platformId) return false
      if (rule.category !== null && rule.category !== category) return false

      const validFrom = new Date(rule.valid_from)
      const validTo = rule.valid_to ? new Date(rule.valid_to) : null
      if (today < validFrom) return false
      if (validTo && today > validTo) return false

      if (rule.price_min !== null && price < rule.price_min) return false
      if (rule.price_max !== null && price >= rule.price_max) return false

      return true
    })
  }

  function getListing(productId, platformId) {
    return listings.find((l) => l.product_id === productId && l.platform_id === platformId)
  }

  // Retorna null quando falta preço de venda OU regra de taxa — nunca inventa valor.
  function computeMargin(product, platformId) {
    const listing = getListing(product.id, platformId)
    if (!listing) return { status: 'sem_preco' }

    const rule = findApplicableRule(platformId, product.category, listing.sale_price)
    if (!rule) return { status: 'sem_regra' }

    const commission = (listing.sale_price * rule.commission_pct) / 100
    const fixedFee = rule.fixed_fee || 0
    const netMargin = listing.sale_price - product.cost_price - commission - fixedFee
    const marginPct = (netMargin / listing.sale_price) * 100

    return {
      status: 'ok',
      salePrice: listing.sale_price,
      commission,
      fixedFee,
      netMargin,
      marginPct,
      rule,
    }
  }

  const displayedProducts =
    selectedPlatform === 'all'
      ? products
      : products.filter((p) => getListing(p.id, selectedPlatform))

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">MargemHub</h1>
              <p className="text-sm text-gray-500">Dashboard de Margens</p>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">{user.email}</span>
              <button
                onClick={onLogout}
                className="text-sm text-red-600 hover:text-red-700 font-medium"
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <div className="flex items-center gap-3">
            <Package className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900">Produtos</h2>
            <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
              {products.length}
            </span>
          </div>

          <div className="flex gap-3">
            <select
              value={selectedPlatform}
              onChange={(e) => setSelectedPlatform(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            >
              <option value="all">Todas as plataformas</option>
              {platforms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => setShowNewProduct(true)}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Novo Produto
            </button>
          </div>
        </div>

        {showNewProduct && (
          <div className="bg-white rounded-xl shadow-md p-6 mb-6">
            <form onSubmit={handleCreateProduct} className="space-y-6">
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
                    value={newProduct.category}
                    onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                    required
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
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
                    <div key={p.id} className="flex items-center gap-3">
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
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  Salvar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewProduct(false)
                    setNewListings({})
                  }}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
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
          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            <div className="overflow-x-auto">
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
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Margem Líq.</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">% Margem</th>
                      </>
                    )}
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {displayedProducts.map((product) => {
                    const margin =
                      selectedPlatform !== 'all' ? computeMargin(product, selectedPlatform) : null

                    return (
                      <tr key={product.id} className="hover:bg-gray-50">
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
                                <span
                                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    margin.netMargin > 0
                                      ? 'bg-green-100 text-green-800'
                                      : 'bg-red-100 text-red-800'
                                  }`}
                                >
                                  R$ {margin.netMargin.toFixed(2)}
                                </span>
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
                          <button
                            onClick={() => handleDeactivateProduct(product.id, product.name)}
                            title="Desativar produto (não apaga o histórico)"
                            className="text-red-600 hover:text-red-900 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
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
      </main>
    </div>
  )
}
