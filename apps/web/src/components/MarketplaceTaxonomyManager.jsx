import React, { useEffect, useMemo, useState } from 'react'
import { ChevronRight, FolderTree, Pencil, Plus, RefreshCw, Save, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { MarketplaceCategoryPicker } from './MarketplaceCategoryPicker'

function slugify(value) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const EMPTY_FORM = {
  id: null,
  parent_id: null,
  parent_snapshot: null,
  canonical_key: '',
  external_category_id: '',
  name: '',
  is_leaf: false,
  source_url: '',
}

export function MarketplaceTaxonomyManager({ platforms }) {
  const [platformId, setPlatformId] = useState(platforms[0]?.id || '')
  const [query, setQuery] = useState('')
  const [categories, setCategories] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!platformId && platforms[0]?.id) setPlatformId(platforms[0].id)
  }, [platformId, platforms])

  const platform = useMemo(
    () => platforms.find((item) => item.id === platformId),
    [platforms, platformId]
  )

  async function loadCategories(searchText = query) {
    if (!platformId) return
    setLoading(true)
    setError(null)
    try {
      const { data, error: searchError } = await supabase.rpc('fn_search_marketplace_categories', {
        p_platform_id: platformId,
        p_query: searchText?.trim() || null,
        p_limit: 100,
      })
      if (searchError) throw searchError
      setCategories(data || [])
    } catch (err) {
      setError(err.message || 'Não foi possível carregar a taxonomia.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => loadCategories(query), query ? 250 : 0)
    return () => window.clearTimeout(timer)
  }, [platformId, query])

  function startNew(parent = null) {
    setForm({
      ...EMPTY_FORM,
      parent_id: parent?.id || null,
      parent_snapshot: parent
        ? {
            id: parent.id,
            name: parent.name,
            path: parent.full_path,
            pathIds: parent.path_ids,
            externalCategoryId: parent.external_category_id,
            sourceUrl: parent.source_url,
          }
        : null,
    })
    setShowForm(true)
    setError(null)
  }

  function startEdit(category) {
    setForm({
      id: category.id,
      parent_id: category.parent_id || null,
      parent_snapshot: null,
      canonical_key: category.canonical_key || '',
      external_category_id: category.external_category_id || '',
      name: category.name || '',
      is_leaf: Boolean(category.is_leaf),
      source_url: category.source_url || '',
    })
    setShowForm(true)
    setError(null)
  }

  async function saveCategory(event) {
    event.preventDefault()
    if (!platformId || !form.name.trim() || !form.source_url.trim()) {
      setError('Marketplace, nome e fonte oficial são obrigatórios.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const { error: saveError } = await supabase.rpc('fn_upsert_marketplace_category', {
        p_category_id: form.id || null,
        p_platform_id: platformId,
        p_parent_id: form.parent_id || null,
        p_canonical_key: form.canonical_key.trim() || slugify(form.name),
        p_external_category_id: form.external_category_id.trim() || null,
        p_name: form.name.trim(),
        p_is_leaf: Boolean(form.is_leaf),
        p_source_url: form.source_url.trim(),
        p_metadata: {},
      })
      if (saveError) throw saveError
      setShowForm(false)
      setForm(EMPTY_FORM)
      await loadCategories()
    } catch (err) {
      setError(err.message || 'Não foi possível salvar a categoria.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-indigo-50 p-2 text-indigo-700">
            <FolderTree className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Taxonomia oficial por marketplace</h3>
            <p className="mt-1 text-xs text-slate-500">
              Cadastre a árvore oficial antes de vincular tarifas específicas. A hierarquia pode ter quantos níveis o marketplace exigir.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => startNew()}
          className="inline-flex items-center justify-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" /> Nova categoria
        </button>
      </div>

      <div className="p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[220px_1fr_auto]">
          <select
            value={platformId}
            onChange={(event) => {
              setPlatformId(event.target.value)
              setForm(EMPTY_FORM)
              setShowForm(false)
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {platforms.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar nome, caminho ou código oficial..."
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => loadCategories()}
            className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-600"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
        </div>

        {showForm && (
          <form onSubmit={saveCategory} className="mt-4 space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">{form.id ? 'Editar categoria' : 'Cadastrar categoria oficial'}</div>
                <div className="mt-1 text-[11px] text-slate-500">Marketplace: {platform?.name || '—'}</div>
              </div>
              <button type="button" onClick={() => { setShowForm(false); setForm(EMPTY_FORM) }} className="text-slate-400 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>

            {!form.id && (
              <div>
                <div className="mb-1.5 text-xs font-medium text-slate-600">Categoria pai (opcional)</div>
                <MarketplaceCategoryPicker
                  platformId={platformId}
                  value={form.parent_id || ''}
                  snapshot={form.parent_snapshot}
                  onSelect={(category) =>
                    setForm({
                      ...form,
                      parent_id: category?.id || null,
                      parent_snapshot: category
                        ? {
                            id: category.id,
                            name: category.name,
                            path: category.full_path,
                            pathIds: category.path_ids,
                            externalCategoryId: category.external_category_id,
                            sourceUrl: category.source_url,
                          }
                        : null,
                    })
                  }
                />
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                value={form.name}
                onChange={(event) =>
                  setForm({
                    ...form,
                    name: event.target.value,
                    canonical_key: form.id ? form.canonical_key : slugify(event.target.value),
                  })
                }
                placeholder="Nome oficial da categoria"
                required
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
              <input
                value={form.external_category_id}
                onChange={(event) => setForm({ ...form, external_category_id: event.target.value })}
                placeholder="Código/ID oficial (se existir)"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
              <input
                value={form.canonical_key}
                onChange={(event) => setForm({ ...form, canonical_key: event.target.value })}
                placeholder="Chave canônica"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={form.is_leaf}
                  onChange={(event) => setForm({ ...form, is_leaf: event.target.checked })}
                />
                Categoria final (folha)
              </label>
            </div>
            <input
              value={form.source_url}
              onChange={(event) => setForm({ ...form, source_url: event.target.value })}
              placeholder="Fonte oficial da categoria"
              required
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
              >
                <Save className="h-4 w-4" /> {saving ? 'Salvando…' : 'Salvar categoria'}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setForm(EMPTY_FORM) }}
                className="rounded-lg px-3 py-2 text-xs text-slate-500"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {error && <div className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</div>}

        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
          {categories.length === 0 && !loading ? (
            <div className="p-5 text-center text-xs text-slate-500">
              Nenhuma categoria oficial confirmada cadastrada para {platform?.name || 'este marketplace'}.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {categories.map((category) => (
                <div key={category.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 text-sm text-slate-800">
                      {category.level > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
                      <span className="truncate">{category.full_path}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      Nível {category.level + 1}{category.external_category_id ? ` · código ${category.external_category_id}` : ''}{category.is_leaf ? ' · final' : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => startNew(category)}
                    className="hidden text-[11px] font-medium text-indigo-600 hover:underline sm:block"
                  >
                    + subcategoria
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(category)}
                    className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
