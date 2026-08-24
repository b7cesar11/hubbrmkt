import React, { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Search, Sparkles, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

function normalize(value) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
}

function categoryFromSnapshot(snapshot) {
  if (!snapshot?.id) return null
  return {
    id: snapshot.id,
    name: snapshot.name || snapshot.path || 'Categoria selecionada',
    full_path: snapshot.path || snapshot.name || 'Categoria selecionada',
    path_ids: snapshot.pathIds || [],
    external_category_id: snapshot.externalCategoryId || null,
    source_url: snapshot.sourceUrl || null,
  }
}

export function MarketplaceCategoryPicker({
  platformId,
  value,
  snapshot,
  productName,
  internalCategory,
  preferredCategoryIds = [],
  onSelect,
  disabled = false,
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState([])
  const [preferred, setPreferred] = useState([])
  const [selected, setSelected] = useState(categoryFromSnapshot(snapshot))
  const [error, setError] = useState(null)

  useEffect(() => {
    const snap = categoryFromSnapshot(snapshot)
    if (snap?.id === value) setSelected(snap)
    if (!value) setSelected(null)
  }, [value, snapshot])

  useEffect(() => {
    let cancelled = false
    async function loadPreferred() {
      const ids = [...new Set(preferredCategoryIds.filter(Boolean))].slice(0, 5)
      if (!platformId || ids.length === 0) {
        setPreferred([])
        return
      }
      const { data, error: preferredError } = await supabase
        .from('marketplace_categories')
        .select('id, platform_id, name, full_path, path_ids, external_category_id, source_url, is_leaf')
        .eq('platform_id', platformId)
        .in('id', ids)
      if (!cancelled && !preferredError) {
        const byId = new Map((data || []).map((item) => [item.id, item]))
        setPreferred(ids.map((id) => byId.get(id)).filter(Boolean))
      }
    }
    loadPreferred()
    return () => {
      cancelled = true
    }
  }, [platformId, preferredCategoryIds.join('|')])

  async function searchCategories(searchText = query) {
    if (!platformId) return
    setLoading(true)
    setError(null)
    try {
      const { data, error: searchError } = await supabase.rpc('fn_search_marketplace_categories', {
        p_platform_id: platformId,
        p_query: searchText?.trim() || null,
        p_limit: 30,
      })
      if (searchError) throw searchError
      setResults(data || [])
    } catch (err) {
      setError(err.message || 'Não foi possível consultar as categorias oficiais.')
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open || !platformId) return undefined
    const seed = query.trim() || internalCategory?.trim() || productName?.trim() || ''
    const timer = window.setTimeout(() => searchCategories(seed), query ? 250 : 0)
    return () => window.clearTimeout(timer)
  }, [open, platformId, query, internalCategory, productName])

  const suggestions = useMemo(() => {
    const seen = new Set()
    const output = []

    for (const item of preferred) {
      if (!seen.has(item.id)) {
        output.push({ ...item, suggestionReason: 'Usada anteriormente pela sua empresa' })
        seen.add(item.id)
      }
    }

    const text = normalize(`${internalCategory || ''} ${productName || ''}`)
    const tokens = text.split(/\s+/).filter((token) => token.length >= 4)
    const ranked = [...results]
      .map((item) => {
        const path = normalize(item.full_path)
        const score = tokens.reduce((sum, token) => sum + (path.includes(token) ? 1 : 0), 0)
        return { item, score }
      })
      .filter(({ item }) => !seen.has(item.id))
      .sort((a, b) => b.score - a.score || Number(b.item.is_leaf) - Number(a.item.is_leaf))

    for (const { item, score } of ranked) {
      if (output.length >= 4) break
      output.push({
        ...item,
        suggestionReason: score > 0 ? 'Combina com o nome/categoria do produto' : 'Resultado do catálogo oficial',
      })
      seen.add(item.id)
    }

    return output
  }, [preferred, results, internalCategory, productName])

  function choose(category) {
    setSelected(category)
    setQuery('')
    setOpen(false)
    onSelect?.(category)
  }

  function clearSelection() {
    setSelected(null)
    setQuery('')
    onSelect?.(null)
  }

  if (selected && value) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
        <div className="flex items-start gap-2">
          <div className="mt-0.5 rounded-full bg-emerald-100 p-1 text-emerald-700">
            <Check className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
              Categoria oficial confirmada
            </div>
            <div className="mt-1 text-sm font-medium text-slate-900">{selected.full_path}</div>
            {selected.external_category_id && (
              <div className="mt-1 text-[11px] text-slate-500">Código: {selected.external_category_id}</div>
            )}
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={clearSelection}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700"
              title="Alterar categoria"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-left text-sm disabled:bg-slate-100 disabled:text-slate-400"
      >
        <span className="flex items-center gap-2 text-slate-600">
          <Search className="h-4 w-4" />
          Pesquisar categoria oficial do marketplace
        </span>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </button>

      {open && !disabled && (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 p-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ex.: cadeira de escritório, fone, brinquedo..."
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              A inteligência sugere a classificação; a taxa vem apenas da regra oficial vinculada à categoria confirmada.
            </p>
          </div>

          <div className="max-h-80 overflow-y-auto p-2">
            {loading && <div className="p-4 text-center text-xs text-slate-500">Consultando catálogo oficial…</div>}
            {error && <div className="p-3 text-xs text-red-600">{error}</div>}

            {!loading && !error && suggestions.length > 0 && (
              <>
                <div className="flex items-center gap-1 px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-blue-700">
                  <Sparkles className="h-3.5 w-3.5" /> Sugestões
                </div>
                {suggestions.map((item) => (
                  <button
                    key={`suggestion-${item.id}`}
                    type="button"
                    onClick={() => choose(item)}
                    className="w-full rounded-lg px-3 py-2 text-left hover:bg-blue-50"
                  >
                    <div className="text-sm font-medium text-slate-900">{item.full_path}</div>
                    <div className="mt-0.5 text-[11px] text-blue-600">{item.suggestionReason}</div>
                  </button>
                ))}
              </>
            )}

            {!loading && !error && results.length > 0 && (
              <>
                <div className="mt-2 px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Catálogo oficial
                </div>
                {results.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => choose(item)}
                    className="w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50"
                  >
                    <div className="text-sm text-slate-800">{item.full_path}</div>
                    {item.external_category_id && (
                      <div className="mt-0.5 text-[11px] text-slate-400">Código {item.external_category_id}</div>
                    )}
                  </button>
                ))}
              </>
            )}

            {!loading && !error && results.length === 0 && (
              <div className="p-4 text-center text-xs text-slate-500">
                Nenhuma categoria oficial confirmada foi encontrada para este marketplace. O MargemHub não cria uma categoria por aproximação.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
