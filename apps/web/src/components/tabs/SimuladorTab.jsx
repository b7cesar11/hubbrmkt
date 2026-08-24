import React, { useMemo, useState } from 'react'
import { computeMargin, getListing } from '../../lib/margin'
import { getPricingRecommendations } from '../../lib/pricing'
import { AccountComparisonPanel } from '../AccountComparisonPanel'

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  })
}

export function SimuladorTab({
  products,
  platforms,
  listings,
  simProductId,
  setSimProductId,
  simPlatformId,
  setSimPlatformId,
  simScenarios,
  setSimScenarios,
  getMarginDeps,
}) {
  const [targetMarginPct, setTargetMarginPct] = useState(20)
  const simProduct = products.find((p) => p.id === simProductId)
  const productPlatformOptions = simProduct
    ? platforms.filter((pl) => getListing(simProduct.id, pl.id, listings))
    : []
  const marginDeps = simProduct && simPlatformId ? getMarginDeps() : null
  const baseMargin =
    simProduct && simPlatformId && marginDeps
      ? computeMargin(simProduct, simPlatformId, marginDeps)
      : null
  const pricing = useMemo(() => {
    if (!simProduct || !simPlatformId || !marginDeps) return null
    return getPricingRecommendations(
      simProduct,
      simPlatformId,
      marginDeps,
      Number(targetMarginPct),
    )
  }, [simProduct, simPlatformId, marginDeps, targetMarginPct])

  const currentListing =
    simProduct && simPlatformId
      ? getListing(simProduct.id, simPlatformId, listings)
      : null
  const accountName = currentListing?.marketplace_account?.name || null

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-gray-900">Simulador de Rentabilidade</h2>
        <p className="mt-1 text-sm text-gray-500">
          Descubra preço mínimo, preço para margem alvo e compare a rentabilidade de cada conta/canal.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-md p-6 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <select
            value={simProductId}
            onChange={(e) => {
              setSimProductId(e.target.value)
              setSimPlatformId('')
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">Selecione um produto...</option>
            {products
              .filter((p) => p.active)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku})
                </option>
              ))}
          </select>
          <select
            value={simPlatformId}
            onChange={(e) => setSimPlatformId(e.target.value)}
            disabled={!simProduct}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100"
          >
            <option value="">Selecione uma plataforma para detalhar...</option>
            {productPlatformOptions.map((pl) => (
              <option key={pl.id} value={pl.id}>
                {pl.name}
              </option>
            ))}
          </select>
        </div>

        {simProduct && productPlatformOptions.length === 0 && (
          <p className="text-xs text-orange-600">
            Esse produto não tem preço de venda cadastrado em nenhuma plataforma ainda.
          </p>
        )}

        {simProduct && !simPlatformId && productPlatformOptions.length > 0 && (
          <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
            A comparação de todas as contas aparece abaixo. Selecione uma plataforma para abrir também o detalhamento de precificação e cenários.
          </div>
        )}

        {baseMargin?.status === 'ok' && (
          <>
            <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-400">Situação atual</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">
                    Preço {money(baseMargin.salePrice)} · margem {baseMargin.marginPct.toFixed(1)}%
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {money(baseMargin.netMargin)} por venda
                    {accountName ? ` · conta padrão ${accountName}` : ''}
                  </div>
                </div>
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <span className="text-xs font-medium text-slate-600">Margem alvo</span>
                  <input
                    type="number"
                    min="0"
                    max="95"
                    step="0.5"
                    value={targetMarginPct}
                    onChange={(event) => setTargetMarginPct(event.target.value)}
                    className="w-16 border-0 bg-transparent text-right text-sm font-semibold text-slate-900 outline-none"
                  />
                  <span className="text-xs text-slate-500">%</span>
                </label>
              </div>
            </div>

            <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Preço mínimo sem prejuízo
                </div>
                {pricing?.breakEven?.status === 'ok' ? (
                  <>
                    <div className="mt-2 text-2xl font-bold text-slate-900">
                      {money(pricing.breakEven.price)}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">Break-even com as regras oficiais atuais.</div>
                  </>
                ) : (
                  <div className="mt-2 text-xs text-amber-700">
                    {pricing?.breakEven?.reason || 'Indisponível neste contexto.'}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-500">
                  Preço para {Number(targetMarginPct || 0).toFixed(1)}%
                </div>
                {pricing?.target?.status === 'ok' ? (
                  <>
                    <div className="mt-2 text-2xl font-bold text-blue-900">
                      {money(pricing.target.price)}
                    </div>
                    <div className="mt-1 text-xs text-blue-700">
                      Menor preço em centavos que atinge a meta.
                    </div>
                  </>
                ) : (
                  <div className="mt-2 text-xs text-amber-700">
                    {pricing?.target?.reason || 'Meta indisponível neste contexto.'}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Ajuste recomendado
                </div>
                {pricing?.target?.status === 'ok' ? (
                  <>
                    <div
                      className={`mt-2 text-2xl font-bold ${
                        pricing.target.price > baseMargin.salePrice
                          ? 'text-amber-700'
                          : 'text-emerald-700'
                      }`}
                    >
                      {pricing.target.price > baseMargin.salePrice ? '+' : ''}
                      {money(pricing.target.price - baseMargin.salePrice)}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {pricing.target.price > baseMargin.salePrice
                        ? 'Aumento necessário para alcançar a meta.'
                        : 'O preço atual já sustenta a margem desejada.'}
                    </div>
                  </>
                ) : (
                  <div className="mt-2 text-xs text-slate-500">Sem recomendação calculável.</div>
                )}
              </div>
            </div>

            <div className="mb-3">
              <h3 className="text-sm font-semibold text-slate-800">Cenários de creator / afiliado</h3>
              <p className="mt-1 text-xs text-slate-500">
                Estes percentuais são aplicados sobre o preço do item e não alteram o cadastro.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {simScenarios.map((pct, i) => {
                const creatorAmount = (baseMargin.salePrice * (parseFloat(pct) || 0)) / 100
                const finalMargin = baseMargin.netMargin - creatorAmount
                const revenueBase = Number(baseMargin.grossRevenue || baseMargin.salePrice || 0)
                const finalPct = revenueBase > 0 ? (finalMargin / revenueBase) * 100 : 0
                return (
                  <div key={i} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs text-gray-500">Comissão creator:</span>
                      <input
                        type="number"
                        value={pct}
                        onChange={(e) => {
                          const updated = [...simScenarios]
                          updated[i] = e.target.value
                          setSimScenarios(updated)
                        }}
                        className="w-16 px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                      <span className="text-xs text-gray-500">%</span>
                    </div>
                    <div className="text-xs text-gray-600 space-y-1">
                      <div className="flex justify-between">
                        <span>Valor pro creator</span>
                        <span>{money(creatorAmount)}</span>
                      </div>
                      <div
                        className={`flex justify-between font-semibold border-t pt-1 mt-1 ${
                          finalMargin > 0 ? 'text-green-700' : 'text-red-600'
                        }`}
                      >
                        <span>Margem final</span>
                        <span>
                          {money(finalMargin)} ({finalPct.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                    <div
                      className={`mt-2 text-[11px] px-2 py-1 rounded text-center ${
                        finalPct > 10
                          ? 'bg-green-100 text-green-700'
                          : finalPct > 0
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {finalPct > 10
                        ? 'Margem saudável'
                        : finalPct > 0
                          ? 'Margem apertada'
                          : 'Prejuízo'}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {baseMargin && baseMargin.status !== 'ok' && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {baseMargin.reason ||
              (baseMargin.status === 'sem_regra'
                ? 'Sem regra oficial confirmada para essa categoria/plataforma — não dá pra precificar ainda.'
                : 'Sem preço de venda cadastrado.')}
          </p>
        )}
      </div>

      <AccountComparisonPanel
        product={simProduct}
        platforms={platforms}
        getMarginDeps={getMarginDeps}
        targetMarginPct={targetMarginPct}
      />
    </div>
  )
}
