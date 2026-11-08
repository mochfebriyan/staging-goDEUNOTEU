# Customer Dashboard — Functional Requirements & IPO (draft for PRD v2.1)

Reference UI: gobychona.store/id (reviewed 8 Nov 2026, signed out). Data source: the GO DEUNOTEU
MVP (`supabase/migrations/0001_init.sql`, `src/lib/calc.ts`, `src/types.ts`).

Scope: Landing page, Order → Bayar Batch, Order → Kalkulator Harga, Tagihan → Tagihan EMS & Pajak.
Out of scope (present on the reference site, no DEUNOTEU counterpart): Form Pre-Order, Kalkulator
Jasa, Pelunasan DCO, Pair Member, Layanan, PayPal/USD payment, testimonial submission, Chona Coin.

Labelling convention used in the "Requirement" column:
- **Backed by MVP** — the table/column/RPC already exists; the customer page only has to read or call it.
- **Needs build** — no backend support yet; a schema or RPC change is required before acceptance.

---

## 0. Data mapping — customer field ↔ admin dashboard source

Every value a customer sees or submits must come from (or write to) the same record the admin sees.

| Customer-facing field | MVP source (table.column / function) | Where the admin sees / sets it |
|---|---|---|
| Customer identity ("DN Line") | `customers.name`, `customers.avatar_url`; linked by `customers.auth_user_id` / `customers.line_user_id` | Customer combobox in Feature A batch form |
| Batch number, order type | `batches.batch_number`, `batches.order_type` (ReqShare / Admin / Persod) | FR-GO-A-001 |
| Batch photos | `batch_photos.storage_path` (public bucket `batch-photos`) | FR-GO-A-007 |
| Items in a batch bill | `items` where `batch_id` = bill's batch **and** `customer_id` = signed-in customer: `tipe_barang`, `tipe_kartu`, `price_idr` | FR-GO-A-001 / A-006 detail |
| Batch bill total | `batch_bills.total` (= sum of that customer's `items.price_idr` + `upnotes_total`) | FR-GO-A-004 |
| Batch bill status | `batch_bills.status`: Belum Bayar / Menunggu Konfirmasi / Lunas | FR-GO-A-005 / A-006 |
| Shipping position | `batches.order_status`: Dibeli dari Seller → Di WH Jepang → Dikirim ke Indonesia → Di Bea Cukai → Di WH Indonesia → Selesai (driven by `boxes.status`) | FR-GO-B-003 |
| Payment method | enum `payment_method`: QRIS, Shopeepay, DANA, GoPay, BCA, SeaBank → `*_bills.payment_method` | Shown read-only in A-005 / C-003 |
| Proof of transfer | Storage `bukti-transfer/<customers.id>/<file>` → `*_bills.bukti_transfer_path`, `bukti_transfer_file_name`, `bukti_transfer_uploaded_at` | Proof viewer in A-005 / C-003 |
| Submit payment | RPC `submit_payment_proof(p_kind 'batch'\|'tax', p_bill_id, p_path, p_file_name, p_method)` → status Menunggu Konfirmasi | Appears as pending in Overview "Perlu Perhatian" |
| Paid date (batch) | `batch_bills.paid_at` (set on admin Confirm) | A-005 |
| Tax bill box | `tax_bills.box_id` → `boxes.box_number` | FR-GO-C-004 |
| Items covered by a tax bill | `items.tax_bill_id` = bill id (grouped by `batches.batch_number`) | C-001 preview / C-004 detail |
| Card tax line | `tax_bills.kartu_count` × Rp5,000 = `tax_bills.kartu_tax` | C-001 |
| Non-card tax line | `tax_bills.non_kartu_weight_grams`, `tax_bills.non_kartu_share` | C-001 |
| Product tax | `tax_bills.total` (may be an admin override, C-006) | C-006 |
| Late fee | `tax_bills.late_fee_idr` (admin-entered, never computed) | C-005 |
| Amount payable (tax) | `tax_bills.total + tax_bills.late_fee_idr` | C-004 detail |
| Deadline / published | `tax_bills.deadline`, `tax_bills.published_at` | C-002 / C-004 |
| Estimator settings | `estimator_config.exchange_rate`, `service_fee_type`, `service_fee_value`, `updated_at` (readable by anyone) | FR-GO-D-001 |
| Estimate formula | `calculateEstimate()` in `src/lib/calc.ts` | FR-GO-D-002 preview |
| Customer notifications | `notifications` rows created by trigger `notify_bill_change` (types: batch_bill_published, tax_bill_published, payment_confirmed, payment_rejected) | Generated automatically by admin actions |

---

## Customer Landing Page

| Requirement ID | User Story | Requirement | Acceptance Criteria |
|---|---|---|---|
| FR-GO-L-001 | As a Customer, I want to understand what GO DEUNOTEU is so that I can decide to join an order. | Show a hero section (GO name, short value statement: Aikatsu items bought from Mercari Japan, transparent costs, self-service order tracking), a featured-batch or call-to-action card, and operational highlights. **Copy and figures are static content maintained by Admin GO**; no MVP table backs them. | Hero, value statement and CTA render without sign-in. Any statistic (orders completed, year founded, rating) has an identified owner and source; no number is shown that cannot be justified. Branding uses one name (GO DEUNOTEU) consistently. |
| FR-GO-L-002 | As a Customer, I want to contact the right admin so that I can ask about an order. | Show an "About" section and admin contact cards (name, role, LINE contact link) plus GO social links. **Static content.** | Each "Hubungi" link opens the correct LINE profile or group in a new tab. Links are reachable and contain no personal phone number unless Admin GO approves it. |
| FR-GO-L-003 | As a Customer, I want to navigate to the service I need from any page. | Provide persistent navigation with **Home**, **Order** (`?tab=order`) and **Tagihan** (`?tab=tagihan`). The Order tab lists **Bayar Batch** and **Kalkulator Harga**; the Tagihan tab lists **Tagihan EMS & Pajak**. Tabs that DEUNOTEU does not offer (Form Pre-Order, Kalkulator Jasa, Pelunasan DCO, Pair Member, Layanan) are not shown. | Each tab updates the URL and survives reload. Each menu tile opens the matching page; Back from that page returns to the tab it came from. No tile leads to a missing page. |
| FR-GO-L-004 | As a Customer, I want to see where my items are without asking an admin. | On the Tagihan tab show a "Posisi barang kamu" tracker using the six `order_status` stages (Dibeli dari Seller, Di WH Jepang, Dikirim ke Indonesia, Di Bea Cukai, Di WH Indonesia, Selesai). Signed out: show the stages with explanations only. Signed in: highlight the stage of each of the customer's batches. **Backed by MVP** (`batches.order_status`, RLS "customer reads own batches"). | Stage labels match the admin dashboard exactly. A signed-in customer sees only batches containing their items. When admin changes a box status, the customer's tracker shows the new stage after reload. The explanatory note states the tax rule actually enforced (see FR-GO-2-005) and no fine rule that the system does not record. |
| FR-GO-L-005 | As a Customer, I want to know about new bills so that I don't miss a deadline. | Signed in: show an unread indicator and list from `notifications` (new batch bill, new tax bill, payment confirmed, proof rejected); allow marking as read. **Backed by MVP** (table + trigger exist). Browser/phone push notifications are **Needs build** and future scope. | A new batch save, tax publication, confirm or reject by admin creates one notification for the affected customer only. Marking as read sets `read_at`. A permission prompt for push is not shown until push delivery exists. |

### Shared customer access and payment behaviour

| Requirement ID | User Story | Requirement | Acceptance Criteria |
|---|---|---|---|
| FR-GO-PAY-001 | As a Customer, I want to sign in so that my bills can be identified. | Provide a "Masuk" action that opens a login modal with **LINE Login only** (per the auth design; the reference site's X and Discord options are excluded), plus "Lihat-lihat dulu" to continue signed out. After login, match the session to `customers.auth_user_id` / `line_user_id`. **Backed by MVP** for matching and RLS; the LINE provider setup is **Needs build**. | Successful login shows the customer's `customers.name` and avatar in the identity card ("DN Line"). A LINE account with no matching customer row sees "Akun belum terhubung — hubungi admin", not an empty bill list. Closing the modal keeps the current page. Sign-out clears all private data from the screen. |
| FR-GO-PAY-002 | As a Customer, I want to pick how I pay so that I get the right instructions. | After a bill is selected, show the payment methods from the `payment_method` enum (QRIS, Shopeepay, DANA, GoPay, BCA, SeaBank) with their instructions (account number / QRIS image). **Needs build:** the MVP has no admin-maintained source for these instructions (`batch_bills.bank_account` is a legacy default); add one before release. | Before selection the panel shows "Pilih … dulu" and no instructions. Exactly one method can be chosen. The chosen method is saved to `*_bills.payment_method` and appears unchanged in the admin proof viewer. Methods not allowed for a bill type (e.g. if tax is QRIS-only) are hidden. |
| FR-GO-PAY-003 | As a Customer, I want to upload proof of transfer for the bill I am paying. | Required image upload (`image/*`, one file, max size agreed — e.g. 5 MB) stored at `bukti-transfer/<customers.id>/<file>`. Submission calls `submit_payment_proof(kind, bill_id, path, file_name, method)`. **Backed by MVP.** | Submit is disabled until a bill, a method and a file are chosen. Files over the limit or of the wrong type are rejected with a message before upload. On success the bill shows **Menunggu Konfirmasi** and the same file, name, method and upload time appear in the admin dashboard (A-005 / C-003). A second submission on the same bill is refused while it is pending or paid. |
| FR-GO-PAY-004 | As a Customer, I want to know the result of my payment review. | Reflect admin decisions: Confirm → **Lunas**; Reject → **Belum Bayar** with the proof removed and a "Bukti ditolak, silakan upload ulang" message. **Backed by MVP** (`confirmBill`, `rejectBill`, notification trigger). | After admin Confirm the bill shows Lunas (batch: with `paid_at`). After Reject the bill returns to Belum Bayar, proof and method are empty, and upload is possible again. Status shown to the customer always equals the status in the admin dashboard. |

---

## Customer Feature 1 — Bayar Batch (Order → Bayar Batch, `/id/order`)

| Requirement ID | User Story | Requirement | Acceptance Criteria |
|---|---|---|---|
| FR-GO-1-001 | As a Customer, I want to see my unpaid batch bills in one place. | Show "Tagihan belum dibayar" listing the signed-in customer's `batch_bills` (RLS "customer reads own batch_bills"). Signed out: show the login prompt and an empty state "Masuk untuk melihat tagihanmu." **Backed by MVP.** | Signed out, no private data is requested or shown. Signed in, the list contains exactly one row per batch in which the customer has items, matching the admin's bill list for that customer. Bills with a Rp0 total (customer removed from batch) are hidden. |
| FR-GO-1-002 | As a Customer, I want to narrow the list to what I need to act on. | Provide filter chips for payment status (Semua, Belum Bayar, Menunggu Konfirmasi, Lunas) and order type (ReqShare, Admin, Persod) — the DEUNOTEU equivalent of the reference site's category chips. | Each chip shows only matching bills and an empty state when none match. Counts equal the number of the customer's bills in that state. |
| FR-GO-1-003 | As a Customer, I want to check what I am paying for. | Each bill card shows `batch_number`, order type, batch photo(s), the customer's items (`tipe_barang`, `tipe_kartu` for Kartu, `price_idr`), the bill total, status, and current shipping stage (`order_status`). | Item rows and prices equal the admin batch detail for that customer. Other customers' items in the same batch are never shown. The card total equals `batch_bills.total` and the sum of the listed item prices (plus upnotes if any). |
| FR-GO-1-004 | As a Customer, I want to review the payment summary before paying. | Selecting one bill fills the payment panel: "Batch: <batch_number>", Rincian Pembayaran (item subtotal, upnotes if non-zero), Total Pembayaran, Metode Pembayaran (FR-GO-PAY-002), Upload Bukti Transfer (FR-GO-PAY-003), submit button. Before selection: Rp0 and "Pilih batch dulu". One bill per submission, because `submit_payment_proof` takes one bill id. | Total Pembayaran equals `batch_bills.total`. Selecting a Menunggu Konfirmasi or Lunas bill shows its status and proof read-only and hides the upload. Paying several batches with one transfer is not offered unless a multi-bill RPC is built (**Needs build**, out of MVP). |
| FR-GO-1-005 | As a Customer, I want to submit proof for a batch bill. | Apply FR-GO-PAY-002–004 with `p_kind = 'batch'`. | After submit the card moves to Menunggu Konfirmasi; the admin Overview shows "Bukti transfer menunggu konfirmasi — <customer> (<batch>)". Confirm/Reject by admin is reflected per FR-GO-PAY-004. |
| FR-GO-1-006 | As a Customer, I want to see my payment history. | Show Lunas bills (collapsed or in the Lunas filter) with paid date (`paid_at`) and payment method. | Paid bills show the date and method recorded by admin confirmation. |
| FR-GO-1-007 | As a Customer, I want to return to the order menu. | Back action returns to `/id?tab=order`. | Back from `/id/order` lands on the Order tab. An unsent file and selection are cleared, with a warning if a file was chosen. |

## Customer Feature 3 — Kalkulator Harga (Order → Kalkulator Harga, `/id/calculator`)

| Requirement ID | User Story | Requirement | Acceptance Criteria |
|---|---|---|---|
| FR-GO-3-001 | As a Customer, I want to estimate an item's price before I commit. | Show the calculator to everyone; **no login required**, since `estimator_config` is publicly readable (the reference site requires login — not adopted). Origin is fixed to **Jepang (JPY)**; the reference site's Korea/China/Thailand/Philippines options and Album/Photocard/Digital types are excluded. | The page loads and calculates without sign-in. Only JPY input is offered. |
| FR-GO-3-002 | As a Customer, I want the current rate shown so that I trust the estimate. | Show "Kurs aktif ¥1 = Rp <exchange_rate>" and the last-update date from `estimator_config.updated_at`. | Values equal the admin's "Konfigurasi Aktif" (FR-GO-D-001). After admin saves a new rate, a reload shows the new rate. Unsaved admin form values never appear here. |
| FR-GO-3-003 | As a Customer, I want to enter the item price easily. | Price input in JPY (numeric keypad with 0–9, 000 and delete on mobile; a normal number field on desktop). Non-negative whole yen only. | Invalid or empty input shows "Rp —" and a hint, not Rp0 or NaN. |
| FR-GO-3-004 | As a Customer, I want to see the full breakdown. | Show Harga produk (JPY × rate), Service fee (flat IDR, or % of product price, per `service_fee_type`/`service_fee_value`), Estimasi pajak, and Total estimasi. **Use the same `calculateEstimate()` function as the admin preview** so the two can never diverge. | For the same JPY input the customer total equals the admin preview total (e.g. ¥1,000 at rate 105 and 10 % fee → Rp105,000 + Rp10,500 = Rp115,500). The tax line follows the decision on the estimator tax rule (currently 7.5 % above Rp3,000,000 in `calc.ts`, not documented in the PRD) — **decide before release**. |
| FR-GO-3-005 | As a Customer, I want to know the estimate is not final. | Always show: estimate is not final; actual tax is calculated per box after customs; domestic shipping not included; contact admin for a firm price. | Disclaimer is visible whenever a total is shown. The reference site's "jumlah barengan" (shared local shipping) is not shown, because DEUNOTEU has no local-shipping setting. |

## Customer Feature 2 — Tagihan EMS & Pajak (Tagihan → Tagihan EMS & Pajak, `/id/ems-tax`)

| Requirement ID | User Story | Requirement | Acceptance Criteria |
|---|---|---|---|
| FR-GO-2-001 | As a Customer, I want a page for my tax bills separate from batch bills. | Show "Tagihan pajak EMS" listing the signed-in customer's `tax_bills` (RLS "customer reads own tax_bills"), one per box. Signed out: login prompt and empty state. **Backed by MVP.** Note: the MVP tax bill contains customs tax only; **EMS shipping cost is not modelled**, so the page title must not promise an EMS shipping charge unless that is built. | Signed in, the list has exactly one row per box in which the admin published a bill for this customer — same count as the admin's Tax Bills detail for that customer. |
| FR-GO-2-002 | As a Customer, I want to identify which items a tax bill covers. | Each tax bill shows `boxes.box_number`, the batches and items it covers (`items.tax_bill_id`, grouped by `batch_number`), `published_at`, and status. The reference site's "Batch: —" line becomes "Box: BOX-xxx · Batch: BATCH-xx, BATCH-yy". | Listed items equal the items the admin's allocation used for this customer in that box. No other customer's items or amounts are visible. |
| FR-GO-2-003 | As a Customer, I want to understand how my tax was calculated. | Show Rincian Pembayaran: Kartu `kartu_count` × Rp5,000 = `kartu_tax`; Non-kartu `non_kartu_weight_grams` g → `non_kartu_share`; **Pajak produk** = `total`; **Denda telat** = `late_fee_idr` (only if > 0); **Total Pembayaran** = `total + late_fee_idr`. If the admin overrode `total` (C-006), show the final amount and do not imply the breakdown adds up to it. | Total Pembayaran equals the amount payable in the admin box detail for that customer, to the rupiah. Late fee shown equals the admin-entered value; no per-day fine is calculated on this page. |
| FR-GO-2-004 | As a Customer, I want to see when my tax is due. | Show `deadline` (Asia/Jakarta, same date and time format as the admin) and an urgency badge using the admin rules: "≤ 2 hari lagi" when two days or fewer remain, "Terlambat" when the deadline has passed and the bill is not Lunas. | When admin edits the box deadline, the customer sees the new deadline after reload. Badge state equals the admin DeadlineBadge for the same bill. |
| FR-GO-2-005 | As a Customer, I want to know when I can pay tax. | The reference site states tax can be paid once the batch is fully paid. **Needs build:** the MVP does not enforce this. Decide the rule; if adopted, block tax submission unless every `batch_bills` row of this customer in that box's batches is Lunas, enforced inside `submit_payment_proof` (not only in the UI), and show which batch bill is still unpaid. | With the rule on: a customer with an unpaid batch bill in the box cannot submit, sees the blocking batch, and a direct RPC call is also refused. With the rule off: the page does not display the sentence. |
| FR-GO-2-006 | As a Customer, I want to submit proof for a tax bill. | Apply FR-GO-PAY-002–004 with `p_kind = 'tax'`. Payment methods follow the agreed tax policy (admin template currently says QRIS only). Late fee may only change while the bill is Belum Bayar (C-005), so the payable amount is frozen once proof is submitted. | After submit the bill shows Menunggu Konfirmasi and the admin Tax Bills page shows the same proof, method and time. Confirm → Lunas; Reject → Belum Bayar with proof cleared. |
| FR-GO-2-007 | As a Customer, I want to return to the billing menu. | Back action returns to `/id?tab=tagihan`. | Back from `/id/ems-tax` lands on the Tagihan tab; unsent file and selection are cleared. |

---

## Input, Process, Output

| Req. ID | Input | Process | Output |
|---|---|---|---|
| FR-GO-L-001 | Page visit | Render static hero, highlights and CTA | Landing hero and CTA |
| FR-GO-L-002 | Click on Hubungi / social icon | Open configured LINE/social URL | External contact page in a new tab |
| FR-GO-L-003 | Tab or menu tile selection | Update `?tab=` and route to the selected page | Order or Tagihan menu; target page |
| FR-GO-L-004 | Session (optional); `batches.order_status` of own batches | Map each batch to one of six stages | Tracker with explanations, highlighted per batch when signed in |
| FR-GO-L-005 | Session; `notifications` rows; mark-as-read action | Read own notifications; set `read_at` | Unread badge and notification list |
| FR-GO-PAY-001 | LINE login; "Lihat-lihat dulu" | Authenticate via LINE; match `customers.auth_user_id` / `line_user_id` | Identity card (name, avatar), or "akun belum terhubung", or signed-out view |
| FR-GO-PAY-002 | Selected bill; chosen payment method | Load allowed methods and instructions | Method instructions; method kept for submission |
| FR-GO-PAY-003 | Selected bill, method, image file | Validate type/size; upload to `bukti-transfer/<customer_id>/`; call `submit_payment_proof` | Bill = Menunggu Konfirmasi with proof, method, upload time (visible to admin) |
| FR-GO-PAY-004 | Admin Confirm / Reject on the bill | Update status; clear proof on reject; create notification | Lunas (with `paid_at` for batch) or Belum Bayar with re-upload enabled |
| FR-GO-1-001 | Session | Read own `batch_bills` (exclude Rp0 orphans) | Unpaid-bill list or login/empty state |
| FR-GO-1-002 | Status / order-type chip | Filter own bills | Filtered list with counts or empty state |
| FR-GO-1-003 | Bill selection / expansion | Read batch, photos and own `items` for that batch | Bill card: batch, type, photos, items, total, status, shipping stage |
| FR-GO-1-004 | One selected `batch_bills` row | Compute display breakdown from items and `total` | Payment panel with batch number and Total Pembayaran |
| FR-GO-1-005 | Bill, method, proof file | `submit_payment_proof('batch', …)` | Menunggu Konfirmasi; admin pending alert |
| FR-GO-1-006 | Lunas filter | Read paid bills with `paid_at`, `payment_method` | Payment history |
| FR-GO-1-007 | Back action | Navigate; clear unsent state | Order tab |
| FR-GO-3-001 | Page visit (no login) | Read `estimator_config` | Calculator with JPY origin |
| FR-GO-3-002 | — | Read `exchange_rate`, `updated_at` | "Kurs aktif ¥1 = Rp …" and update date |
| FR-GO-3-003 | JPY price via keypad/field | Validate non-negative whole number | Valid price or hint |
| FR-GO-3-004 | JPY price; saved config | `calculateEstimate(priceJpy, config)` | Harga produk, service fee, estimasi pajak, total |
| FR-GO-3-005 | Any computed total | — | Non-final / excludes domestic shipping disclaimer |
| FR-GO-2-001 | Session | Read own `tax_bills` | One tax bill per box, or login/empty state |
| FR-GO-2-002 | Tax bill selection | Read `boxes.box_number`, own `items` with `tax_bill_id`, their `batch_number` | Box, batches and items covered; published date; status |
| FR-GO-2-003 | Selected tax bill | Payable = `total + late_fee_idr` | Card tax, non-card share, product tax, late fee, Total Pembayaran |
| FR-GO-2-004 | `deadline`, current time | Days remaining (Asia/Jakarta); urgency rule | Deadline and badge (≤ 2 hari / Terlambat) |
| FR-GO-2-005 | Own batch bills in the box | Check all Lunas (in RPC if rule adopted) | Submission allowed, or blocked with the unpaid batch named |
| FR-GO-2-006 | Tax bill, method, proof file | `submit_payment_proof('tax', …)` | Menunggu Konfirmasi; admin pending alert; Lunas / Belum Bayar after review |
| FR-GO-2-007 | Back action | Navigate; clear unsent state | Tagihan tab |

---

## Gaps to close before these requirements can pass UAT

1. **LINE Login provider** — not configured; customer ↔ `customers` linking (FR-GO-PAY-001).
2. **Payment instructions source** — no admin-maintained account numbers / QRIS image per method (FR-GO-PAY-002).
3. **Tax-after-batch-paid rule** — stated on the reference site, not enforced in `submit_payment_proof` (FR-GO-2-005).
4. **EMS shipping cost** — not part of `tax_bills`; rename the page to "Tagihan Pajak" or add an EMS component (FR-GO-2-001).
5. **Estimator tax line** — hidden 7.5 %-above-Rp3,000,000 rule in `calc.ts` must be confirmed or removed (FR-GO-3-004).
6. **Rp0 orphan batch bills** — must be hidden or deleted so customers don't see empty bills (FR-GO-1-001).
7. **Proof file limits** — max size and accepted subtypes are not defined anywhere (FR-GO-PAY-003).
8. **Push notifications** — only the in-app `notifications` table exists (FR-GO-L-005).
