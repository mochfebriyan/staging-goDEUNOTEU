import { LINE_CHANNEL_ID, lineRedirectUri, supabase } from './supabase'

// LINE Login (OAuth 2.1 + PKCE). The code is exchanged by the `line-auth`
// Edge Function (supabase/functions/line-auth), which keeps the channel
// secret and returns a Supabase session.

const STORAGE_KEY = 'go-deunoteu-line-login'

function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const randomString = (bytes = 32) => base64Url(crypto.getRandomValues(new Uint8Array(bytes)))

async function sha256(text: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
}

export async function startLineLogin(): Promise<string | null> {
  if (!supabase || !LINE_CHANNEL_ID) return 'LINE Login belum dikonfigurasi.'
  const state = randomString(16)
  const nonce = randomString(16)
  const codeVerifier = randomString(48)
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ state, nonce, codeVerifier }))
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: LINE_CHANNEL_ID,
    redirect_uri: lineRedirectUri(),
    state,
    scope: 'openid profile',
    nonce,
    code_challenge: base64Url(await sha256(codeVerifier)),
    code_challenge_method: 'S256',
  })
  window.location.assign(`https://access.line.me/oauth2/v2.1/authorize?${params}`)
  return null
}

// Called on /id/line-callback. Returns an error message, or null once the
// Supabase session is set.
export async function finishLineLogin(search: string): Promise<string | null> {
  if (!supabase) return 'LINE Login belum dikonfigurasi.'
  const params = new URLSearchParams(search)
  const lineError = params.get('error')
  if (lineError) return lineError === 'access_denied' ? 'Login dibatalkan.' : (params.get('error_description') ?? lineError)

  const saved = sessionStorage.getItem(STORAGE_KEY)
  sessionStorage.removeItem(STORAGE_KEY)
  const pending = saved ? (JSON.parse(saved) as { state: string; nonce: string; codeVerifier: string }) : null
  const code = params.get('code')
  if (!code || !pending || params.get('state') !== pending.state) {
    return 'Sesi login tidak cocok. Coba masuk lagi.'
  }

  const { data, error } = await supabase.functions.invoke('line-auth', {
    body: { code, redirectUri: lineRedirectUri(), codeVerifier: pending.codeVerifier, nonce: pending.nonce },
  })
  if (error) {
    // The function's own { error } message is in the response body.
    const context = (error as { context?: Response }).context
    const body = context ? await context.json().catch(() => null) : null
    return body?.error ?? error.message
  }
  const { error: sessionError } = await supabase.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  })
  return sessionError ? sessionError.message : null
}
