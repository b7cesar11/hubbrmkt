// =============================================================================
// Edge Function: mercadolivre-fee-query
// =============================================================================
// Consulta a taxa de venda AO VIVO no Mercado Livre para uma dada
// (categoria × tipo de anúncio × preço), com:
//   1. Cache (marketplace_fee_cache) — evita bater na API a cada cálculo.
//   2. Refresh automático do access_token quando expirado, salvando o NOVO
//      refresh_token (o refresh token do ML é de USO ÚNICO e ROTACIONA — se não
//      salvarmos o novo, a próxima renovação falha com invalid_grant).
//
// Entrada (POST JSON):
//   { company_id, category_id, price, listing_type }
//     listing_type: 'classico' | 'premium'
//
// Saída (JSON):
//   { ok, source: 'cache'|'live', commission_pct, fixed_fee, raw }
//
// SECRETS necessários:
//   ML_CLIENT_ID, ML_CLIENT_SECRET
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (injetados pelo runtime)
//
// Observações:
//   - Mapeamento listing_type (Brasil): classico -> gold_special, premium -> gold_pro
//   - A API: GET /sites/MLB/listing_prices?price=&category_id=&listing_type_id=
//     Resposta contém sale_fee_details { percentage_fee, fixed_fee, ... }.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

const ML_TOKEN_URL = 'https://api.mercadolibre.com/oauth/token'
const ML_LISTING_PRICES = 'https://api.mercadolibre.com/sites/MLB/listing_prices'

// TTL do cache (em horas). Taxas mudam pouco; 24h é um bom equilíbrio.
const CACHE_TTL_HOURS = 24

const LISTING_TYPE_MAP: Record<string, string> = {
  classico: 'gold_special',
  premium: 'gold_pro',
}

interface FeeQueryBody {
  company_id: string
  category_id: string
  price: number
  listing_type: 'classico' | 'premium'
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Use POST.' }, 405)
  }

  let body: FeeQueryBody
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ ok: false, error: 'JSON inválido no corpo.' }, 400)
  }

  const { company_id, category_id, price, listing_type } = body
  if (!company_id || !category_id || price == null || !listing_type) {
    return jsonResponse(
      {
        ok: false,
        error: 'Campos obrigatórios: company_id, category_id, price, listing_type.',
      },
      400,
    )
  }

  const listingTypeId = LISTING_TYPE_MAP[listing_type]
  if (!listingTypeId) {
    return jsonResponse(
      { ok: false, error: `listing_type inválido: ${listing_type}` },
      400,
    )
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const CLIENT_ID = Deno.env.get('ML_CLIENT_ID')
  const CLIENT_SECRET = Deno.env.get('ML_CLIENT_SECRET')
  if (!SUPABASE_URL || !SERVICE_ROLE || !CLIENT_ID || !CLIENT_SECRET) {
    return jsonResponse({ ok: false, error: 'Configuração ausente (secrets).' }, 500)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  })

  // 1) Tenta o cache
  const { data: cached } = await admin
    .from('marketplace_fee_cache')
    .select('commission_pct, fixed_fee, raw, expires_at')
    .eq('company_id', company_id)
    .eq('platform', 'mercado_livre')
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
      raw: cached.raw,
    })
  }

  // 2) Precisa consultar ao vivo — garante um access_token válido
  const tokenResult = await ensureValidAccessToken(admin, company_id, CLIENT_ID, CLIENT_SECRET)
  if (!tokenResult.ok) {
    return jsonResponse({ ok: false, error: tokenResult.error }, tokenResult.status)
  }
  const accessToken = tokenResult.accessToken

  // 3) Consulta listing_prices
  const q = new URL(ML_LISTING_PRICES)
  q.searchParams.set('price', String(price))
  q.searchParams.set('category_id', category_id)
  q.searchParams.set('listing_type_id', listingTypeId)

  const feeRes = await fetch(q.toString(), {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  })
  const feeData = await feeRes.json()
  if (!feeRes.ok) {
    return jsonResponse(
      { ok: false, error: 'Falha na consulta de taxa no ML.', details: feeData },
      502,
    )
  }

  // A resposta pode ser um objeto único ou uma lista, dependendo dos parâmetros.
  const entry = Array.isArray(feeData) ? feeData[0] : feeData
  const details = entry?.sale_fee_details ?? {}
  const commissionPct =
    typeof details.percentage_fee === 'number' ? details.percentage_fee : null
  const fixedFee =
    typeof details.fixed_fee === 'number'
      ? details.fixed_fee
      : typeof details.gross_amount === 'number' && commissionPct != null
        ? Math.max(0, entry.sale_fee_amount - (price * commissionPct) / 100)
        : null

  // 4) Grava no cache
  const expiresAt = new Date(Date.now() + CACHE_TTL_HOURS * 3600 * 1000)
  await admin.from('marketplace_fee_cache').upsert(
    {
      company_id,
      platform: 'mercado_livre',
      category_id,
      listing_type,
      price,
      commission_pct: commissionPct,
      fixed_fee: fixedFee,
      raw: feeData,
      fetched_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
    },
    { onConflict: 'company_id,platform,category_id,listing_type,price' },
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
// Garante um access_token válido; renova se expirado e SALVA o novo refresh_token.
// -----------------------------------------------------------------------------
async function ensureValidAccessToken(
  // deno-lint-ignore no-explicit-any
  admin: any,
  companyId: string,
  clientId: string,
  clientSecret: string,
): Promise<
  | { ok: true; accessToken: string }
  | { ok: false; error: string; status: number }
> {
  const { data: conn, error } = await admin
    .from('marketplace_connections')
    .select('access_token, refresh_token, token_expires_at, status')
    .eq('company_id', companyId)
    .eq('platform', 'mercado_livre')
    .maybeSingle()

  if (error) {
    return { ok: false, error: 'Erro ao ler conexão.', status: 500 }
  }
  if (!conn || conn.status !== 'connected' || !conn.refresh_token) {
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

  // Renova
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
    // marca erro na conexão para o frontend sinalizar reconexão
    await admin
      .from('marketplace_connections')
      .update({
        status: 'error',
        last_error: `Falha ao renovar token: ${JSON.stringify(refreshData)}`,
        updated_at: new Date().toISOString(),
      })
      .eq('company_id', companyId)
      .eq('platform', 'mercado_livre')
    return {
      ok: false,
      error: 'Falha ao renovar token do Mercado Livre. Reconecte a conta.',
      status: 401,
    }
  }

  const newExpiresAt = new Date(Date.now() + (refreshData.expires_in ?? 21600) * 1000)
  // IMPORTANTE: salva o NOVO refresh_token (rotativo / uso único).
  await admin
    .from('marketplace_connections')
    .update({
      access_token: refreshData.access_token,
      refresh_token: refreshData.refresh_token ?? conn.refresh_token,
      token_expires_at: newExpiresAt.toISOString(),
      status: 'connected',
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('company_id', companyId)
    .eq('platform', 'mercado_livre')

  return { ok: true, accessToken: refreshData.access_token }
}
