// =============================================================================
// Edge Function: mercadolivre-oauth-callback
// =============================================================================
// Recebe o callback OAuth do Mercado Livre (query param `code` + `state`),
// troca o `code` por tokens no endpoint /oauth/token, e grava/atualiza a linha
// em `marketplace_connections` usando a service_role key (BYPASS de RLS).
//
// O token NUNCA volta para o navegador: esta função devolve apenas um redirect
// (ou um JSON de status) e persiste os segredos no banco.
//
// SECRETS necessários (configurar via `supabase secrets set`):
//   ML_CLIENT_ID              — App ID do app no Mercado Livre DevCenter
//   ML_CLIENT_SECRET          — Secret do app
//   ML_REDIRECT_URI           — deve ser EXATAMENTE a mesma registrada no app
//   SUPABASE_URL              — (injetado automaticamente pelo runtime)
//   SUPABASE_SERVICE_ROLE_KEY — (injetado automaticamente pelo runtime)
//   APP_POST_CONNECT_URL      — (opcional) URL do app p/ redirecionar ao final
//
// Fluxo do `state`:
//   O frontend inicia o OAuth com state = base64url(JSON({ company_id, nonce })).
//   Aqui decodificamos para saber a QUAL empresa a conexão pertence.
//   (Em produção, valide o nonce contra um valor guardado no início do fluxo
//    para proteção CSRF completa.)
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

const ML_TOKEN_URL = 'https://api.mercadolibre.com/oauth/token'

interface StatePayload {
  company_id: string
  nonce?: string
}

function decodeState(state: string): StatePayload | null {
  try {
    // base64url -> base64 -> JSON
    const b64 = state.replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(b64)
    const parsed = JSON.parse(json)
    if (parsed && typeof parsed.company_id === 'string') return parsed
    return null
  } catch {
    return null
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const errorParam = url.searchParams.get('error')

  if (errorParam) {
    return jsonResponse(
      { ok: false, error: `Mercado Livre retornou erro: ${errorParam}` },
      400,
    )
  }
  if (!code || !state) {
    return jsonResponse(
      { ok: false, error: 'Parâmetros ausentes: code e state são obrigatórios.' },
      400,
    )
  }

  const statePayload = decodeState(state)
  if (!statePayload) {
    return jsonResponse(
      { ok: false, error: 'state inválido — não foi possível identificar a empresa.' },
      400,
    )
  }

  const CLIENT_ID = Deno.env.get('ML_CLIENT_ID')
  const CLIENT_SECRET = Deno.env.get('ML_CLIENT_SECRET')
  const REDIRECT_URI = Deno.env.get('ML_REDIRECT_URI')
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI || !SUPABASE_URL || !SERVICE_ROLE) {
    return jsonResponse(
      { ok: false, error: 'Configuração ausente (secrets do ML/Supabase não definidos).' },
      500,
    )
  }

  // 1) Troca o code por tokens
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
      {
        ok: false,
        error: 'Falha ao trocar code por token no Mercado Livre.',
        details: tokenData,
      },
      502,
    )
  }

  // tokenData: { access_token, token_type, expires_in, scope, user_id, refresh_token }
  const expiresAt = new Date(Date.now() + (tokenData.expires_in ?? 21600) * 1000)

  // 2) Persiste com service_role (BYPASS de RLS)
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  })

  const { error: upsertError } = await admin
    .from('marketplace_connections')
    .upsert(
      {
        company_id: statePayload.company_id,
        platform: 'mercado_livre',
        external_user_id: tokenData.user_id ? String(tokenData.user_id) : null,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: expiresAt.toISOString(),
        status: 'connected',
        last_error: null,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'company_id,platform' },
    )

  if (upsertError) {
    return jsonResponse(
      { ok: false, error: 'Falha ao gravar conexão no banco.', details: upsertError.message },
      500,
    )
  }

  // 3) Redireciona de volta para o app (se configurado), senão devolve JSON.
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
