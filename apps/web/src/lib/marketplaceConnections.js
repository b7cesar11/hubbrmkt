// Helper de front-end para as conexões de marketplace (OAuth) e consulta de
// taxa ao vivo via Edge Functions. NENHUM segredo vive aqui — o frontend só:
//   - inicia o OAuth do Mercado Livre chamando a Edge Function `oauth-start`
//     (que deriva o company_id do JWT e assina o `state` com HMAC no backend);
//   - lê o STATUS das conexões via RPC `get_platform_connections()` (sem tokens);
//   - invoca a Edge Function de consulta de taxa.
//
// Importante (segurança): o company_id NÃO é mais enviado pelo cliente. Tanto as
// Edge Functions quanto a RPC derivam a empresa do usuário logado a partir do
// JWT (fn_current_company_id). Assim o navegador nunca escolhe de qual empresa
// consulta/conecta, e os tokens de acesso ficam apenas no backend.
import { supabase } from './supabase'

// Inicia o fluxo OAuth do Mercado Livre.
// Chama a Edge Function `mercadolivre-oauth-start`, que devolve a URL de
// autorização já com o `state` assinado. O frontend apenas redireciona.
export async function startMercadoLivreConnect() {
  const { data, error } = await supabase.functions.invoke('mercadolivre-oauth-start', {
    body: {},
  })
  if (error) throw error
  if (!data || !data.ok || !data.url) {
    throw new Error(data?.error || 'Não foi possível iniciar a conexão com o Mercado Livre.')
  }
  return data.url
}

// Lê o status das conexões da empresa do usuário logado (sem segredos), via
// RPC SECURITY DEFINER. Não recebe company_id — é derivado do JWT no backend.
// Retorna linhas: { platform_id, platform_name, external_seller_id, status,
//                   connected_at, token_expires_at, last_error }
export async function getMarketplaceConnections() {
  const { data, error } = await supabase.rpc('get_platform_connections')
  if (error) throw error
  return data || []
}

// Consulta a taxa ao vivo no Mercado Livre via Edge Function.
// O company_id é derivado do JWT no backend — não é enviado pelo cliente.
export async function queryMercadoLivreFee({ categoryId, price, listingType }) {
  const { data, error } = await supabase.functions.invoke('mercadolivre-fee-query', {
    body: {
      category_id: categoryId,
      price,
      listing_type: listingType,
    },
  })
  if (error) throw error
  return data
}
