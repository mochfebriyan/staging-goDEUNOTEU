// Supabase data layer. Every read/write the store makes when Supabase is
// configured goes through here, so pages and components never talk to
// Supabase directly — they keep using the same src/types.ts shapes.
//
// Table/column layout: supabase/migrations/0001_init.sql (diagram in
// docs/ERD.md). Rows come back snake_case and are mapped to the camelCase
// domain types below; derived arrays (Box.batchIds, BatchBill.itemIds,
// TaxBill.itemIds) are rebuilt from foreign keys on every load.
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import type {
  Batch,
  BatchBill,
  BatchBillStatus,
  Box,
  BoxStatus,
  BuktiTransfer,
  Customer,
  EstimatorConfig,
  Item,
  OrderStatus,
  OrderType,
  PaymentMethod,
  ServiceFeeType,
  TaxBill,
  TipeBarang,
  TipeKartu,
} from '../types'

const PHOTO_BUCKET = 'batch-photos'
const BUKTI_BUCKET = 'bukti-transfer'
const SIGNED_URL_TTL_SECONDS = 60 * 60

function db(): SupabaseClient {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi (cek file .env).')
  return supabase
}

// Supabase errors are plain objects, not Error instances — normalize so
// callers can always read `.message`.
function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message)
  return result.data as T
}

function iso(value: string): string {
  return new Date(value).toISOString()
}

export function newId(): string {
  return crypto.randomUUID()
}

// ── Row shapes (snake_case, as stored) ─────────────────────────────────────

interface CustomerRow {
  id: string
  name: string
}
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
  price_idr: number
  weight_grams: number | null
  // Added by supabase/migrations/0002_item_description.sql.
  description?: string | null
  tax_bill_id: string | null
  created_at: string
  updated_at: string
}
interface BuktiColumns {
  // batch_bills and tax_bills share one bill_status enum
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

// PostgREST caps a response at 1000 rows by default — page through so
// large tables (items especially) are never silently truncated.
async function selectAll<T>(table: string, orderBy: string): Promise<T[]> {
  const PAGE = 1000
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const data = check(
      await db().from(table).select('*').order(orderBy).order('id').range(from, from + PAGE - 1),
    ) as T[]
    rows.push(...data)
    if (data.length < PAGE) return rows
  }
}

// ── Load everything ────────────────────────────────────────────────────────

export interface RemoteSnapshot {
  customers: Customer[]
  boxes: Box[]
  batches: Batch[]
  items: Item[]
  batchBills: BatchBill[]
  taxBills: TaxBill[]
  estimatorConfig: EstimatorConfig
}

export async function fetchAll(): Promise<RemoteSnapshot> {
  const [customerRows, boxRows, batchRows, photoRows, itemRows, batchBillRows, taxBillRows, configRow] =
    await Promise.all([
      selectAll<CustomerRow>('customers', 'name'),
      selectAll<BoxRow>('boxes', 'created_at'),
      selectAll<BatchRow>('batches', 'created_at'),
      selectAll<BatchPhotoRow>('batch_photos', 'position'),
      selectAll<ItemRow>('items', 'created_at'),
      selectAll<BatchBillRow>('batch_bills', 'created_at'),
      selectAll<TaxBillRow>('tax_bills', 'published_at'),
      db().from('estimator_config').select('*').eq('id', 1).single().then((r) => check<EstimatorConfigRow>(r)),
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

  const items: Item[] = itemRows.map((r) => ({
    id: r.id,
    batchId: r.batch_id,
    customerId: r.customer_id,
    tipeBarang: r.tipe_barang,
    tipeKartu: r.tipe_kartu ?? undefined,
    priceIDR: Number(r.price_idr),
    weightGrams: r.weight_grams == null ? undefined : Number(r.weight_grams),
    description: r.description ?? undefined,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  }))

  return {
    customers: customerRows.map((r) => ({ id: r.id, name: r.name })),
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
    items,
    batchBills: batchBillRows.map((r) => ({
      id: r.id,
      batchId: r.batch_id,
      batchNumber: batchNumberById.get(r.batch_id) ?? '',
      customerId: r.customer_id,
      itemIds: itemRows
        .filter((i) => i.batch_id === r.batch_id && i.customer_id === r.customer_id)
        .map((i) => i.id),
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
    estimatorConfig: {
      exchangeRate: Number(configRow.exchange_rate),
      serviceFeeType: configRow.service_fee_type,
      serviceFeeValue: Number(configRow.service_fee_value),
      updatedAt: iso(configRow.updated_at),
    },
  }
}

// bukti-transfer is a private bucket, so each file needs a short-lived
// signed URL — fetched in one request for every bill at once.
async function signBuktiUrls(rows: BuktiColumns[]): Promise<Map<string, string>> {
  const paths = rows.map((r) => r.bukti_transfer_path).filter((p): p is string => Boolean(p))
  if (paths.length === 0) return new Map()
  const signed = check(await db().storage.from(BUKTI_BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS))
  return new Map(
    signed.filter((s) => s.path && s.signedUrl).map((s) => [s.path as string, s.signedUrl as string]),
  )
}

// ── Auth ───────────────────────────────────────────────────────────────────

export async function isCurrentUserAdmin(userId: string): Promise<boolean> {
  const row = check(await db().from('admins').select('id').eq('id', userId).maybeSingle())
  return Boolean(row)
}

// ── Feature A: batches ─────────────────────────────────────────────────────

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
}

// A photo is either a fresh upload (data: URL from MultiImageInput) or an
// already-stored one (its public URL, as fetchAll produced it).
function photoPathFromPublicUrl(url: string): string | null {
  const marker = `/object/public/${PHOTO_BUCKET}/`
  const at = url.indexOf(marker)
  return at === -1 ? null : decodeURIComponent(url.slice(at + marker.length).split('?')[0])
}

async function uploadDataUrl(bucket: string, path: string, dataUrl: string): Promise<void> {
  const blob = await (await fetch(dataUrl)).blob()
  check(await db().storage.from(bucket).upload(path, blob, { contentType: blob.type, upsert: false }))
}

export interface RemoteSaveBatchInput {
  batchId: string
  batchNumber: string
  orderIdWH: string
  orderType: OrderType
  photoUrls: string[]
  previousPhotoUrls: string[]
  items: Array<{
    id: string
    customerId: string
    tipeBarang: TipeBarang
    tipeKartu?: TipeKartu
    priceIDR: number
    weightGrams?: number
    description?: string
  }>
}

// Returns how many new batch bills were created.
export async function saveBatch(input: RemoteSaveBatchInput): Promise<number> {
  const photoPaths: string[] = []
  for (const url of input.photoUrls) {
    if (url.startsWith('data:')) {
      const mime = url.slice(5, url.indexOf(';'))
      const path = `${input.batchId}/${newId()}.${EXT_BY_MIME[mime] ?? 'img'}`
      await uploadDataUrl(PHOTO_BUCKET, path, url)
      photoPaths.push(path)
    } else {
      const path = photoPathFromPublicUrl(url)
      if (path) photoPaths.push(path)
    }
  }

  const newBills = check(
    await db().rpc('save_batch', {
      p_batch_id: input.batchId,
      p_batch_number: input.batchNumber,
      p_order_id_wh: input.orderIdWH,
      p_order_type: input.orderType,
      p_photo_paths: photoPaths,
      p_items: input.items.map((it) => ({
        id: it.id,
        customer_id: it.customerId,
        tipe_barang: it.tipeBarang,
        tipe_kartu: it.tipeKartu ?? null,
        price_idr: it.priceIDR,
        weight_grams: it.weightGrams ?? null,
        description: it.description?.trim() || null,
      })),
    }),
  ) as number

  const kept = new Set(photoPaths)
  const removed = input.previousPhotoUrls
    .map(photoPathFromPublicUrl)
    .filter((p): p is string => Boolean(p) && !kept.has(p as string))
  if (removed.length > 0) await db().storage.from(PHOTO_BUCKET).remove(removed)

  return newBills
}

export async function deleteBatches(batchIds: string[]): Promise<{ deleted: number; blocked: number }> {
  const result = check(await db().rpc('delete_batches', { p_batch_ids: batchIds })) as {
    deleted: number
    blocked: number
    photo_paths: string[]
  }
  if (result.photo_paths.length > 0) {
    await db().storage.from(PHOTO_BUCKET).remove(result.photo_paths)
  }
  return { deleted: result.deleted, blocked: result.blocked }
}

export async function setItemWeights(weights: Array<{ itemId: string; weightGrams: number }>) {
  check(
    await db().rpc('set_item_weights', {
      p_weights: weights.map((w) => ({ item_id: w.itemId, weight_grams: w.weightGrams })),
    }),
  )
}

// ── Payments (shared by batch bills and tax bills) ─────────────────────────

type BillKind = 'batch' | 'tax'
const BILL_TABLE: Record<BillKind, string> = { batch: 'batch_bills', tax: 'tax_bills' }

// Demo stand-in for the Customer Dashboard: uploads a placeholder receipt
// and submits it through the same RPC customers will use.
export async function simulateCustomerUpload(
  kind: BillKind,
  billId: string,
  customerId: string,
  receipt: BuktiTransfer,
) {
  const path = `${customerId}/${billId}-${Date.now()}.svg`
  await uploadDataUrl(BUKTI_BUCKET, path, receipt.dataUrl)
  check(
    await db().rpc('submit_payment_proof', {
      p_kind: kind,
      p_bill_id: billId,
      p_path: path,
      p_file_name: receipt.fileName,
      p_method: receipt.paymentMethod,
    }),
  )
}

export async function confirmBill(kind: BillKind, billId: string) {
  const patch: Record<string, unknown> = { status: 'Lunas' }
  if (kind === 'batch') patch.paid_at = new Date().toISOString()
  const rows = check(
    await db()
      .from(BILL_TABLE[kind])
      .update(patch)
      .eq('id', billId)
      .eq('status', 'Menunggu Konfirmasi')
      .select('id'),
  )
  if (rows.length === 0) throw new Error('Tagihan ini tidak sedang menunggu konfirmasi.')
}

export async function rejectBill(kind: BillKind, billId: string) {
  const before = check(
    await db().from(BILL_TABLE[kind]).select('bukti_transfer_path').eq('id', billId).single(),
  ) as { bukti_transfer_path: string | null }
  const patch: Record<string, unknown> = {
    status: 'Belum Bayar',
    payment_method: null,
    bukti_transfer_path: null,
    bukti_transfer_file_name: null,
    bukti_transfer_uploaded_at: null,
  }
  if (kind === 'batch') patch.paid_at = null
  check(await db().from(BILL_TABLE[kind]).update(patch).eq('id', billId))
  if (before.bukti_transfer_path) {
    await db().storage.from(BUKTI_BUCKET).remove([before.bukti_transfer_path])
  }
}

// ── Feature B: boxes ───────────────────────────────────────────────────────

export async function saveBox(input: {
  boxId: string
  boxNumber: string
  batchIds: string[]
  status: BoxStatus
}) {
  check(
    await db().rpc('save_box', {
      p_box_id: input.boxId,
      p_box_number: input.boxNumber,
      p_batch_ids: input.batchIds,
      p_status: input.status,
    }),
  )
}

export async function deleteBoxes(boxIds: string[]): Promise<{ deleted: number; blocked: number }> {
  return check(await db().rpc('delete_boxes', { p_box_ids: boxIds })) as {
    deleted: number
    blocked: number
  }
}

// ── Feature C: tax bills ───────────────────────────────────────────────────

export async function publishTaxBills(
  boxId: string,
  deadline: string,
  bills: Array<Pick<
    TaxBill,
    'customerId' | 'itemIds' | 'kartuCount' | 'kartuTax' | 'nonKartuWeightGrams' | 'nonKartuShare' | 'total'
  >>,
) {
  check(
    await db().rpc('publish_tax_bills', {
      p_box_id: boxId,
      p_deadline: deadline,
      p_bills: bills.map((b) => ({
        customer_id: b.customerId,
        item_ids: b.itemIds,
        kartu_count: b.kartuCount,
        kartu_tax: b.kartuTax,
        non_kartu_weight_grams: b.nonKartuWeightGrams,
        non_kartu_share: b.nonKartuShare,
        total: b.total,
      })),
    }),
  )
}

// Returns false when the guard (status filter) matched no row.
export async function updateTaxBillAmount(taxBillId: string, total: number): Promise<boolean> {
  const rows = check(
    await db().from('tax_bills').update({ total }).eq('id', taxBillId).neq('status', 'Lunas').select('id'),
  )
  return rows.length > 0
}

export async function updateTaxBillLateFee(taxBillId: string, lateFeeIDR: number): Promise<boolean> {
  const rows = check(
    await db()
      .from('tax_bills')
      .update({ late_fee_idr: lateFeeIDR })
      .eq('id', taxBillId)
      .eq('status', 'Belum Bayar')
      .select('id'),
  )
  return rows.length > 0
}

export async function updateBoxDeadline(boxId: string, deadline: string) {
  check(await db().from('tax_bills').update({ deadline }).eq('box_id', boxId))
}

export async function deleteTaxBills(taxBillIds: string[]) {
  if (taxBillIds.length === 0) return
  check(await db().from('tax_bills').delete().in('id', taxBillIds))
}

// ── Feature D: estimator config ────────────────────────────────────────────

export async function updateEstimatorConfig(
  patch: Partial<Omit<EstimatorConfig, 'updatedAt'>>,
) {
  const { data } = await db().auth.getUser()
  const row: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: data.user?.id ?? null,
  }
  if (patch.exchangeRate !== undefined) row.exchange_rate = patch.exchangeRate
  if (patch.serviceFeeType !== undefined) row.service_fee_type = patch.serviceFeeType
  if (patch.serviceFeeValue !== undefined) row.service_fee_value = patch.serviceFeeValue
  const rows = check(await db().from('estimator_config').update(row).eq('id', 1).select('id'))
  if (rows.length === 0) throw new Error('Konfigurasi tidak tersimpan — akun ini bukan admin.')
}
