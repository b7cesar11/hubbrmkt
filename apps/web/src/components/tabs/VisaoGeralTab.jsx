import React from 'react'
import { AlertCircle } from 'lucide-react'
import { computeMargin } from '../../lib/margin'

export function VisaoGeralTab({ products, platforms, getMarginDeps, setShowGaps }) {
  const activeProducts = products.filter((p) => p.active)
  const results = []
  activeProducts.forEach((product) => {
    platforms.forEach((platform) => {
      const m = computeMargin(product, platform.id, getMarginDeps())
      results.push({ product, platform, m })
    })
  })
  const okResults = results.filter((r) => r.m.status === 'ok')
  const pendingCount = results.filter((r) => r.m.status === 'sem_regra').length

  const avgMargin =
    okResults.length > 0
      ? okResults.reduce((s, r) => s + r.m.marginPct, 0) / okResults.length
      : null

  const best = okResults.reduce(
    (acc, r) => (!acc || r.m.marginPct > acc.m.marginPct ? r : acc),
    null
  )
  const worst = okResults.reduce(
    (acc, r) => (!acc || r.m.marginPct < acc.m.marginPct ? r : acc),
    null
  )

  const platformAverages = platforms.map((platform) => {
    const platformResults = okResults.filter((r) => r.platform.id === platform.id)
    const avg =
      platformResults.length > 0
        ? platformResults.reduce((s, r) => s + r.m.marginPct, 0) / platformResults.length
        : null
    return { platform, avg, count: platformResults.length }
  })
  const maxPlatformAvg = Math.max(...platformAverages.map((p) => p.avg || 0), 1)

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-md p-4">
          <p className="text-xs text-gray-500 mb-1">Produtos ativos</p>
          <p className="text-2xl font-semibold text-gray-900">{activeProducts.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-md p-4">
          <p className="text-xs text-gray-500 mb-1">Margem média geral</p>
          <p className="text-2xl font-semibold text-gray-900">
            {avgMargin !== null ? `${avgMargin.toFixed(1)}%` : '—'}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-md p-4">
          <p className="text-xs text-gray-500 mb-1">Melhor margem</p>
          {best ? (
            <>
              <p className="text-sm font-semibold text-green-700">
                {best.product.name} — {best.m.marginPct.toFixed(1)}%
              </p>
              <p className="text-xs text-gray-400">{best.platform.name}</p>
            </>
          ) : (
            <p className="text-sm text-gray-400">—</p>
          )}
        </div>
        <div
          className={`bg-white rounded-xl shadow-md p-4 cursor-pointer hover:shadow-lg transition-shadow ${
            pendingCount > 0 ? 'ring-1 ring-orange-200' : ''
          }`}
          onClick={() => pendingCount > 0 && setShowGaps(true)}
        >
          <p className="text-xs text-gray-500 mb-1">Produtos com pendência</p>
          <p
            className={`text-2xl font-semibold ${
              pendingCount > 0 ? 'text-orange-600' : 'text-gray-900'
            }`}
          >
            {pendingCount}
          </p>
        </div>
      </div>

      {worst && worst.m.marginPct < 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800">
              Margem negativa detectada: {worst.product.name} em {worst.platform.name} (
              {worst.m.marginPct.toFixed(1)}%)
            </p>
            <p className="text-xs text-red-600">
              Esse produto está dando prejuízo nessa plataforma — vale revisar preço ou custo.
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-md p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Margem média por plataforma</h3>
        <div className="space-y-3">
          {platformAverages.map(({ platform, avg, count }) => (
            <div key={platform.id}>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>
                  {platform.name} {count > 0 ? `(${count} produto${count > 1 ? 's' : ''})` : ''}
                </span>
                <span>{avg !== null ? `${avg.toFixed(1)}%` : 'sem dado'}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                {avg !== null && (
                  <div
                    className="bg-blue-500 h-2 rounded-full"
                    style={{ width: `${Math.max((avg / maxPlatformAvg) * 100, 2)}%` }}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
