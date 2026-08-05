// =============================================================================
// Edge Function: mercadolivre-fee-query   (verify_jwt = TRUE)
// =============================================================================
// Consulta a taxa de venda AO VIVO no Mercado Livre para
// (categoria × tipo de anúncio × preço), com:
//   1. company_id derivado do JWT (não confia em input do cliente).
//   2. Cache em live_fee_cache (TTL 24h).
//   3. Refresh automático do access_token, salvando o NOVO refresh_token
//      (o refresh token do ML é de USO ÚNICO e ROTACIONA).
//
// Entrada (POST JSON): { category_id, price, listing_type }
//   listing_type: 'classico' | 'premium'
// Saída: { ok, source: 'cache'|'live', commission_pct, fixed_fee, raw }
//
// SECRETS: ML_CLIENT_ID, ML_CLIENT_SECRET.
//          SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY injetados.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

const ML_TOKEN_URL = 'https://api.mercadolibre.com/oauth/token'
const ML_LISTING_PRICES = 'https://api.mercadolibre.com/sites/MLB/listing_prices'
const ML_PLATFORM_NAME = 'Mercado Livre'
const CACHE_TTL_HOURS = 24

const LISTING_TYPE_MAP: Record<string, string> = {
  classico: 'gold_special',
  premium: 'gold_pro',
}

interface FeeQueryBody {
  category_id: string
  price: number
  listing_type: 'classico' | 'premium'
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Use POST.' }, 405)

  let body: FeeQueryBody
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ ok: false, error: 'JSON inválido.' }, 400)
  }
  const { category_id, price, listing_type } = body
  if (!category_id || price == null || !listing_type) {
    return jsonResponse(
      { ok: false, error: 'Obrigatórios: category_id, price, listing_type.' },
      400,
    )
  }
  const listingTypeId = LISTING_TYPE_MAP[listing_type]
  if (!listingTypeId) {
    return jsonResponse({ ok: false, error: `listing_type inválido: ${listing_type}` }, 400)
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
  const CLIENT_ID = Deno.env.get('ML_CLIENT_ID')
  const CLIENT_SECRET = Deno.env.get('ML_CLIENT_SECRET')
  if (!SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY || !CLIENT_ID || !CLIENT_SECRET) {
    return jsonResponse({ ok: false, error: 'Configuração ausente (secrets).' }, 500)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonResponse({ ok: false, error: 'Não autenticado.' }, 401)

  // company_id confiável, do JWT
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
  const { data: companyId, error: rpcErr } = await userClient.rpc('fn_current_company_id')
  if (rpcErr || !companyId) {
    return jsonResponse({ ok: false, error: 'Empresa do usuário não identificada.' }, 403)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

  // platform_id do ML
  const { data: platform, error: platErr } = await admin
    .from('platforms')
    .select('id')
    .eq('name', ML_PLATFORM_NAME)
    .single()
  if (platErr || !platform) {
    return jsonResponse({ ok: false, error: 'Plataforma ML não encontrada.' }, 500)
  }
  const platformId = platform.id

  // 1) Cache
  const { data: cached } = await admin
    .from('live_fee_cache')
    .select('commission_pct, fixed_fee, raw_response, expires_at')
    .eq('company_id', companyId)
    .eq('platform_id', platformId)
    .eq('category_id', category_id)
    .eq('listing_type', listing_type)
    .eq('price', price)
    .maybeSingle()

  if (cached && new Date(cached.expires_at) > new Date()) {
    return jsonResponse({
      ok: true,
      source: 'cache',
      commission_pct: cached.commission_pct,
      fixed_fee: cached.fixed_fee,
      raw: cached.raw_response,
    })
  }

  // 2) Token válido (renova se preciso)
  const tokenResult = await ensureValidAccessToken(
    admin,
    companyId as string,
    platformId,
    CLIENT_ID,
    CLIENT_SECRET,
  )
  if (!tokenResult.ok) {
    return jsonResponse({ ok: false, error: tokenResult.error }, tokenResult.status)
  }

  // 3) Consulta listing_prices
  const q = new URL(ML_LISTING_PRICES)
  q.searchParams.set('price', String(price))
  q.searchParams.set('category_id', category_id)
  q.searchParams.set('listing_type_id', listingTypeId)
  const feeRes = await fetch(q.toString(), {
    headers: { Authorization: `Bearer ${tokenResult.accessToken}`, Accept: 'application/json' },
  })
  const feeData = await feeRes.json()
  if (!feeRes.ok) {
    return jsonResponse(
      { ok: false, error: 'Falha na consulta de taxa no ML.', details: feeData },
      502,
    )
  }

  const entry = Array.isArray(feeData) ? feeData[0] : feeData
  const details = entry?.sale_fee_details ?? {}
  const commissionPct =
    typeof details.percentage_fee === 'number' ? details.percentage_fee : null
  const fixedFee = typeof details.fixed_fee === 'number' ? details.fixed_fee : null

  // 4) Grava no cache (upsert idempotente via índice único)
  const expiresAt = new Date(Date.now() + CACHE_TTL_HOURS * 3600 * 1000)
  await admin.from('live_fee_cache').upsert(
    {
      company_id: companyId,
      platform_id: platformId,
      category_id,
      listing_type,
      price,
      commission_pct: commissionPct,
      fixed_fee: fixedFee,
      raw_response: feeData,
      fetched_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
    },
    { onConflict: 'company_id,platform_id,category_id,listing_type,price' },
  )

  return jsonResponse({
    ok: true,
    source: 'live',
    commission_pct: commissionPct,
    fixed_fee: fixedFee,
    raw: feeData,
  })
})

// -----------------------------------------------------------------------------
async function ensureValidAccessToken(
  // deno-lint-ignore no-explicit-any
  admin: any,
  companyId: string,
  platformId: string,
  clientId: string,
  clientSecret: string,
): Promise<
  { ok: true; accessToken: string } | { ok: false; error: string; status: number }
> {
  const { data: conn, error } = await admin
    .from('platform_connections')
    .select('access_token, refresh_token, token_expires_at, status')
    .eq('company_id', companyId)
    .eq('platform_id', platformId)
    .maybeSingle()

  if (error) return { ok: false, error: 'Erro ao ler conexão.', status: 500 }
  if (!conn || conn.status === 'disconnected' || !conn.refresh_token) {
    return {
      ok: false,
      error: 'Mercado Livre não conectado para esta empresa. Conecte primeiro.',
      status: 409,
    }
  }

  const notExpired =
    conn.token_expires_at && new Date(conn.token_expires_at).getTime() - 60_000 > Date.now()
  if (conn.access_token && notExpired) {
    return { ok: true, accessToken: conn.access_token }
  }

  const refreshRes = await fetch(ML_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: conn.refresh_token,
    }),
  })
  const refreshData = await refreshRes.json()

  if (!refreshRes.ok) {
    await admin
      .from('platform_connections')
      .update({
        status: 'expired',
        last_error: `Falha ao renovar token: ${JSON.stringify(refreshData)}`,
      })
      .eq('company_id', companyId)
      .eq('platform_id', platformId)
    return {
      ok: false,
      error: 'Falha ao renovar token do ML. Reconecte a conta.',
      status: 401,
    }
  }

  const newExpiresAt = new Date(Date.now() + (refreshData.expires_in ?? 21600) * 1000)
  // IMPORTANTE: salvar o NOVO refresh_token (rotativo / uso único).
  await admin
    .from('platform_connections')
    .update({
      access_token: refreshData.access_token,
      refresh_token: refreshData.refresh_token ?? conn.refresh_token,
      token_expires_at: newExpiresAt.toISOString(),
      status: 'connected',
      last_error: null,
    })
    .eq('company_id', companyId)
    .eq('platform_id', platformId)

  return { ok: true, accessToken: refreshData.access_token }
}
