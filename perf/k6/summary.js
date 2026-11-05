// End-of-test summary. Prints the numbers you need for section E of the
// report and saves them to perf/results/ (<RUN_NAME>-row.txt and the full
// raw data in <RUN_NAME>-summary.json).

function ms(v) {
  return v === undefined ? '-' : `${v.toFixed(0)} ms`
}

function thresholdLines(data) {
  const lines = []
  for (const [metric, m] of Object.entries(data.metrics)) {
    if (!m.thresholds) continue
    for (const [rule, t] of Object.entries(m.thresholds)) {
      lines.push(`  ${t.ok ? 'PASS' : 'FAIL'}  ${metric} ${rule}`)
    }
  }
  return lines.join('\n')
}

export function handleSummary(data) {
  const name = __ENV.RUN_NAME || 'run'
  const m = data.metrics
  const d = m.http_req_duration.values
  const reqs = m.http_reqs.values
  const failed = m.http_req_failed.values.rate * 100
  const vus = m.vus_max ? m.vus_max.values.max : '-'
  const dash = m.dashboard_load_time ? m.dashboard_load_time.values : {}
  const save = m.save_batch_time ? m.save_batch_time.values : {}
  const dur = (data.state.testRunDurationMs / 1000).toFixed(0)

  const text =
    `\n===== ${name} (${dur} s) =====\n` +
    `Max virtual users     : ${vus}\n` +
    `HTTP request  p50/p95 : ${ms(d.med)} / ${ms(d['p(95)'])}   (p99 ${ms(d['p(99)'])}, max ${ms(d.max)})\n` +
    `Dashboard load p50/p95: ${ms(dash.med)} / ${ms(dash['p(95)'])}\n` +
    `Save batch    p50/p95 : ${ms(save.med)} / ${ms(save['p(95)'])}\n` +
    `Throughput            : ${reqs.rate.toFixed(1)} req/s  (${reqs.count} requests)\n` +
    `Error rate            : ${failed.toFixed(2)} %\n` +
    `Thresholds:\n${thresholdLines(data)}\n`

  return {
    stdout: text,
    [`/results/${name}-row.txt`]: text,
    [`/results/${name}-summary.json`]: JSON.stringify(data, null, 2),
  }
}
