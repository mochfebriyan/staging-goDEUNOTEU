// LOAD TEST: does the system meet the targets at the expected load?
//
// Profile (change with -e VUS=..., -e DURATION=...):
//   ramp-up 1m  ->  VUS users steady for DURATION  ->  ramp-down 30s
// Each virtual user = one admin session:
//   80% open the dashboard (all tables load), 20% save a new batch + reload,
//   with 1–3 s think time between actions.
import { sleep } from 'k6'
import { login, customerIds, dashboardLoad, saveBatch } from './lib.js'

const VUS = Number(__ENV.VUS || 50)
const DURATION = __ENV.DURATION || '5m'

export const options = {
  scenarios: {
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: VUS },
        { duration: DURATION, target: VUS },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  // Targets agreed BEFORE running (test plan section D).
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.01'],
    dashboard_load_time: ['p(95)<2000'],
    save_batch_time: ['p(95)<3000'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
}

export function setup() {
  const token = login()
  return { token, customers: customerIds(token) }
}

export default function (data) {
  if (Math.random() < 0.8) dashboardLoad(data.token)
  else saveBatch(data.token, data.customers)
  sleep(1 + Math.random() * 2)
}

export { handleSummary } from './summary.js'
