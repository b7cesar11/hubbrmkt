// =============================================================================
// Edge Function: mercadolivre-oauth-callback   (verify_jwt = FALSE)
// =============================================================================
// Recebe o callback OAuth do Mercado Livre (?code=&state=), valida a ASSINATURA
// do state (HMAC — emitido por mercadolivre-oauth-start), troca o code por
// tokens e grava/atualiza a linha em `platform_connections` via service_role
// (BYPASS de RLS). O token NUNCA volta ao navegador.
//
// verify_jwt = FALSE porque o ML chama esta URL via redirect do browser (sem
// JWT). A confiança vem do `state` assinado, não de um JWT.
//
// SECRETS: ML_CLIENT_ID, ML_CLIENT_SECRET, ML_REDIRECT_URI, OAUTH_STATE_SECRET,
//          APP_POST_CONNECT_URL (opcional).
//          SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY injetados pelo runtime.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { verifyState } from '../_shared/state.ts'

const ML_TOKEN_URL = 'https://api.mercadolibre.com/oauth/token'
const ML_PLATFORM_NAME = 'Mercado Livre'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const errorParam = url.searchParams.get('error')

  if (errorParam) {
    return jsonResponse({ ok: false, error: `Mercado Livre retornou erro: ${errorParam}` }, 400)
  }
  if (!code || !state) {
    return jsonResponse({ ok: false, error: 'Parâmetros ausentes: code e state.' }, 400)
  }

  const CLIENT_ID = Deno.env.get('ML_CLIENT_ID')
  const CLIENT_SECRET = Deno.env.get('ML_CLIENT_SECRET')
  const REDIRECT_URI = Deno.env.get('ML_REDIRECT_URI')
  const STATE_SECRET = Deno.env.get('OAUTH_STATE_SECRET')
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI || !STATE_SECRET || !SUPABASE_URL || !SERVICE_ROLE) {
    return jsonResponse({ ok: false, error: 'Configuração ausente (secrets).' }, 500)
  }

  // 1) Valida a assinatura do state (CSRF + company_id confiável)
  const payload = await verifyState(STATE_SECRET, state)
  if (!payload) {
    return jsonResponse({ ok: false, error: 'state inválido ou expirado.' }, 400)
  }
  const companyId = payload.company_id

  // 2) Troca o code por tokens
  const tokenRes = await fetch(ML_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri: REDIRECT_URI,
    }),
  })
  const tokenData = await tokenRes.json()
  if (!tokenRes.ok) {
    return jsonResponse(
      { ok: false, error: 'Falha ao trocar code por token no ML.', details: tokenData },
      502,
    )
  }

  const expiresAt = new Date(Date.now() + (tokenData.expires_in ?? 21600) * 1000)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  })

  // 3) Descobre o platform_id do Mercado Livre
  const { data: platform, error: platErr } = await admin
    .from('platforms')
    .select('id')
    .eq('name', ML_PLATFORM_NAME)
    .single()
  if (platErr || !platform) {
    return jsonResponse({ ok: false, error: 'Plataforma Mercado Livre não encontrada.' }, 500)
  }

  // 4) Upsert da conexão (via service_role, BYPASS de RLS)
  const { error: upsertError } = await admin.from('platform_connections').upsert(
    {
      company_id: companyId,
      platform_id: platform.id,
      external_seller_id: tokenData.user_id ? String(tokenData.user_id) : null,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_expires_at: expiresAt.toISOString(),
      status: 'connected',
      last_error: null,
      connected_at: new Date().toISOString(),
    },
    { onConflict: 'company_id,platform_id' },
  )
  if (upsertError) {
    return jsonResponse(
      { ok: false, error: 'Falha ao gravar conexão.', details: upsertError.message },
      500,
    )
  }

  // 5) Redireciona de volta ao app, se configurado
  const postConnect = Deno.env.get('APP_POST_CONNECT_URL')
  if (postConnect) {
    const dest = new URL(postConnect)
    dest.searchParams.set('ml', 'connected')
    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, Location: dest.toString() },
    })
  }
  return jsonResponse({ ok: true, platform: 'mercado_livre', status: 'connected' })
})
