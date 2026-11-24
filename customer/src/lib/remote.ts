// Supabase data layer for the Customer Dashboard. Same row → domain mapping
// as the admin app (../../src/lib/remote.ts); RLS limits every select to
// the signed-in customer's own rows (supabase/migrations/0001_init.sql §6).
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Batch,
  BatchBill,
  BatchBillStatus,
  Box,
  BoxStatus,
  BuktiTransfer,
  EstimatorConfig,
  Item,
  OrderStatus,
  OrderType,
  PaymentMethod,
  ServiceFeeType,
  TaxBill,
  TipeBarang,
  TipeKartu,
} from '../shared/types'
import { supabase } from './supabase'

const PHOTO_BUCKET = 'batch-photos'
const BUKTI_BUCKET = 'bukti-transfer'
const SIGNED_URL_TTL_SECONDS = 60 * 60

function db(): SupabaseClient {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi (cek file .env).')
  return supabase
}

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message)
  return result.data as T
}

const iso = (value: string) => new Date(value).toISOString()

// ── Row shapes ─────────────────────────────────────────────────────────────

interface BoxRow {
  id: string
  box_number: string
  status: BoxStatus
  created_at: string
  updated_at: string
}
interface BatchRow {
  id: string
  batch_number: string
  box_id: string | null
  order_id_wh: string
  order_type: OrderType
  order_status: OrderStatus
  created_at: string
  updated_at: string
}
interface BatchPhotoRow {
  batch_id: string
  storage_path: string
  position: number
}
interface ItemRow {
  id: string
  batch_id: string
  customer_id: string
  tipe_barang: TipeBarang
  tipe_kartu: TipeKartu | null
  description: string | null
  price_idr: number
  weight_grams: number | null
  tax_bill_id: string | null
  created_at: string
  updated_at: string
}
interface BuktiColumns {
  status: BatchBillStatus
  payment_method: PaymentMethod | null
  bukti_transfer_path: string | null
  bukti_transfer_file_name: string | null
  bukti_transfer_uploaded_at: string | null
}
interface BatchBillRow extends BuktiColumns {
  id: string
  batch_id: string
  customer_id: string
  upnotes_total: number
  bank_account: string
  total: number
  paid_at: string | null
  created_at: string
}
interface TaxBillRow extends BuktiColumns {
  id: string
  box_id: string
  customer_id: string
  kartu_count: number
  kartu_tax: number
  non_kartu_weight_grams: number
  non_kartu_share: number
  total: number
  late_fee_idr: number
  published_at: string
  deadline: string
}
interface EstimatorConfigRow {
  exchange_rate: number
  service_fee_type: ServiceFeeType
  service_fee_value: number
  updated_at: string
}
interface NotificationRow {
  id: string
  type: 'batch_bill_published' | 'tax_bill_published' | 'payment_confirmed' | 'payment_rejected'
  reference_id: string
  message: string
  read_at: string | null
  created_at: string
}
interface MemberRow {
  batch_id: string
  customer_id: string
  name: string
  item_count: number
  total: number
  status: BatchBillStatus
}

// ── Public estimator config (readable without login) ───────────────────────

export async function fetchEstimatorConfig(): Promise<EstimatorConfig> {
  const r = check(await db().from('estimator_config').select('*').eq('id', 1).single()) as EstimatorConfigRow
  return {
    exchangeRate: Number(r.exchange_rate),
    serviceFeeType: r.service_fee_type,
    serviceFeeValue: Number(r.service_fee_value),
    updatedAt: iso(r.updated_at),
  }
}

// ── Everything the signed-in customer can see ──────────────────────────────

export interface RemoteNotification {
  id: string
  message: string
  at: string
  to: string
  read: boolean
}

export interface BatchMember {
  batchId: string
  customerId: string
  name: string
  itemCount: number
  total: number
  status: BatchBillStatus
}

export interface CustomerSnapshot {
  boxes: Box[]
  batches: Batch[]
  items: Item[]
  batchBills: BatchBill[]
  taxBills: TaxBill[]
  estimatorConfig: EstimatorConfig
  notifications: RemoteNotification[]
  batchMembers: BatchMember[]
}

export async function fetchCustomerData(): Promise<CustomerSnapshot> {
  const all = <T,>(table: string, orderBy: string) =>
    db().from(table).select('*').order(orderBy).then((r) => check(r) as T[])

  const [boxRows, batchRows, photoRows, itemRows, batchBillRows, taxBillRows, notifRows, memberRows, estimatorConfig] =
    await Promise.all([
      all<BoxRow>('boxes', 'created_at'),
      all<BatchRow>('batches', 'created_at'),
      all<BatchPhotoRow>('batch_photos', 'position'),
      all<ItemRow>('items', 'created_at'),
      all<BatchBillRow>('batch_bills', 'created_at'),
      all<TaxBillRow>('tax_bills', 'published_at'),
      db()
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)
        .then((r) => check(r) as NotificationRow[]),
      // Optional (migration 0006): without it, ReqShare batches just don't list co-sharers.
      db()
        .rpc('my_batch_members')
        .then((r) => {
          if (r.error) console.error('my_batch_members:', r.error.message)
          return (r.data ?? []) as MemberRow[]
        }),
      fetchEstimatorConfig(),
    ])

  const signedUrls = await signBuktiUrls([...batchBillRows, ...taxBillRows])
  const toBukti = (row: BuktiColumns): BuktiTransfer | undefined =>
    row.bukti_transfer_path
      ? {
          fileName: row.bukti_transfer_file_name ?? row.bukti_transfer_path.split('/').pop()!,
          dataUrl: signedUrls.get(row.bukti_transfer_path) ?? '',
          uploadedAt: iso(row.bukti_transfer_uploaded_at ?? new Date().toISOString()),
          paymentMethod: row.payment_method ?? 'QRIS',
        }
      : undefined

  const batchNumberById = new Map(batchRows.map((b) => [b.id, b.batch_number]))
  const taxBillIds = new Set(taxBillRows.map((t) => t.id))

  return {
    boxes: boxRows.map((r) => ({
      id: r.id,
      boxNumber: r.box_number,
      batchIds: batchRows.filter((b) => b.box_id === r.id).map((b) => b.id),
      status: r.status,
      createdAt: iso(r.created_at),
      updatedAt: iso(r.updated_at),
    })),
    batches: batchRows.map((r) => ({
      id: r.id,
      batchNumber: r.batch_number,
      boxId: r.box_id ?? undefined,
      orderIdWH: r.order_id_wh,
      orderType: r.order_type,
      photoDataUrls: photoRows
        .filter((p) => p.batch_id === r.id)
        .map((p) => db().storage.from(PHOTO_BUCKET).getPublicUrl(p.storage_path).data.publicUrl),
      orderStatus: r.order_status,
      createdAt: iso(r.created_at),
      updatedAt: iso(r.updated_at),
    })),
    items: itemRows.map((r) => ({
      id: r.id,
      batchId: r.batch_id,
      customerId: r.customer_id,
      tipeBarang: r.tipe_barang,
      tipeKartu: r.tipe_kartu ?? undefined,
      description: r.description ?? undefined,
      priceIDR: Number(r.price_idr),
      weightGrams: r.weight_grams == null ? undefined : Number(r.weight_grams),
      createdAt: iso(r.created_at),
      updatedAt: iso(r.updated_at),
    })),
    batchBills: batchBillRows.map((r) => ({
      id: r.id,
      batchId: r.batch_id,
      batchNumber: batchNumberById.get(r.batch_id) ?? '',
      customerId: r.customer_id,
      itemIds: itemRows.filter((i) => i.batch_id === r.batch_id && i.customer_id === r.customer_id).map((i) => i.id),
      upnotesTotal: Number(r.upnotes_total),
      bankAccount: r.bank_account,
      total: Number(r.total),
      status: r.status,
      createdAt: iso(r.created_at),
      paidAt: r.paid_at ? iso(r.paid_at) : undefined,
      buktiTransfer: toBukti(r),
    })),
    taxBills: taxBillRows.map((r) => ({
      id: r.id,
      boxId: r.box_id,
      customerId: r.customer_id,
      itemIds: itemRows.filter((i) => i.tax_bill_id === r.id).map((i) => i.id),
      kartuCount: r.kartu_count,
      kartuTax: Number(r.kartu_tax),
      nonKartuWeightGrams: Number(r.non_kartu_weight_grams),
      nonKartuShare: Number(r.non_kartu_share),
      total: Number(r.total),
      lateFeeIDR: Number(r.late_fee_idr),
      publishedAt: iso(r.published_at),
      deadline: iso(r.deadline),
      status: r.status,
      buktiTransfer: toBukti(r),
    })),
    estimatorConfig,
    notifications: notifRows.map((n) => ({
      id: n.id,
      message: n.message,
      at: iso(n.created_at),
      to:
        n.type === 'tax_bill_published' || (n.type !== 'batch_bill_published' && taxBillIds.has(n.reference_id))
          ? '/id/ems-tax'
          : '/id/order',
      read: n.read_at != null,
    })),
    batchMembers: memberRows.map((m) => ({
      batchId: m.batch_id,
      customerId: m.customer_id,
      name: m.name,
      itemCount: m.item_count,
      total: Number(m.total),
      status: m.status,
    })),
  }
}

// bukti-transfer is private: the customer may read files in their own folder.
async function signBuktiUrls(rows: BuktiColumns[]): Promise<Map<string, string>> {
  const paths = rows.map((r) => r.bukti_transfer_path).filter((p): p is string => Boolean(p))
  if (paths.length === 0) return new Map()
  const { data, error } = await db().storage.from(BUKTI_BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)
  if (error || !data) return new Map() // proof thumbnails are optional; bills still load
  return new Map(data.filter((s) => s.path && s.signedUrl).map((s) => [s.path as string, s.signedUrl as string]))
}

// ── Pay a bill (FR-GO-1 / FR-GO-2): upload proof, then submit_payment_proof ─

const EXT_BY_MIME: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }

export async function submitPaymentProof(input: {
  kind: 'batch' | 'tax'
  billId: string
  customerId: string
  method: PaymentMethod
  fileName: string
  dataUrl: string
}) {
  const blob = await (await fetch(input.dataUrl)).blob()
  // Storage policy: customers may only upload into bukti-transfer/<their customers.id>/.
  const path = `${input.customerId}/${input.billId}-${Date.now()}.${EXT_BY_MIME[blob.type] ?? 'jpg'}`
  check(await db().storage.from(BUKTI_BUCKET).upload(path, blob, { contentType: blob.type, upsert: false }))
  const { error } = await db().rpc('submit_payment_proof', {
    p_kind: input.kind,
    p_bill_id: input.billId,
    p_path: path,
    p_file_name: input.fileName,
    p_method: input.method,
  })
  if (error) {
    await db().storage.from(BUKTI_BUCKET).remove([path]) // don't leave an orphan file
    throw new Error(error.message)
  }
}

export async function markNotificationsRead(ids: string[]) {
  if (ids.length === 0) return
  check(await db().from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids).is('read_at', null))
}
