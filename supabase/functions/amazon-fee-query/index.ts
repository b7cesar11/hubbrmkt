// =============================================================================
// Edge Function: amazon-fee-query  (SKELETON DOCUMENTADO — NÃO IMPLEMENTADO)
// =============================================================================
// A Amazon usa a SP-API (Selling Partner API), significativamente mais complexa
// que o OAuth do Mercado Livre. Este arquivo documenta a estrutura para quando
// a integração for priorizada. HOJE ele retorna 501 (not implemented) de forma
// explícita, para não dar falsa impressão de que funciona.
//
// -----------------------------------------------------------------------------
// Por que a Amazon é mais complexa que o ML:
// -----------------------------------------------------------------------------
// 1. Cadastro: é preciso uma conta de desenvolvedor na Amazon e registrar um
//    app SP-API (LWA — Login with Amazon). Gera client_id/client_secret LWA.
// 2. Autorização: fluxo OAuth LWA -> retorna um refresh_token de longa duração.
//    Troca-se o refresh_token por access_tokens de curta duração (~1h).
// 3. Endpoint de taxas: Product Fees API
//      POST /products/fees/v0/listings/{SellerSKU}/feesEstimate
//      (ou /products/fees/v0/items/{Asin}/feesEstimate)
//    Corpo: FeesEstimateRequest com PriceToEstimateFees (ListingPrice, Shipping),
//    Identifier, MarketplaceId (Brasil = A2Q3Y263D00KWC).
//    Resposta: FeesEstimateResult com TotalFeesEstimate e FeeDetailList
//    (ReferralFee, VariableClosingFee, PerItemFee, FBAFees, etc.).
// 4. Assinatura: chamadas exigem o access_token LWA no header
//    `x-amz-access-token`. (SigV4 com credenciais AWS foi descontinuado para a
//    maioria das chamadas SP-API, mas confirme o requisito vigente na doc.)
// 5. Rate limits: a SP-API tem limites por endpoint (token bucket) — o cache é
//    ainda mais importante aqui.
//
// -----------------------------------------------------------------------------
// SECRETS que serão necessários quando implementar:
//   AMZ_LWA_CLIENT_ID
//   AMZ_LWA_CLIENT_SECRET
//   AMZ_MARKETPLACE_ID           (Brasil: A2Q3Y263D00KWC)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (injetados)
//
// -----------------------------------------------------------------------------
// Estrutura pretendida (igual à do ML, reaproveitando o mesmo schema):
//   1. Receber { asin|sku, price } (company_id derivado do JWT).
//   2. Checar live_fee_cache (platform_id = Amazon).
//   3. Garantir access_token LWA válido a partir do refresh_token guardado em
//      platform_connections (platform_id = Amazon), renovando quando expirar.
//   4. POST feesEstimate, parsear FeeDetailList -> commission_pct + fixed_fee.
//   5. Gravar no cache e retornar no MESMO formato do ML:
//      { ok, source, commission_pct, fixed_fee, raw }.
// =============================================================================

import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

Deno.serve((req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  return jsonResponse(
    {
      ok: false,
      error: 'not_implemented',
      message:
        'Integração Amazon SP-API ainda não implementada. Ver comentários deste ' +
        'arquivo para o roteiro. O Mercado Livre é a integração ativa no momento.',
    },
    501,
  )
})
