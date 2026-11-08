import { useState } from 'react'
import {
  ORDER_TYPE_OPTIONS,
  TIPE_BARANG_OPTIONS,
  TIPE_KARTU_OPTIONS,
  type Batch,
  type Customer,
  type Item,
  type OrderType,
  type TipeBarang,
  type TipeKartu,
} from '../types'
import { MultiImageInput } from './MultiImageInput'
import { AlertDialog } from './AlertDialog'
import { ConfirmDialog } from './ConfirmDialog'
import { CustomerCombobox } from './CustomerCombobox'
import { makeId } from '../lib/id'
import { guardBatchDeletion } from '../lib/deleteGuards'
import { formatIDR } from '../lib/format'
import { BATCH_NUMBER_PREFIX, extractNumber, formatWithPrefix } from '../lib/numberedId'
import { useStore, type SaveBatchInput } from '../store/useStore'

interface ItemRow {
  localId: string
  id?: string
  tipeBarang: TipeBarang | ''
  tipeKartu?: TipeKartu
  priceIDR: number
  weightGrams?: number
  description?: string
}

const DESCRIPTION_MAX_LENGTH = 500

interface CustomerOrderRow {
  localId: string
  customerId: string
  items: ItemRow[]
}

function emptyItemRow(): ItemRow {
  return { localId: makeId('row'), tipeBarang: '', priceIDR: 0 }
}

function emptyCustomerOrder(): CustomerOrderRow {
  return { localId: makeId('order'), customerId: '', items: [emptyItemRow()] }
}

function toCustomerOrders(items: Item[]): CustomerOrderRow[] {
  const byCustomer = new Map<string, ItemRow[]>()
  for (const it of items) {
    const row: ItemRow = {
      localId: makeId('row'),
      id: it.id,
      tipeBarang: it.tipeBarang,
      tipeKartu: it.tipeKartu,
      priceIDR: it.priceIDR,
      weightGrams: it.weightGrams,
      description: it.description,
    }
    byCustomer.set(it.customerId, [...(byCustomer.get(it.customerId) ?? []), row])
  }
  return Array.from(byCustomer.entries()).map(([customerId, items]) => ({
    localId: makeId('order'),
    customerId,
    items,
  }))
}

export function BatchForm({
  customers,
  initial,
  onSubmit,
  onCancel,
}: {
  customers: Customer[]
  initial?: { batch: Batch; items: Item[] }
  onSubmit: (input: SaveBatchInput) => Promise<boolean>
  onCancel: () => void
}) {
  const allBatches = useStore((s) => s.batches)

  const [batchNumberValue, setBatchNumberValue] = useState<number | ''>(() => {
    if (initial) return extractNumber(initial.batch.batchNumber, BATCH_NUMBER_PREFIX)
    // Prefill a new batch's number as (latest existing batch number) + 1 —
    // batch numbers are assigned sequentially, so this is the expected
    // next value the admin would otherwise type in by hand.
    const latest = allBatches.reduce((max, b) => {
      const n = extractNumber(b.batchNumber, BATCH_NUMBER_PREFIX)
      return typeof n === 'number' && n > max ? n : max
    }, 0)
    return latest + 1
  })
  const [orderIdWH, setOrderIdWH] = useState(initial?.batch.orderIdWH ?? '')
  const [orderType, setOrderType] = useState<OrderType>(initial?.batch.orderType ?? 'ReqShare')
  const [photoDataUrls, setPhotoDataUrls] = useState<string[]>(initial?.batch.photoDataUrls ?? [])
  const [customerOrders, setCustomerOrders] = useState<CustomerOrderRow[]>(
    initial ? toCustomerOrders(initial.items) : [emptyCustomerOrder()],
  )
  const [dialog, setDialog] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const batchBills = useStore((s) => s.batchBills)
  const taxBills = useStore((s) => s.taxBills)
  const deleteBatches = useStore((s) => s.deleteBatches)
  // A customer's items lock once their bill is Lunas or Menunggu
  // Konfirmasi — money's either settled or already in flight, so editing
  // items out from under it would silently change what they owe.
  const protectedCustomerBillStatus = new Map(
    initial
      ? batchBills
          .filter(
            (b) =>
              b.batchId === initial.batch.id &&
              (b.status === 'Lunas' || b.status === 'Menunggu Konfirmasi'),
          )
          .map((b) => [b.customerId, b.status] as const)
      : [],
  )
  const deleteGuard = initial
    ? guardBatchDeletion([initial.batch], initial.items, taxBills, batchBills)
    : null
  const isDeleteBlocked = Boolean(deleteGuard && deleteGuard.blocked.length > 0)
  const deleteBlockReason = deleteGuard?.blocked[0]?.reason

  function handleDeleteConfirm() {
    if (!initial) return
    deleteBatches([initial.batch.id])
    setDeleteConfirmOpen(false)
    onCancel()
  }

  function updateOrder(localId: string, patch: Partial<CustomerOrderRow>) {
    setCustomerOrders((rows) => rows.map((r) => (r.localId === localId ? { ...r, ...patch } : r)))
  }

  function updateItem(orderLocalId: string, itemLocalId: string, patch: Partial<ItemRow>) {
    setCustomerOrders((rows) =>
      rows.map((r) =>
        r.localId !== orderLocalId
          ? r
          : {
              ...r,
              items: r.items.map((it) => (it.localId === itemLocalId ? { ...it, ...patch } : it)),
            },
      ),
    )
  }

  function addCustomerOrder() {
    setCustomerOrders((rows) => [...rows, emptyCustomerOrder()])
  }

  function removeCustomerOrder(localId: string) {
    setCustomerOrders((rows) => rows.filter((r) => r.localId !== localId))
  }

  function addItem(orderLocalId: string) {
    setCustomerOrders((rows) =>
      rows.map((r) =>
        r.localId === orderLocalId ? { ...r, items: [...r.items, emptyItemRow()] } : r,
      ),
    )
  }

  function removeItem(orderLocalId: string, itemLocalId: string) {
    setCustomerOrders((rows) =>
      rows.map((r) =>
        r.localId === orderLocalId
          ? { ...r, items: r.items.filter((it) => it.localId !== itemLocalId) }
          : r,
      ),
    )
  }

  const usedCustomerIds = new Set(customerOrders.map((r) => r.customerId).filter(Boolean))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    const fail = (message: string) => setDialog({ tone: 'error', message })
    if (batchNumberValue === '' || !Number.isInteger(batchNumberValue) || batchNumberValue <= 0) {
      return fail('Batch Number wajib diisi dengan angka.')
    }
    if (!orderIdWH.trim()) return fail('Order ID (WH) wajib diisi.')
    if (customerOrders.length === 0) return fail('Tambahkan minimal satu customer.')
    for (const order of customerOrders) {
      if (!order.customerId) return fail('Setiap bagian customer wajib memilih customer.')
      if (order.items.length === 0) {
        return fail('Setiap customer wajib memiliki minimal satu item.')
      }
      for (const it of order.items) {
        if (!it.tipeBarang) return fail('Tipe Barang wajib dipilih untuk setiap item.')
        if (it.tipeBarang === 'Kartu' && !it.tipeKartu) {
          return fail('Tipe Kartu wajib dipilih untuk item bertipe Kartu.')
        }
        if (it.tipeBarang !== 'Kartu' && !(it.weightGrams && it.weightGrams > 0)) {
          return fail('Berat (gram) wajib diisi untuk item non-Kartu.')
        }
        if (it.priceIDR <= 0) return fail('Harga item (IDR) harus lebih dari 0.')
        if ((it.description ?? '').trim().length > DESCRIPTION_MAX_LENGTH) {
          return fail(`Deskripsi item maksimal ${DESCRIPTION_MAX_LENGTH} karakter.`)
        }
      }
    }
    const ids = customerOrders.map((r) => r.customerId)
    if (new Set(ids).size !== ids.length) {
      return fail('Satu customer hanya boleh muncul sekali per batch — gabungkan itemnya.')
    }

    // onSubmit resolves once the store has saved (instantly in demo mode,
    // after the Supabase round-trip otherwise) — false means it failed and
    // already toasted why. If it throws for any other reason we must still
    // surface a dialog rather than leaving the sheet open with no feedback.
    setSubmitting(true)
    try {
      const saved = await onSubmit({
        batchId: initial?.batch.id,
        batchNumber: formatWithPrefix(BATCH_NUMBER_PREFIX, batchNumberValue, 2)!,
        orderIdWH: orderIdWH.trim(),
        orderType,
        photoDataUrls,
        customerOrders: customerOrders.map((order) => ({
          customerId: order.customerId,
          items: order.items.map((it) => ({
            id: it.id,
            tipeBarang: it.tipeBarang as TipeBarang,
            tipeKartu: it.tipeBarang === 'Kartu' ? it.tipeKartu : undefined,
            priceIDR: it.priceIDR,
            weightGrams: it.tipeBarang !== 'Kartu' ? it.weightGrams : undefined,
            description: it.description?.trim() || undefined,
          })),
        })),
      })

      setDialog(
        saved
          ? {
              tone: 'success',
              message: initial ? 'Perubahan batch berhasil disimpan.' : 'Batch record baru berhasil disimpan.',
            }
          : { tone: 'error', message: 'Batch belum tersimpan — lihat pesan error di pojok kanan bawah.' },
      )
    } catch (err) {
      setDialog({
        tone: 'error',
        message: `Gagal menyimpan batch: ${err instanceof Error ? err.message : 'terjadi kesalahan tak terduga.'}`,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            1 · Batch Information
          </p>
          <p className="text-xs text-slate-400">
            <span className="text-rose-500">*</span> wajib diisi
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 rounded-lg border border-slate-200 p-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Batch Number <span className="text-rose-500">*</span>
            </label>
            <div className="flex items-stretch gap-2">
              <span className="flex items-center whitespace-nowrap rounded-md border border-slate-300 bg-slate-50 px-3 text-sm font-medium text-slate-500">
                {BATCH_NUMBER_PREFIX} -
              </span>
              <input
                type="number"
                min={1}
                step={1}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                value={batchNumberValue}
                onChange={(e) =>
                  setBatchNumberValue(e.target.value === '' ? '' : Math.trunc(Number(e.target.value)))
                }
                placeholder="01"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Order ID (WH) <span className="text-rose-500">*</span>
            </label>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
              value={orderIdWH}
              onChange={(e) => setOrderIdWH(e.target.value)}
              placeholder="e.g. m12345678910"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Order Type <span className="text-rose-500">*</span>
            </label>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
              value={orderType}
              onChange={(e) => setOrderType(e.target.value as OrderType)}
            >
              {ORDER_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Order status batch baru selalu dimulai dari{' '}
            <span className="font-medium text-slate-700">Dibeli dari Seller</span> dan tidak bisa diubah
            di sini — status hanya berubah lewat Box Management, saat batch ini dimasukkan ke sebuah box.
          </div>
          <div className="col-span-2">
            <MultiImageInput label="Foto Produk" values={photoDataUrls} onChange={setPhotoDataUrls} />
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            2 · Per-Customer Orders
          </p>
          <button
            type="button"
            onClick={addCustomerOrder}
            className="text-xs font-medium text-rose-600 hover:underline"
          >
            + Add Customer
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {customerOrders.map((order) => {
            const lockedStatus = protectedCustomerBillStatus.get(order.customerId)
            const isLocked = Boolean(lockedStatus)
            return (
            <div
              key={order.localId}
              className={`rounded-lg border p-4 ${isLocked ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200'}`}
            >
              <div className="mb-3 flex items-end justify-between gap-3">
                <div className="w-full max-w-xs">
                  <label className="mb-1 block text-xs text-slate-500">
                    Customer <span className="text-rose-500">*</span>
                  </label>
                  <CustomerCombobox
                    customers={customers}
                    value={order.customerId}
                    onChange={(customerId) => updateOrder(order.localId, { customerId })}
                    disabled={isLocked}
                    disabledIds={usedCustomerIds}
                  />
                </div>
                {isLocked && (
                  <span
                    className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700"
                    title="Pembayaran customer ini sudah lunas atau sedang menunggu konfirmasi — item terkunci agar tidak berubah diam-diam."
                  >
                    {lockedStatus} — terkunci
                  </span>
                )}
                {!isLocked && customerOrders.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeCustomerOrder(order.localId)}
                    className="text-xs text-rose-600 hover:underline"
                  >
                    Remove customer
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-2">
                {order.items.map((it) => (
                  <div
                    key={it.localId}
                    className="grid grid-cols-12 items-end gap-2 rounded-md bg-slate-50 p-2"
                  >
                    <div className="col-span-4">
                      <label className="mb-1 block text-xs text-slate-500">
                        Tipe Barang <span className="text-rose-500">*</span>
                      </label>
                      <select
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                        value={it.tipeBarang}
                        onChange={(e) =>
                          updateItem(order.localId, it.localId, {
                            tipeBarang: e.target.value as TipeBarang | '',
                            // switching type invalidates whichever conditional
                            // field belonged to the previous type
                            tipeKartu: undefined,
                            weightGrams: undefined,
                          })
                        }
                        disabled={isLocked}
                      >
                        <option value="">Pilih tipe barang…</option>
                        {TIPE_BARANG_OPTIONS.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-4">
                      {it.tipeBarang === 'Kartu' && (
                        <>
                          <label className="mb-1 block text-xs text-slate-500">
                            Tipe Kartu <span className="text-rose-500">*</span>
                          </label>
                          <select
                            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                            value={it.tipeKartu ?? ''}
                            onChange={(e) =>
                              updateItem(order.localId, it.localId, {
                                tipeKartu: e.target.value as TipeKartu,
                              })
                            }
                            disabled={isLocked}
                          >
                            <option value="">Pilih…</option>
                            {TIPE_KARTU_OPTIONS.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </>
                      )}
                      {it.tipeBarang && it.tipeBarang !== 'Kartu' && (
                        <>
                          <label className="mb-1 block text-xs text-slate-500">
                            Berat (gram) <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="number"
                            min={0}
                            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                            value={it.weightGrams ?? ''}
                            onChange={(e) =>
                              updateItem(order.localId, it.localId, {
                                weightGrams: Number(e.target.value),
                              })
                            }
                            placeholder="gram"
                            disabled={isLocked}
                          />
                        </>
                      )}
                    </div>
                    <div className="col-span-3">
                      <label className="mb-1 block text-xs text-slate-500">
                        Harga (IDR) <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="number"
                        min={0}
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                        value={it.priceIDR || ''}
                        onChange={(e) =>
                          updateItem(order.localId, it.localId, { priceIDR: Number(e.target.value) })
                        }
                        disabled={isLocked}
                      />
                    </div>
                    <div className="col-span-1 flex justify-end">
                      {!isLocked && order.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(order.localId, it.localId)}
                          className="text-xs text-rose-600 hover:underline"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <div className="col-span-11">
                      <label className="mb-1 block text-xs text-slate-500">
                        Deskripsi <span className="text-slate-400">(opsional)</span>
                      </label>
                      <input
                        type="text"
                        maxLength={DESCRIPTION_MAX_LENGTH}
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                        value={it.description ?? ''}
                        onChange={(e) =>
                          updateItem(order.localId, it.localId, { description: e.target.value })
                        }
                        placeholder="Contoh: nama karakter, seri, kondisi barang"
                        disabled={isLocked}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-2 flex items-center justify-between">
                {!isLocked ? (
                  <button
                    type="button"
                    onClick={() => addItem(order.localId)}
                    className="text-xs font-medium text-rose-600 hover:underline"
                  >
                    + Add Item
                  </button>
                ) : (
                  <span />
                )}
                <span className="text-xs text-slate-400">
                  Subtotal: {formatIDR(order.items.reduce((sum, it) => sum + (it.priceIDR || 0), 0))}
                </span>
              </div>
            </div>
            )
          })}
        </div>
      </div>

      <div className="mt-1 flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
        {initial ? (
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={isDeleteBlocked}
              className="rounded-md border border-rose-300 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Hapus Batch
            </button>
            {isDeleteBlocked && (
              <span className="text-xs text-slate-400">Tidak bisa dihapus — {deleteBlockReason}.</span>
            )}
          </div>
        ) : (
          <span />
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {submitting ? 'Menyimpan…' : initial ? 'Simpan Perubahan' : 'Simpan Batch'}
          </button>
        </div>
      </div>

      {dialog && (
        <AlertDialog
          tone={dialog.tone}
          title={dialog.tone === 'success' ? 'Berhasil' : 'Gagal Menyimpan'}
          message={dialog.message}
          onClose={() => {
            const wasSuccess = dialog.tone === 'success'
            setDialog(null)
            if (wasSuccess) onCancel()
          }}
        />
      )}

      {deleteConfirmOpen && initial && (
        <ConfirmDialog
          title={`Hapus ${initial.batch.batchNumber}?`}
          message="Tindakan ini tidak bisa dibatalkan — semua item dan tagihan pada batch ini akan ikut terhapus."
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteConfirmOpen(false)}
        />
      )}
    </form>
  )
}
