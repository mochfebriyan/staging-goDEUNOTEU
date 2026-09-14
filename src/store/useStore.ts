import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { makeId } from '../lib/id'
import { guardBatchDeletion, guardBoxDeletion, guardTaxBillDeletion } from '../lib/deleteGuards'
import {
  seedBatchBills,
  seedBatches,
  seedBoxes,
  seedCustomers,
  seedEstimatorConfig,
  seedItems,
  seedTaxBills,
} from './seed'
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
  OrderType,
  TaxBill,
  TaxBillStatus,
  TipeBarang,
  TipeKartu,
} from '../types'
import { DEFAULT_BOX_STATUS, PAYMENT_METHOD_OPTIONS } from '../types'

const DEFAULT_BANK_ACCOUNT = 'BCA 1234567890 a.n. Admin GO Aikatsu'

interface Toast {
  id: string
  message: string
  tone: 'success' | 'error' | 'info'
}

export interface CustomerOrderItemInput {
  id?: string
  tipeBarang: TipeBarang
  tipeKartu?: TipeKartu
  priceIDR: number
  weightGrams?: number
}

export interface CustomerOrderInput {
  customerId: string
  items: CustomerOrderItemInput[]
}

export interface SaveBatchInput {
  batchId?: string
  batchNumber: string
  orderIdWH: string
  orderType: OrderType
  photoDataUrls: string[]
  customerOrders: CustomerOrderInput[]
}

export interface SaveBoxInput {
  boxId?: string
  boxNumber: string
  batchIds: string[]
  status?: BoxStatus
}

interface StoreState {
  customers: Customer[]
  batches: Batch[]
  boxes: Box[]
  items: Item[]
  batchBills: BatchBill[]
  taxBills: TaxBill[]
  estimatorConfig: EstimatorConfig
  toasts: Toast[]

  // customers
  getCustomerName: (customerId: string) => string
  // boxes — boxNumber is display-only, resolved live from the Box record;
  // Batch/TaxBill never store it, only the stable boxId.
  getBoxNumber: (boxId: string) => string

  // toasts
  pushToast: (message: string, tone?: Toast['tone']) => void
  dismissToast: (id: string) => void

  // Feature A — one submitted form = one Batch, containing per-customer items.
  // Saving a batch also auto-bills every customer in it (was Feature B).
  // orderStatus and box membership are never touched here — a batch always
  // starts at "Dibeli dari Seller" and only Feature B (Box Management)
  // can move it, since a box ships as one unit.
  saveBatch: (input: SaveBatchInput) => void
  // Deletes one or many batch records along with their items and bills —
  // but only the ones that are actually safe to delete. A batch whose
  // items are already in a published tax bill, or whose own bill is
  // Lunas/Menunggu Konfirmasi, is skipped rather than deleted; see
  // src/lib/deleteGuards.ts for the exact rule.
  deleteBatches: (batchIds: string[]) => void
  setItemWeights: (weights: Array<{ itemId: string; weightGrams: number }>) => void
  simulateCustomerUploadBatch: (batchBillId: string) => void
  confirmBatchBill: (batchBillId: string) => void
  rejectBatchBill: (batchBillId: string) => void

  // Feature B — Box Management. A box's status is the single source of
  // truth for every batch inside it.
  // Creates or edits a box's number, status, and membership in one go.
  // Batches added to the box inherit its (possibly newly set) status;
  // batches removed from it fall back to "Dibeli dari Seller" (no box,
  // no derived status).
  saveBox: (input: SaveBoxInput) => void
  // Deletes one or many boxes — but only the ones with no tax bill still
  // pointing at them (see src/lib/deleteGuards.ts). Every batch inside a
  // box that does get deleted is released back to unboxed ("Dibeli dari
  // Seller").
  deleteBoxes: (boxIds: string[]) => void

  // Feature C
  // Publishing is a one-shot action per box: a box only ever gets
  // published once, for every customer in it at once, and only once its
  // status reaches "Di Bea Cukai" or later (enforced by the caller via
  // which boxes it offers) — so there's never an "existing bills in this
  // box" case to reconcile with. `deadline` is admin-chosen at publish
  // time (pre-filled with a +7-day suggestion by the caller, not forced).
  publishTaxBills: (
    bills: Array<
      Omit<TaxBill, 'id' | 'publishedAt' | 'deadline' | 'status' | 'buktiTransfer' | 'lateFeeIDR'>
    >,
    deadline: string,
  ) => void
  simulateCustomerUploadTax: (taxBillId: string) => void
  confirmTaxBill: (taxBillId: string) => void
  rejectTaxBill: (taxBillId: string) => void
  // Overrides one customer's published tax amount directly — the box's
  // displayed total isn't a stored field anywhere, it's always the live
  // sum of its bills' `total`, so this is the only change needed for the
  // box total to "follow" the edit. Refused once the bill is Lunas —
  // settled payments don't get silently rewritten.
  updateTaxBillAmount: (taxBillId: string, total: number) => void
  // Free-entry late fee, separate from the product tax — admin decides the
  // amount, nothing is auto-suggested from days overdue. Locked once the
  // bill is Menunggu Konfirmasi or Lunas, same as the reasoning for
  // updateTaxBillAmount, but stricter: a pending confirmation already has
  // a bukti transfer in flight for a specific amount, so the fee can't
  // move under it either.
  updateTaxBillLateFee: (taxBillId: string, lateFeeIDR: number) => void
  // Changes a box's shared payment deadline, applied to every tax bill in
  // it at once — deadline isn't a payment-sensitive field the way total
  // is, so this stays editable regardless of any bill's status.
  updateBoxDeadline: (boxId: string, deadline: string) => void
  // Deletes one or many published tax bills — but only the ones still
  // Belum Bayar (see src/lib/deleteGuards.ts). A Lunas or Menunggu
  // Konfirmasi bill is a real financial record, not undone by a delete.
  deleteTaxBills: (taxBillIds: string[]) => void

  // Feature D
  updateEstimatorConfig: (patch: Partial<Omit<EstimatorConfig, 'updatedAt'>>) => void
}

function attachDemoBukti(): BuktiTransfer {
  const paymentMethod =
    PAYMENT_METHOD_OPTIONS[Math.floor(Math.random() * PAYMENT_METHOD_OPTIONS.length)]
  return {
    fileName: `bukti_${Date.now()}.png`,
    dataUrl:
      'data:image/svg+xml;utf8,' +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#f1f5f9"/><text x="160" y="105" font-family="monospace" font-size="13" text-anchor="middle" fill="#334155">bukti transfer (simulasi)</text></svg>`,
      ),
    uploadedAt: new Date().toISOString(),
    paymentMethod,
  }
}

// Auto-billing: every customer present in a batch gets (or keeps) exactly
// one BatchBill for that batch, always in sync with their current items.
// Replaces the old separate "Create Batch Bill" step (Feature B).
function syncBatchBillsForBatch(
  batchId: string,
  batchNumber: string,
  items: Item[],
  existingBills: BatchBill[],
  now: string,
): { batchBills: BatchBill[]; newlyBilled: number } {
  const otherBatchBills = existingBills.filter((b) => b.batchId !== batchId)
  const existingForBatch = existingBills.filter((b) => b.batchId === batchId)
  const existingByCustomer = new Map(existingForBatch.map((b) => [b.customerId, b]))

  const customerIdsInBatch = Array.from(new Set(items.map((i) => i.customerId)))
  let newlyBilled = 0

  const syncedForBatch: BatchBill[] = customerIdsInBatch.map((customerId) => {
    const customerItems = items.filter((i) => i.customerId === customerId)
    const customerItemIds = customerItems.map((i) => i.id)
    const itemTotal = customerItems.reduce((sum, i) => sum + i.priceIDR, 0)
    const existing = existingByCustomer.get(customerId)
    existingByCustomer.delete(customerId)

    if (existing) {
      return { ...existing, itemIds: customerItemIds, total: itemTotal + existing.upnotesTotal }
    }
    newlyBilled += 1
    return {
      id: makeId('bbill'),
      batchId,
      batchNumber,
      customerId,
      itemIds: customerItemIds,
      upnotesTotal: 0,
      bankAccount: DEFAULT_BANK_ACCOUNT,
      total: itemTotal,
      status: 'Belum Bayar',
      createdAt: now,
    }
  })

  // Customers who were removed from the batch (edit) keep their bill record
  // but it no longer references any item.
  const orphaned = Array.from(existingByCustomer.values()).map((b) => ({
    ...b,
    itemIds: [],
    total: b.upnotesTotal,
  }))

  return { batchBills: [...otherBatchBills, ...syncedForBatch, ...orphaned], newlyBilled }
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      customers: seedCustomers,
      batches: seedBatches,
      boxes: seedBoxes,
      items: seedItems,
      batchBills: seedBatchBills,
      taxBills: seedTaxBills,
      estimatorConfig: seedEstimatorConfig,
      toasts: [],

      getCustomerName: (customerId) =>
        get().customers.find((c) => c.id === customerId)?.name ?? 'Unknown',

      getBoxNumber: (boxId) => get().boxes.find((b) => b.id === boxId)?.boxNumber ?? 'Unknown',

      pushToast: (message, tone = 'info') => {
        const id = makeId('toast')
        set((s) => ({ toasts: [...s.toasts, { id, message, tone }] }))
        setTimeout(() => {
          set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
        }, 4000)
      },
      dismissToast: (id) =>
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

      saveBatch: (input) => {
        const now = new Date().toISOString()
        const isEdit = Boolean(input.batchId)
        const batchId = input.batchId ?? makeId('batch')
        let newlyBilled = 0

        set((s) => {
          const existing = s.batches.find((b) => b.id === batchId)
          const batch: Batch = {
            id: batchId,
            batchNumber: input.batchNumber,
            boxId: existing?.boxId,
            orderIdWH: input.orderIdWH,
            orderType: input.orderType,
            photoDataUrls: input.photoDataUrls,
            orderStatus: existing?.orderStatus ?? 'Dibeli dari Seller',
            createdAt: isEdit ? (existing?.createdAt ?? now) : now,
            updatedAt: now,
          }
          const batches = isEdit
            ? s.batches.map((b) => (b.id === batchId ? batch : b))
            : [batch, ...s.batches]

          const incomingItems: Item[] = input.customerOrders.flatMap((order) =>
            order.items.map((it) => {
              const existing = it.id ? s.items.find((i) => i.id === it.id) : undefined
              return {
                id: it.id ?? makeId('item'),
                batchId,
                customerId: order.customerId,
                tipeBarang: it.tipeBarang,
                tipeKartu: it.tipeKartu,
                priceIDR: it.priceIDR,
                weightGrams: it.weightGrams ?? existing?.weightGrams,
                createdAt: existing?.createdAt ?? now,
                updatedAt: now,
              }
            }),
          )

          const items = [
            ...s.items.filter((i) => i.batchId !== batchId),
            ...incomingItems,
          ]

          const synced = syncBatchBillsForBatch(
            batchId,
            input.batchNumber,
            incomingItems,
            s.batchBills,
            now,
          )
          newlyBilled = synced.newlyBilled

          return { batches, items, batchBills: synced.batchBills }
        })

        get().pushToast(
          isEdit
            ? 'Batch record berhasil diperbarui.'
            : `Batch record berhasil disimpan. ${newlyBilled} tagihan otomatis diterbitkan.`,
          'success',
        )
      },

      deleteBatches: (batchIds) => {
        let deletedCount = 0
        let blockedCount = 0
        set((s) => {
          const targets = s.batches.filter((b) => batchIds.includes(b.id))
          const { eligible, blocked } = guardBatchDeletion(targets, s.items, s.taxBills, s.batchBills)
          deletedCount = eligible.length
          blockedCount = blocked.length
          const idSet = new Set(eligible.map((b) => b.id))
          return {
            batches: s.batches.filter((b) => !idSet.has(b.id)),
            items: s.items.filter((i) => !idSet.has(i.batchId)),
            batchBills: s.batchBills.filter((b) => !idSet.has(b.batchId)),
            boxes: s.boxes.map((box) => ({
              ...box,
              batchIds: box.batchIds.filter((id) => !idSet.has(id)),
            })),
          }
        })
        if (deletedCount > 0) {
          get().pushToast(
            deletedCount > 1 ? `${deletedCount} batch record dihapus.` : 'Batch record dihapus.',
            'success',
          )
        }
        if (blockedCount > 0) {
          get().pushToast(
            `${blockedCount} batch tidak bisa dihapus — masih punya item di tagihan pajak yang dipublikasikan, atau tagihan yang sudah dibayar/menunggu konfirmasi.`,
            'error',
          )
        }
      },

      saveBox: (input) => {
        const now = new Date().toISOString()
        const isEdit = Boolean(input.boxId)
        const boxId = input.boxId ?? makeId('box')

        set((s) => {
          const existing = s.boxes.find((b) => b.id === boxId)
          const status: BoxStatus = input.status ?? existing?.status ?? DEFAULT_BOX_STATUS
          // A box's batch composition locks the moment its status leaves
          // the default — same rule the UI enforces (BoxForm disables the
          // batch picker), re-asserted here so a stale/bypassed form can't
          // sneak a composition change through.
          const isLocked = Boolean(existing) && existing!.status !== DEFAULT_BOX_STATUS
          const batchIds = isLocked ? (existing?.batchIds ?? []) : input.batchIds
          const box: Box = {
            id: boxId,
            boxNumber: input.boxNumber,
            batchIds,
            status,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
          }
          const boxes = isEdit ? s.boxes.map((b) => (b.id === boxId ? box : b)) : [box, ...s.boxes]

          const includedIds = new Set(batchIds)
          const previouslyIncludedIds = new Set(existing?.batchIds ?? [])
          const batches = s.batches.map((b) => {
            if (includedIds.has(b.id)) {
              return { ...b, boxId: box.id, orderStatus: status, updatedAt: now }
            }
            if (previouslyIncludedIds.has(b.id)) {
              return { ...b, boxId: undefined, orderStatus: 'Dibeli dari Seller' as const, updatedAt: now }
            }
            return b
          })

          return { boxes, batches }
        })

        get().pushToast(isEdit ? 'Box berhasil diperbarui.' : 'Box baru berhasil dibuat.', 'success')
      },

      deleteBoxes: (boxIds) => {
        const now = new Date().toISOString()
        let deletedCount = 0
        let blockedCount = 0
        set((s) => {
          const targets = s.boxes.filter((b) => boxIds.includes(b.id))
          const { eligible, blocked } = guardBoxDeletion(targets)
          deletedCount = eligible.length
          blockedCount = blocked.length
          const idSet = new Set(eligible.map((b) => b.id))
          const affectedBatchIds = new Set(eligible.flatMap((b) => b.batchIds))
          return {
            boxes: s.boxes.filter((b) => !idSet.has(b.id)),
            batches: s.batches.map((b) =>
              affectedBatchIds.has(b.id)
                ? { ...b, boxId: undefined, orderStatus: 'Dibeli dari Seller' as const, updatedAt: now }
                : b,
            ),
          }
        })
        if (deletedCount > 0) {
          get().pushToast(deletedCount > 1 ? `${deletedCount} box dihapus.` : 'Box dihapus.', 'success')
        }
        if (blockedCount > 0) {
          get().pushToast(
            `${blockedCount} box tidak bisa dihapus — masih punya tagihan pajak yang dipublikasikan. Hapus tagihannya dulu.`,
            'error',
          )
        }
      },

      setItemWeights: (weights) => {
        const byId = new Map(weights.map((w) => [w.itemId, w.weightGrams]))
        set((s) => ({
          items: s.items.map((it) =>
            byId.has(it.id) ? { ...it, weightGrams: byId.get(it.id) } : it,
          ),
        }))
      },

      simulateCustomerUploadBatch: (batchBillId) => {
        set((s) => ({
          batchBills: s.batchBills.map((b) =>
            b.id === batchBillId
              ? { ...b, status: 'Menunggu Konfirmasi' as BatchBillStatus, buktiTransfer: attachDemoBukti() }
              : b,
          ),
        }))
      },

      confirmBatchBill: (batchBillId) => {
        set((s) => ({
          batchBills: s.batchBills.map((b) =>
            b.id === batchBillId
              ? { ...b, status: 'Lunas' as BatchBillStatus, paidAt: new Date().toISOString() }
              : b,
          ),
        }))
        get().pushToast('Pembayaran batch dikonfirmasi — status Lunas.', 'success')
      },

      rejectBatchBill: (batchBillId) => {
        set((s) => ({
          batchBills: s.batchBills.map((b) =>
            b.id === batchBillId
              ? { ...b, status: 'Belum Bayar' as BatchBillStatus, buktiTransfer: undefined, paidAt: undefined }
              : b,
          ),
        }))
        get().pushToast('Bukti transfer ditolak — customer diminta upload ulang.', 'error')
      },

      publishTaxBills: (bills, deadline) => {
        const nowIso = new Date().toISOString()
        set((s) => {
          const newBills: TaxBill[] = bills.map((b) => ({
            ...b,
            id: makeId('tbill'),
            publishedAt: nowIso,
            deadline,
            status: 'Belum Bayar',
            lateFeeIDR: 0,
          }))
          return { taxBills: [...newBills, ...s.taxBills] }
        })
        get().pushToast(
          `Tagihan pajak box ${get().getBoxNumber(bills[0]?.boxId ?? '')} diterbitkan ke ${bills.length} customer. Notifikasi terkirim.`,
          'success',
        )
      },

      simulateCustomerUploadTax: (taxBillId) => {
        set((s) => ({
          taxBills: s.taxBills.map((t) =>
            t.id === taxBillId
              ? { ...t, status: 'Menunggu Konfirmasi' as TaxBillStatus, buktiTransfer: attachDemoBukti() }
              : t,
          ),
        }))
      },

      confirmTaxBill: (taxBillId) => {
        set((s) => ({
          taxBills: s.taxBills.map((t) =>
            t.id === taxBillId ? { ...t, status: 'Lunas' as TaxBillStatus } : t,
          ),
        }))
        get().pushToast('Pembayaran pajak dikonfirmasi — status Lunas.', 'success')
      },

      rejectTaxBill: (taxBillId) => {
        set((s) => ({
          taxBills: s.taxBills.map((t) =>
            t.id === taxBillId
              ? { ...t, status: 'Belum Bayar' as TaxBillStatus, buktiTransfer: undefined }
              : t,
          ),
        }))
        get().pushToast('Bukti transfer pajak ditolak — customer diminta upload ulang.', 'error')
      },

      updateTaxBillAmount: (taxBillId, total) => {
        if (!Number.isFinite(total) || total < 0) {
          get().pushToast('Jumlah tagihan harus berupa angka 0 atau lebih.', 'error')
          return
        }
        let blocked = false
        set((s) => {
          const bill = s.taxBills.find((t) => t.id === taxBillId)
          if (!bill || bill.status === 'Lunas') {
            blocked = true
            return s
          }
          return {
            taxBills: s.taxBills.map((t) => (t.id === taxBillId ? { ...t, total } : t)),
          }
        })
        if (blocked) {
          get().pushToast('Tagihan yang sudah lunas tidak bisa diubah jumlahnya.', 'error')
        } else {
          get().pushToast('Jumlah tagihan pajak diperbarui.', 'success')
        }
      },

      updateTaxBillLateFee: (taxBillId, lateFeeIDR) => {
        if (!Number.isFinite(lateFeeIDR) || lateFeeIDR < 0) {
          get().pushToast('Denda telat harus berupa angka 0 atau lebih.', 'error')
          return
        }
        let blocked = false
        set((s) => {
          const bill = s.taxBills.find((t) => t.id === taxBillId)
          if (!bill || bill.status !== 'Belum Bayar') {
            blocked = true
            return s
          }
          return {
            taxBills: s.taxBills.map((t) => (t.id === taxBillId ? { ...t, lateFeeIDR } : t)),
          }
        })
        if (blocked) {
          get().pushToast(
            'Denda telat hanya bisa diubah selama tagihan masih Belum Bayar.',
            'error',
          )
        } else {
          get().pushToast('Denda telat diperbarui.', 'success')
        }
      },

      updateBoxDeadline: (boxId, deadline) => {
        set((s) => ({
          taxBills: s.taxBills.map((t) => (t.boxId === boxId ? { ...t, deadline } : t)),
        }))
        get().pushToast(`Deadline pembayaran box ${get().getBoxNumber(boxId)} diperbarui.`, 'success')
      },

      deleteTaxBills: (taxBillIds) => {
        let deletedCount = 0
        let blockedCount = 0
        set((s) => {
          const targets = s.taxBills.filter((t) => taxBillIds.includes(t.id))
          const { eligible, blocked } = guardTaxBillDeletion(targets)
          deletedCount = eligible.length
          blockedCount = blocked.length
          const idSet = new Set(eligible.map((t) => t.id))
          return { taxBills: s.taxBills.filter((t) => !idSet.has(t.id)) }
        })
        if (deletedCount > 0) {
          get().pushToast(
            deletedCount > 1 ? `${deletedCount} tagihan pajak dihapus.` : 'Tagihan pajak dihapus.',
            'success',
          )
        }
        if (blockedCount > 0) {
          get().pushToast(
            `${blockedCount} tagihan pajak tidak bisa dihapus — sudah lunas atau menunggu konfirmasi pembayaran.`,
            'error',
          )
        }
      },

      updateEstimatorConfig: (patch) => {
        set((s) => ({
          estimatorConfig: { ...s.estimatorConfig, ...patch, updatedAt: new Date().toISOString() },
        }))
        get().pushToast('Konfigurasi Price Estimator disimpan dan langsung berlaku.', 'success')
      },
    }),
    {
      name: 'go-aikatsu-admin-store-v2',
      // v1 introduced orderIdWH and switched photoDataUrl (single) to
      // photoDataUrls (array) on Batch. v2 added itemIds to TaxBill. v3
      // introduced the Box entity (Feature B) and dropped "Menunggu
      // Pembayaran ke Seller" from OrderStatus — box status is now the
      // single source of truth for every batch inside it. v4 renamed
      // BatchBillStatus to match TaxBillStatus's wording ("Belum Dibayar"
      // → "Belum Bayar", "Dibayar" → "Lunas"). v5 grew the seed customer
      // list from 5 to 15 — persisted state otherwise keeps whatever
      // `customers` array a browser already saved, so the 10 new demo
      // customers would silently never show up for anyone who'd already
      // used the app. Browsers with data saved before any of these
      // changes need their persisted records backfilled, or the app
      // crashes reading fields that don't exist yet, or shows a status
      // (or a missing customer) no longer matching the current app.
      // v6 adds TaxBill.lateFeeIDR (free-entry late payment fee, separate
      // from the product tax) — persisted bills saved before this need it
      // backfilled to 0, or reading it renders "NaN".
      // v7 replaces the loose Batch.boxNumber/TaxBill.boxNumber string join
      // with a stable Batch.boxId/TaxBill.boxId (matching Item.batchId's
      // pattern) — boxNumber is now resolved live from the Box record
      // wherever it's displayed, never stored or compared. Persisted
      // records saved before this need boxId backfilled from their old
      // boxNumber string, matched against the (by-then-existing) boxes
      // list, or they'd silently vanish from their box's grouping.
      version: 7,
      migrate: (persistedState) => {
        const state = persistedState as {
          customers?: Array<Record<string, unknown>>
          batches?: Array<Record<string, unknown>>
          boxes?: Array<Record<string, unknown>>
          taxBills?: Array<Record<string, unknown>>
          batchBills?: Array<Record<string, unknown>>
        }
        if (state?.customers) {
          const existingIds = new Set(state.customers.map((c) => c.id))
          const missingSeedCustomers = seedCustomers.filter((c) => !existingIds.has(c.id))
          state.customers = [
            ...state.customers,
            ...(missingSeedCustomers as unknown as Array<Record<string, unknown>>),
          ]
        }
        if (state?.batches) {
          state.batches = state.batches.map((b) => ({
            ...b,
            orderIdWH: b.orderIdWH ?? '',
            photoDataUrls: b.photoDataUrls ?? (b.photoDataUrl ? [b.photoDataUrl] : []),
            orderStatus: b.orderStatus === 'Menunggu Pembayaran ke Seller' ? 'Dibeli dari Seller' : b.orderStatus,
          }))
        }
        if (state?.taxBills) {
          state.taxBills = state.taxBills.map((t) => ({
            ...t,
            itemIds: t.itemIds ?? [],
            lateFeeIDR: t.lateFeeIDR ?? 0,
          }))
        }
        if (state?.batchBills) {
          const BATCH_BILL_STATUS_RENAME: Record<string, string> = {
            'Belum Dibayar': 'Belum Bayar',
            Dibayar: 'Lunas',
          }
          state.batchBills = state.batchBills.map((b) => ({
            ...b,
            status: BATCH_BILL_STATUS_RENAME[b.status as string] ?? b.status,
          }))
        }
        if (!state.boxes && state?.batches) {
          // Reconstruct one Box per pre-existing boxNumber, best-effort:
          // every batch in the group is forced onto the first batch's
          // status so the new "one box, one status" invariant holds.
          const byBoxNumber = new Map<string, Array<Record<string, unknown>>>()
          for (const b of state.batches) {
            const boxNumber = b.boxNumber as string | undefined
            if (!boxNumber) continue
            byBoxNumber.set(boxNumber, [...(byBoxNumber.get(boxNumber) ?? []), b])
          }
          state.boxes = Array.from(byBoxNumber.entries()).map(([boxNumber, batchesInBox]) => ({
            id: `box_migrated_${boxNumber}`,
            boxNumber,
            batchIds: batchesInBox.map((b) => b.id as string),
            status: (batchesInBox[0]?.orderStatus as string) ?? 'Di WH Jepang',
            createdAt: (batchesInBox[0]?.createdAt as string) ?? new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }))
          for (const box of state.boxes) {
            const idsInBox = new Set(box.batchIds as string[])
            state.batches = state.batches.map((b) =>
              idsInBox.has(b.id as string) ? { ...b, orderStatus: box.status } : b,
            )
          }
        }
        if (state?.boxes) {
          const boxIdByNumber = new Map(
            state.boxes.map((box) => [box.boxNumber as string, box.id as string]),
          )
          if (state?.batches) {
            state.batches = state.batches.map((b) => {
              if (b.boxId) return b
              const { boxNumber, ...rest } = b
              const boxId = boxNumber ? boxIdByNumber.get(boxNumber as string) : undefined
              return boxId ? { ...rest, boxId } : rest
            })
          }
          if (state?.taxBills) {
            state.taxBills = state.taxBills.map((t) => {
              if (t.boxId) return t
              const { boxNumber, ...rest } = t
              return { ...rest, boxId: boxIdByNumber.get(boxNumber as string) ?? 'box_unknown' }
            })
          }
        }
        return state
      },
    },
  ),
)
