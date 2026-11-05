# Performance testing with Docker (k6 + local Supabase)

The goal is to load test and stress test GO Aikatsu **without touching the
hosted Supabase project or the Vercel site**. Everything runs on your own
laptop in Docker:

```
 ┌──────────── your laptop (Docker) ──────────────────────────────┐
 │                                                                │
 │  k6 container ──HTTP──▶ Kong :54321 ─▶ PostgREST ─▶ Postgres   │
 │  (virtual users)                    └▶ GoTrue (auth)           │
 │                                                                │
 │  docker stats ──▶ CPU / RAM of every Supabase container        │
 └────────────────────────────────────────────────────────────────┘
```

**Why test Supabase and not Vercel?** Vercel only serves the built
HTML/JS files from a CDN. Every data request goes from the browser straight
to Supabase (`src/lib/remote.ts`), so that's where the load and the
bottlenecks are. The local stack runs the **same** migration
(`supabase/migrations/0001_init.sql`): the same tables, RLS policies and RPC
functions as production.

What's in this folder:

| File | What it does |
|---|---|
| `docker-compose.yml` | Runs k6 (v1.0.0) in Docker and saves results to `results/` |
| `.env.example` | Template for the local keys, copied to `.env` |
| `seed_perf.sql` | Fake but realistic data: 300 customers, 400 batches, 2000 items |
| `k6/setup-admin.js` | Creates the test admin account |
| `k6/load-test.js` | Load test: expected load, checked against targets |
| `k6/stress-test.js` | Stress test: increases load step by step, then measures recovery |
| `k6/lib.js` | The requests themselves, copied from what the app sends |
| `record-stats.sh` | Logs CPU/RAM of the Supabase containers to a CSV |

What one virtual user does (an admin using the dashboard):

- **80% of the time: open the dashboard.** This sends the same 8 parallel
  queries as `fetchAll()`: customers, boxes, batches, batch_photos, items,
  batch_bills, tax_bills and estimator_config. Tables over 1000 rows are
  paged, so `items` takes 2 pages. This is measured as `dashboard_load_time`.
- **20% of the time: save a new batch.** This calls the `save_batch` RPC
  with 3 items (which also creates bills and notifications through triggers),
  then reloads the dashboard, the same way the app does. This is measured as
  `save_batch_time`.
- Between actions, the user waits ("think time"): 1–3 s in the load test,
  0.5–1 s in the stress test.

---

## Step 0: Install the tools (once)

1. **Docker Desktop**: <https://www.docker.com/products/docker-desktop/>.
   Start it and wait until it says *Engine running*.
   - Windows: let it use WSL 2. Under **Settings → Resources**, give Docker
     at least 4 CPUs and 6 GB RAM, and **write these numbers down** for the
     report.
2. **Node.js 18+** (you already have it for `npm run dev`). It's needed for
   `npx supabase`.
3. Check that it works:

   ```bash
   docker --version
   ```

   ```bash
   docker compose version
   ```

   ```bash
   npx supabase --version
   ```

All commands below run from the **repo root** (the folder that contains
`package.json`), unless a step says otherwise.

## Step 1: Start Supabase locally

```bash
npx supabase init
```

Answer **N** to the VS Code / IntelliJ questions. This only creates
`supabase/config.toml`; your migration and seed files are already in place.

```bash
npx supabase start
```

The first run downloads the images and takes 5–10 minutes. When it
finishes, it has already applied `0001_init.sql` and `seed.sql`. It
prints URLs, including:

- **API URL** `http://127.0.0.1:54321`: what k6 will test
- **Studio URL** `http://127.0.0.1:54323`: a local copy of the Supabase dashboard

## Step 2: Create `perf/.env`

```bash
npx supabase status -o env
```

Copy the example file:

```bash
cp perf/.env.example perf/.env
```

(Windows PowerShell: `copy perf\.env.example perf\.env`)

Open `perf/.env` and paste the values:

```env
SUPABASE_URL=http://host.docker.internal:54321
ANON_KEY=<ANON_KEY from supabase status>
SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY from supabase status>
ADMIN_EMAIL=perf-admin@example.com
ADMIN_PASSWORD=<make one up, e.g. LocalOnly-Perf-123>
```

> `SUPABASE_URL` stays `host.docker.internal`, not `127.0.0.1`. k6 runs
> inside a container, and inside a container `127.0.0.1` is the container
> itself.
> `.env` is git-ignored. These keys are only for the local Docker
> stack. **Never** put the hosted project's keys here.

## Step 3: Create the test admin

```bash
docker compose -f perf/docker-compose.yml run --rm k6 run /scripts/setup-admin.js
```

Expected output: `Created user perf-admin@example.com` and then `Admin ready`.

## Step 4: Load the test data

Open Studio at <http://127.0.0.1:54323>, go to **SQL Editor**, paste the
whole contents of `perf/seed_perf.sql` and click **Run**. The last row
should show: `customers 300 | boxes 20 | batches 400 | items 2000 | batch_bills ~1986`.

(If you have `psql`, you can run this instead:
`psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f perf/seed_perf.sql`)

## Step 5: Smoke test (1 minute, to check the setup)

```bash
docker compose -f perf/docker-compose.yml run --rm --service-ports -e RUN_NAME=smoke -e VUS=5 -e DURATION=30s k6 run /scripts/load-test.js
```

You should see `Error rate : 0.00 %` and all thresholds marked `PASS`. If
not, check the troubleshooting table at the end. Smoke-test results don't
go in the report.

## Step 6: Write the test plan BEFORE running (template section D)

Fill in section D now, because the targets have to be set before you test.
These are the defaults in the scripts; change them if your group agrees on
different targets:

| Element | Value |
|---|---|
| App / endpoints | GO Aikatsu Admin Dashboard: Supabase REST `GET /rest/v1/*` (dashboard load) and `POST /rest/v1/rpc/save_batch` |
| Tool | k6 v1.0.0 (Docker image `grafana/k6:1.0.0`), Supabase CLI `npx supabase --version` |
| Environment | Local Docker replica of production schema. Laptop CPU/RAM/OS + Docker Desktop limits from step 0 |
| Load test | 50 VUs, ramp-up 1 min, steady 5 min, ramp-down 30 s |
| Stress test | 50 → 100 → 200 → 300 → 400 VUs (1 min ramp + 2 min hold each), then 20 VUs for 3 min (recovery) |
| Think time / mix | 80% dashboard load, 20% save batch. Think time 1–3 s (load) or 0.5–1 s (stress) |
| Target response time | p95 HTTP request < 2 s; p95 dashboard load < 2 s; p95 save batch < 3 s |
| Target throughput | Write down what you measure at 50 VUs as the baseline |
| Error rate limit | < 1% |
| Stop condition | Automatic abort if errors exceed 30% for 30 s, or stop manually with Ctrl+C if the laptop becomes unresponsive |

## Step 7: Record CPU/RAM during every run

Open a **second terminal** before each test and start recording. Name it the
same as the run.

macOS / Linux / Git Bash:

```bash
bash perf/record-stats.sh load-50vu
```

Windows PowerShell:

```powershell
while ($true) { docker stats --no-stream --format "{{.Name}},{{.CPUPerc}},{{.MemUsage}}" | Select-String supabase_ | ForEach-Object { "$(Get-Date -Format HH:mm:ss),$_" } | Add-Content perf/results/load-50vu-docker-stats.csv; Start-Sleep 5 }
```

Press Ctrl+C after the test ends. The containers that matter most are
`supabase_db_*` (Postgres), `supabase_rest_*` (PostgREST) and
`supabase_kong_*` (gateway). A plain `docker stats` in a third window is
also nice for screenshots.

## Step 8: Run the load test

```bash
docker compose -f perf/docker-compose.yml run --rm --service-ports -e RUN_NAME=load-50vu k6 run /scripts/load-test.js
```

- While it runs, open <http://localhost:5665> to see live graphs.
  Screenshot them for the report's appendix.
- When it finishes, you have in `perf/results/`:
  - `load-50vu-row.txt`: the numbers for the section E table
  - `load-50vu-report.html`: the full report with graphs (open it in a browser)
  - `load-50vu-summary.json`: all raw numbers
  - `load-50vu-docker-stats.csv`: CPU/RAM from step 7

**Run it 3 times** (`load-50vu-1`, `-2`, `-3`). The slides say not to draw
conclusions from a single run. To keep the runs comparable, reset the data
between them (step 11).

Optional: also run at the predicted peak, for example
`-e VUS=100 -e RUN_NAME=load-100vu`.

## Step 9: Run the stress test (~20 min)

Reset first (step 11), start `record-stats` with name `stress`, then:

```bash
docker compose -f perf/docker-compose.yml run --rm --service-ports -e RUN_NAME=stress k6 run /scripts/stress-test.js
```

Watch <http://localhost:5665> and write down:

- the VU level where **p95 jumps** or **errors start** (degradation point)
- whether **req/s stops rising** while VUs keep rising (saturation)
- which container's **CPU hits ~100%** in `docker stats` (the bottleneck)
- in the last stage (20 VUs), **how many seconds** until response time is
  back to normal (recovery time)

If the run aborts on the 30% error rule, that's a valid result too: write
down the VU level where it happened.

## Step 10 (bonus): Scalability test

Give Postgres a different amount of CPU and repeat the same load test. Find
the container name first:

```bash
docker ps --format "{{.Names}}"
```

Then, for each configuration (replace `<db>` with the `supabase_db_...` name):

```bash
docker update --cpus 1 --memory 2g --memory-swap 2g <db>
```

```bash
docker compose -f perf/docker-compose.yml run --rm --service-ports -e RUN_NAME=scale-1cpu -e VUS=150 k6 run /scripts/load-test.js
```

Repeat with `--cpus 2` (`scale-2cpu`) and `--cpus 4` (`scale-4cpu`). Use a
load that's heavy enough to stress 1 CPU; 150 VUs is a starting point, so
pick it from what you saw in the stress test. Then:

```
scaling efficiency (n) = (throughput_n / throughput_1) / n × 100%
```

Postgres might not be the bottleneck. If PostgREST is the busiest
container instead, limit `supabase_rest_...` the same way. Either way, it's
a finding for the report. To remove the limits afterwards, run
`npx supabase stop` and then `npx supabase start`.

## Step 11: Reset between runs

Every test adds batches, so reset to the same starting data before each
measured run:

```bash
npx supabase db reset
```

```bash
docker compose -f perf/docker-compose.yml run --rm k6 run /scripts/setup-admin.js
```

Then run `perf/seed_perf.sql` again (step 4). A reset also deletes the
admin user, which is why `setup-admin` runs again.

When you're done for the day:

```bash
npx supabase stop
```

---

## Filling in the report template

**Section E (one row per run).** Take the numbers from `results/<run>-row.txt`:

| Template column | Where it comes from |
|---|---|
| Users | `Max virtual users` |
| p50 / p95 (ms) | `HTTP request p50/p95`. Also mention dashboard-load p95 in the analysis, since that's what the user waits for |
| RPS/TPS | `Throughput` (req/s) |
| Error (%) | `Error rate` |
| CPU/RAM | Peak of `supabase_db_*` and `supabase_rest_*` in `<run>-docker-stats.csv` |

**Section F (analysis).** Some hints for reading the results, from slide 11:

- p95 high and DB CPU high: expensive queries. Candidates include the RLS
  check `is_admin()` running for every row, and `select *` over
  all items.
- p95 high but CPU low: look at the connection pool or locks, for example
  `save_batch` and `save_box` using `for update`.
- Throughput flat while VUs rise: saturation, so name the container.
- Dashboard load gets slower as `items` grows, because every page load
  downloads every table. This is a design finding, and a recommendation
  could be pagination or per-page queries.

**Limitations to state honestly.** This is a local replica, so there's no
internet latency, and absolute numbers will be lower than production.
k6 runs on the same laptop and uses CPU too: check that the `perf-k6-run`
container in `docker stats` isn't near 100%. One shared login token is used
for all virtual users, so login isn't load tested. Photo uploads to
Storage aren't tested.

## Troubleshooting

| Problem | Fix |
|---|---|
| `Cannot connect to the Docker daemon` | Start Docker Desktop and wait for *Engine running* |
| `npx supabase start` fails on a port | Something else uses 5432x. Stop other Supabase projects (`npx supabase stop --all`) |
| `ANON_KEY is empty` | Fill in `perf/.env` (step 2) |
| `Login failed (400)` | Run `setup-admin.js` (step 3), or reset and run it again (step 11) |
| `No customers visible` | The user isn't an admin. Run `setup-admin.js` again |
| `connection refused` / `dial tcp` | `SUPABASE_URL` must be `http://host.docker.internal:54321`, and Supabase must be running (`npx supabase status`) |
| `429 Too Many Requests` on login | You ran too many tests in 5 minutes. Wait a few minutes |
| Laptop freezes during the stress test | Press Ctrl+C. Lower the top stages in `k6/stress-test.js` (e.g. stop at 200) and note that the laptop limit was reached |
