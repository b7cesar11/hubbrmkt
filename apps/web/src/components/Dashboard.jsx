import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, Package, TrendingUp, AlertCircle } from 'lucide-react'

export default function Dashboard({ user, onLogout }) {
  const [products, setProducts] = useState([])
  const [platforms, setPlatforms] = useState([])
  const [feeRules, setFeeRules] = useState([])
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

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (selectedPlatform !== 'all') {
      calculateMargins()
    } else {
      loadProducts()
    }
  }, [selectedPlatform])

  async function loadData() {
    try {
      const [productsRes, platformsRes, rulesRes] = await Promise.all([
        supabase.from('products').select('*'),
        supabase.from('platforms').select('*'),
        supabase.from('platform_fee_rules').select('*'),
      ])

      if (productsRes.error) throw productsRes.error
      if (platformsRes.error) throw platformsRes.error
      if (rulesRes.error) throw rulesRes.error

      setProducts(productsRes.data || [])
      setPlatforms(platformsRes.data || [])
      setFeeRules(rulesRes.data || [])
    } catch (err) {
      console.error('Erro ao carregar dados:', err)
    } finally {
      setLoading(false)
    }
  }

  async function loadProducts() {
    const { data, error } = await supabase.from('products').select('*')
    if (!error && data) {
      setProducts(data)
    }
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

    setProducts([...products, data[0]])
    setNewProduct({ sku: '', name: '', category: '', cost_price: '', weight_kg: '' })
    setShowNewProduct(false)
  }

  async function handleDeleteProduct(id) {
    const { error } = await supabase.from('products').delete().eq('id', id)
    if (error) {
      alert('Erro ao deletar: ' + error.message)
      return
    }
    setProducts(products.filter(p => p.id !== id))
  }

  function calculateMargins() {
    if (selectedPlatform === 'all') return products

    const platform = platforms.find(p => p.id === selectedPlatform)
    if (!platform) return []

    return products.map(product => {
      const applicableRule = feeRules.find(rule => {
        if (rule.platform_id !== selectedPlatform) return false
        if (!rule.valid_from) return false
        
        const today = new Date()
        const validFrom = new Date(rule.valid_from)
        const validTo = rule.valid_to ? new Date(rule.valid_to) : null
        
        if (today < validFrom) return false
        if (validTo && today > validTo) return false

        if (rule.category && rule.category !== product.category) {
          return false
        }

        const price = 0
        if (rule.price_min !== null && price < rule.price_min) return false
        if (rule.price_max !== null && price >= rule.price_max) return false

        return true
      })

      let marginInfo = null
      if (applicableRule) {
        const simulatedPrice = product.cost_price * 1.5
        const commission = (simulatedPrice * applicableRule.commission_pct) / 100
        const fixedFee = applicableRule.fixed_fee || 0
        const netMargin = simulatedPrice - product.cost_price - commission - fixedFee
        const marginPct = (netMargin / simulatedPrice) * 100

        marginInfo = {
          rule: applicableRule,
          simulatedPrice,
          commission,
          fixedFee,
          netMargin,
          marginPct,
        }
      }

      return {
        ...product,
        marginInfo,
        platformName: platform?.name,
      }
    })
  }

  const displayedProducts = selectedPlatform === 'all' ? products : calculateMargins()

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
              <option value="all">Todas as Plataformas</option>
              {platforms.map(platform => (
                <option key={platform.id} value={platform.id}>
                  {platform.name}
                </option>
              ))}
            </select>

            <button
              onClick={() => setShowNewProduct(!showNewProduct)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Novo Produto
            </button>
          </div>
        </div>

        {showNewProduct && (
          <div className="mb-6 bg-white rounded-xl shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Novo Produto</h3>
            <form onSubmit={handleCreateProduct} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  Salvar
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewProduct(false)}
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
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      SKU
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Nome
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Categoria
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Custo
                    </th>
                    {selectedPlatform !== 'all' && (
                      <>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Plataforma
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Margem Líq.
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          % Margem
                        </th>
                      </>
                    )}
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {displayedProducts.map((product) => (
                    <tr key={product.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {product.sku}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {product.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {product.category}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        R$ {product.cost_price?.toFixed(2)}
                      </td>
                      {selectedPlatform !== 'all' && (
                        <>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {product.platformName}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {product.marginInfo ? (
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                product.marginInfo.netMargin > 0
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                R$ {product.marginInfo.netMargin.toFixed(2)}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-orange-600">
                                <AlertCircle className="w-3 h-3" />
                                Sem regra
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {product.marginInfo ? (
                              <span className={`text-sm font-medium ${
                                product.marginInfo.marginPct > 10
                                  ? 'text-green-600'
                                  : product.marginInfo.marginPct > 0
                                  ? 'text-yellow-600'
                                  : 'text-red-600'
                              }`}>
                                {product.marginInfo.marginPct.toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-sm text-gray-400">-</span>
                            )}
                          </td>
                        </>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleDeleteProduct(product.id)}
                          className="text-red-600 hover:text-red-900 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
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
                <h4 className="text-sm font-semibold text-blue-900 mb-1">
                  Simulação de Margem
                </h4>
                <p className="text-sm text-blue-700">
                  Os cálculos acima usam um preço de venda simulado (1.5x o custo) para demonstração. 
                  Na versão completa, você poderá cadastrar o preço real de venda em cada plataforma.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
