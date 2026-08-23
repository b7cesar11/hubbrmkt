import React, { useState, useEffect, useCallback } from 'react'
import { Link2, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react'
import {
  startMercadoLivreConnect,
  getMarketplaceConnections,
  queryMercadoLivreFee,
} from '../../lib/marketplaceConnections'

const ML_PLATFORM_NAME = 'Mercado Livre'

function StatusBadge({ status }) {
  const map = {
    connected: { cls: 'bg-green-100 text-green-700', label: 'Conectado' },
    disconnected: { cls: 'bg-gray-100 text-gray-600', label: 'Desconectado' },
    expired: { cls: 'bg-amber-100 text-amber-700', label: 'Expirado — reconectar' },
    error: { cls: 'bg-red-100 text-red-700', label: 'Erro — reconectar' },
  }
  const s = map[status] || map.disconnected
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>{s.label}</span>
}

export function ConexoesTab({ companyId, userRole }) {
  const [connections, setConnections] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [testForm, setTestForm] = useState({
    categoryId: '', price: '', listingType: 'classico',
    logisticType: 'drop_off', shippingMode: 'me2', billableWeightKg: '',
  })
  const [testResult, setTestResult] = useState(null)
  const [testing, setTesting] = useState(false)
  const [testError, setTestError] = useState(null)

  const loadConnections = useCallback(async () => {
    if (!companyId) return
    setLoading(true); setError(null)
    try { setConnections(await getMarketplaceConnections()) }
    catch (e) { setError(e.message || 'Falha ao carregar conexões.') }
    finally { setLoading(false) }
  }, [companyId])

  useEffect(() => { loadConnections() }, [loadConnections])
  const mlConnection = connections.find((c) => c.platform_name === ML_PLATFORM_NAME)
  const canManage = userRole === 'super_admin' || userRole === 'company_admin'

  async function handleConnectMercadoLivre() {
    setError(null)
    try { window.location.href = await startMercadoLivreConnect() }
    catch (e) { setError(e.message || 'Falha ao iniciar a conexão com o Mercado Livre.') }
  }

  async function handleTestFee(e) {
    e.preventDefault(); setTesting(true); setTestError(null); setTestResult(null)
    try {
      const res = await queryMercadoLivreFee({
        categoryId: testForm.categoryId,
        price: Number(testForm.price),
        listingType: testForm.listingType,
        logisticType: testForm.logisticType,
        shippingMode: testForm.shippingMode,
        billableWeightKg: testForm.billableWeightKg,
      })
      if (res?.ok) setTestResult(res)
      else setTestError(res?.error || 'Falha na consulta.')
    } catch (err) { setTestError(err.message || 'Falha ao invocar a função de taxa.') }
    finally { setTesting(false) }
  }

  return (
    <div>
      <div className="mb-4 flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-900">Conexões de Marketplace</h2>
        <button onClick={loadConnections} className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      <p className="text-sm text-gray-500 mb-6">
        Conecte a conta do marketplace para consultar taxas pela API oficial. Tokens ficam no backend.
      </p>

      {error && <div className="mb-4 flex items-start gap-2 bg-red-50 text-red-700 rounded-lg p-3 text-sm"><AlertCircle className="w-4 h-4 mt-0.5" /><span>{error}</span></div>}

      <div className="bg-white rounded-xl shadow-md p-6 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center"><Link2 className="w-5 h-5 text-yellow-700" /></div>
            <div><h3 className="font-semibold text-gray-900">{ML_PLATFORM_NAME}</h3><div className="mt-1"><StatusBadge status={mlConnection?.status || 'disconnected'} /></div></div>
          </div>
          {canManage && <button onClick={handleConnectMercadoLivre} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm"><Link2 className="w-4 h-4" />{mlConnection?.status === 'connected' ? 'Reconectar' : 'Conectar'}</button>}
        </div>
        {mlConnection && <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div><dt className="text-gray-500">Vendedor (ID)</dt><dd>{mlConnection.external_seller_id || '—'}</dd></div>
          <div><dt className="text-gray-500">Conectado em</dt><dd>{mlConnection.connected_at ? new Date(mlConnection.connected_at).toLocaleString('pt-BR') : '—'}</dd></div>
          <div><dt className="text-gray-500">Token expira em</dt><dd>{mlConnection.token_expires_at ? new Date(mlConnection.token_expires_at).toLocaleString('pt-BR') : '—'}</dd></div>
          {mlConnection.last_error && <div className="col-span-2 sm:col-span-4"><dt className="text-gray-500">Último erro</dt><dd className="text-red-600">{mlConnection.last_error}</dd></div>}
        </dl>}
      </div>

      {mlConnection?.status === 'connected' && <div className="bg-white rounded-xl shadow-md p-6 mb-6">
        <h3 className="font-semibold text-gray-900 mb-2">Testar taxa ao vivo (Mercado Livre)</h3>
        <p className="text-xs text-gray-500 mb-3">Logística e modo de envio influenciam o custo fixo. Peso faturável é informado em kg no MargemHub e enviado em gramas à API.</p>
        <form onSubmit={handleTestFee} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input type="text" placeholder="category_id (ex: MLB1234)" value={testForm.categoryId} onChange={(e)=>setTestForm({...testForm,categoryId:e.target.value})} required className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            <input type="number" step="0.01" min="0.01" placeholder="Preço (R$)" value={testForm.price} onChange={(e)=>setTestForm({...testForm,price:e.target.value})} required className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            <select value={testForm.listingType} onChange={(e)=>setTestForm({...testForm,listingType:e.target.value})} className="px-3 py-2 border border-gray-300 rounded-lg text-sm"><option value="classico">Clássico</option><option value="premium">Premium</option></select>
            <select value={testForm.logisticType} onChange={(e)=>setTestForm({...testForm,logisticType:e.target.value})} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
              <option value="drop_off">Drop off</option><option value="cross_docking">Coleta</option><option value="xd_drop_off">Places</option><option value="self_service">Flex</option><option value="turbo">Turbo</option><option value="fulfillment">Full</option><option value="default">Padrão</option><option value="custom">Custom</option><option value="not_specified">Não especificado</option>
            </select>
            <select value={testForm.shippingMode} onChange={(e)=>setTestForm({...testForm,shippingMode:e.target.value})} className="px-3 py-2 border border-gray-300 rounded-lg text-sm"><option value="me2">Mercado Envios 2</option><option value="me1">Mercado Envios 1</option><option value="custom">Custom</option><option value="not_specified">Não especificado</option></select>
            <input type="number" step="0.001" min="0.001" placeholder="Peso faturável (kg, opcional no Brasil)" value={testForm.billableWeightKg} onChange={(e)=>setTestForm({...testForm,billableWeightKg:e.target.value})} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <button type="submit" disabled={testing} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm">{testing ? 'Consultando…' : 'Consultar taxa'}</button>
        </form>

        {testError && <div className="mt-3 flex items-start gap-2 bg-red-50 text-red-700 rounded-lg p-3 text-sm"><AlertCircle className="w-4 h-4 mt-0.5" /><span>{testError}</span></div>}
        {testResult && <div className={`${testResult.exact ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'} mt-3 flex items-start gap-2 rounded-lg p-3 text-sm`}>
          <CheckCircle2 className="w-4 h-4 mt-0.5" />
          <div><div>Comissão: <strong>{testResult.commission_pct}%</strong> · Taxa fixa: <strong>R$ {testResult.fixed_fee ?? 0}</strong></div><div className="text-xs mt-1">Origem: {testResult.source === 'cache' ? 'cache' : 'consulta ao vivo'} · {testResult.exact ? 'logística informada' : 'cálculo parcial'}</div>{testResult.warning && <div className="text-xs mt-1">{testResult.warning}</div>}</div>
        </div>}
      </div>}

      <div className="text-xs text-gray-400">Amazon (SP-API), Shopee, Magalu e TikTok Shop ainda não têm integração de API ativa.</div>
    </div>
  )
}
