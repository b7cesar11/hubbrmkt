import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const BENEFIT_LABELS = {
  commission_exemption: 'Isenção de comissão',
  shipping_subsidy: 'Subsídio de frete',
  cashback: 'Cashback',
  other: 'Outro',
}

export default function PromotionsView({ userRole }) {
  const [promotions, setPromotions] = useState([])
  const [platforms, setPlatforms] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [newPromo, setNewPromo] = useState({
    platform_id: '',
    category: '',
    benefit_type: 'commission_exemption',
    value_pct: '',
    value_fixed: '',
    eligibility_note: '',
    starts_at: '',
    ends_at: '',
  })

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [platformsRes, promotionsRes] = await Promise.all([
        supabase.from('platforms').select('*'),
        supabase.from('platform_promotions').select('*').order('starts_at', { ascending: false }),
      ])
      if (platformsRes.error) throw platformsRes.error
      if (promotionsRes.error) throw promotionsRes.error
      setPlatforms(platformsRes.data || [])
      setPromotions(promotionsRes.data || [])
    } catch (err) {
      alert('Erro ao carregar promoções: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  function getStatus(promo) {
    const today = new Date().toISOString().slice(0, 10)
    if (today < promo.starts_at) return 'Agendada'
    if (today > promo.ends_at) return 'Expirada'
    return 'Ativa'
  }

  function isExpiringSoon(promo) {
    if (getStatus(promo) !== 'Ativa') return false
    const diffDays = (new Date(promo.ends_at) - new Date()) / (1000 * 60 * 60 * 24)
    return diffDays <= 7
  }

  function getPlatformName(platformId) {
    return platforms.find((p) => p.id === platformId)?.name || '—'
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!newPromo.platform_id || !newPromo.starts_at || !newPromo.ends_at) {
      alert('Preencha plataforma, data de início e data de fim.')
      return
    }

    const { data, error } = await supabase
      .from('platform_promotions')
      .insert([
        {
          platform_id: newPromo.platform_id, // é UUID, nunca converter pra número
          category: newPromo.category || null,
          benefit_type: newPromo.benefit_type,
          value_pct: newPromo.value_pct ? parseFloat(newPromo.value_pct) : null,
          value_fixed: newPromo.value_fixed ? parseFloat(newPromo.value_fixed) : null,
          eligibility_note: newPromo.eligibility_note || null,
          starts_at: newPromo.starts_at,
          ends_at: newPromo.ends_at,
        },
      ])
      .select()

    if (error) {
      alert('Erro ao criar promoção: ' + error.message)
      return
    }

    setPromotions([...(data || []), ...promotions])
    setNewPromo({
      platform_id: '',
      category: '',
      benefit_type: 'commission_exemption',
      value_pct: '',
      value_fixed: '',
      eligibility_note: '',
      starts_at: '',
      ends_at: '',
    })
    setShowForm(false)
  }

  async function handleEarlyTermination(promo) {
    const confirmed = window.confirm(
      'Encerrar essa promoção hoje? Isso não apaga o registro, só antecipa a data de fim.'
    )
    if (!confirmed) return

    const today = new Date().toISOString().slice(0, 10)
    const { error } = await supabase
      .from('platform_promotions')
      .update({ ends_at: today })
      .eq('id', promo.id)

    if (error) {
      alert('Erro ao encerrar promoção: ' + error.message)
      return
    }

    setPromotions(promotions.map((p) => (p.id === promo.id ? { ...p, ends_at: today } : p)))
  }

  if (loading) {
    return <p className="text-sm text-gray-500 py-8 text-center">Carregando promoções...</p>
  }

  return (
    <div>
      <div className="mb-4 flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-900">Promoções</h2>
        {userRole === 'super_admin' && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            {showForm ? 'Cancelar' : '+ Nova Promoção'}
          </button>
        )}
      </div>

      {showForm && userRole === 'super_admin' && (
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <p className="text-xs text-gray-500 mb-3">
            Se marcar uma categoria, a promoção aplica automaticamente em todos os produtos
            (já cadastrados ou futuros) dessa categoria nessa plataforma — igual ao motor de
            taxas. Deixe em branco pra aplicar a todas as categorias da plataforma.
          </p>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <select
                value={newPromo.platform_id}
                onChange={(e) => setNewPromo({ ...newPromo, platform_id: e.target.value })}
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
                placeholder="Categoria (vazio = todas)"
                value={newPromo.category}
                onChange={(e) => setNewPromo({ ...newPromo, category: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <select
                value={newPromo.benefit_type}
                onChange={(e) => setNewPromo({ ...newPromo, benefit_type: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                {Object.entries(BENEFIT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="number"
                placeholder="Valor em % (opcional)"
                value={newPromo.value_pct}
                onChange={(e) => setNewPromo({ ...newPromo, value_pct: e.target.value })}
                step="0.01"
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <input
                type="number"
                placeholder="Valor fixo R$ (opcional)"
                value={newPromo.value_fixed}
                onChange={(e) => setNewPromo({ ...newPromo, value_fixed: e.target.value })}
                step="0.01"
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <input
              type="text"
              placeholder="Elegibilidade (ex: contas novas, categoria X)"
              value={newPromo.eligibility_note}
              onChange={(e) => setNewPromo({ ...newPromo, eligibility_note: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-full"
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500">Início</label>
                <input
                  type="date"
                  value={newPromo.starts_at}
                  onChange={(e) => setNewPromo({ ...newPromo, starts_at: e.target.value })}
                  required
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-full"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Fim</label>
                <input
                  type="date"
                  value={newPromo.ends_at}
                  onChange={(e) => setNewPromo({ ...newPromo, ends_at: e.target.value })}
                  required
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-full"
                />
              </div>
            </div>
            <button
              type="submit"
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm"
            >
              Salvar
            </button>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plataforma</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categoria</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Benefício</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Valor</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Elegibilidade</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Período</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              {userRole === 'super_admin' && (
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ações</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {promotions.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-gray-400">
                  Nenhuma promoção cadastrada ainda.
                </td>
              </tr>
            ) : (
              promotions.map((promo) => {
                const status = getStatus(promo)
                return (
                  <tr
                    key={promo.id}
                    className={isExpiringSoon(promo) ? 'bg-yellow-50' : 'hover:bg-gray-50'}
                  >
                    <td className="px-4 py-3">{getPlatformName(promo.platform_id)}</td>
                    <td className="px-4 py-3">{promo.category || 'Todas'}</td>
                    <td className="px-4 py-3">{BENEFIT_LABELS[promo.benefit_type] || promo.benefit_type}</td>
                    <td className="px-4 py-3">
                      {promo.value_pct ? `${promo.value_pct}%` : ''}
                      {promo.value_pct && promo.value_fixed ? ' + ' : ''}
                      {promo.value_fixed ? `R$ ${promo.value_fixed}` : ''}
                      {!promo.value_pct && !promo.value_fixed ? '—' : ''}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{promo.eligibility_note || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(promo.starts_at).toLocaleDateString('pt-BR')} –{' '}
                      {new Date(promo.ends_at).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          status === 'Ativa'
                            ? 'bg-green-100 text-green-700'
                            : status === 'Agendada'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {status}
                      </span>
                      {isExpiringSoon(promo) && (
                        <span className="ml-2 text-xs text-orange-600">⚠️ vence em breve</span>
                      )}
                    </td>
                    {userRole === 'super_admin' && (
                      <td className="px-4 py-3">
                        {status === 'Ativa' && (
                          <button
                            onClick={() => handleEarlyTermination(promo)}
                            className="text-xs text-orange-600 hover:underline"
                          >
                            encerrar antecipadamente
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
