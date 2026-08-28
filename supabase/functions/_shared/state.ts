// Assinatura/validação do `state` do OAuth com HMAC-SHA256 (Web Crypto).
// O state carrega { company_id, nonce, ts } e é assinado com OAUTH_STATE_SECRET
// no início do fluxo (oauth-start). O callback valida a assinatura antes de
// confiar no company_id — protege contra CSRF / forjar company_id.

function b64urlEncode(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecodeToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return new Uint8Array(sig)
}

export interface StatePayload {
  company_id: string
  nonce: string
  ts: number
}

// Gera um state assinado: base64url(payloadJSON) + "." + base64url(hmac)
export async function signState(secret: string, payload: StatePayload): Promise<string> {
  const json = JSON.stringify(payload)
  const p = b64urlEncode(new TextEncoder().encode(json))
  const sig = b64urlEncode(await hmac(secret, p))
  return `${p}.${sig}`
}

// Valida o state e devolve o payload, ou null se inválido/expirado.
export async function verifyState(
  secret: string,
  state: string,
  maxAgeMs = 10 * 60 * 1000,
): Promise<StatePayload | null> {
  const parts = state.split('.')
  if (parts.length !== 2) return null
  const [p, sig] = parts

  const expected = b64urlEncode(await hmac(secret, p))
  // comparação em tempo constante
  if (expected.length !== sig.length) return null
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i)
  if (diff !== 0) return null

  try {
    const json = new TextDecoder().decode(b64urlDecodeToBytes(p))
    const payload = JSON.parse(json) as StatePayload
    if (!payload.company_id || !payload.ts) return null
    if (Date.now() - payload.ts > maxAgeMs) return null
    return payload
  } catch {
    return null
  }
}
