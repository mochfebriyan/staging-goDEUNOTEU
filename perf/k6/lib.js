// Shared helpers for the k6 scripts. Every request here mirrors what the
// web app sends through supabase-js (src/lib/remote.ts), so the load on
// Supabase is the same as real admins using the dashboard.
import http from 'k6/http'
import { check, fail } from 'k6'
import { Trend } from 'k6/metrics'

export const SUPABASE_URL = __ENV.SUPABASE_URL || 'http://host.docker.internal:54321'
export const ANON_KEY = __ENV.ANON_KEY
export const ADMIN_EMAIL = __ENV.ADMIN_EMAIL || 'perf-admin@example.com'
export const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD

// Time for one whole "open the dashboard" (all tables loaded), not just
// one HTTP request. This is what the admin actually waits for.
export const dashboardLoadTime = new Trend('dashboard_load_time', true)
// Time for "save a batch" + the reload the app does right after it.
export const saveBatchTime = new Trend('save_batch_time', true)

function requireEnv() {
  if (!ANON_KEY) fail('ANON_KEY is empty: fill in perf/.env (see perf/README.md step 3).')
}

function headers(token) {
  return {
    apikey: ANON_KEY,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

// Logs in once (called from setup()). One login shared by all virtual
// users: local Supabase limits sign-ins to 30 per 5 minutes per IP, and
// login speed is not what we are measuring.
export function login() {
  requireEnv()
  if (!ADMIN_PASSWORD) fail('ADMIN_PASSWORD is empty: fill in perf/.env.')
  const res = http.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    { headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' }, tags: { name: 'auth login' } },
  )
  if (res.status !== 200) fail(`Login failed (${res.status}): ${res.body}. Did you run setup-admin.js?`)
  return res.json('access_token')
}

export function customerIds(token) {
  const res = http.get(`${SUPABASE_URL}/rest/v1/customers?select=id`, {
    headers: headers(token),
    tags: { name: 'setup customers' },
  })
  const ids = res.status === 200 ? res.json().map((c) => c.id) : []
  if (ids.length === 0) fail(`No customers visible (${res.status}). Is the user in the admins table?`)
  return ids
}

// Same tables, order and 1000-row paging as fetchAll() in src/lib/remote.ts.
const TABLES = [
  ['customers', 'name'],
  ['boxes', 'created_at'],
  ['batches', 'created_at'],
  ['batch_photos', 'position'],
  ['items', 'created_at'],
  ['batch_bills', 'created_at'],
  ['tax_bills', 'published_at'],
]
const PAGE = 1000

export function dashboardLoad(token) {
  const start = Date.now()
  const h = headers(token)
  let pending = TABLES.map(([table, order]) => ({ table, order, offset: 0 }))
  let first = true

  while (pending.length > 0) {
    const reqs = pending.map((p) => ({
      method: 'GET',
      url: `${SUPABASE_URL}/rest/v1/${p.table}?select=*&order=${p.order}.asc,id.asc&offset=${p.offset}&limit=${PAGE}`,
      params: { headers: h, tags: { name: `GET ${p.table}` } },
    }))
    if (first) {
      reqs.push({
        method: 'GET',
        url: `${SUPABASE_URL}/rest/v1/estimator_config?select=*&id=eq.1`,
        params: { headers: h, tags: { name: 'GET estimator_config' } },
      })
    }
    const res = http.batch(reqs)
    const ok = check(res, { 'dashboard tables 200': (all) => all.every((r) => r.status === 200) })
    if (!ok) return false

    // Tables that returned a full page have more rows: fetch the next page.
    pending = pending.filter((p, i) => {
      p.offset += PAGE
      return res[i].json().length === PAGE
    })
    first = false
  }
  dashboardLoadTime.add(Date.now() - start)
  return true
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

// Feature A "New Batch Record": save_batch RPC with 3 items, then the app
// reloads everything (useStore -> loadRemote), so we do the same.
export function saveBatch(token, customers) {
  const start = Date.now()
  const items = [0, 1, 2].map((i) => ({
    id: uuid(),
    customer_id: pick(customers),
    tipe_barang: i === 0 ? 'Ganci' : 'Kartu',
    tipe_kartu: i === 0 ? null : pick(['Tops', 'Skirt', 'Shoes', 'Dress']),
    price_idr: 20000 + Math.floor(Math.random() * 200000),
    weight_grams: i === 0 ? 50 : null,
  }))
  const res = http.post(
    `${SUPABASE_URL}/rest/v1/rpc/save_batch`,
    JSON.stringify({
      p_batch_id: uuid(),
      p_batch_number: `K6-${__VU}-${__ITER}-${Date.now()}`,
      p_order_id_wh: `WH-K6-${__VU}`,
      p_order_type: 'ReqShare',
      p_photo_paths: [],
      p_items: items,
    }),
    { headers: headers(token), tags: { name: 'RPC save_batch' } },
  )
  if (!check(res, { 'save_batch 200': (r) => r.status === 200 })) return false
  const ok = dashboardLoad(token)
  if (ok) saveBatchTime.add(Date.now() - start)
  return ok
}
