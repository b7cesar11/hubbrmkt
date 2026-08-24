import React, { useMemo } from 'react'
import { AlertCircle, CheckCircle2, Sparkles } from 'lucide-react'
import { compareProductAccounts } from '../lib/comparison'

function money(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return Number(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  })
}

function accountTitle(row) {
  const account = row.account
  const type = account?.document_type ? ` · ${account.document_type.toUpperCase()}` : ''
  return `${row.platform?.name || 'Marketplace'} · ${account?.name || 'Conta'}${type}`
}

export function AccountComparisonPanel({
  product,
  platforms,
  getMarginDeps,
  targetMarginPct = 20,
}) {
  const comparison = useMemo(() => {
    if (!product) return { rows: [], best: null, secondBest: null }
    return compareProductAccounts(
      product,
      platforms,
      getMarginDeps(),
      Number(targetMarginPct),
    )
  }, [product, platforms, getMarginDeps, targetMarginPct])

  if (!product || comparison.rows.length === 0) return null

  const best = comparison.best
  const secondBest = comparison.secondBest
  const profitAdvantage =
    best && secondBest ? Number(best.netMargin - secondBest.netMargin) : null

  return (
    <section className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Comparação por conta e canal</h3>
            <p className="mt-1 text-xs text-slate-500">
              Cada anúncio é calculado isoladamente. Contas do mesmo marketplace aparecem em linhas diferentes.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            Meta {Number(targetMarginPct || 0).toFixed(1)}%
          </span>
        </div>
      </div>

      {best && (
        <div className="border-b border-blue-100 bg-blue-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 text-blue-600" />
            <div>
              <div className="text-sm font-semibold text-blue-950">
                Melhor margem atual: {accountTitle(best)}
              </div>
              <div className="mt-1 text-xs text-blue-800">
                {best.marginPct.toFixed(1)}% · {money(best.netMargin)} por venda
                {profitAdvantage != null
                  ? ` · ${money(profitAdvantage)} a mais por unidade que a 2ª melhor operação`
                  : ''}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-[1050px] w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">Rank / operação</th>
              <th className="px-4 py-3 text-left">Categoria</th>
              <th className="px-4 py-3 text-right">Preço</th>
              <th className="px-4 py-3 text-right">Comissão</th>
              <th className="px-4 py-3 text-right">Margem</th>
              <th className="px-4 py-3 text-right">Break-even</th>
              <th className="px-4 py-3 text-right">Preço p/ meta</th>
              <th className="px-4 py-3 text-right">Ajuste</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {comparison.rows.map((row) => {
              const ok = row.status === 'ok'
              const category =
                row.listing.marketplace_category_path ||
                row.listing.marketplace_category_name ||
                row.listing.platform_category_name ||
                '—'
              const adjustment = row.priceAdjustmentToTarget

              return (
                <tr key={row.listing.id} className={row.rank === 1 ? 'bg-emerald-50/40' : 'hover:bg-slate-50'}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {row.rank ? (
                        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${row.rank === 1 ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                          {row.rank}
                        </span>
                      ) : (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-700">—</span>
                      )}
                      <div>
                        <div className="font-medium text-slate-900">{accountTitle(row)}</div>
                        <div className="mt-0.5 text-[11px] text-slate-400">
                          {row.account?.is_default ? 'Conta padrão' : 'Conta adicional'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="max-w-[220px] px-4 py-3 text-xs text-slate-600">
                    <div className="truncate" title={category}>{category}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-800">{money(row.currentPrice)}</td>
                  <td className="px-4 py-3 text-right">
                    {ok ? (
                      <div>
                        <div className="font-medium text-slate-800">{money(row.margin.commission)}</div>
                        <div className="text-[10px] text-slate-400">
                          {Number(row.margin.commissionEffectivePct ?? row.margin.rule?.commission_pct ?? 0).toFixed(2)}% efetiva
                        </div>
                      </div>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {ok ? (
                      <div>
                        <div className={`font-bold ${row.marginPct >= Number(targetMarginPct) ? 'text-emerald-700' : row.marginPct >= 0 ? 'text-amber-700' : 'text-red-700'}`}>
                          {row.marginPct.toFixed(1)}%
                        </div>
                        <div className="text-[10px] text-slate-400">{money(row.netMargin)}</div>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-700" title={row.margin.reason || ''}>
                        <AlertCircle className="h-3.5 w-3.5" /> indisponível
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">{money(row.breakEvenPrice)}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{money(row.targetPrice)}</td>
                  <td className="px-4 py-3 text-right">
                    {adjustment == null ? '—' : adjustment > 0.004 ? (
                      <span className="font-medium text-amber-700">+{money(adjustment)}</span>
                    ) : (
                      <span className="inline-flex items-center justify-end gap-1 font-medium text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" /> meta sustentada
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="border-t border-slate-100 bg-slate-50 px-5 py-3 text-[11px] text-slate-500">
        Ranking baseado na margem percentual projetada com regras oficiais confirmadas. Operações sem contexto oficial suficiente permanecem visíveis, mas não recebem rank.
      </div>
    </section>
  )
}
