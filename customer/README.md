# GO DEUNOTEU — Customer Dashboard

Customer-facing dashboard, kept separate from the admin dashboard (repo
root). Requirements: the "customer" tab of the PRD (FR-GO-L, FR-GO-PAY,
FR-GO-1/2/3). Styling follows the admin dashboard (Tailwind, slate + rose).

## Run

```bash
cd customer
npm install
npm run dev
```

Open http://localhost:5173/id.

## Pages

| Path | Requirement |
| --- | --- |
| `/id` | Landing page (FR-GO-L-001, L-002) |
| `/id?tab=order` | Order menu: Bayar Batch, Kalkulator Harga (L-003) |
| `/id?tab=tagihan` | Tagihan menu + "Posisi barang kamu" tracker (L-003, L-004) |
| `/id?tab=profile` | Login, profile, notifications (PAY-001, L-005) |
| `/id/order` | Bayar Batch (FR-GO-1-001 … 007) |
| `/id/ems-tax` | Tagihan EMS & Pajak (FR-GO-2-001 … 007) |
| `/id/calculator` | Kalkulator Harga (FR-GO-3-001 … 005) |

## LINE Login

Uses the Supabase project from the repo-root `.env` (`envDir: '..'`), plus
`VITE_LINE_CHANNEL_ID`. Supabase's custom OIDC provider can't verify LINE
web-login ID tokens (HS256), so the code exchange runs in the `line-auth`
Edge Function (`../supabase/functions/line-auth/index.ts`):

1. "Lanjut dengan LINE" → LINE authorize page (PKCE, state, nonce).
2. LINE → `/id/line-callback?code=…` → `line-auth` exchanges and verifies
   it with LINE, creates/finds the Supabase user, returns a session.
3. First login: "Saya customer baru" (`register_customer`) or a one-time
   code from Admin GO (`link_customer`). Migrations 0003–0005.

Setup: LINE console → LINE Login → Callback URL lists
`http://localhost:5174/id/line-callback` (and the deployed URL); Edge
Function secrets `LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET`; "Verify JWT" off.
Run this app on port 5174 (`npm run dev -- --port 5174`) so the callback
URL matches.

## Demo mode

LINE Login isn't set up yet, so the app runs on demo data: the same seed
data as the admin dashboard's demo mode (`src/shared/seed.ts`), saved in
this browser's localStorage.

- **Masuk** opens the LINE-only login (disabled for now) plus a
  "Masuk sebagai customer demo" picker.
- Submitting a proof follows the same rules as the backend's
  `submit_payment_proof`: own bill only, only while Belum Bayar.
- After a proof is submitted the bill stays "Menunggu Konfirmasi"; only the
  admin can confirm or reject it (not possible in demo mode).
- Profil → "Reset data demo" restores the seed data.

`src/shared/` holds copies of the admin's `types.ts`, `calc.ts`,
`format.ts` and `seed.ts`; keep them in sync with the admin app.
Moving to the real Supabase backend means replacing `src/store.ts`; the
pages only use its actions and selectors.

## Open decisions (`src/config.ts`)

- Payment instructions per method (account numbers, QRIS image).
- Tax payment methods (currently QRIS only, as in the admin's tax template).
- Proof upload size limit (5 MB placeholder).
- Whether tax can only be paid after the box's batch bills are Lunas
  (`TAX_REQUIRES_PAID_BATCH`, off).

Landing-page copy, numbers, links and photos are placeholders in
`src/content.ts`.

## Deploy (Vercel)

New Vercel project from this repo: **Root Directory = `customer`**,
framework Vite, production branch `customer-dashboard`. `vercel.json`
rewrites every path to `index.html` for client-side routing.
