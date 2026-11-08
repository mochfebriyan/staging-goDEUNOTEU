# GO Aikatsu — Admin Dashboard

Admin dashboard for a Group Order (GO) business purchasing Aikatsu products
from Mercari Japan, per the product's PRD. Covers order recap (Box → Batch →
Item → Customer), batch payment management, tax bill management (Tagihan
Pajak EMS), and Price Estimator configuration.

## Stack

- React 19 + TypeScript, built with Vite
- React Router (hash routing)
- Zustand for state
- Supabase (Postgres + Auth + Storage) as the backend, with a
  `localStorage` demo mode when it isn't configured
- Tailwind CSS v4

## Running locally

```bash
npm install
npm run dev
```

Without a `.env` the app runs in **demo mode**: seed data in the Zustand
store (`src/store/useStore.ts`), persisted to `localStorage`, no login.

## Backend (Supabase)

- **Setup guide:** [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md):
  create the tables, add an admin, fill `.env`, smoke test.
- **ERD + table reference:** [`docs/ERD.md`](docs/ERD.md)
- **Schema:** [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql),
  then [`0002_item_description.sql`](supabase/migrations/0002_item_description.sql)
  (tables, RPC functions, RLS, storage buckets); demo customers in
  [`supabase/seed.sql`](supabase/seed.sql).

With `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set in `.env`, the
app requires an admin login (`src/components/AuthGate.tsx`) and every
store action reads/writes Supabase through `src/lib/remote.ts`. Pages are
unchanged — they use the same store in both modes.

## Auth

The two dashboards use **two separate, unrelated sign-in methods** — there
is no shared login screen and no SSO between them.

### Admin Dashboard — website account (no SSO)

Admin GO signs in with a normal website account: Supabase Auth's built-in
email/password provider. This is an internal tool, not a public signup —
admin accounts are created in the Supabase dashboard and granted access by
inserting their id into the `admins` table (implemented — see
`docs/SUPABASE_SETUP.md` Step 2). No public "sign up as admin" flow
exists or should exist.

### Customer Dashboard — LINE Login only (planned)

Customers sign in with **LINE Login and nothing else** — no email/
password option on that dashboard. LINE Login (v2.1) is OpenID Connect–
compliant — it issues a signed `id_token` carrying the user's stable LINE
id (`sub`), display name, and profile picture. Supabase Auth accepts that
directly via `supabase.auth.signInWithIdToken()` once LINE is registered
as a custom OIDC provider on the project (LINE Developers Console → a
"LINE Login" channel, Callback URL pointed at the Supabase Auth callback,
Channel ID/Secret entered into Supabase's Auth provider settings).

- `customers.line_user_id` stores the `sub` claim and
  `customers.auth_user_id` the Supabase user — together they match a
  returning customer back to the row Admin already created for them;
  `avatar_url` is seeded from the LINE profile on first login.
- Customers and admins live in separate tables (`customers` vs
  `admins`), so a LINE login can never grant admin access.
- If a customer's phone number changes but their LINE account doesn't,
  nothing breaks — identity is the LINE account, not a phone/email.
- No password-reset flow or "forgot password" ticket to design for on
  this side — LINE handles all of that.
