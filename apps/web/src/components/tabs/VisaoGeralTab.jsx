import React from 'react'
import { AlertCircle, ArrowRight, Building2, CheckCircle2, CircleDollarSign, Layers3, Store, Target, TrendingUp, Users } from 'lucide-react'
import { computeMargin } from '../../lib/margin'
import { allocateMonthlyCostsByProduct, buildBusinessPredictability } from '../../lib/predictability'

function money(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
}

function number(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return Math.ceil(Number(value)).toLocaleString('pt-BR')
}

function roas(value) {
  return value == null || !Number.isFinite(Number(value)) ? '—' : `${Number(value).toFixed(2)}x`
}

function ScopeTable({ title, subtitle, icon: Icon, rows, showPlatform = false, onSelect }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-5">
        <div className="flex items-center gap-2"><Icon className="h-5 w-5 text-blue-600" /><h2 className="font-semibold text-slate-900">{title}</h2></div>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-5 py-3">{showPlatform ? 'Conta' : 'Plataforma'}</th><th className="px-5 py-3">Custo mensal</th><th className="px-5 py-3">Faturamento mínimo</th><th className="px-5 py-3">Meta 10%</th><th className="px-5 py-3">Pedidos meta</th><th className="px-5 py-3">ROAS meta</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id} onClick={() => onSelect?.(row)} className="cursor-pointer hover:bg-blue-50/50">
                <td className="px-5 py-4"><p className="font-medium text-slate-900">{row.name}</p><p className="text-xs text-slate-500">{showPlatform ? `${row.platformName} · ` : ''}{row.validListingCount} anúncio{row.validListingCount === 1 ? '' : 's'} calculado{row.validListingCount === 1 ? '' : 's'}</p></td>
                <td className="px-5 py-4 font-medium text-slate-700">{money(row.monthlyFixed)}</td>
                <td className="px-5 py-4 text-slate-700">{money(row.breakEvenRevenue)}</td>
                <td className="px-5 py-4 font-semibold text-blue-700">{money(row.targetRevenue)}</td>
                <td className="px-5 py-4 text-slate-700">{number(row.targetOrders)}</td>
                <td className="px-5 py-4 text-slate-700"><span className="inline-flex items-center gap-2">{roas(row.targetRoas)}<ArrowRight className="h-3.5 w-3.5 text-slate-300" /></span></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="6" className="px-5 py-8 text-center text-slate-500">Nenhum anúncio ativo neste nível.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function VisaoGeralTab({ products, platforms, marketplaceAccounts, listings, operationPeople, productPeople, monthlyOperationCosts, productMonthlyOperationCosts, getMarginDeps, setShowGaps, onNavigate }) {
  const allocationByProduct = allocateMonthlyCostsByProduct({ products, people: operationPeople, productPeople, monthlyCosts: monthlyOperationCosts, productMonthlyCosts: productMonthlyOperationCosts })
  const prediction = buildBusinessPredictability({
    products,
    listings,
    platforms,
    marketplaceAccounts,
    allocationByProduct,
    calculateMargin: (product, listing) => computeMargin(product, listing.platform_id, { ...getMarginDeps(), marketplaceAccountId: listing.marketplace_account_id }),
  })
  const general = prediction.general
  const healthy = general.status === 'ok' && general.pendingCount === 0
  const setupSteps = [
    { label: 'Produtos cadastrados', complete: products.some((product) => product.active !== false), action: 'produtos' },
    { label: 'Contas configuradas', complete: marketplaceAccounts.some((account) => account.active !== false), action: 'conexoes' },
    { label: 'Equipe ou custo mensal informado', complete: operationPeople.some((person) => person.active !== false) || monthlyOperationCosts.some((cost) => cost.active !== false), action: 'custos' },
    { label: 'Previsão calculável', complete: general.validListingCount > 0 && general.pendingCount === 0, action: 'produtos' },
  ]
  const completedSteps = setupSteps.filter((step) => step.complete).length

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-blue-950 to-blue-800 p-6 text-white shadow-lg md:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-200">Previsibilidade geral do negócio</p><h1 className="mt-2 text-2xl font-semibold md:text-3xl">O que sua operação precisa fazer para se pagar e gerar lucro</h1><p className="mt-3 text-sm leading-6 text-blue-100">Todos os SKUs, contas, marketplaces, equipe, estrutura e tráfego reunidos em uma única meta mensal.</p></div>
          <div className={`rounded-full px-4 py-2 text-sm font-semibold ${healthy ? 'bg-emerald-400/20 text-emerald-200' : 'bg-amber-300/20 text-amber-100'}`}>{healthy ? 'Cenário calculado' : 'Cenário precisa de atenção'}</div>
        </div>
        <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-white/10 p-4"><div className="flex items-center gap-2 text-blue-100"><CircleDollarSign className="h-4 w-4" /><span className="text-xs">Custo mensal total</span></div><p className="mt-2 text-2xl font-semibold">{money(general.monthlyFixed)}</p><p className="mt-1 text-xs text-blue-200">Tudo que o negócio precisa pagar</p></div>
          <div className="rounded-xl border border-white/10 bg-white/10 p-4"><div className="flex items-center gap-2 text-blue-100"><Layers3 className="h-4 w-4" /><span className="text-xs">Faturamento mínimo</span></div><p className="mt-2 text-2xl font-semibold">{money(general.breakEvenRevenue)}</p><p className="mt-1 text-xs text-blue-200">{number(general.breakEvenOrders)} pedidos equivalentes para empatar</p></div>
          <div className="rounded-xl border border-emerald-300/30 bg-emerald-300/10 p-4"><div className="flex items-center gap-2 text-emerald-100"><Target className="h-4 w-4" /><span className="text-xs">Meta para 10% de lucro</span></div><p className="mt-2 text-2xl font-semibold">{money(general.targetRevenue)}</p><p className="mt-1 text-xs text-emerald-100">{number(general.targetOrders)} pedidos equivalentes no mês</p></div>
          <div className="rounded-xl border border-white/10 bg-white/10 p-4"><div className="flex items-center gap-2 text-blue-100"><TrendingUp className="h-4 w-4" /><span className="text-xs">ROAS recomendado</span></div><p className="mt-2 text-2xl font-semibold">{roas(general.targetRoas)}</p><p className="mt-1 text-xs text-blue-200">Mínimo para empatar: {roas(general.breakEvenRoas)}</p></div>
        </div>
      </section>

      {completedSteps < setupSteps.length && (
        <section className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Primeiros passos</p><h2 className="mt-1 text-lg font-semibold text-slate-900">Complete sua previsão</h2><p className="mt-1 text-sm text-slate-600">{completedSteps} de {setupSteps.length} etapas concluídas</p></div><div className="h-2 w-full overflow-hidden rounded-full bg-blue-100 sm:w-52"><div className="h-full rounded-full bg-blue-600" style={{ width: `${(completedSteps / setupSteps.length) * 100}%` }} /></div></div>
          <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">{setupSteps.map((step) => <button key={step.label} type="button" onClick={() => onNavigate(step.action)} className={`flex items-center justify-between rounded-xl border p-3 text-left text-sm ${step.complete ? 'border-emerald-100 bg-white text-slate-600' : 'border-blue-200 bg-white font-medium text-blue-800 hover:border-blue-400'}`}><span className="flex items-center gap-2">{step.complete ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <span className="h-4 w-4 rounded-full border-2 border-blue-300" />}{step.label}</span>{!step.complete && <ArrowRight className="h-4 w-4" />}</button>)}</div>
        </section>
      )}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2 text-slate-500"><Users className="h-4 w-4" /><span className="text-xs font-medium uppercase">Equipe</span></div><p className="mt-2 text-xl font-semibold text-slate-900">{money(general.teamMonthly)}</p><p className="mt-1 text-xs text-slate-500">Salários e custos fixos das pessoas</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2 text-slate-500"><Building2 className="h-4 w-4" /><span className="text-xs font-medium uppercase">Estrutura</span></div><p className="mt-2 text-xl font-semibold text-slate-900">{money(general.overheadMonthly)}</p><p className="mt-1 text-xs text-slate-500">Aluguel, energia, internet e demais custos</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2 text-slate-500"><TrendingUp className="h-4 w-4" /><span className="text-xs font-medium uppercase">Tráfego pago</span></div><p className="mt-2 text-xl font-semibold text-slate-900">{money(general.paidTrafficBudget)}</p><p className="mt-1 text-xs text-slate-500">Orçamento mensal considerado nas metas</p></div>
      </section>

      {general.monthlyFixed <= 0 && <button type="button" onClick={() => onNavigate('custos')} className="flex w-full items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-900 hover:bg-amber-100"><span className="flex items-start gap-3"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><span>Cadastre equipe e custos mensais em <strong>Custos e operação</strong> para transformar as margens dos produtos em uma meta completa do negócio.</span></span><ArrowRight className="h-5 w-5 shrink-0" /></button>}
      {general.pendingCount > 0 && <button type="button" onClick={() => setShowGaps(true)} className="flex w-full items-start gap-3 rounded-xl border border-orange-200 bg-orange-50 p-4 text-left text-sm text-orange-900 hover:bg-orange-100"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><span><strong>{general.pendingCount} anúncio{general.pendingCount === 1 ? '' : 's'} ainda não entra{general.pendingCount === 1 ? '' : 'm'} na meta</strong> por falta de preço, categoria ou regra oficial. Clique para revisar.</span></button>}
      {general.unallocatedMonthly > 0 && <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><p>{money(general.unallocatedMonthly)} estão ligados a SKUs sem anúncio ativo. O valor está incluído na meta geral, mas não aparece no detalhamento por conta.</p></div>}

      <ScopeTable title="Previsibilidade por plataforma" subtitle="Quanto cada marketplace precisa sustentar da operação mensal. Selecione uma linha para ver seus produtos." icon={Layers3} rows={prediction.platforms} onSelect={(row) => onNavigate('produtos', { platformId: row.id })} />
      <ScopeTable title="Previsibilidade por conta" subtitle="A meta de cada operação, já separada dentro de seu marketplace. Selecione uma linha para gerenciar a conta." icon={Store} rows={prediction.accounts} showPlatform onSelect={() => onNavigate('conexoes')} />
      <p className="px-1 text-xs leading-5 text-slate-500">Como o MargemHub é um sistema de planejamento e não recebe vendas diárias, as metas usam um pedido médio equivalente entre os anúncios válidos. O custo de um SKU presente em mais de uma conta é dividido entre seus anúncios ativos, sem duplicar o custo no total geral.</p>
    </div>
  )
}
