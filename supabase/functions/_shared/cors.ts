// Cabeçalhos CORS compartilhados pelas Edge Functions.
// Ajuste "Access-Control-Allow-Origin" para o domínio do app em produção
// (ex.: "https://margemhub.com.br") em vez de "*" quando publicar.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

// Resposta JSON padronizada já com CORS.
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
