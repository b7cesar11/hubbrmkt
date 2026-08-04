import React, { useState, useEffect, useCallback } from 'react'
import { Link2, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react'
import {
  buildMercadoLivreAuthUrl,
  getMarketplaceConnections,
  queryMercadoLivreFee,
} from '../../lib/marketplaceConnections'

const PLATFORM_LABELS = {
  mercado_livre: 'Mercado Livre',
  amazon: 'Amazon',
  shopee: 'Shopee',
  magalu: 'Magalu',
  tiktok_shop: 'TikTok Shop',
}

function StatusBadge({ status }) {
  const map = {
    connected: { cls: 'bg-green-100 text-green-700', label: 'Conectado' },
    disconnected: { cls: 'bg-gray-100 text-gray-600', label: 'Desconectado' },
    error: { cls: 'bg-red-100 text-red-700', label: 'Erro — reconectar' },
  }
  const s = map[status] || map.disconnected
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  )
}

export function ConexoesTab({ companyId, userRole }) {
  const [connections, setConnections] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Estado do teste de taxa ao vivo
  const [testForm, setTestForm] = useState({
    categoryId: '',
    price: '',
    listingType: 'classico',
  })
  const [testResult, setTestResult] = useState(null)
  const [testing, setTesting] = useState(false)
  const [testError, setTestError] = useState(null)

  const loadConnections = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    try {
      const data = await getMarketplaceConnections(companyId)
      setConnections(data)
    } catch (e) {
      setError(e.message || 'Falha ao carregar conexões.')
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    loadConnections()
  }, [loadConnections])

  const mlConnection = connections.find((c) => c.platform === 'mercado_livre')

  function handleConnectMercadoLivre() {
    try {
      const url = buildMercadoLivreAuthUrl(companyId)
      window.location.href = url
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleTestFee(e) {
    e.preventDefault()
    setTesting(true)
    setTestError(null)
    setTestResult(null)
    try {
      const res = await queryMercadoLivreFee({
        companyId,
        categoryId: testForm.categoryId,
        price: Number(testForm.price),
        listingType: testForm.listingType,
      })
      if (res && res.ok) {
        setTestResult(res)
      } else {
        setTestError(res?.error || 'Falha na consulta.')
      }
    } catch (err) {
      setTestError(err.message || 'Falha ao invocar a função de taxa.')
    } finally {
      setTesting(false)
    }
  }

  const canManage = userRole === 'super_admin' || userRole === 'company_admin'

  return (
    <div>
      <div className="mb-4 flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-900">Conexões de Marketplace</h2>
        <button
          onClick={loadConnections}
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      <p className="text-sm text-gray-500 mb-6">
        Conecte a conta do marketplace para consultar as taxas de venda ao vivo,
        direto da API oficial. Os tokens ficam protegidos no backend e nunca são
        expostos no navegador.
      </p>

      {error && (
        <div className="mb-4 flex items-start gap-2 bg-red-50 text-red-700 rounded-lg p-3 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Card do Mercado Livre */}
      <div className="bg-white rounded-xl shadow-md p-6 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
              <Link2 className="w-5 h-5 text-yellow-700" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">
                {PLATFORM_LABELS.mercado_livre}
              </h3>
              <div className="mt-1">
                <StatusBadge status={mlConnection?.status || 'disconnected'} />
              </div>
            </div>
          </div>
          {canManage && (
            <button
              onClick={handleConnectMercadoLivre}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors text-sm"
            >
              <Link2 className="w-4 h-4" />
              {mlConnection?.status === 'connected' ? 'Reconectar' : 'Conectar'}
            </button>
          )}
        </div>

        {mlConnection && (
          <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <dt className="text-gray-500">Vendedor (ID)</dt>
              <dd className="text-gray-900">{mlConnection.external_user_id || '—'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Conectado em</dt>
              <dd className="text-gray-900">
                {mlConnection.connected_at
                  ? new Date(mlConnection.connected_at).toLocaleString('pt-BR')
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Token expira em</dt>
              <dd className="text-gray-900">
                {mlConnection.token_expires_at
                  ? new Date(mlConnection.token_expires_at).toLocaleString('pt-BR')
                  : '—'}
              </dd>
            </div>
            {mlConnection.last_error && (
              <div className="col-span-2 sm:col-span-4">
                <dt className="text-gray-500">Último erro</dt>
                <dd className="text-red-600">{mlConnection.last_error}</dd>
              </div>
            )}
          </dl>
        )}
      </div>

      {/* Teste de taxa ao vivo */}
      {mlConnection?.status === 'connected' && (
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <h3 className="font-semibold text-gray-900 mb-3">
            Testar consulta de taxa ao vivo (Mercado Livre)
          </h3>
          <form onSubmit={handleTestFee} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <input
                type="text"
                placeholder="category_id (ex: MLB1234)"
                value={testForm.categoryId}
                onChange={(e) => setTestForm({ ...testForm, categoryId: e.target.value })}
                required
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <input
                type="number"
                step="0.01"
                placeholder="Preço (R$)"
                value={testForm.price}
                onChange={(e) => setTestForm({ ...testForm, price: e.target.value })}
                required
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <select
                value={testForm.listingType}
                onChange={(e) => setTestForm({ ...testForm, listingType: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="classico">Clássico</option>
                <option value="premium">Premium</option>
              </select>
              <button
                type="submit"
                disabled={testing}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm"
              >
                {testing ? 'Consultando…' : 'Consultar'}
              </button>
            </div>
          </form>

          {testError && (
            <div className="mt-3 flex items-start gap-2 bg-red-50 text-red-700 rounded-lg p-3 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{testError}</span>
            </div>
          )}

          {testResult && (
            <div className="mt-3 flex items-start gap-2 bg-green-50 text-green-800 rounded-lg p-3 text-sm">
              <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <div>
                  Comissão: <strong>{testResult.commission_pct}%</strong> · Taxa fixa:{' '}
                  <strong>R$ {testResult.fixed_fee}</strong>
                </div>
                <div className="text-xs text-green-700 mt-1">
                  Origem: {testResult.source === 'cache' ? 'cache' : 'consulta ao vivo'}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="text-xs text-gray-400">
        Amazon (SP-API), Shopee, Magalu e TikTok Shop ainda não têm integração de
        API ativa. Serão adicionadas seguindo o mesmo padrão do Mercado Livre.
      </div>
    </div>
  )
}
