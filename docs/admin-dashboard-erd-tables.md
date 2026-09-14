# Dokumentasi Tabel — ERD Admin Dashboard

> Dokumentasi tiap tabel pada ERD Admin Dashboard (lihat `docs/customer-dashboard-plan.md`
> untuk konteks pengembangan lanjutan). Disusun langsung dari `src/types.ts`
> sebagai source of truth model data yang sudah berjalan di aplikasi,
> dipetakan ke tipe data relasional (Postgres/Supabase).

---

## 1. `customers`

Data customer. Belum ada field autentikasi — login/SSO baru direncanakan
untuk Customer Dashboard (lihat `docs/customer-dashboard-plan.md`).

| Field | Key | Tipe Data | Keterangan |
|---|---|---|---|
| `id` | PK | `uuid` | ID unik customer |
| `name` | - | `text` | Nama customer. Saat ini diisi manual oleh Admin; rencana ke depan disinkron dari display name LINE |

---

## 2. `boxes`

Unit pengiriman fisik yang membawa satu atau lebih batch dari WH Jepang →
Bea Cukai → WH Indonesia. Status box adalah satu-satunya sumber kebenaran
untuk status semua batch di dalamnya.

| Field | Key | Tipe Data | Keterangan |
|---|---|---|---|
| `id` | PK | `uuid` | ID unik box |
| `box_number` | - | `text` | Nomor box yang tampil ke Admin & customer (mis. `BOX-001`), unik. Ini nilai *display*, direferensikan lewat `id` oleh tabel lain — bukan dipakai sebagai join key |
| `status` | - | `text` (enum) | Status pengiriman box: `Di WH Jepang`, `Dikirim ke Indonesia`, `Di Bea Cukai`, `Di WH Indonesia`, `Selesai` |
| `created_at` | - | `timestamp` | Waktu box dibuat |
| `updated_at` | - | `timestamp` | Waktu terakhir box diubah (status, dst) |

---

## 3. `batches`

Satu batch = satu form recap order = satu invoice/link order ke seller.
Satu batch bisa berisi item dari beberapa customer.

| Field | Key | Tipe Data | Keterangan |
|---|---|---|---|
| `id` | PK | `uuid` | ID unik batch |
| `batch_number` | - | `text` | Nomor batch yang tampil ke Admin (mis. `BATCH-01`) |
| `box_id` | FK → `boxes.id` | `uuid`, nullable | Box tempat batch ini dikelompokkan. Nullable karena batch bisa dibuat dulu sebelum dimasukkan ke box mana pun |
| `order_id_wh` | - | `text` | ID order di warehouse (referensi ke seller) |
| `order_type` | - | `text` (enum) | `ReqShare`, `Admin`, atau `Persod` |
| `order_status` | - | `text` (enum) | Status pengiriman batch: `Dibeli dari Seller`, `Di WH Jepang`, `Dikirim ke Indonesia`, `Di Bea Cukai`, `Di WH Indonesia`, `Selesai`. Begitu batch masuk ke sebuah box, nilai ini selalu ikut status box-nya |
| `created_at` | - | `timestamp` | Waktu batch dibuat |
| `updated_at` | - | `timestamp` | Waktu terakhir batch diubah |

---

## 4. `batch_photos`

Foto produk yang dilampirkan Admin saat membuat batch. Dipisah dari
`batches` karena satu batch bisa punya banyak foto — kalau digabung jadi
satu kolom array, tidak bisa di-query/di-index dengan baik.

| Field | Key | Tipe Data | Keterangan |
|---|---|---|---|
| `id` | PK | `uuid` | ID unik foto |
| `batch_id` | FK → `batches.id` | `uuid` | Batch pemilik foto ini |
| `url` | - | `text` | Path/URL foto (idealnya path ke object storage, bukan base64 langsung di kolom) |
| `position` | - | `int` | Urutan tampil foto dalam carousel |

---

## 5. `items`

Unit produk terkecil — satu baris per barang yang dipesan satu customer
dalam satu batch. Ini tabel "produk" dalam sistem.

| Field | Key | Tipe Data | Keterangan |
|---|---|---|---|
| `id` | PK | `uuid` | ID unik item |
| `batch_id` | FK → `batches.id` | `uuid` | Batch tempat item ini dipesan |
| `customer_id` | FK → `customers.id` | `uuid` | Customer pemesan item ini |
| `tipe_barang` | - | `text` (enum) | `Kartu`, `Ganci`, `Binder`, `Boneka`, `Sleeve`, `Standee`, `Lainnya` |
| `tipe_kartu` | - | `text` (enum), nullable | Sub-tipe kartu (`Tops`, `Skirt`, `Shoes`, `Set`, `Accessories`, `Dress`) — wajib diisi kalau `tipe_barang = Kartu`, kosong untuk tipe lain |
| `price_idr` | - | `numeric` | Harga item dalam Rupiah |
| `weight_grams` | - | `numeric`, nullable | Berat item — diisi belakangan saat perhitungan pajak (Fitur C), kosong sebelum itu |
| `created_at` | - | `timestamp` | Waktu item dicatat |
| `updated_at` | - | `timestamp` | Waktu terakhir item diubah (mis. berat baru diisi) |

---

## 6. `batch_bills` — tagihan produk

Tagihan pembayaran produk per customer per batch. Dibuat otomatis begitu
item customer tersebut disimpan.

| Field | Key | Tipe Data | Keterangan |
|---|---|---|---|
| `id` | PK | `uuid` | ID unik tagihan |
| `batch_id` | FK → `batches.id` | `uuid` | Batch yang ditagih |
| `customer_id` | FK → `customers.id` | `uuid` | Customer yang ditagih |
| `upnotes_total` | - | `numeric` | Total biaya tambahan (upnotes), diisi manual oleh Admin |
| `bank_account` | - | `text` | Rekening tujuan pembayaran |
| `total` | - | `numeric` | Total tagihan (jumlah harga semua item milik customer ini di batch tsb + upnotes) |
| `status` | - | `text` (enum) | `Belum Bayar`, `Menunggu Konfirmasi`, `Lunas` |
| `bukti_transfer_url` | - | `text`, nullable | Path/URL bukti transfer yang diupload customer |
| `bukti_transfer_uploaded_at` | - | `timestamp`, nullable | Waktu bukti transfer diupload |
| `payment_method` | - | `text` (enum), nullable | Metode pembayaran yang dipilih customer (`QRIS`, `Shopeepay`, `DANA`, `GoPay`, `BCA`, `SeaBank`) |
| `paid_at` | - | `timestamp`, nullable | Waktu tagihan dikonfirmasi Lunas oleh Admin |
| `created_at` | - | `timestamp` | Waktu tagihan dibuat |

---

## 7. `tax_bills` — tagihan pajak

Tagihan pajak (EMS) per customer per box, dihitung & dipublikasikan
manual oleh Admin setelah semua item di box diketahui beratnya.

| Field | Key | Tipe Data | Keterangan |
|---|---|---|---|
| `id` | PK | `uuid` | ID unik tagihan pajak |
| `box_id` | FK → `boxes.id` | `uuid` | Box yang ditagih pajaknya |
| `customer_id` | FK → `customers.id` | `uuid` | Customer yang ditagih |
| `kartu_count` | - | `int` | Jumlah item bertipe Kartu milik customer ini di box tsb |
| `kartu_tax` | - | `numeric` | Total pajak flat dari item Kartu (`kartu_count` × tarif flat) |
| `non_kartu_weight_grams` | - | `numeric` | Total berat item non-Kartu milik customer ini |
| `non_kartu_share` | - | `numeric` | Bagian pajak proporsional dari item non-Kartu, dihitung dari berat |
| `total` | - | `numeric` | Total pajak produk (`kartu_tax` + `non_kartu_share`) — **belum termasuk denda telat** |
| `late_fee_idr` | - | `numeric`, default `0` | Denda telat, opsional, diisi bebas oleh Admin. Total tagihan yang harus dibayar customer = `total` + `late_fee_idr` |
| `status` | - | `text` (enum) | `Belum Bayar`, `Menunggu Konfirmasi`, `Lunas` |
| `bukti_transfer_url` | - | `text`, nullable | Path/URL bukti transfer yang diupload customer |
| `bukti_transfer_uploaded_at` | - | `timestamp`, nullable | Waktu bukti transfer diupload |
| `payment_method` | - | `text` (enum), nullable | Metode pembayaran yang dipilih customer |
| `deadline` | - | `timestamp` | Batas waktu pembayaran. Satu box selalu punya satu deadline yang sama untuk semua tagihan di dalamnya |
| `published_at` | - | `timestamp` | Waktu tagihan pajak dipublikasikan Admin |

---

## 8. `estimator_config` — konfigurasi Price Estimator

Tabel konfigurasi tunggal (satu baris saja) untuk parameter kalkulasi
estimasi harga.

| Field | Key | Tipe Data | Keterangan |
|---|---|---|---|
| `id` | PK | `integer`, tetap `1` | Dikunci ke nilai `1` supaya tabel ini selalu cuma satu baris (singleton) |
| `exchange_rate` | - | `numeric` | Kurs JPY → IDR yang dipakai untuk estimasi harga |
| `service_fee_type` | - | `text` (enum) | `flat` atau `percentage` |
| `service_fee_value` | - | `numeric` | Nilai biaya jasa — nominal rupiah kalau `flat`, persentase kalau `percentage` |
| `updated_at` | - | `timestamp` | Waktu konfigurasi terakhir diubah |

---

## Catatan relasi (ringkas)

```
customers ──┬──< items
            ├──< batch_bills
            └──< tax_bills

boxes ──┬──< batches
        └──< tax_bills

batches ──┬──< items
          ├──< batch_bills
          └──< batch_photos
```

Diagram lengkap (Mermaid) sudah dibahas sebelumnya di percakapan — mau
digabung jadi satu file dengan dokumen ini, atau tetap dipisah?
