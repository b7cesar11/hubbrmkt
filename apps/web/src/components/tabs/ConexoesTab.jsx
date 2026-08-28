import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, RefreshCw, Store } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { PageHeader } from '../ui/PageHeader'

const SHOPEE = 'Shopee'
const TIKTOK = 'TikTok Shop'
const AMAZON = 'Amazon'

const EMPTY_FORM = {
  platform_id: '',
  name: '',
  document_type: '',
  shopee_cpf_order_band: '',
  tiktok_shipping_fee_program: '',
  amazon_selling_plan: '',
  is_default: false,
}

function accountIssue(account, platformName) {
  if (platformName === SHOPEE) {
    if (!['cpf', 'cnpj'].includes(account.document_type)) return 'Defina CPF ou CNPJ.'
    if (
      account.document_type === 'cpf' &&
      !['under_450', 'over_450'].includes(account.profile_config?.shopee_cpf_order_band)
    ) {
      return 'Defina a faixa de pedidos dos últimos 90 dias.'
    }
  }
  if (
    platformName === TIKTOK &&
    !['enrolled', 'opted_out'].includes(account.profile_config?.tiktok_shipping_fee_program)
  ) {
    return 'Defina a participação no Programa de Taxas de Envio.'
  }
  if (
    platformName === AMAZON &&
    !['individual', 'professional'].includes(account.profile_config?.amazon_selling_plan)
  ) {
    return 'Defina se a conta usa o Plano Individual ou Profissional.'
  }
  return null
}

export function ConexoesTab({ companyId, userRole }) {
  const [platforms, setPlatforms] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const canManage = userRole === 'super_admin' || userRole === 'company_admin'
  const platformById = useMemo(
    () => new Map(platforms.map((platform) => [platform.id, platform])),
    [platforms]
  )
  const selectedPlatform = platformById.get(form.platform_id)

  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    try {
      const [platformsRes, accountsRes] = await Promise.all([
        supabase.from('platforms').select('*'),
        supabase.from('marketplace_accounts').select('*').eq('active', true).order('created_at'),
      ])
      if (platformsRes.error) throw platformsRes.error
      if (accountsRes.error) throw accountsRes.error
      setPlatforms(platformsRes.data || [])
      setAccounts(accountsRes.data || [])
    } catch (loadError) {
      setError(loadError.message || 'Falha ao carregar as contas.')
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    loadData()
  }, [loadData])

  function resetForm() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError(null)
    setShowForm(false)
  }

  function editAccount(account) {
    setEditingId(account.id)
    setForm({
      platform_id: account.platform_id,
      name: account.name,
      document_type: account.document_type || '',
      shopee_cpf_order_band: account.profile_config?.shopee_cpf_order_band || '',
      tiktok_shipping_fee_program: account.profile_config?.tiktok_shipping_fee_program || '',
      amazon_selling_plan: account.profile_config?.amazon_selling_plan || '',
      is_default: Boolean(account.is_default),
    })
    setError(null)
    setShowForm(true)
  }

  async function saveAccount(event) {
    event.preventDefault()
    setError(null)
    const platform = platformById.get(form.platform_id)
    if (!platform || !form.name.trim()) {
      setError('Informe marketplace e nome da conta.')
      return
    }
    if (platform.name === SHOPEE && !['cpf', 'cnpj'].includes(form.document_type)) {
      setError('Na Shopee, o tipo de conta CPF/CNPJ é obrigatório para escolher a taxa oficial.')
      return
    }
    if (
      platform.name === SHOPEE &&
      form.document_type === 'cpf' &&
      !['under_450', 'over_450'].includes(form.shopee_cpf_order_band)
    ) {
      setError('Informe se a conta CPF ultrapassou 450 pedidos nos últimos 90 dias.')
      return
    }
    if (
      platform.name === TIKTOK &&
      !['enrolled', 'opted_out'].includes(form.tiktok_shipping_fee_program)
    ) {
      setError('Informe se a conta participa do Programa de Taxas de Envio do TikTok.')
      return
    }
    if (platform.name === AMAZON && !['individual', 'professional'].includes(form.amazon_selling_plan)) {
      setError('Informe se a conta Amazon usa o Plano Individual ou Profissional.')
      return
    }

    const profileConfig = {}
    if (platform.name === SHOPEE && form.document_type === 'cpf') {
      profileConfig.shopee_cpf_order_band = form.shopee_cpf_order_band
    }
    if (platform.name === TIKTOK) {
      profileConfig.tiktok_shipping_fee_program = form.tiktok_shipping_fee_program
    }
    if (platform.name === AMAZON) {
      profileConfig.amazon_selling_plan = form.amazon_selling_plan
    }

    setSaving(true)
    try {
      const { error: saveError } = await supabase.rpc('fn_upsert_marketplace_account', {
        p_account_id: editingId || null,
        p_platform_id: form.platform_id,
        p_name: form.name.trim(),
        p_document_type: form.document_type || null,
        p_profile_config: profileConfig,
        p_is_default: Boolean(form.is_default),
      })
      if (saveError) throw saveError
      await loadData()
      window.dispatchEvent(new CustomEvent('margemhub:data-changed'))
      resetForm()
    } catch (saveError) {
      setError(saveError.message || 'Não foi possível salvar a conta.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader eyebrow="Operação multicanal" title="Contas de marketplace" description="Organize cada operação. O tipo e os programas da conta determinam qual tabela oficial entra no cálculo." actions={<>
          <button onClick={loadData} className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
          {canManage && (
            <button onClick={() => { resetForm(); setShowForm(true) }} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              + Nova conta
            </button>
          )}
        </>} />

      <div className="mb-6 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
        <strong>Política de cálculo atual:</strong> somente regras oficiais confirmadas entram na margem. Se uma fonte pública não expõe a fórmula exata, o MargemHub sinaliza a pendência em vez de estimar.
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5" /><span>{error}</span>
        </div>
      )}

      {showForm && canManage && (
        <form onSubmit={saveAccount} className="mb-6 rounded-xl bg-white shadow-md p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select value={form.platform_id} onChange={(event) => setForm({ ...form, platform_id: event.target.value })} required disabled={Boolean(editingId)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white disabled:bg-gray-100">
              <option value="">Marketplace...</option>{platforms.map((platform) => <option key={platform.id} value={platform.id}>{platform.name}</option>)}
            </select>
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Nome para identificar a conta" required className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            <select value={form.document_type} onChange={(event) => setForm({ ...form, document_type: event.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
              <option value="">CPF/CNPJ não aplicável ou não informado</option><option value="cpf">CPF</option><option value="cnpj">CNPJ</option>
            </select>

            {selectedPlatform?.name === SHOPEE && form.document_type === 'cpf' && (
              <select value={form.shopee_cpf_order_band} onChange={(event) => setForm({ ...form, shopee_cpf_order_band: event.target.value })} required className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                <option value="">Pedidos nos últimos 90 dias...</option><option value="under_450">Até 450 pedidos</option><option value="over_450">Mais de 450 pedidos</option>
              </select>
            )}
            {selectedPlatform?.name === TIKTOK && (
              <select value={form.tiktok_shipping_fee_program} onChange={(event) => setForm({ ...form, tiktok_shipping_fee_program: event.target.value })} required className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                <option value="">Programa de Taxas de Envio...</option><option value="enrolled">Participa</option><option value="opted_out">Não participa / opt-out</option>
              </select>
            )}
            {selectedPlatform?.name === AMAZON && (
              <select value={form.amazon_selling_plan} onChange={(event) => setForm({ ...form, amazon_selling_plan: event.target.value })} required className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                <option value="">Plano de vendas Amazon...</option><option value="individual">Individual — R$ 2 por item + comissão</option><option value="professional">Profissional — mensalidade + comissão</option>
              </select>
            )}
          </div>

          {selectedPlatform?.name === AMAZON && (
            <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              O Plano Individual adiciona R$ 2 por item. A mensalidade do Plano Profissional é uma despesa da conta e não é rateada automaticamente por SKU.
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={form.is_default} onChange={(event) => setForm({ ...form, is_default: event.target.checked })} /> Conta padrão para este marketplace
          </label>

          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Cadastrar conta'}</button>
            <button type="button" onClick={resetForm} className="rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-600">Cancelar</button>
          </div>
        </form>
      )}

      {accounts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <Store className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <div className="font-medium text-gray-900">Nenhuma conta cadastrada</div>
          <p className="mt-1 text-sm text-gray-500">Cadastre as contas antes de associar produtos aos marketplaces.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {accounts.map((account) => {
            const platform = platformById.get(account.platform_id)
            const issue = accountIssue(account, platform?.name)
            return (
              <div key={account.id} className="rounded-xl bg-white shadow-md border border-gray-100 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center"><Store className="w-5 h-5 text-slate-600" /></div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{account.name}</h3>
                      <p className="text-sm text-gray-500">{platform?.name || 'Marketplace'}{account.document_type ? ` · ${account.document_type.toUpperCase()}` : ''}</p>
                    </div>
                  </div>
                  {canManage && <button onClick={() => editAccount(account)} className="text-sm text-blue-600 hover:underline">Editar</button>}
                </div>

                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  {account.is_default && <span className="rounded-full bg-blue-100 px-2 py-1 text-blue-700">Padrão</span>}
                  {issue ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-amber-700"><AlertCircle className="w-3 h-3" /> Configuração pendente</span> : <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-green-700"><CheckCircle2 className="w-3 h-3" /> Perfil configurado</span>}
                </div>

                {issue && <p className="mt-3 text-xs text-amber-700">{issue}</p>}
                {platform?.name === SHOPEE && account.document_type === 'cpf' && !issue && <p className="mt-3 text-xs text-gray-500">Faixa CPF: {account.profile_config?.shopee_cpf_order_band === 'over_450' ? 'mais de 450 pedidos/90 dias (+ R$3 por item)' : 'até 450 pedidos/90 dias'}.</p>}
                {platform?.name === TIKTOK && !issue && <p className="mt-3 text-xs text-gray-500">Programa de Taxas de Envio: {account.profile_config?.tiktok_shipping_fee_program === 'enrolled' ? 'participa (6%, teto R$50)' : 'opt-out / não participa'}.</p>}
                {platform?.name === AMAZON && !issue && <p className="mt-3 text-xs text-gray-500">Plano Amazon: {account.profile_config?.amazon_selling_plan === 'individual' ? 'Individual — R$ 2 por item + comissão' : 'Profissional — mensalidade + comissão'}.</p>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
