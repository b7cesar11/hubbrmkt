import React, { useEffect, useMemo, useState } from 'react'
import { computeMargin } from '../../lib/margin'
import { supabase } from '../../lib/supabase'
import {
  getMarketplaceConnections,
  queryMercadoLivreFee,
} from '../../lib/marketplaceConnections'

const ML_PLATFORM_NAME = 'Mercado Livre'
const TIKTOK_PLATFORM_NAME = 'TikTok Shop'

function numberOrBlank(value) {
  return value == null ? '' : String(value)
}

function liveQueryKey(entry, productWeight) {
  return [
    entry?.platform_category_id || '',
    entry?.sale_price || '',
    entry?.listing_type || '',
    entry?.logistic_type || '',
    entry?.shipping_mode || '',
    entry?.billable_weight_kg || productWeight || '',
  ].join('|')
}

export function ProductForm({
  platforms,
  feeRules,
  costComponents,
  editingProductId,
  newProduct,
  setNewProduct,
  newListings,
  setNewListings,
  setListingPrice,
  toggleListingCost,
  closeProductForm,
  availableCategories,
}) {
  const [promotions, setPromotions] = useState([])
  const [connections, setConnections] = useState([])
  const [liveFees, setLiveFees] = useState({})
  const [liveLoading, setLiveLoading] = useState({})
  const [liveErrors, setLiveErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const mlPlatform = useMemo(
    () => platforms.find((platform) => platform.name === ML_PLATFORM_NAME),
    [platforms]
  )
  const mlConnected = connections.some(
    (connection) =>
      connection.platform_name === ML_PLATFORM_NAME && connection.status === 'connected'
  )

  useEffect(() => {
    let cancelled = false

    async function loadSupportingData() {
      const [promotionsRes, connectionsResult] = await Promise.allSettled([
        supabase.from('platform_promotions').select('*'),
        getMarketplaceConnections(),
      ])

      if (cancelled) return
      if (promotionsRes.status === 'fulfilled' && !promotionsRes.value.error) {
        setPromotions(promotionsRes.value.data || [])
      }
      if (connectionsResult.status === 'fulfilled') {
        setConnections(connectionsResult.value || [])
      }
    }

    loadSupportingData()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!editingProductId) return undefined
    let cancelled = false

    async function hydrateListingMetadata() {
      const { data, error } = await supabase
        .from('product_listings')
        .select(
          'id, platform_id, platform_category_id, logistic_type, shipping_mode, billable_weight_kg, length_cm, width_cm, height_cm, program_config'
        )
        .eq('product_id', editingProductId)

      if (cancelled || error) return
      setNewListings((previous) => {
        const next = { ...previous }
        for (const listing of data || []) {
          next[listing.platform_id] = {
            ...next[listing.platform_id],
            platform_category_id: listing.platform_category_id || '',
            logistic_type: listing.logistic_type || '',
            shipping_mode: listing.shipping_mode || '',
            billable_weight_kg: numberOrBlank(listing.billable_weight_kg),
            length_cm: numberOrBlank(listing.length_cm),
            width_cm: numberOrBlank(listing.width_cm),
            height_cm: numberOrBlank(listing.height_cm),
            program_config: listing.program_config || {},
          }
        }
        return next
      })
    }

    hydrateListingMetadata()
    return () => {
      cancelled = true
    }
  }, [editingProductId, setNewListings])

  const mlEntry = mlPlatform ? newListings[mlPlatform.id] : null

  useEffect(() => {
    if (!mlPlatform || !mlConnected || !mlEntry?.enabled) return undefined
    const price = Number(mlEntry.sale_price)
    if (!mlEntry.platform_category_id || !mlEntry.listing_type || !Number.isFinite(price) || price <= 0) {
      return undefined
    }

    const key = liveQueryKey(mlEntry, newProduct.weight_kg)
    const timer = window.setTimeout(async () => {
      setLiveLoading((previous) => ({ ...previous, [mlPlatform.id]: true }))
      setLiveErrors((previous) => ({ ...previous, [mlPlatform.id]: null }))
      try {
        const result = await queryMercadoLivreFee({
          categoryId: mlEntry.platform_category_id,
          price,
          listingType: mlEntry.listing_type,
          logisticType: mlEntry.logistic_type || null,
          shippingMode: mlEntry.shipping_mode || null,
          billableWeightKg: mlEntry.billable_weight_kg || newProduct.weight_kg || null,
        })
        if (!result?.ok) throw new Error(result?.error || 'Falha na consulta de taxa do ML.')
        setLiveFees((previous) => ({ ...previous, [mlPlatform.id]: { key, result } }))
        window.dispatchEvent(new CustomEvent('margemhub:data-changed'))
      } catch (error) {
        setLiveErrors((previous) => ({
          ...previous,
          [mlPlatform.id]: error.message || 'Falha na consulta de taxa ao vivo.',
        }))
      } finally {
        setLiveLoading((previous) => ({ ...previous, [mlPlatform.id]: false }))
      }
    }, 650)

    return () => window.clearTimeout(timer)
  }, [
    mlPlatform,
    mlConnected,
    mlEntry?.enabled,
    mlEntry?.sale_price,
    mlEntry?.platform_category_id,
    mlEntry?.listing_type,
    mlEntry?.logistic_type,
    mlEntry?.shipping_mode,
    mlEntry?.billable_weight_kg,
    newProduct.weight_kg,
  ])

  function setListingField(platformId, field, value) {
    setNewListings((previous) => ({
      ...previous,
      [platformId]: { ...previous[platformId], [field]: value },
    }))
  }

  function setProgramField(platformId, key, value) {
    setNewListings((previous) => ({
      ...previous,
      [platformId]: {
        ...previous[platformId],
        program_config: {
          ...(previous[platformId]?.program_config || {}),
          [key]: value,
        },
      },
    }))
  }

  function previewForPlatform(platform) {
    const entry = newListings[platform.id]
    const price = Number(entry?.sale_price)
    const cost = Number(newProduct.cost_price)
    if (!entry?.enabled || !Number.isFinite(price) || price <= 0 || !Number.isFinite(cost)) return null

    const previewProduct = {
      id: 'preview-product',
      category: newProduct.category,
      cost_price: cost,
    }
    const previewListingId = `preview-${platform.id}`
    const previewListing = {
      id: previewListingId,
      product_id: previewProduct.id,
      platform_id: platform.id,
      sale_price: price,
      listing_type: entry.listing_type || null,
      platform_category_id: entry.platform_category_id || null,
      logistic_type: entry.logistic_type || null,
      shipping_mode: entry.shipping_mode || null,
      billable_weight_kg: Number(entry.billable_weight_kg || newProduct.weight_kg) || null,
      length_cm: Number(entry.length_cm) || null,
      width_cm: Number(entry.width_cm) || null,
      height_cm: Number(entry.height_cm) || null,
      program_config: entry.program_config || {},
    }
    const selectedCosts = (entry.selectedCosts || []).map((costId) => ({
      product_listing_id: previewListingId,
      cost_component_id: costId,
      value_override: null,
    }))

    const liveRecord = liveFees[platform.id]
    const liveFee =
      liveRecord && liveRecord.key === liveQueryKey(entry, newProduct.weight_kg)
        ? liveRecord.result
        : null

    return computeMargin(previewProduct, platform.id, {
      listings: [previewListing],
      feeRules,
      promotions,
      listingCostComponents: selectedCosts,
      costComponents,
      liveFee,
    })
  }

  async function handleTransactionalSave(event) {
    event.preventDefault()
    setSaving(true)
    setSaveError(null)

    const listingsPayload = platforms.map((platform) => {
      const entry = newListings[platform.id] || {}
      const programConfig = { ...(entry.program_config || {}) }
      if (
        platform.name === TIKTOK_PLATFORM_NAME &&
        !programConfig.tiktok_shipping_fee_program
      ) {
        programConfig.tiktok_shipping_fee_program = 'unknown'
      }

      return {
        platform_id: platform.id,
        enabled: Boolean(entry.enabled),
        sale_price: entry.sale_price || '',
        listing_type: entry.listing_type || '',
        platform_category_id: entry.platform_category_id || '',
        logistic_type: entry.logistic_type || '',
        shipping_mode: entry.shipping_mode || '',
        billable_weight_kg: entry.billable_weight_kg || newProduct.weight_kg || '',
        length_cm: entry.length_cm || '',
        width_cm: entry.width_cm || '',
        height_cm: entry.height_cm || '',
        program_config: programConfig,
        selectedCosts: entry.selectedCosts || [],
      }
    })

    try {
      const { error } = await supabase.rpc('fn_save_product_with_listings', {
        p_product_id: editingProductId || null,
        p_product: {
          sku: newProduct.sku,
          name: newProduct.name,
          category: newProduct.category,
          cost_price: newProduct.cost_price,
          weight_kg: newProduct.weight_kg || '',
        },
        p_listings: listingsPayload,
      })
      if (error) throw error

      window.dispatchEvent(new CustomEvent('margemhub:data-changed'))
      closeProductForm()
    } catch (error) {
      setSaveError(error.message || 'Não foi possível salvar o produto.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-md p-6 mb-6">
      <h3 className="text-base font-semibold text-gray-900 mb-4">
        {editingProductId ? 'Editar produto' : 'Novo produto'}
      </h3>

      <form onSubmit={handleTransactionalSave} className="space-y-6">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Dados do produto</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="SKU"
              value={newProduct.sku}
              onChange={(event) => setNewProduct({ ...newProduct, sku: event.target.value })}
              required
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <input
              type="text"
              placeholder="Nome"
              value={newProduct.name}
              onChange={(event) => setNewProduct({ ...newProduct, name: event.target.value })}
              required
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <input
              type="text"
              placeholder="Categoria interna"
              list="categorias-existentes"
              value={newProduct.category}
              onChange={(event) => setNewProduct({ ...newProduct, category: event.target.value })}
              required
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <datalist id="categorias-existentes">
              {availableCategories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
            <input
              type="number"
              placeholder="Custo (R$)"
              value={newProduct.cost_price}
              onChange={(event) => setNewProduct({ ...newProduct, cost_price: event.target.value })}
              required
              step="0.01"
              min="0"
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <input
              type="number"
              placeholder="Peso físico/faturável padrão (kg)"
              value={newProduct.weight_kg}
              onChange={(event) => setNewProduct({ ...newProduct, weight_kg: event.target.value })}
              step="0.001"
              min="0"
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-1">Presença por plataforma</h3>
          <p className="text-xs text-gray-500 mb-3">
            A prévia usa o mesmo motor da visão operacional. Programas condicionais são provisionados conforme a política e podem ser confirmados por anúncio.
          </p>

          <div className="space-y-3">
            {platforms.map((platform) => {
              const entry = newListings[platform.id] || {}
              const preview = previewForPlatform(platform)
              const isML = platform.name === ML_PLATFORM_NAME
              const isTikTok = platform.name === TIKTOK_PLATFORM_NAME
              const liveRecord = liveFees[platform.id]
              const liveIsCurrent = liveRecord?.key === liveQueryKey(entry, newProduct.weight_kg)
              const tikTokProgramStatus =
                entry.program_config?.tiktok_shipping_fee_program || 'unknown'

              return (
                <div key={platform.id} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      type="checkbox"
                      checked={Boolean(entry.enabled)}
                      onChange={() => setListingField(platform.id, 'enabled', !entry.enabled)}
                      className="w-4 h-4 rounded border-gray-300"
                    />
                    <span className="w-36 text-sm font-medium text-gray-700">{platform.name}</span>
                    <input
                      type="number"
                      placeholder="Preço de venda (R$)"
                      disabled={!entry.enabled}
                      value={entry.sale_price || ''}
                      onChange={(event) => setListingPrice(platform.id, event.target.value)}
                      step="0.01"
                      min="0"
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100 disabled:text-gray-400"
                    />
                    {isML && entry.enabled && (
                      <select
                        value={entry.listing_type || ''}
                        onChange={(event) => setListingField(platform.id, 'listing_type', event.target.value)}
                        required
                        className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
                      >
                        <option value="">Tipo de anúncio...</option>
                        <option value="classico">Clássico</option>
                        <option value="premium">Premium</option>
                      </select>
                    )}
                  </div>

                  {isML && entry.enabled && (
                    <div className="ml-7 mt-3 rounded-lg bg-yellow-50 border border-yellow-100 p-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          value={entry.platform_category_id || ''}
                          onChange={(event) => setListingField(platform.id, 'platform_category_id', event.target.value.trim())}
                          placeholder="Categoria ML (ex.: MLB1234)"
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                        <select
                          value={entry.logistic_type || ''}
                          onChange={(event) => setListingField(platform.id, 'logistic_type', event.target.value)}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                        >
                          <option value="">Tipo logístico...</option>
                          <option value="drop_off">Drop Off</option>
                          <option value="cross_docking">Coleta / Cross docking</option>
                          <option value="xd_drop_off">Places / XD Drop Off</option>
                          <option value="self_service">Flex</option>
                          <option value="turbo">Turbo</option>
                          <option value="fulfillment">Full</option>
                          <option value="default">Padrão</option>
                          <option value="custom">Personalizado</option>
                          <option value="not_specified">Não especificado</option>
                        </select>
                        <select
                          value={entry.shipping_mode || ''}
                          onChange={(event) => setListingField(platform.id, 'shipping_mode', event.target.value)}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                        >
                          <option value="">Modo de envio...</option>
                          <option value="me2">Mercado Envios 2 (me2)</option>
                          <option value="me1">Mercado Envios 1 (me1)</option>
                          <option value="custom">Personalizado</option>
                          <option value="not_specified">Não especificado</option>
                        </select>
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          value={entry.billable_weight_kg || ''}
                          onChange={(event) => setListingField(platform.id, 'billable_weight_kg', event.target.value)}
                          placeholder={`Peso faturável kg${newProduct.weight_kg ? ` (padrão ${newProduct.weight_kg})` : ''}`}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={entry.length_cm || ''}
                          onChange={(event) => setListingField(platform.id, 'length_cm', event.target.value)}
                          placeholder="Comprimento cm"
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            value={entry.width_cm || ''}
                            onChange={(event) => setListingField(platform.id, 'width_cm', event.target.value)}
                            placeholder="Largura cm"
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            value={entry.height_cm || ''}
                            onChange={(event) => setListingField(platform.id, 'height_cm', event.target.value)}
                            placeholder="Altura cm"
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                        </div>
                      </div>

                      <div className="mt-2 text-xs">
                        {!mlConnected ? (
                          <span className="text-amber-700">
                            Conecte a conta do Mercado Livre na aba Conexões para substituir a estimativa pela taxa da API.
                          </span>
                        ) : liveLoading[platform.id] ? (
                          <span className="text-blue-700">Consultando taxa do Mercado Livre…</span>
                        ) : liveErrors[platform.id] ? (
                          <span className="text-red-600">API ML: {liveErrors[platform.id]}</span>
                        ) : liveIsCurrent && liveRecord?.result ? (
                          <span className={liveRecord.result.exact ? 'text-green-700' : 'text-amber-700'}>
                            API ML: {liveRecord.result.commission_pct}% + R$ {Number(liveRecord.result.fixed_fee || 0).toFixed(2)} ·{' '}
                            {liveRecord.result.exact ? 'contexto logístico completo' : 'consulta parcial'}
                            {liveRecord.result.warning ? ` — ${liveRecord.result.warning}` : ''}
                          </span>
                        ) : (
                          <span className="text-gray-500">
                            Preencha categoria ML, tipo de anúncio e preço para consultar automaticamente.
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {isTikTok && entry.enabled && (
                    <div className="ml-7 mt-3 rounded-lg bg-slate-50 border border-slate-200 p-3">
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Programa de Taxas de Envio TikTok
                      </label>
                      <select
                        value={tikTokProgramStatus}
                        onChange={(event) =>
                          setProgramField(
                            platform.id,
                            'tiktok_shipping_fee_program',
                            event.target.value
                          )
                        }
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white w-full sm:w-auto"
                      >
                        <option value="unknown">Não sei / confirmar no Seller Center</option>
                        <option value="enrolled">Participa do programa</option>
                        <option value="opted_out">Opt-out / não participa</option>
                      </select>
                      <p className="mt-2 text-xs text-gray-500">
                        A plataforma informa inclusão automática por padrão. Em “não sei”, o motor provisiona 6% sobre o preço de venda, limitado a R$ 50 por produto, e mantém um alerta até a confirmação. Opt-out remove essa cobrança.
                      </p>
                    </div>
                  )}

                  {entry.enabled && costComponents.filter((component) => component.active).length > 0 && (
                    <div className="ml-7 mt-2 flex flex-wrap gap-2">
                      {costComponents.filter((component) => component.active).map((component) => (
                        <label
                          key={component.id}
                          className="flex items-center gap-1 text-xs bg-gray-50 rounded px-2 py-1 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(entry.selectedCosts?.includes(component.id))}
                            onChange={() => toggleListingCost(platform.id, component.id)}
                            className="w-3 h-3"
                          />
                          {component.name} ({component.calc_type === 'percentage' ? `${component.default_value}%` : `R$${component.default_value}`}
                          {component.cap_amount != null ? ` · teto R$${component.cap_amount}` : ''})
                        </label>
                      ))}
                    </div>
                  )}

                  {preview?.status === 'ok' && (
                    <div className="ml-7 mt-2 text-xs">
                      <span
                        className={`font-medium ${
                          preview.marginPct > 10
                            ? 'text-green-600'
                            : preview.marginPct > 0
                              ? 'text-yellow-600'
                              : 'text-red-600'
                        }`}
                      >
                        Prévia: margem de R$ {preview.netMargin.toFixed(2)} ({preview.marginPct.toFixed(1)}%)
                      </span>
                      <span className="text-gray-500 ml-2">
                        · {preview.calculationMode === 'api_live_or_cache'
                          ? 'taxa API exata'
                          : preview.calculationMode === 'api_partial'
                            ? 'taxa API parcial'
                            : preview.rule?.confidence_status === 'verified'
                              ? 'regra verificada'
                              : 'regra estática/estimativa'}
                      </span>

                      {preview.fixedFeeLabel && (
                        <div className="text-gray-600 mt-1">
                          Taxa por item ajustada: R$ {preview.fixedFee.toFixed(2)} · {preview.fixedFeeLabel}
                        </div>
                      )}

                      {preview.platformCharges?.map((charge) => (
                        <div key={charge.code || charge.name} className="text-gray-600 mt-1">
                          {charge.name}: -R$ {charge.amount.toFixed(2)}
                          {charge.capAmount != null ? ` (teto R$ ${Number(charge.capAmount).toFixed(2)})` : ''}
                        </div>
                      ))}

                      {preview.calculationWarnings?.map((warning) => (
                        <div key={warning} className="text-amber-700 mt-1">⚠️ {warning}</div>
                      ))}
                    </div>
                  )}

                  {preview?.status === 'sem_regra' && (
                    <p className="ml-7 mt-2 text-xs text-orange-600">
                      ⚠️ Sem regra de taxa aplicável nessa plataforma; o anúncio será registrado, mas a margem dependerá de validação/API.
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {saveError && (
          <div className="rounded-lg bg-red-50 border border-red-100 p-3 text-sm text-red-700">
            {saveError}
          </div>
        )}

        <p className="text-xs text-gray-400">
          O salvamento de produto, anúncios, programas e custos é transacional: ou todas as alterações são aplicadas, ou nenhuma é gravada.
        </p>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg transition-colors"
          >
            {saving ? 'Salvando…' : editingProductId ? 'Salvar alterações' : 'Salvar'}
          </button>
          <button
            type="button"
            onClick={closeProductForm}
            disabled={saving}
            className="flex-1 bg-gray-200 hover:bg-gray-300 disabled:opacity-60 text-gray-700 px-4 py-2 rounded-lg transition-colors"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}
