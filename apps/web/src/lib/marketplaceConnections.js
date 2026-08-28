// Helpers de conexão e consulta de taxas. Nenhum segredo é exposto no frontend.
import { supabase } from './supabase'

export async function startMercadoLivreConnect() {
  const { data, error } = await supabase.functions.invoke('mercadolivre-oauth-start', { body: {} })
  if (error) throw error
  if (!data?.ok || !data?.url) {
    throw new Error(data?.error || 'Não foi possível iniciar a conexão com o Mercado Livre.')
  }
  return data.url
}

export async function getMarketplaceConnections() {
  const { data, error } = await supabase.rpc('get_platform_connections')
  if (error) throw error
  return data || []
}

/**
 * Consulta o listing_prices do Mercado Livre.
 * Peso é informado em kg no app e convertido para gramas na Edge Function.
 */
export async function queryMercadoLivreFee({
  categoryId,
  price,
  listingType,
  logisticType = null,
  shippingMode = null,
  billableWeightKg = null,
}) {
  const { data, error } = await supabase.functions.invoke('mercadolivre-fee-query', {
    body: {
      category_id: categoryId,
      price,
      listing_type: listingType,
      logistic_type: logisticType || null,
      shipping_mode: shippingMode || null,
      billable_weight_kg:
        billableWeightKg === '' || billableWeightKg == null ? null : Number(billableWeightKg),
    },
  })
  if (error) throw error
  return data
}
