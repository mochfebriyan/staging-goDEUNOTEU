# GO DEUNOTEU — project guide for Claude Code

Group Order (GO) business for Aikatsu products bought from Mercari Japan.
Two separate Vite + React 19 + TypeScript + Tailwind v4 apps share one
Supabase project (Postgres + Auth + Storage + Edge Functions).

| App | Folder | Local URL | Router | Login |
|---|---|---|---|---|
| Admin Dashboard | repo root (`src/`) | http://localhost:5173 | HashRouter | Supabase email/password, user must be in `admins` table |
| Customer Dashboard | `customer/` | http://localhost:5174/id | BrowserRouter (`customer/vercel.json` rewrites) | **LINE Login only**, via Edge Function `line-auth` |

The user writes in Indonesian (casual). Reply in Indonesian.

## Run locally

```bash
npm install && npm run dev                                   # admin  → :5173
cd customer && npm install && npm run dev -- --port 5174     # customer → :5174 (port must match LINE callback URL)
```

- Env: one `.env` at the repo root (gitignored), read by both apps
  (`customer/vite.config.ts` has `envDir: '..'`):
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_LINE_CHANNEL_ID=2012779435`.
- Without `.env` both apps run in **demo mode** (seed data in localStorage).
- Checks: `npx tsc -b` and `npx vite build` in each app; admin also `npm run lint` (oxlint).

## Supabase

- Project ref `llywvxiknmqtvgxteqye` (name GO-DEUNOTEU).
- Migrations in `supabase/migrations/`, run **by hand in the SQL Editor**, in order:
  - `0001_init`: schema, RLS, RPCs, storage
  - `0002`: `items.description`
  - `0003`: `customers.claim_code`, `link_customer`
  - `0004`: `register_customer`
  - `0005`: LINE id read from `app_metadata.line_sub`
  - `0006`: `my_batch_members()`

  All six are applied on the live project.
- Edge Function `supabase/functions/line-auth/index.ts`: deployed. Verify JWT is OFF.
  Secrets `LINE_CHANNEL_ID` and `LINE_CHANNEL_SECRET` are set in Supabase.
- RLS: admin = full access via `is_admin()`. A customer reads only their own rows
  (`current_customer_id()`) and pays through `rpc('submit_payment_proof')`.

## What the customer dashboard does (built and tested end to end)

1. **LINE Login.** Supabase's custom OIDC provider can't verify LINE web ID tokens
   (HS256 vs ES256), so login does not use it:
   - `customer/src/lib/lineLogin.ts` sends the customer to LINE (PKCE + state + nonce).
   - LINE redirects to `/id/line-callback`.
   - The `line-auth` Edge Function exchanges the code, verifies with LINE `/verify`,
     creates or finds the auth user (placeholder email `line_<sub>@line-login.invalid`,
     `app_metadata.line_sub`), and returns a session.
   - The client calls `supabase.auth.setSession`.
2. **First login.** The "Selamat datang!" modal offers two choices:
   - "Saya customer baru": `register_customer()` creates a `customers` row named after the LINE display name.
   - "Punya kode dari admin": `link_customer(code)` links an existing row. Admin generates codes in SQL:
     `select generate_missing_claim_codes(); select name, claim_code from customers where auth_user_id is null;`
3. **Data.** `customer/src/store.ts` runs in `MODE = 'remote'` when Supabase and the LINE channel id are set.
   - `customer/src/lib/remote.ts` loads the customer's boxes, batches, items, bills, notifications and estimator config.
   - Paying uploads the proof to `bukti-transfer/<customer_id>/…` and then calls `submit_payment_proof`.
   - The admin confirms or rejects the payment in the admin app.
4. `customer/src/auth.ts` holds the session and linked customer. On link it calls
   `useStore.loadRemote`, and on sign-out `clearRemote`.

Full details and troubleshooting: `docs/LINE_LOGIN_SETUP.md`.

## Deploying to Vercel

Follow **`docs/DEPLOY_VERCEL.md`** step by step. It's a checklist with what is
done and what is still open. When the user asks to deploy, read it first, do
the steps that can be done from the CLI, and list the dashboard steps for the
user.

## Rules

- Never put `LINE_CHANNEL_SECRET` or the Supabase service_role key in `.env`,
  frontend code, Vercel env vars, or chat. They live only in Supabase Edge
  Function secrets.
- Schema changes go in a new numbered migration (`0007_…`), never by editing an
  applied one. Tell the user to run it in the SQL Editor.
- `customer/src/shared/` holds copies of the admin's `types.ts`, `calc.ts`,
  `format.ts` and `seed.ts`. Keep them in sync.
- Commit only when asked. `supabase/.temp/` is Supabase CLI state and must not
  be committed.
