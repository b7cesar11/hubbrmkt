// =============================================================================
// Edge Function: mercadolivre-oauth-start   (verify_jwt = TRUE)
// =============================================================================
// Inicia o fluxo OAuth do Mercado Livre de forma segura:
//   - Deriva o company_id do JWT do usuário logado (não confia em input do
//     cliente) via RPC fn_current_company_id.
//   - Gera um `state` ASSINADO (HMAC) carregando company_id + nonce + timestamp.
//   - Monta a URL de autorização do ML e devolve { url } (o frontend redireciona)
//     ou já responde 302 para o ML se chamado com ?redirect=1.
//
// SECRETS: ML_CLIENT_ID, ML_REDIRECT_URI, OAUTH_STATE_SECRET.
//          SUPABASE_URL / SUPABASE_ANON_KEY injetados pelo runtime.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { signState } from '../_shared/state.ts'

const ML_AUTH_BASE = 'https://auth.mercadolivre.com.br/authorization'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const CLIENT_ID = Deno.env.get('ML_CLIENT_ID')
  const REDIRECT_URI = Deno.env.get('ML_REDIRECT_URI')
  const STATE_SECRET = Deno.env.get('OAUTH_STATE_SECRET')
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
  if (!CLIENT_ID || !REDIRECT_URI || !STATE_SECRET || !SUPABASE_URL || !ANON_KEY) {
    return jsonResponse({ ok: false, error: 'Configuração ausente (secrets).' }, 500)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse({ ok: false, error: 'Não autenticado.' }, 401)
  }

  // Cliente com o JWT do usuário — resolve o company_id de forma confiável.
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })

  const { data: companyId, error: rpcError } = await userClient.rpc('fn_current_company_id')
  if (rpcError || !companyId) {
    return jsonResponse(
      { ok: false, error: 'Não foi possível identificar a empresa do usuário.' },
      403,
    )
  }

  const state = await signState(STATE_SECRET, {
    company_id: companyId as string,
    nonce: crypto.randomUUID(),
    ts: Date.now(),
  })

  const authUrl = new URL(ML_AUTH_BASE)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('client_id', CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('scope', 'offline_access read')

  const url = new URL(req.url)
  if (url.searchParams.get('redirect') === '1') {
    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, Location: authUrl.toString() },
    })
  }

  return jsonResponse({ ok: true, url: authUrl.toString() })
})
