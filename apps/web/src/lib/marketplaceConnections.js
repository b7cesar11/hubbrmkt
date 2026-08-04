// Helper de front-end para as conexões de marketplace (OAuth) e consulta de
// taxa ao vivo via Edge Functions. NENHUM segredo vive aqui — o frontend só:
//   - monta a URL de autorização do Mercado Livre (inicia o OAuth);
//   - lê o STATUS das conexões via RPC (sem tokens);
//   - invoca a Edge Function de consulta de taxa.
import { supabase } from './supabase'

// App ID público do app no Mercado Livre (é público por natureza — o SECRET
// fica só no backend). Configure via variável de ambiente do Vite.
const ML_CLIENT_ID = import.meta.env.VITE_ML_CLIENT_ID || ''
// Deve ser EXATAMENTE a redirect_uri registrada no app do ML e usada pela
// Edge Function `mercadolivre-oauth-callback`.
const ML_REDIRECT_URI = import.meta.env.VITE_ML_REDIRECT_URI || ''

const ML_AUTH_BASE = 'https://auth.mercadolivre.com.br/authorization'

// base64url de um objeto — usado no `state` do OAuth (carrega o company_id).
function toBase64Url(obj) {
  const json = JSON.stringify(obj)
  const b64 = btoa(json)
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Monta a URL de autorização do Mercado Livre para uma empresa.
export function buildMercadoLivreAuthUrl(companyId) {
  if (!ML_CLIENT_ID || !ML_REDIRECT_URI) {
    throw new Error(
      'VITE_ML_CLIENT_ID e VITE_ML_REDIRECT_URI precisam estar configurados.',
    )
  }
  const nonce = crypto.randomUUID()
  // guarda o nonce localmente para validação CSRF ao voltar (opcional)
  try {
    sessionStorage.setItem('ml_oauth_nonce', nonce)
  } catch {
    // ignore
  }
  const state = toBase64Url({ company_id: companyId, nonce })
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: ML_CLIENT_ID,
    redirect_uri: ML_REDIRECT_URI,
    state,
    scope: 'offline_access read',
  })
  return `${ML_AUTH_BASE}?${params.toString()}`
}

// Lê o status das conexões da empresa (sem segredos), via RPC SECURITY DEFINER.
export async function getMarketplaceConnections(companyId) {
  const { data, error } = await supabase.rpc('get_marketplace_connections', {
    p_company_id: companyId,
  })
  if (error) throw error
  return data || []
}

// Consulta a taxa ao vivo no Mercado Livre via Edge Function.
export async function queryMercadoLivreFee({
  companyId,
  categoryId,
  price,
  listingType,
}) {
  const { data, error } = await supabase.functions.invoke('mercadolivre-fee-query', {
    body: {
      company_id: companyId,
      category_id: categoryId,
      price,
      listing_type: listingType,
    },
  })
  if (error) throw error
  return data
}
