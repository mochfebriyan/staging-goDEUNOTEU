// Run once after `npx supabase start` (and again after `npx supabase db reset`).
// Creates the admin account the tests log in with, and adds it to the
// `admins` table. Uses the LOCAL service_role key. Never point this at
// the hosted project.
import http from 'k6/http'
import { fail } from 'k6'
import { SUPABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD } from './lib.js'

export const options = { vus: 1, iterations: 1 }

export default function () {
  const key = __ENV.SERVICE_ROLE_KEY
  if (!key || !ADMIN_PASSWORD) fail('Fill in SERVICE_ROLE_KEY and ADMIN_PASSWORD in perf/.env first.')
  if (!/localhost|127\.0\.0\.1|host\.docker\.internal|kong/.test(SUPABASE_URL)) {
    fail(`Refusing to run against ${SUPABASE_URL}: this script is for the local Docker Supabase only.`)
  }
  const h = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }

  // 1. Create the auth user (already confirmed).
  let res = http.post(
    `${SUPABASE_URL}/auth/v1/admin/users`,
    JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, email_confirm: true }),
    { headers: h },
  )
  let userId
  if (res.status === 200 || res.status === 201) {
    userId = res.json('id')
    console.log(`Created user ${ADMIN_EMAIL}`)
  } else {
    // Probably exists already: log in to get its id.
    res = http.post(
      `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
      JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
      { headers: h },
    )
    if (res.status !== 200) fail(`Could not create or log in as ${ADMIN_EMAIL}: ${res.status} ${res.body}`)
    userId = res.json('user.id')
    console.log(`User ${ADMIN_EMAIL} already existed`)
  }

  // 2. Make it an admin (same as step 2 of docs/SUPABASE_SETUP.md).
  res = http.post(
    `${SUPABASE_URL}/rest/v1/admins?on_conflict=id`,
    JSON.stringify({ id: userId, full_name: 'Perf Test Admin' }),
    { headers: { ...h, Prefer: 'resolution=ignore-duplicates' } },
  )
  if (res.status >= 300) fail(`Could not insert into admins: ${res.status} ${res.body}`)
  console.log('Admin ready. Next: load perf/seed_perf.sql (README step 5).')
}
