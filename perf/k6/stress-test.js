// STRESS TEST: where does the system break, and does it recover?
//
// Steps the load up past the load test, holds each step 2 minutes, then
// drops back to a low load ("recovery" stage) so you can see whether
// response time returns to normal.
// Shorter think time than the load test, so each user pushes harder.
//
// Safety stop: the run aborts automatically if more than 30% of requests
// fail for 30 s (test plan "Batas penghentian").
import { sleep } from 'k6'
import { login, customerIds, dashboardLoad, saveBatch } from './lib.js'

export const options = {
  scenarios: {
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 50 }, //   normal load
        { duration: '2m', target: 50 },
        { duration: '1m', target: 100 }, //  2x
        { duration: '2m', target: 100 },
        { duration: '1m', target: 200 }, //  4x
        { duration: '2m', target: 200 },
        { duration: '1m', target: 300 }, //  6x
        { duration: '2m', target: 300 },
        { duration: '1m', target: 400 }, //  8x
        { duration: '2m', target: 400 },
        { duration: '30s', target: 20 }, //  drop the load...
        { duration: '3m', target: 20 }, //   ...and watch recovery
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    // Not a pass/fail target here: we expect these to break. They are
    // listed so the summary shows them; the only hard rule is the abort.
    http_req_duration: ['p(95)<2000'],
    http_req_failed: [{ threshold: 'rate<0.30', abortOnFail: true, delayAbortEval: '30s' }],
    dashboard_load_time: ['p(95)<2000'],
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
  sleep(0.5 + Math.random() * 0.5)
}

export { handleSummary } from './summary.js'
