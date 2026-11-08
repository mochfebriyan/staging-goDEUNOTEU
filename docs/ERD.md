# ERD — GO Aikatsu Admin Dashboard

Database schema for Supabase (Postgres). Source of truth:
[`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql),
built to match [`src/types.ts`](../src/types.ts). The diagram renders on
GitHub and in VS Code (Markdown Preview Mermaid Support extension); you can
also paste the code block into <https://mermaid.live>.

```mermaid
erDiagram
    AUTH_USERS ||--o| ADMINS : "is admin"
    AUTH_USERS |o--o| CUSTOMERS : "logs in as (future LINE login)"

    BOXES     |o--o{ BATCHES      : "contains"
    BATCHES   ||--o{ BATCH_PHOTOS : "has photos"
    BATCHES   ||--o{ ITEMS        : "contains"
    CUSTOMERS ||--o{ ITEMS        : "orders"
    BATCHES   ||--o{ BATCH_BILLS  : "billed per customer"
    CUSTOMERS ||--o{ BATCH_BILLS  : "pays"
    BOXES     ||--o{ TAX_BILLS    : "taxed per customer"
    CUSTOMERS ||--o{ TAX_BILLS    : "pays"
    TAX_BILLS |o--o{ ITEMS        : "covers"
    CUSTOMERS ||--o{ NOTIFICATIONS : "receives"

    AUTH_USERS {
        uuid id PK "managed by Supabase Auth"
        text email
    }
    ADMINS {
        uuid id PK,FK "auth.users.id"
        text full_name
        timestamptz created_at
    }
    CUSTOMERS {
        uuid id PK
        text name
        uuid auth_user_id FK,UK "nullable until LINE login"
        text line_user_id UK "nullable"
        text avatar_url
        timestamptz created_at
        timestamptz updated_at
    }
    BOXES {
        uuid id PK
        text box_number UK "BOX-001"
        box_status status "default Di WH Jepang"
        timestamptz created_at
        timestamptz updated_at
    }
    BATCHES {
        uuid id PK
        text batch_number UK "BATCH-01"
        uuid box_id FK "nullable = not boxed yet"
        text order_id_wh
        order_type order_type
        order_status order_status "follows box status"
        timestamptz created_at
        timestamptz updated_at
    }
    BATCH_PHOTOS {
        uuid id PK
        uuid batch_id FK
        text storage_path "batch-photos bucket"
        int position
    }
    ITEMS {
        uuid id PK
        uuid batch_id FK
        uuid customer_id FK
        tipe_barang tipe_barang
        tipe_kartu tipe_kartu "only when Kartu"
        numeric price_idr
        numeric weight_grams "non-Kartu"
        text description "optional, max 500"
        uuid tax_bill_id FK "set on publish"
        timestamptz created_at
        timestamptz updated_at
    }
    BATCH_BILLS {
        uuid id PK
        uuid batch_id FK "UK with customer_id"
        uuid customer_id FK
        numeric upnotes_total
        text bank_account
        numeric total "items + upnotes"
        bill_status status
        payment_method payment_method
        text bukti_transfer_path "bukti-transfer bucket"
        text bukti_transfer_file_name
        timestamptz bukti_transfer_uploaded_at
        timestamptz paid_at
        timestamptz created_at
    }
    TAX_BILLS {
        uuid id PK
        uuid box_id FK "UK with customer_id"
        uuid customer_id FK
        int kartu_count
        numeric kartu_tax
        numeric non_kartu_weight_grams
        numeric non_kartu_share
        numeric total "product tax"
        numeric late_fee_idr "owed = total + late_fee_idr"
        bill_status status
        payment_method payment_method
        text bukti_transfer_path
        timestamptz published_at
        timestamptz deadline
    }
    ESTIMATOR_CONFIG {
        int id PK "always 1"
        numeric exchange_rate
        service_fee_type service_fee_type
        numeric service_fee_value
        uuid updated_by FK
        timestamptz updated_at
    }
    NOTIFICATIONS {
        uuid id PK
        uuid customer_id FK
        notification_type type
        uuid reference_id "batch_bills.id or tax_bills.id"
        text message
        timestamptz read_at
        timestamptz created_at
    }
```

`ESTIMATOR_CONFIG` stands alone (single row) and has no relationship lines.

## How `src/types.ts` maps to tables

| App type (`src/types.ts`) | Table | Notes |
|---|---|---|
| `Customer` | `customers` | `name` only today; `auth_user_id`/`line_user_id` are for the future Customer Dashboard |
| `Box` | `boxes` | `Box.batchIds` is **not a column** — it's every `batches` row with that `box_id` |
| `Batch` | `batches` + `batch_photos` | `photoDataUrls` → one `batch_photos` row per photo; the file itself is in Storage |
| `Item` | `items` | `tax_bill_id` added so `TaxBill.itemIds` can be rebuilt |
| `BatchBill` | `batch_bills` | `itemIds` = items with the same `(batch_id, customer_id)`; `batchNumber` read from the batch |
| `TaxBill` | `tax_bills` | `itemIds` = items whose `tax_bill_id` is this bill |
| `BuktiTransfer` | columns on both bill tables | `payment_method`, `bukti_transfer_*`; file in the private `bukti-transfer` bucket |
| `EstimatorConfig` | `estimator_config` | one row, `id = 1` |
| — | `admins` | who may use the Admin Dashboard |
| — | `notifications` | filled automatically by triggers, for the Customer Dashboard |

## Enums

| Enum | Values |
|---|---|
| `tipe_barang` | Kartu, Ganci, Binder, Boneka, Sleeve, Standee, Lainnya |
| `tipe_kartu` | Tops, Skirt, Shoes, Set, Accessories, Dress |
| `order_status` | Dibeli dari Seller, Di WH Jepang, Dikirim ke Indonesia, Di Bea Cukai, Di WH Indonesia, Selesai |
| `box_status` | same as `order_status` minus "Dibeli dari Seller" |
| `order_type` | ReqShare, Admin, Persod |
| `bill_status` | Belum Bayar, Menunggu Konfirmasi, Lunas (shared by both bill tables) |
| `payment_method` | QRIS, Shopeepay, DANA, GoPay, BCA, SeaBank |
| `service_fee_type` | flat, percentage |
| `notification_type` | batch_bill_published, tax_bill_published, payment_confirmed, payment_rejected |

## Business rules enforced in the database

These match `src/store/useStore.ts` and `src/lib/deleteGuards.ts`, so they
hold even if someone edits data outside the app:

- A batch with no box is always `Dibeli dari Seller`; once boxed, its
  `order_status` equals the box's status (`box_drives_status` check + `save_box`).
- A box's batch list locks once its status leaves `Di WH Jepang`; only
  boxes still at `Di WH Jepang` can be deleted (`save_box`, `delete_boxes`).
- A batch can't be deleted if any of its items is in a tax bill, or any of
  its bills is `Lunas`/`Menunggu Konfirmasi` (`delete_batches`).
- Tax bills are published once per box, only at `Di Bea Cukai` or later
  (`publish_tax_bills`); a non-`Belum Bayar` tax bill can't be deleted (trigger).
- One batch bill per (batch, customer), one tax bill per (box, customer) — unique constraints.
- `tipe_kartu` is required for Kartu items and forbidden otherwise; prices > 0.
- `description` is optional free text per item, at most 500 characters
  (`0002_item_description.sql`).
