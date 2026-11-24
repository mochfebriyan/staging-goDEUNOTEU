import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { TAX_REQUIRES_PAID_BATCH } from './config'
import * as remote from './lib/remote'
import { LINE_CHANNEL_ID, supabase } from './lib/supabase'
import type { Batch, BatchBill, Box, BuktiTransfer, Customer, EstimatorConfig, Item, PaymentMethod, TaxBill } from './shared/types'
import {
  seedBatchBills,
  seedBatches,
  seedBoxes,
  seedCustomers,
  seedEstimatorConfig,
  seedItems,
  seedTaxBills,
} from './shared/seed'

// Two modes, same state shape, so pages don't care which one runs:
//
// remote – Supabase + LINE Login configured (.env). Data is the signed-in
//          customer's own rows (RLS), loaded by loadRemote() once auth.ts
//          has linked the LINE account to a customer. Nothing is persisted
//          in localStorage.
// demo   – no .env: the admin's demo seed data in localStorage, with a
//          customer picker. Every action mirrors the backend's rules.

export type BillKind = 'batch' | 'tax'
export const MODE: 'remote' | 'demo' = supabase && LINE_CHANNEL_ID ? 'remote' : 'demo'

export interface Toast {
  id: string
  message: string
  tone: 'success' | 'error' | 'info'
}

interface Data {
  customers: Customer[]
  batches: Batch[]
  boxes: Box[]
  items: Item[]
  batchBills: BatchBill[]
  taxBills: TaxBill[]
  estimatorConfig: EstimatorConfig
}

interface State extends Data {
  customerId: string | null
  // demo: ids of derived notifications the customer has read
  readNotificationIds: string[]
  // remote: rows from the notifications table / my_batch_members()
  remoteNotifications: remote.RemoteNotification[]
  batchMembers: remote.BatchMember[]
  loading: boolean
  toasts: Toast[]
  loadRemote: (customer: Customer) => Promise<void>
  clearRemote: () => void
  login: (customerId: string) => void
  logout: () => void
  submitPayment: (input: {
    kind: BillKind
    billId: string
    method: PaymentMethod
    fileName: string
    dataUrl: string
  }) => Promise<boolean>
  markNotificationsRead: (ids: string[]) => void
  resetDemo: () => void
  pushToast: (message: string, tone?: Toast['tone']) => void
  dismissToast: (id: string) => void
}

function seedData(): Data {
  return {
    customers: seedCustomers,
    batches: seedBatches,
    boxes: seedBoxes,
    items: seedItems,
    batchBills: seedBatchBills,
    taxBills: seedTaxBills,
    estimatorConfig: seedEstimatorConfig,
  }
}

// Remote mode starts empty (signed out); the estimator config still comes
// from the seed until fetchEstimatorConfig() answers.
function emptyData(): Data {
  return { customers: [], batches: [], boxes: [], items: [], batchBills: [], taxBills: [], estimatorConfig: seedEstimatorConfig }
}

const newId = () => Math.random().toString(36).slice(2, 10)

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      ...(MODE === 'remote' ? emptyData() : seedData()),
      customerId: null,
      readNotificationIds: [],
      remoteNotifications: [],
      batchMembers: [],
      loading: false,
      toasts: [],

      // Called by auth.ts when a LINE account is linked to `customer`.
      loadRemote: async (customer) => {
        set({ loading: true, customerId: customer.id, customers: [customer] })
        try {
          const snap = await remote.fetchCustomerData()
          // Ignore a late answer for a customer who already signed out.
          if (get().customerId !== customer.id) return
          set({
            boxes: snap.boxes,
            batches: snap.batches,
            items: snap.items,
            batchBills: snap.batchBills,
            taxBills: snap.taxBills,
            estimatorConfig: snap.estimatorConfig,
            remoteNotifications: snap.notifications,
            batchMembers: snap.batchMembers,
          })
        } catch (e) {
          get().pushToast(`Gagal memuat data: ${(e as Error).message}`, 'error')
        } finally {
          set({ loading: false })
        }
      },

      clearRemote: () =>
        set((s) => ({ ...emptyData(), estimatorConfig: s.estimatorConfig, customerId: null, remoteNotifications: [], batchMembers: [] })),

      // Demo customer picker only.
      login: (customerId) => {
        set({ customerId })
        const name = get().customers.find((c) => c.id === customerId)?.name
        get().pushToast(`Masuk sebagai ${name}.`, 'success')
      },
      logout: () => {
        set({ customerId: null })
        get().pushToast('Kamu sudah keluar.', 'info')
      },

      // Same rules as submit_payment_proof(): only the bill's owner, only
      // while the bill is Belum Bayar. Remote mode lets the database enforce
      // them and then reloads.
      submitPayment: async ({ kind, billId, method, fileName, dataUrl }) => {
        const s = get()
        const fail = (msg: string) => {
          s.pushToast(msg, 'error')
          return false
        }
        const bill = kind === 'batch' ? s.batchBills.find((b) => b.id === billId) : s.taxBills.find((t) => t.id === billId)
        if (!bill) return fail('Tagihan tidak ditemukan.')
        if (bill.customerId !== s.customerId) return fail('Bukan tagihan milik kamu.')
        if (bill.status !== 'Belum Bayar') return fail('Tagihan ini sudah dibayar / menunggu konfirmasi.')
        if (kind === 'tax' && TAX_REQUIRES_PAID_BATCH && unpaidBatchBillsForTax(s, bill as TaxBill).length > 0) {
          return fail('Lunasi tagihan batch di box ini dulu.')
        }

        if (MODE === 'remote') {
          const customer = s.customers.find((c) => c.id === s.customerId)
          try {
            await remote.submitPaymentProof({ kind, billId, customerId: s.customerId!, method, fileName, dataUrl })
          } catch (e) {
            return fail(`Gagal mengirim bukti: ${(e as Error).message}`)
          }
          s.pushToast('Bukti transfer terkirim. Menunggu konfirmasi admin.', 'success')
          if (customer) await get().loadRemote(customer)
          return true
        }

        const bukti: BuktiTransfer = { fileName, dataUrl, uploadedAt: new Date().toISOString(), paymentMethod: method }
        if (kind === 'batch') {
          set({
            batchBills: s.batchBills.map((b) =>
              b.id === billId ? { ...b, status: 'Menunggu Konfirmasi', buktiTransfer: bukti } : b,
            ),
          })
        } else {
          set({
            taxBills: s.taxBills.map((t) =>
              t.id === billId ? { ...t, status: 'Menunggu Konfirmasi', buktiTransfer: bukti } : t,
            ),
          })
        }
        s.pushToast('Bukti transfer terkirim. Menunggu konfirmasi admin.', 'success')
        return true
      },

      markNotificationsRead: (ids) => {
        if (MODE === 'remote') {
          const unread = new Set(get().remoteNotifications.filter((n) => !n.read && ids.includes(n.id)).map((n) => n.id))
          if (unread.size === 0) return
          set((s) => ({ remoteNotifications: s.remoteNotifications.map((n) => (unread.has(n.id) ? { ...n, read: true } : n)) }))
          remote.markNotificationsRead([...unread]).catch((e) => console.error('Gagal menandai notifikasi:', e))
          return
        }
        set((s) => ({ readNotificationIds: Array.from(new Set([...s.readNotificationIds, ...ids])) }))
      },

      resetDemo: () => {
        set({ ...seedData(), readNotificationIds: [] })
        get().pushToast('Data demo dikembalikan ke awal.', 'info')
      },

      pushToast: (message, tone = 'info') => {
        const id = newId()
        set((s) => ({ toasts: [...s.toasts, { id, message, tone }] }))
        setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000)
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    }),
    {
      name: 'go-deunoteu-customer-demo-v5',
      // Only demo mode keeps data in this browser.
      partialize: (s) =>
        MODE === 'remote'
          ? {}
          : {
              customers: s.customers,
              batches: s.batches,
              boxes: s.boxes,
              items: s.items,
              batchBills: s.batchBills,
              taxBills: s.taxBills,
              estimatorConfig: s.estimatorConfig,
              customerId: s.customerId,
              readNotificationIds: s.readNotificationIds,
            },
      merge: (persisted, current) => (MODE === 'remote' ? current : { ...current, ...(persisted as Partial<State>) }),
    },
  ),
)

// The price calculator works without login (estimator_config is public).
if (MODE === 'remote') {
  remote
    .fetchEstimatorConfig()
    .then((estimatorConfig) => useStore.setState({ estimatorConfig }))
    .catch((e) => console.error('Gagal memuat konfigurasi kalkulator:', e))
}

// ── Selectors ───────────────────────────────────────────────────────
type Sel = Pick<
  State,
  'batches' | 'boxes' | 'items' | 'batchBills' | 'taxBills' | 'customerId' | 'customers' | 'batchMembers' | 'remoteNotifications' | 'readNotificationIds'
>

// FR-GO-1-001: one bill per batch the customer has items in. A bill with no
// items (customer removed from the batch) has a Rp0 total and is hidden.
export function myBatchBills(s: Pick<Sel, 'batchBills' | 'customerId'>): BatchBill[] {
  return s.batchBills
    .filter((b) => b.customerId === s.customerId && b.itemIds.length > 0)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function myTaxBills(s: Pick<Sel, 'taxBills' | 'customerId'>): TaxBill[] {
  return s.taxBills
    .filter((t) => t.customerId === s.customerId)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
}

export function myBatches(s: Pick<Sel, 'items' | 'batches' | 'customerId'>): Batch[] {
  const ids = new Set(s.items.filter((i) => i.customerId === s.customerId).map((i) => i.batchId))
  return s.batches.filter((b) => ids.has(b.id))
}

// Everyone with items in a batch: their item count, bill total (items +
// upnotes, falling back to the item sum before a bill exists) and payment
// status. Used for ReqShare batches, which several customers share.
// Remote mode: RLS hides other customers' rows, so this comes from the
// my_batch_members() function (migration 0006).
export interface BatchOwner {
  customerId: string
  name: string
  itemCount: number
  total: number
  status: BatchBill['status']
}
export function batchOwners(s: Sel, batchId: string): BatchOwner[] {
  if (MODE === 'remote') {
    return s.batchMembers
      .filter((m) => m.batchId === batchId)
      .map(({ customerId, name, itemCount, total, status }) => ({ customerId, name, itemCount, total, status }))
  }
  const items = s.items.filter((i) => i.batchId === batchId)
  return Array.from(new Set(items.map((i) => i.customerId))).map((customerId) => {
    const theirItems = items.filter((i) => i.customerId === customerId)
    const theirBill = s.batchBills.find((b) => b.batchId === batchId && b.customerId === customerId)
    return {
      customerId,
      name: s.customers.find((c) => c.id === customerId)?.name ?? '—',
      itemCount: theirItems.length,
      total: theirBill?.total ?? theirItems.reduce((sum, i) => sum + i.priceIDR, 0),
      status: theirBill?.status ?? 'Belum Bayar',
    }
  })
}

export function unpaidBatchBillsForTax(s: Pick<Sel, 'batches' | 'batchBills'>, tax: TaxBill): BatchBill[] {
  const batchIds = new Set(s.batches.filter((b) => b.boxId === tax.boxId).map((b) => b.id))
  return s.batchBills.filter(
    (b) => b.customerId === tax.customerId && batchIds.has(b.batchId) && b.itemIds.length > 0 && b.status !== 'Lunas',
  )
}

export interface Notification {
  id: string
  message: string
  at: string
  to: string
  read: boolean
}

// FR-GO-L-005. Remote: the notifications table, filled by the backend's
// notify_bill_change trigger (new batch bill, new tax bill, payment
// confirmed, proof rejected). Demo: derived from the bills.
export function myNotifications(s: Sel): Notification[] {
  if (MODE === 'remote') return s.remoteNotifications

  const read = new Set(s.readNotificationIds)
  const boxNumber = (id: string) => s.boxes.find((b) => b.id === id)?.boxNumber ?? '—'
  const out: Notification[] = []
  const add = (n: Omit<Notification, 'read'>) => out.push({ ...n, read: read.has(n.id) })
  for (const b of myBatchBills(s)) {
    add({ id: `new-${b.id}`, message: `Ada tagihan ${b.batchNumber} baru untuk kamu.`, at: b.createdAt, to: '/id/order' })
    if (b.status === 'Lunas' && b.paidAt)
      add({ id: `ok-${b.id}`, message: `Pembayaran tagihan ${b.batchNumber} sudah dikonfirmasi. Terima kasih!`, at: b.paidAt, to: '/id/order' })
  }
  for (const t of myTaxBills(s)) {
    const label = `tagihan pajak ${boxNumber(t.boxId)}`
    add({ id: `new-${t.id}`, message: `Ada ${label} baru untuk kamu.`, at: t.publishedAt, to: '/id/ems-tax' })
    if (t.status === 'Lunas')
      add({ id: `ok-${t.id}`, message: `Pembayaran ${label} sudah dikonfirmasi. Terima kasih!`, at: t.buktiTransfer?.uploadedAt ?? t.publishedAt, to: '/id/ems-tax' })
  }
  return out.sort((a, b) => b.at.localeCompare(a.at))
}
