import React, { useState } from 'react'
import {
  BarChart3,
  Boxes,
  Calculator,
  ChevronDown,
  CircleDollarSign,
  LogOut,
  Menu,
  Plug,
  Settings2,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react'

const NAV_ITEMS = [
  { id: 'visao_geral', label: 'Início', icon: BarChart3, group: 'principal' },
  { id: 'produtos', label: 'Produtos', icon: Boxes, group: 'principal' },
  { id: 'custos', label: 'Custos e operação', shortLabel: 'Custos', icon: CircleDollarSign, group: 'planejamento' },
  { id: 'simulador', label: 'Simulador', icon: Calculator, group: 'planejamento' },
  { id: 'conexoes', label: 'Contas', icon: Plug, group: 'operacao', roles: ['company_admin', 'super_admin'] },
  { id: 'usuarios', label: 'Equipe e acessos', shortLabel: 'Equipe', icon: Users, group: 'operacao' },
  { id: 'regras', label: 'Regras de taxa', icon: Settings2, group: 'admin', roles: ['super_admin'] },
  { id: 'promocoes', label: 'Promoções', icon: ShieldCheck, group: 'admin', roles: ['super_admin'] },
]

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-200">
        <BarChart3 className="h-5 w-5" />
      </div>
      <div><div className="font-bold tracking-tight text-slate-950">MargemHub</div><div className="text-[11px] text-slate-500">Planejamento de margem</div></div>
    </div>
  )
}

function NavButton({ item, active, onClick, mobile = false }) {
  const Icon = item.icon
  if (mobile) {
    return (
      <button type="button" onClick={onClick} aria-current={active ? 'page' : undefined} className={`flex min-w-0 flex-1 flex-col items-center gap-1 px-1 py-2 text-[10px] font-medium ${active ? 'text-blue-700' : 'text-slate-500'}`}>
        <span className={`rounded-lg p-1 ${active ? 'bg-blue-50' : ''}`}><Icon className="h-5 w-5" /></span>
        <span className="truncate">{item.shortLabel || item.label}</span>
      </button>
    )
  }
  return (
    <button type="button" onClick={onClick} aria-current={active ? 'page' : undefined} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${active ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}>
      <Icon className="h-4.5 w-4.5" /><span>{item.label}</span>
    </button>
  )
}

export function AppShell({ activeTab, onNavigate, user, userRole, onLogout, children }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const allowedItems = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(userRole))
  const primaryMobile = allowedItems.filter((item) => ['visao_geral', 'produtos', 'custos', 'simulador'].includes(item.id))
  const moreItems = allowedItems.filter((item) => !primaryMobile.some((candidate) => candidate.id === item.id))
  const initials = String(user?.email || 'U').slice(0, 2).toUpperCase()

  const navigate = (id) => {
    onNavigate(id)
    setMobileMenuOpen(false)
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-white px-4 py-5 lg:flex lg:flex-col">
        <div className="px-2"><Logo /></div>
        <nav className="mt-8 flex-1 space-y-6" aria-label="Navegação principal">
          {[['principal', 'Visão geral'], ['planejamento', 'Planejamento'], ['operacao', 'Operação'], ['admin', 'Administração']].map(([group, label]) => {
            const items = allowedItems.filter((item) => item.group === group)
            if (items.length === 0) return null
            return <div key={group}><p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p><div className="space-y-1">{items.map((item) => <NavButton key={item.id} item={item} active={activeTab === item.id} onClick={() => navigate(item.id)} />)}</div></div>
          })}
        </nav>
        <div className="border-t border-slate-100 pt-4"><button type="button" onClick={onLogout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 hover:bg-red-50 hover:text-red-700"><LogOut className="h-4 w-4" /> Sair</button></div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="lg:hidden"><Logo /></div>
            <div className="hidden lg:block"><p className="text-xs font-medium text-slate-400">Workspace</p><p className="text-sm font-semibold text-slate-800">Sua operação</p></div>
            <div className="relative">
              <button type="button" onClick={() => setProfileOpen((value) => !value)} aria-expanded={profileOpen} className="flex items-center gap-2 rounded-xl p-1.5 hover:bg-slate-50">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">{initials}</span>
                <span className="hidden max-w-48 truncate text-sm text-slate-600 sm:block">{user?.email}</span>
                <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
              </button>
              {profileOpen && <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-xl"><div className="border-b border-slate-100 px-3 py-2"><p className="truncate text-xs text-slate-500">{user?.email}</p><p className="mt-1 text-xs font-medium text-slate-800">{userRole === 'super_admin' ? 'Administrador geral' : userRole === 'company_admin' ? 'Administrador' : 'Usuário'}</p></div><button type="button" onClick={onLogout} className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"><LogOut className="h-4 w-4" /> Sair</button></div>}
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1440px] px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white/95 px-1 pb-[max(env(safe-area-inset-bottom),4px)] backdrop-blur lg:hidden" aria-label="Navegação móvel">
        {primaryMobile.map((item) => <NavButton key={item.id} item={item} mobile active={activeTab === item.id} onClick={() => navigate(item.id)} />)}
        <button type="button" onClick={() => setMobileMenuOpen(true)} className={`flex min-w-0 flex-1 flex-col items-center gap-1 px-1 py-2 text-[10px] font-medium ${moreItems.some((item) => item.id === activeTab) ? 'text-blue-700' : 'text-slate-500'}`}><span className="rounded-lg p-1"><Menu className="h-5 w-5" /></span><span>Mais</span></button>
      </nav>

      {mobileMenuOpen && <div className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden" onClick={() => setMobileMenuOpen(false)}><div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white p-5 pb-[max(env(safe-area-inset-bottom),20px)] shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold text-slate-900">Mais opções</h2><p className="text-xs text-slate-500">Administração e configurações</p></div><button type="button" aria-label="Fechar menu" onClick={() => setMobileMenuOpen(false)} className="rounded-full bg-slate-100 p-2"><X className="h-5 w-5" /></button></div><div className="grid grid-cols-2 gap-2">{moreItems.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" onClick={() => navigate(item.id)} className={`flex items-center gap-3 rounded-xl border p-4 text-left text-sm font-medium ${activeTab === item.id ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-700'}`}><Icon className="h-5 w-5" />{item.shortLabel || item.label}</button> })}</div></div></div>}
    </div>
  )
}
