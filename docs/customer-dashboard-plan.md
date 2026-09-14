# Rencana Pengembangan: Customer Dashboard & Backend

> Draft perencanaan, bukan spesifikasi final. Dibuat dari analisis langsung
> ke source code (`src/types.ts`, `src/store/useStore.ts`, seluruh
> `src/pages`/`src/components`) dan ke backend yang sudah di-scaffold
> (`supabase/migrations/0001_init.sql`, `README.md`, `src/lib/supabaseClient.ts`).

## TL;DR — temuan penting sebelum baca lebih lanjut

Sebagian besar pertanyaan arsitektur yang kita diskusikan (LINE SSO, upload
bukti bayar, notifikasi in-app) **sudah punya jawaban** di
`supabase/migrations/0001_init.sql` dan `README.md` — bukan hal baru yang
perlu didesain dari nol. Tapi migration itu ditulis **sebelum** kerjaan Box
Management (Part 2, `boxId` migration) dan late fee di sesi ini, jadi
sekarang sudah **tidak sinkron** dengan `src/types.ts` yang sekarang.
Prioritas pertama sebelum lanjut ke customer dashboard adalah
menyinkronkan migration ini dulu, bukan langsung nulis kode baru.

---

## 1. Yang sudah ada (dan sudah benar)

Backend ini masih "scaffolded, not yet wired up" (istilah dari README-nya
sendiri) — skema SQL dan rencana auth-nya sudah ditulis, tapi
`src/lib/supabaseClient.ts` belum dipanggil dari mana pun. Semua halaman
Admin Dashboard masih jalan 100% di atas Zustand + `localStorage`.

Yang sudah terjawab di `0001_init.sql` + README:

- **Auth**: dua metode terpisah, tanpa SSO bersama.
  - Admin: email/password biasa via Supabase Auth, akun dibuat manual
    (bukan public sign-up).
  - Customer: **LINE Login only**, lewat `signInWithIdToken()` — LINE
    didaftarkan sebagai custom OIDC provider di Supabase. `profiles.line_user_id`
    nyimpen `sub` claim dari LINE, `full_name`/`avatar_url` di-seed dari
    profil LINE tiap login (sesuai concern kamu soal display name).
  - Satu tabel `profiles` (bukan dua tabel terpisah `admins`/`customers`)
    yang extend `auth.users`, dibedakan lewat kolom `role` + constraint
    yang mastiin baris LINE-customer dan admin-website nggak pernah campur.
- **Upload bukti bayar**: sudah didesain nggak nyimpen file di database —
  cuma nyimpen path-nya (`bukti_transfer_path`) ke Supabase Storage bucket
  (`bukti-transfer`, plus `batch-photos` buat foto produk Admin). Persis
  konsep yang kamu mau: "foto yang ditaro customer bisa diakses admin,
  sama kayak foto batch yang ditaro admin bisa dilihat customer" — dua-duanya
  lewat mekanisme Storage yang sama, cuma beda bucket & siapa yang boleh upload.
- **Notifikasi in-app**: tabel `notifications` sudah ada, dengan kolom
  `type` (enum: `batch_bill_published`, `tax_bill_published`,
  `payment_confirmed`, `payment_rejected`) dan `reference_id` yang nunjuk
  ke `batch_bills.id` atau `tax_bills.id`.
- **Row Level Security**: customer cuma bisa baca baris miliknya sendiri
  (`customer_id = auth.uid()`), Admin akses penuh ke semua tabel. Ini yang
  jawab concern "customer dashboard boleh baca apa aja" dari diskusi kita
  sebelumnya.

---

## 2. Yang perlu disinkronkan dulu (schema drift)

Migration ini ditulis sebelum fitur Box Management (Part 2) dan late fee
selesai. Berikut daftar konkret yang beda antara `0001_init.sql` dan
`src/types.ts` yang sekarang:

| Area | Di migration SQL | Di `src/types.ts` sekarang | Aksi |
|---|---|---|---|
| Box | **Tidak ada tabel `boxes`** — `batches.box_number` & `tax_bills.box_number` cuma teks lepas | Ada entity `Box` penuh (`id`, `boxNumber`, `batchIds`, `status`), dan `Batch`/`TaxBill` sudah pakai `boxId` (FK stabil, bukan string) — ini persis migrasi yang baru saja kita kerjakan sesi ini | Tambah tabel `boxes`, ganti `box_number` → `box_id uuid references boxes(id)` di kedua tabel |
| Late fee | Tidak ada kolom | `tax_bills.lateFeeIDR: number` | Tambah kolom `late_fee_idr numeric` ke `tax_bills` |
| `batch_bill_status` enum | `'Belum Lunas'`, `'Menunggu Konfirmasi'`, `'Lunas'` | `'Belum Bayar'`, `'Menunggu Konfirmasi'`, `'Lunas'` | Ganti nilai enum-nya |
| `order_status` enum | Masih ada `'Menunggu Pembayaran ke Seller'` | Sudah dihapus — batch sekarang mulai dari `'Dibeli dari Seller'` | Hapus nilai lama dari enum |
| `order_type` enum | `('Persod', 'Group Order', 'Admin')` | `('ReqShare', 'Admin', 'Persod')` | `'Group Order'` → `'ReqShare'` |
| `payment_method` | **Tidak ada kolom sama sekali** di `batch_bills`/`tax_bills` | `BuktiTransfer.paymentMethod` dipakai & ditampilkan di UI | Tambah kolom `payment_method` enum ke kedua tabel bill |
| `items.price_jpy` | Ada, `not null` | Tidak ada di `Item` — cuma `priceIDR` yang disimpan | Perlu diputuskan: apakah harga JPY mentah memang mau disimpan per item, atau memang sengaja cuma hasil konversi IDR yang disimpan? Cek ulang ke alur Estimator dulu. |

---

## 3. Yang masih jadi pertanyaan terbuka

1. **Item ↔ Tax Bill**: `items.batch_bill_id` sudah jadi FK eksplisit ke
   `batch_bills`, tapi `tax_bills` tidak punya kolom setara — hubungannya
   cuma implisit lewat `box_id` + `customer_id`. Ini persis kekhawatiran
   yang aku angkat waktu bahas ERD kemarin: kalau publish tagihan pajak per
   box itu bisa dilakukan bertahap (nggak sekaligus semua item di box),
   maka butuh kolom/tabel penghubung eksplisit juga di sisi tax bill.
   Perlu dicek ke `TaxCalculationForm` sebelum diputuskan nambah kolom
   atau tidak.
2. **Riwayat & ongoing order** (dari instruksi terakhir kamu: cukup daftar
   dulu, belum butuh detail): ini nggak butuh tabel baru — cukup query
   `items`/`batch_bills`/`tax_bills` di-filter `customer_id = auth.uid()`,
   dipisah "selesai" vs "masih berjalan" berdasarkan `status`/`order_status`.
   Kalau nanti "ongoing order" mau ditampilkan lebih detail (progress bar
   per tahap pengiriman, dst), baru dipikirkan ulang — untuk sekarang cukup.

## 4. Konfirmasi: yang TIDAK perlu ditambah (in scope tetap sempit)

Karena LINE tetap dipakai sebagai media komunikasi dan Shopee buat
pengiriman tahap akhir:

- ❌ Tabel `messages`/`support_tickets` — komunikasi tetap di LINE, di luar sistem.
- ❌ Tabel alamat pengiriman customer — pengiriman akhir ditangani Shopee, bukan sistem ini.
- ❌ Tabel `bill_status_history` (audit trail detail) — riwayat cukup daftar, bukan timeline perubahan status. Bisa ditambah nanti kalau dibutuhkan, tidak sekarang.

---

## 5. Roadmap kerja (urutan yang disarankan)

1. **Sinkronkan `0001_init.sql`** dengan `src/types.ts` sekarang (lihat
   tabel drift di atas) — termasu tambah tabel `boxes`, kolom
   `late_fee_idr`, kolom `payment_method`, dan perbaikan nilai enum.
2. **Setup project Supabase beneran** (belum ada — masih stub) — bikin
   project, jalankan migration yang sudah disinkronkan, bikin storage
   bucket (`batch-photos`, `bukti-transfer`) + policy-nya, isi `.env` dari
   `.env.example`.
3. **Daftarkan LINE Login sebagai custom OIDC provider** di Supabase
   (channel LINE Developers Console → Supabase Auth settings) — bisa
   dikerjakan paralel sama langkah di atas.
4. **Sambungkan Admin Dashboard ke Supabase** — ganti isi tiap action di
   `useStore.ts` dari mutasi lokal jadi query Supabase. Ini kerjaan besar
   karena nyentuh semua halaman, tapi nggak perlu desain ulang UI — cuma
   ganti "sumber data"-nya.
5. **Bangun Customer Dashboard sebagai app/route baru** — belum ada satu
   pun halaman customer di `src/pages` sekarang (dicek: routing di
   `App.tsx` cuma ada 5 route, semuanya Admin). Fitur intinya sesuai
   yang kamu sebutkan:
   - Login LINE
   - Lihat & upload bukti bayar (batch bill & tax bill)
   - Riwayat batch bill & tax bill (daftar aja)
   - Price Estimator (read-only dari `estimator_config`)
   - Ongoing order (subset dari riwayat, status belum selesai)
   - Notifikasi in-app (baca dari tabel `notifications`, tandai sudah dibaca)
6. **Uji end-to-end** alur "Admin publish tagihan → customer dapat
   notifikasi → customer upload bukti bayar → Admin lihat & konfirmasi di
   dashboard-nya" — ini alur yang paling penting untuk dipastikan jalan
   mulus di kedua sisi sebelum dianggap selesai.

---

## 6. Referensi

- `supabase/migrations/0001_init.sql` — skema SQL saat ini (perlu disinkronkan, lihat §2)
- `README.md` — rencana auth & cara connect Supabase project
- `src/lib/supabaseClient.ts` — client stub, belum dipanggil di mana pun
- `src/types.ts` — source of truth model data Admin Dashboard saat ini
