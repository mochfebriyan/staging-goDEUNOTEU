# LINE Login — Customer Dashboard

How customers sign in to the Customer Dashboard (`customer/`) with LINE, what
was built, and every setup step in LINE Developers and Supabase.

## Why an Edge Function (not Supabase's custom provider)

We first tried Supabase **Authentication → Sign In / Providers → Custom
Providers** (`line`). It fails on every login:

```
failed to verify ID token: oidc: malformed jwt: unexpected signature algorithm "HS256"; expected ["ES256"]
```

LINE signs **web-login** ID tokens with HS256 (the channel secret). Supabase's
custom OIDC provider only verifies tokens with public keys from a JWKS (LINE's
JWKS has ES256 keys, used for native/LIFF logins only). No form setting fixes
this, so the code exchange runs in our own Edge Function instead. The custom
provider `line` in Supabase is unused and can be disabled.

## How it works

```
Customer Dashboard            LINE                   Edge Function line-auth          Supabase Auth / DB
──────────────────            ────                   ───────────────────────          ──────────────────
"Lanjut dengan LINE" ───────▶ authorize (PKCE,
                              state, nonce)
/id/line-callback?code ◀───── redirect
  POST {code, verifier, nonce} ──────────────────▶ token exchange with LINE
                                                   (channel secret, server-side)
                                                   LINE /verify checks the ID token
                                                   create/find auth user ─────────▶ auth.users
                                                   (app_metadata.line_sub = LINE id)
  setSession(access, refresh) ◀─────────────────── session
First login only: "Selamat datang!" modal
  • "Saya customer baru"  → rpc register_customer() ───────────────────────────────▶ new customers row
  • "Punya kode dari admin" → rpc link_customer(code) ─────────────────────────────▶ links existing row
```

- The LINE user id (`sub`) never changes for one LINE provider, so later
  logins match automatically via `customers.auth_user_id`.
- `line_sub` lives in `app_metadata`, which only the service role can write
  (users can't edit it to impersonate another LINE account).
- Auth users get a placeholder email `line_<sub>@line-login.invalid` because
  Supabase Auth needs a unique email; no mail is sent to it.

## Files

| File | Purpose |
|---|---|
| `supabase/functions/line-auth/index.ts` | Edge Function: code → tokens → verify → Supabase session |
| `supabase/migrations/0003_line_claim_code.sql` | `customers.claim_code`, `generate_claim_code`, `generate_missing_claim_codes`, `link_customer` |
| `supabase/migrations/0004_line_self_register.sql` | `register_customer` (new customer from LINE display name) |
| `supabase/migrations/0005_line_edge_function.sql` | Both functions read the LINE id from `app_metadata.line_sub` |
| `customer/src/lib/lineLogin.ts` | Start login (PKCE/state/nonce), finish login on callback |
| `customer/src/pages/LineCallback.tsx` | `/id/line-callback` route |
| `customer/src/auth.ts` | Session + linked-customer state |
| `customer/src/components/Layout.tsx` | Login modal, "Selamat datang!" modal, header |

No new tables. Only a `claim_code` column on `customers`.

## Setup checklist

### LINE Developers Console (developers.line.biz)

- [x] Provider `GO DEUNOTEU`, channel **LINE Login** (Web app), Channel ID `2012779435`
- [ ] **LINE Login → Callback URL** lists `http://localhost:5174/id/line-callback`
      (plus the production URL `https://<domain>/id/line-callback` when deployed)
- [ ] Channel is **Developing**: only accounts under **Roles** can log in.
      Add testers there, or **Publish** for everyone.

### Supabase (project GO-DEUNOTEU)

- [ ] SQL Editor: run migrations `0002` … `0006` in order
- [x] Edge Functions → deploy `line-auth` with the contents of `supabase/functions/line-auth/index.ts`
- [ ] Edge Functions → `line-auth` → **Verify JWT: OFF**
- [ ] Edge Functions → **Secrets**: `LINE_CHANNEL_ID` = `2012779435`,
      `LINE_CHANNEL_SECRET` = channel secret (LINE console → Basic settings).
      Takes effect immediately, no redeploy needed.
      `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are built in.
- [ ] (Optional) Authentication → Custom Providers → disable `line`

### Repo

- Root `.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_LINE_CHANNEL_ID=2012779435`
  (the customer app reads it via `envDir: '..'`). Never put the channel secret here.
- Run the customer app on port 5174 so the callback URL matches:
  `cd customer && npm run dev -- --port 5174`

## Customer codes (existing customers)

Customers Admin GO created before LINE Login need a one-time code so their
orders stay attached to them. In the SQL Editor:

```sql
select generate_missing_claim_codes();
select name, claim_code from customers where auth_user_id is null;
```

Send each customer their code over LINE chat. A code works once, then is
cleared. New customers don't need a code ("Saya customer baru, buat profil").

## Troubleshooting

| Message on `/id/line-callback` | Fix |
|---|---|
| `LINE_CHANNEL_ID / LINE_CHANNEL_SECRET belum di-set.` | Add both secrets (exact names) under Edge Functions → Secrets |
| `Failed to send a request to the Edge Function` / 401 | Function not named `line-auth`, or Verify JWT still on |
| `LINE menolak kode login: invalid_grant` | Wrong channel secret, or callback URL not registered in LINE console |
| `ID token LINE tidak valid` | `LINE_CHANNEL_ID` secret doesn't match the channel |
| `Sesi login tidak cocok` | Started login on a different origin/port; start again from `localhost:5174` |
| `Gagal membuat akun: … email …` | Supabase rejected the placeholder email domain; change `emailFor` in the function |
| LINE shows an error page before redirecting | Account not added under Roles while the channel is Developing |

Function logs: Edge Functions → `line-auth` → Logs.

## Customer data (Supabase)

With Supabase + `VITE_LINE_CHANNEL_ID` in `.env` the Customer Dashboard runs
in **remote mode** (`customer/src/store.ts`, `MODE`); without them it falls
back to demo data with a customer picker.

| What | Source (`customer/src/lib/remote.ts`) |
|---|---|
| Boxes, batches, photos, items, batch bills, tax bills | Tables, filtered by RLS to the signed-in customer |
| Bukti transfer thumbnails | Signed URLs, bucket `bukti-transfer/<customer_id>/` |
| Pay a bill | Upload to `bukti-transfer/<customer_id>/…` → `rpc('submit_payment_proof')` → reload |
| Notifications | `notifications` table (trigger `notify_bill_change`); "read" sets `read_at` |
| ReqShare co-sharers | `rpc('my_batch_members')` (migration 0006) |
| Kalkulator Harga | `estimator_config` (public, also when signed out) |

Data loads when `auth.ts` links the LINE account to a customer and is cleared
on sign-out; nothing from remote mode is stored in localStorage. Admin
confirms or rejects proofs in the admin dashboard as before.

Migration `0006_customer_batch_members.sql` must be run for the co-sharer
list; without it everything else still loads.
