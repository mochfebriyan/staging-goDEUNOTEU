// LINE Login for the Customer Dashboard.
//
// Supabase's custom OIDC provider can't verify LINE web-login ID tokens
// (LINE signs them HS256 with the channel secret; Supabase only accepts
// JWKS keys), so the exchange happens here instead:
//
//   1. The dashboard sends the customer to LINE's authorize page.
//   2. LINE redirects back to the dashboard (/id/line-callback?code=…).
//   3. The dashboard POSTs { code, redirectUri, codeVerifier, nonce } here.
//   4. This function exchanges the code with LINE (channel secret stays
//      server-side), lets LINE verify the ID token (/verify), then finds or
//      creates the Supabase Auth user for that LINE account and returns a
//      session ({ access_token, refresh_token }) for supabase.auth.setSession.
//
// The LINE user id (`sub`) goes in app_metadata.line_sub, which only the
// service role can write; link_customer() / register_customer() read it.
//
// Secrets (Edge Functions → Secrets): LINE_CHANNEL_ID, LINE_CHANNEL_SECRET.
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided
// by Supabase. Deploy with "Verify JWT" turned OFF (the caller isn't signed
// in yet).

import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

// Placeholder address so Supabase Auth has a unique key per LINE account.
// No mail is ever sent to it (the user is created already confirmed).
const emailFor = (sub: string) => `line_${sub.toLowerCase()}@line-login.invalid`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const channelId = Deno.env.get('LINE_CHANNEL_ID')
  const channelSecret = Deno.env.get('LINE_CHANNEL_SECRET')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  if (!channelId || !channelSecret) return json({ error: 'LINE_CHANNEL_ID / LINE_CHANNEL_SECRET belum di-set.' }, 500)

  let input: { code?: string; redirectUri?: string; codeVerifier?: string; nonce?: string }
  try {
    input = await req.json()
  } catch {
    return json({ error: 'Body harus JSON.' }, 400)
  }
  const { code, redirectUri, codeVerifier, nonce } = input
  if (!code || !redirectUri || !codeVerifier || !nonce) return json({ error: 'Data login tidak lengkap.' }, 400)

  // 1. Code → tokens. LINE rejects a redirect_uri that isn't registered on
  //    the channel, so it doesn't need a separate allowlist here.
  const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: channelId,
      client_secret: channelSecret,
      code_verifier: codeVerifier,
    }),
  })
  const tokens = await tokenRes.json()
  if (!tokenRes.ok || !tokens.id_token) {
    return json({ error: `LINE menolak kode login: ${tokens.error_description ?? tokens.error ?? tokenRes.status}` }, 401)
  }

  // 2. LINE verifies the ID token (signature, audience, expiry, nonce).
  const verifyRes = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: tokens.id_token, client_id: channelId, nonce }),
  })
  const profile = await verifyRes.json()
  if (!verifyRes.ok || !profile.sub) {
    return json({ error: `ID token LINE tidak valid: ${profile.error_description ?? profile.error ?? verifyRes.status}` }, 401)
  }
  const sub: string = profile.sub
  const name: string | null = profile.name ?? null
  const picture: string | null = profile.picture ?? null

  // 3. Find or create the Supabase Auth user for this LINE account.
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const email = emailFor(sub)
  const appMeta = { provider: 'line', providers: ['line'], line_sub: sub }
  const userMeta = { name, picture }

  const created = await admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: appMeta, user_metadata: userMeta })
  if (created.error && created.error.code !== 'email_exists' && created.error.status !== 422) {
    return json({ error: `Gagal membuat akun: ${created.error.message}` }, 500)
  }

  // 4. Mint a session: magic-link token generated and redeemed server-side.
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (link.error || !link.data.properties?.hashed_token) {
    return json({ error: `Gagal membuat sesi: ${link.error?.message ?? 'no token'}` }, 500)
  }
  if (!created.data?.user) {
    // Returning user: refresh name / picture from LINE.
    await admin.auth.admin.updateUserById(link.data.user.id, { app_metadata: appMeta, user_metadata: userMeta })
  }

  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const verified = await anon.auth.verifyOtp({ type: 'magiclink', token_hash: link.data.properties.hashed_token })
  if (verified.error || !verified.data.session) {
    return json({ error: `Gagal membuat sesi: ${verified.error?.message ?? 'no session'}` }, 500)
  }

  return json({
    access_token: verified.data.session.access_token,
    refresh_token: verified.data.session.refresh_token,
  })
})
