import React from 'react'
import { computeMargin, getListing } from '../../lib/margin'

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
  const simProduct = products.find((p) => p.id === simProductId)
  const productPlatformOptions = simProduct
    ? platforms.filter((pl) => getListing(simProduct.id, pl.id, listings))
    : []
  const baseMargin =
    simProduct && simPlatformId ? computeMargin(simProduct, simPlatformId, getMarginDeps()) : null

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Simulador de Comissionamento</h2>
      <p className="text-sm text-gray-500 mb-4">
        Teste cenários de comissão de creator/afiliado sem alterar nenhum dado real.
      </p>

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
            <option value="">Selecione a plataforma...</option>
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

        {baseMargin?.status === 'ok' && (
          <>
            <div className="text-xs text-gray-500 mb-4">
              Margem base (sem comissão de creator): R$ {baseMargin.netMargin.toFixed(2)} (
              {baseMargin.marginPct.toFixed(1)}%)
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {simScenarios.map((pct, i) => {
                const creatorAmount = (baseMargin.salePrice * (parseFloat(pct) || 0)) / 100
                const finalMargin = baseMargin.netMargin - creatorAmount
                const finalPct = (finalMargin / baseMargin.salePrice) * 100
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
                        <span>R$ {creatorAmount.toFixed(2)}</span>
                      </div>
                      <div
                        className={`flex justify-between font-semibold border-t pt-1 mt-1 ${
                          finalMargin > 0 ? 'text-green-700' : 'text-red-600'
                        }`}
                      >
                        <span>Margem final</span>
                        <span>
                          R$ {finalMargin.toFixed(2)} ({finalPct.toFixed(1)}%)
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
          <p className="text-xs text-gray-400">
            {baseMargin.status === 'sem_regra'
              ? 'Sem regra de taxa cadastrada para essa categoria/plataforma — não dá pra simular ainda.'
              : 'Sem preço de venda cadastrado.'}
          </p>
        )}
      </div>
    </div>
  )
}
