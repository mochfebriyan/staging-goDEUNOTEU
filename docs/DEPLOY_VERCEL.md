# Deploy to Vercel — runbook

Two Vercel projects from this one repo. No code changes are needed: the LINE
callback URL is built from `window.location.origin`, and
`customer/vercel.json` already rewrites every path to `index.html`.

Tick items as they're done (`[x]`) so the next session knows where we are.

## 0. Before deploying

- [ ] Commit and push the current work (branch `customer-dashboard`). Don't commit `supabase/.temp/`.
- [ ] Local check passes in both apps: `npx tsc -b && npx vite build`

## 1. Admin Dashboard: Vercel project #1

- [ ] Vercel → Add New → Project → import this repo
- [ ] **Root Directory**: `.` (repo root) · Framework: **Vite**
      · Build `npm run build` · Output `dist`
- [ ] Environment Variables (Production + Preview):
  - `VITE_SUPABASE_URL` = value from the local `.env`
  - `VITE_SUPABASE_ANON_KEY` = value from the local `.env`
- [ ] Deploy. Write the URL here: `https://______________`
- [ ] Log in with an admin account. Data loads from Supabase, with no "Mode demo" badge.

Admin uses HashRouter (`/#/orders`), so it needs no `vercel.json`.

## 2. Customer Dashboard: Vercel project #2

- [ ] Vercel → Add New → Project → import the **same** repo
- [ ] **Root Directory**: `customer` · Framework: **Vite**
      · Production branch: `customer-dashboard` (or `main` after merging)
- [ ] Environment Variables (Production + Preview):
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_LINE_CHANNEL_ID` = `2012779435`

  The `.env` file is gitignored and never reaches Vercel. Vite reads these
  `VITE_*` variables from the build environment even though the app uses
  `envDir: '..'`.
- [ ] Deploy. Write the URL here: `https://______________` (this is `<customer-domain>` below)

## 3. LINE Developers Console (channel 2012779435)

- [ ] **LINE Login → Callback URL**: add `https://<customer-domain>/id/line-callback`.
      Keep `http://localhost:5174/id/line-callback` for local development.
- [ ] **Publish** the channel. While it is *Developing*, only accounts under
      **Roles** can log in, and real customers get an error from LINE.

## 4. Supabase

- [x] Edge Function `line-auth` deployed, Verify JWT OFF, secrets `LINE_CHANNEL_ID` and `LINE_CHANNEL_SECRET` set
- [x] Migrations 0001–0006 applied
- [ ] (Recommended) In `supabase/functions/line-auth/index.ts`, set
      `'Access-Control-Allow-Origin'` to `https://<customer-domain>` instead of `*`, then redeploy:
      `npx supabase functions deploy line-auth --no-verify-jwt --project-ref llywvxiknmqtvgxteqye`
      (or paste the file in Dashboard → Edge Functions → line-auth → Code).
      To keep local login working with a fixed origin, echo the request's
      `Origin` when it is in an allowlist (`http://localhost:5174` + the production domain).
- [ ] (Optional) Authentication → Custom Providers → disable `line` (unused)
- [ ] (Optional) Authentication → URL Configuration → Site URL = admin domain

## 5. Smoke test on production

- [ ] Customer domain → Masuk → Lanjut dengan LINE → "Selamat datang!" → profile created
- [ ] Admin domain: add an item for that customer in a batch. The customer sees the bill and a notification.
- [ ] Customer uploads a proof → admin confirms → the bill shows **Lunas** with a notification

## Notes

- **Preview deployments** get a new URL each time, and LINE rejects unregistered
  callback URLs. Test LINE Login on the production domain, or register the preview URL in LINE first.
- **Custom domain** (e.g. `go.deunoteu.id`): add it in Vercel and add its
  `/id/line-callback` URL in LINE. Also update the CORS origin if it was restricted.
- Secrets never go in Vercel: `LINE_CHANNEL_SECRET` and the service_role key
  stay in Supabase Edge Function secrets only.
- Errors on `/id/line-callback`: see the troubleshooting table in `docs/LINE_LOGIN_SETUP.md`.
