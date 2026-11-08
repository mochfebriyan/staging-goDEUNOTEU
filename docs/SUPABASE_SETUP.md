# Connecting the Admin Dashboard to Supabase

This guide takes you from the current state (app running on demo data in
`localStorage`) to the app reading and writing a real Supabase database.
All the app code is already in place — you only need to set up the
Supabase project and fill in `.env`.

Time needed: ~15 minutes.

```
Browser (React app)
   │  src/store/useStore.ts      ← pages read/write here (unchanged API)
   │  src/lib/remote.ts          ← the only file that talks to Supabase
   ▼
Supabase
   ├─ Auth      → admin email/password login
   ├─ Database  → tables + RPC functions + RLS (supabase/migrations/0001_init.sql)
   └─ Storage   → batch-photos (public), bukti-transfer (private)
```

> **Demo mode still works.** If `.env` is missing, the app runs exactly
> like before (seed data, `localStorage`, a "Mode demo" tag in the header).
> As soon as `.env` has both Supabase values, it switches to Supabase.

---

## Step 1 — Create the tables

1. Open your project at <https://supabase.com/dashboard> → **SQL Editor** → **New query**.
2. Open [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql)
   from this repo, copy **the whole file**, paste it, and click **Run**.
   You should see `Success. No rows returned`.
   Then do the same with
   [`supabase/migrations/0002_item_description.sql`](../supabase/migrations/0002_item_description.sql)
   (adds the optional item description). Already set up before this file
   existed? Run only `0002` on your existing database.
3. New query again: paste [`supabase/seed.sql`](../supabase/seed.sql) and
   **Run**. This adds the 15 demo customers.
4. Check **Table Editor**: you should see `admins`, `customers` (15 rows),
   `boxes`, `batches`, `batch_photos`, `items`, `batch_bills`, `tax_bills`,
   `estimator_config` (1 row), `notifications`.
5. Check **Storage**: buckets `batch-photos` (public) and `bukti-transfer`
   (private) were created by the same script.

What the script contains (see [`docs/ERD.md`](ERD.md) for the diagram):

| Section | What it is |
|---|---|
| Enums | The dropdown values from `src/types.ts` |
| Tables | One per entity, with foreign keys and checks |
| Triggers | auto `updated_at`, tax bill delete guard, customer notifications |
| RPC functions | `save_batch`, `save_box`, `delete_batches`, `delete_boxes`, `set_item_weights`, `publish_tax_bills`, `submit_payment_proof`. Each multi-step action runs as one transaction |
| RLS policies | Admins can do everything; customers (later) only see their own rows |
| Storage | the two buckets + who may upload/read |

> **Made a mistake and want to start over?** Run this in the SQL Editor
> (it **deletes all data**), then repeat Step 1:
>
> ```sql
> drop schema public cascade;
> create schema public;
> grant usage on schema public to postgres, anon, authenticated, service_role;
> grant all on schema public to postgres, service_role;
> alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
> alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
> alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
> drop policy if exists "admin writes batch photos" on storage.objects;
> drop policy if exists "admin manages bukti transfer" on storage.objects;
> drop policy if exists "customer reads own bukti transfer" on storage.objects;
> drop policy if exists "customer uploads own bukti transfer" on storage.objects;
> ```

## Step 2 — Create an admin account

The dashboard only opens for users listed in the `admins` table.

1. **Authentication → Users → Add user → Create new user.**
   Enter an email + password and tick **Auto Confirm User**.
2. **SQL Editor**, replacing the email:

   ```sql
   insert into admins (id, full_name)
   select id, 'Admin GO' from auth.users where email = 'admin@example.com';
   ```

3. Recommended: **Authentication → Sign In / Providers → turn off "Allow new
   users to sign up"**. Even if someone signs up, they can't see or change
   anything (RLS checks the `admins` table), but there's no reason to allow
   it. Turn it back on later when you build LINE login for customers.

Repeat 1–2 for every teammate who needs admin access.

## Step 3 — Connect the web app

1. In Supabase: **Project Settings → API** (or **Connect** button at the top).
   Copy the **Project URL** and the **anon / publishable key**.
   ⚠️ Never use the `service_role` / secret key in the web app — it bypasses
   all security rules and would be visible to anyone opening the site.
2. In the repo root, copy `.env.example` to `.env`:

   ```bash
   cp .env.example .env
   ```

   and fill it in:

   ```env
   VITE_SUPABASE_URL=https://abcdefghijkl.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```

   `.env` is git-ignored — every teammate creates their own.
3. Restart the dev server (Vite only reads `.env` on startup):

   ```bash
   npm install
   npm run dev
   ```

4. Open the app → you get the **login page** → sign in with the admin
   from Step 2 → the dashboard loads, empty except for customers.

## Step 4 — Smoke test

Do this once to confirm everything is wired up. After each step, look in
**Table Editor** to see the rows appear.

| In the app | Expect in Supabase |
|---|---|
| A · New Batch Record with 2 customers + a photo | 1 `batches`, N `items`, 2 `batch_bills`, 1 `batch_photos`, file in `batch-photos`, 2 `notifications` |
| Open the batch → "Simulate customer upload (demo)" → Confirm | bill `status` → Lunas, `paid_at` set, file in `bukti-transfer` |
| B · New Box with that batch, then change status to Di Bea Cukai | 1 `boxes`; the batch's `order_status` follows |
| C · Calculate & Publish | `tax_bills` rows; `items.tax_bill_id` filled |
| D · change exchange rate | `estimator_config.updated_at` / `updated_by` change |
| Reload the page / open on another laptop | same data — it's in the database now |

## How the code is connected (for when you change things)

- **`src/lib/supabaseClient.ts`** creates the client from `.env`;
  `isSupabaseConfigured` decides demo vs Supabase mode.
- **`src/components/AuthGate.tsx`** wraps the app: login → checks
  `admins` → loads data → renders pages. **`src/pages/LoginPage.tsx`** is the form.
- **`src/store/useStore.ts`** keeps the same actions the pages already use.
  In Supabase mode each action calls `remote.*`, then reloads everything
  (`loadRemote`), so the screen always shows what's really in the
  database. Errors from the database are shown as a red toast.
- **`src/lib/remote.ts`** has all queries: `fetchAll()` reads every table
  and converts rows (`snake_case`) into the `src/types.ts` shapes
  (`camelCase`); the other functions are one per store action.

### Adding a new field (example: `notes` on batches)

1. SQL Editor: `alter table batches add column notes text;`
   and save the same statement as a new file
   `supabase/migrations/0002_batch_notes.sql` so teammates can apply it too.
2. `src/types.ts`: add `notes?: string` to `Batch`.
3. `src/lib/remote.ts`: add `notes` to `BatchRow` and map it in `fetchAll()`.
4. Write it: if it's saved through an RPC (batches are, via `save_batch`),
   add a parameter to that SQL function too (`create or replace function`);
   otherwise a plain `db().from('batches').update({ notes })` works.
5. Use it in the page/form as usual.

### Adding customers

There's no "add customer" screen yet (customers will come from LINE login
on the Customer Dashboard). For now: **Table Editor → customers → Insert
row** (only `name` is required), then reload the app.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Still shows "Mode demo" | `.env` not in the repo root, wrong variable names (must start with `VITE_`), or dev server not restarted |
| "Email atau password salah" | Wrong password, or user not confirmed — tick Auto Confirm or confirm in Authentication → Users |
| "Akun … bukan akun Admin GO" | Step 2.2 not done for that user — insert their id into `admins` |
| "Gagal memuat data … relation … does not exist" | Step 1 not run on this project (check the URL in `.env` is the right project) |
| "permission denied for table …" | Project created with the Data API not exposing new tables: Project Settings → Data API → make sure the `public` schema is exposed, then re-run the `grant` lines from the reset snippet above |
| Photo upload fails | `batch-photos` bucket missing — rerun the storage part (section 7) of the migration |
| Red toast with an Indonesian message like "Tagihan pajak box ini sudah pernah dipublikasikan" | That's a business rule from the database refusing the action — expected |

## Next steps (not done yet)

- **Customer Dashboard** with LINE Login: the schema is ready —
  link `customers.auth_user_id`/`line_user_id` on first login, read with
  the same tables (RLS already limits customers to their own rows), pay
  via `rpc('submit_payment_proof', …)`, and read `notifications`.
- **Realtime**: to see customer uploads without reloading, enable Realtime
  on `batch_bills`/`tax_bills` and call `useStore.getState().loadRemote()`
  from a `supabase.channel(...).on('postgres_changes', ...)` subscription.
- **Typed client**: `npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts`
  and pass it to `createClient<Database>()` for column-name autocompletion.
- **Deploying**: set the same two `VITE_` variables in your host (Vercel /
  Netlify env settings), and add the site URL under Authentication → URL Configuration.
