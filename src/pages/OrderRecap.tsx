import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import { Modal } from '../components/Modal'
import { AlertDialog } from '../components/AlertDialog'
import { BatchForm } from '../components/BatchForm'
import { BatchDetailDialog } from '../components/BatchDetailDialog'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { CustomerCombobox } from '../components/CustomerCombobox'
import { guardBatchDeletion } from '../lib/deleteGuards'
import { formatDate, formatIDR } from '../lib/format'
import {
  BATCH_BILL_STATUSES,
  ORDER_STATUS_OPTIONS,
  ORDER_TYPE_OPTIONS,
  type Batch,
  type BatchBillStatus,
  type OrderStatus,
  type OrderType,
} from '../types'
import { EmptyState } from '../components/EmptyState'
import { PAGE_SIZE, Pagination } from '../components/Pagination'
import type { SaveBatchInput } from '../store/useStore'

const PAYMENT_PILL_TONE: Record<BatchBillStatus, string> = {
  'Belum Bayar': 'bg-rose-100 text-rose-700',
  'Menunggu Konfirmasi': 'bg-amber-100 text-amber-800',
  Lunas: 'bg-emerald-100 text-emerald-700',
}

const EMPTY_PAYMENT_COUNTS: Record<BatchBillStatus, number> = {
  'Belum Bayar': 0,
  'Menunggu Konfirmasi': 0,
  Lunas: 0,
}

export default function OrderRecap() {
  const batches = useStore((s) => s.batches)
  const items = useStore((s) => s.items)
  const batchBills = useStore((s) => s.batchBills)
  const taxBills = useStore((s) => s.taxBills)
  const customers = useStore((s) => s.customers)
  const getCustomerName = useStore((s) => s.getCustomerName)
  const saveBatch = useStore((s) => s.saveBatch)
  const deleteBatches = useStore((s) => s.deleteBatches)

  const [boxFilter, setBoxFilter] = useState('')
  const [batchFilter, setBatchFilter] = useState('')
  const [customerFilter, setCustomerFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('')
  const [orderTypeFilter, setOrderTypeFilter] = useState<OrderType | ''>('')
  const [paymentFilter, setPaymentFilter] = useState<BatchBillStatus | ''>('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingBatch, setEditingBatch] = useState<Batch | null>(null)
  const [viewingBatchId, setViewingBatchId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null)
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false)
  const [nothingToDeleteOpen, setNothingToDeleteOpen] = useState(false)
  const [page, setPage] = useState(1)
  const selectAllRef = useRef<HTMLInputElement>(null)

  const boxOptions = useMemo(
    () => Array.from(new Set(batches.map((b) => b.boxNumber).filter(Boolean))) as string[],
    [batches],
  )
  const batchOptions = useMemo(
    () => Array.from(new Set(batches.map((b) => b.batchNumber))),
    [batches],
  )

  // One batch can hold several customers, each with their own BatchBill —
  // so "payment status" per batch is a count per status, not one scalar.
  const paymentCountsByBatch = useMemo(() => {
    const map = new Map<string, Record<BatchBillStatus, number>>()
    for (const bill of batchBills) {
      const counts = map.get(bill.batchId) ?? { ...EMPTY_PAYMENT_COUNTS }
      counts[bill.status] += 1
      map.set(bill.batchId, counts)
    }
    return map
  }, [batchBills])

  function paymentCountsFor(batchId: string): Record<BatchBillStatus, number> {
    return paymentCountsByBatch.get(batchId) ?? EMPTY_PAYMENT_COUNTS
  }

  // A pending confirmation is the only thing worth surfacing once it
  // exists — it outranks "how many are paid/unpaid" until resolved.
  function paymentPillsFor(batchId: string): Array<[BatchBillStatus, number]> {
    const counts = paymentCountsFor(batchId)
    if (counts['Menunggu Konfirmasi'] > 0) {
      return [['Menunggu Konfirmasi', counts['Menunggu Konfirmasi']]]
    }
    return BATCH_BILL_STATUSES.filter((s) => s !== 'Menunggu Konfirmasi' && counts[s] > 0).map((s) => [
      s,
      counts[s],
    ])
  }

  // How many batches (not bills) contain at least one bill of each status —
  // drives the filter chip counts, including the "Menunggu Konfirmasi" badge.
  const paymentStatusBatchCounts = useMemo(() => {
    const acc: Record<BatchBillStatus, number> = { ...EMPTY_PAYMENT_COUNTS }
    for (const batch of batches) {
      const counts = paymentCountsByBatch.get(batch.id)
      if (!counts) continue
      for (const status of BATCH_BILL_STATUSES) {
        if (counts[status] > 0) acc[status] += 1
      }
    }
    return acc
  }, [batches, paymentCountsByBatch])

  const filtered = batches.filter((b) => {
    if (boxFilter && b.boxNumber !== boxFilter) return false
    if (batchFilter && b.batchNumber !== batchFilter) return false
    if (customerFilter) {
      const hasCustomer = items.some((i) => i.batchId === b.id && i.customerId === customerFilter)
      if (!hasCustomer) return false
    }
    if (statusFilter && b.orderStatus !== statusFilter) return false
    if (orderTypeFilter && b.orderType !== orderTypeFilter) return false
    if (paymentFilter && paymentCountsFor(b.id)[paymentFilter] === 0) return false
    return true
  })
  const sorted = [...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageItems = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const selectedInView = pageItems.filter((b) => selectedIds.has(b.id)).length
  const allInViewSelected = pageItems.length > 0 && selectedInView === pageItems.length

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selectedInView > 0 && !allInViewSelected
    }
  }, [selectedInView, allInViewSelected])

  function handleCreate(input: SaveBatchInput) {
    saveBatch(input)
  }

  function handleEdit(input: SaveBatchInput) {
    saveBatch(input)
  }

  // Shift-click selects the whole visible range in one go — the intended
  // workflow is checking a run of batches (eg. batch 1-200) that all
  // belong to the same box, identified only after the fact. Range is
  // scoped to the current page, same as "select all".
  function handleRowCheckboxClick(batchId: string, index: number, shiftKey: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (shiftKey && lastClickedIndex !== null) {
        const [start, end] = [lastClickedIndex, index].sort((a, b) => a - b)
        for (let i = start; i <= end; i++) next.add(pageItems[i].id)
      } else if (next.has(batchId)) {
        next.delete(batchId)
      } else {
        next.add(batchId)
      }
      return next
    })
    setLastClickedIndex(index)
  }

  function handleSelectAllToggle() {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allInViewSelected) {
        pageItems.forEach((b) => next.delete(b.id))
      } else {
        pageItems.forEach((b) => next.add(b.id))
      }
      return next
    })
  }

  function handleDeleteClick() {
    if (eligibleBatchesToDelete.length === 0) {
      setNothingToDeleteOpen(true)
    } else {
      setBulkDeleteConfirmOpen(true)
    }
  }

  function handleBulkDeleteConfirm() {
    deleteBatches(Array.from(selectedIds))
    setSelectedIds(new Set())
    setBulkDeleteConfirmOpen(false)
  }

  const selectedBatchesForDelete = batches.filter((b) => selectedIds.has(b.id))
  const { eligible: eligibleBatchesToDelete, blocked: blockedBatchesToDelete } = guardBatchDeletion(
    selectedBatchesForDelete,
    items,
    taxBills,
    batchBills,
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">A · Order Recap & Batch Payments</h2>
          <p className="text-sm text-slate-500">
            Satu form = satu batch = satu invoice/order link — satu batch bisa berisi order dari
            beberapa customer. Menyimpan batch otomatis menerbitkan tagihan per customer; buka detail
            batch untuk melihat dan mengonfirmasi pembayaran tiap customer di tempat yang sama.
          </p>
        </div>
        <button
          onClick={() => setFormOpen(true)}
          className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-rose-700"
        >
          + New Batch Record
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Box Number</label>
          <select
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            value={boxFilter}
            onChange={(e) => {
              setBoxFilter(e.target.value)
              setPage(1)
            }}
          >
            <option value="">Semua Box</option>
            {boxOptions.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Batch Number</label>
          <select
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            value={batchFilter}
            onChange={(e) => {
              setBatchFilter(e.target.value)
              setPage(1)
            }}
          >
            <option value="">Semua Batch</option>
            {batchOptions.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
        <div className="w-48">
          <label className="mb-1 block text-xs font-medium text-slate-500">Customer</label>
          <CustomerCombobox
            customers={customers}
            value={customerFilter}
            onChange={(customerId) => {
              setCustomerFilter(customerId)
              setPage(1)
            }}
            allowClear
            clearLabel="Semua Customer"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Order Status</label>
          <select
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as OrderStatus | '')
              setPage(1)
            }}
          >
            <option value="">Semua Status</option>
            {ORDER_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Order Type</label>
          <select
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            value={orderTypeFilter}
            onChange={(e) => {
              setOrderTypeFilter(e.target.value as OrderType | '')
              setPage(1)
            }}
          >
            <option value="">Semua Order Type</option>
            {ORDER_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        {(boxFilter || batchFilter || customerFilter || statusFilter || orderTypeFilter || paymentFilter) && (
          <button
            className="text-xs text-slate-500 underline"
            onClick={() => {
              setBoxFilter('')
              setBatchFilter('')
              setCustomerFilter('')
              setStatusFilter('')
              setOrderTypeFilter('')
              setPaymentFilter('')
              setPage(1)
            }}
          >
            Reset filter
          </button>
        )}
        <span className="ml-auto text-xs text-slate-400">{sorted.length} batch ditemukan</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            setPaymentFilter('')
            setPage(1)
          }}
          className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset ${
            paymentFilter === ''
              ? 'bg-slate-900 text-white ring-slate-900'
              : 'bg-white text-slate-600 ring-slate-200'
          }`}
        >
          Semua Payment ({batches.length})
        </button>
        {BATCH_BILL_STATUSES.map((s) => {
          const isPending = s === 'Menunggu Konfirmasi'
          const count = paymentStatusBatchCounts[s]
          return (
            <button
              key={s}
              onClick={() => {
                setPaymentFilter(s)
                setPage(1)
              }}
              className={`relative rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset ${
                paymentFilter === s
                  ? 'bg-slate-900 text-white ring-slate-900'
                  : 'bg-white text-slate-600 ring-slate-200'
              }`}
            >
              {isPending ? s : `${s} (${count})`}
              {isPending && count > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white ring-2 ring-white">
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
          <span className="text-sm font-medium text-rose-700">
            {selectedIds.size} batch dipilih
          </span>
          <div className="flex items-center gap-4">
            <button
              onClick={handleDeleteClick}
              className="rounded-md border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100"
            >
              Delete
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-xs font-medium text-rose-600 hover:underline"
            >
              Batalkan pilihan
            </button>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <EmptyState message="Belum ada batch record yang cocok dengan filter ini." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allInViewSelected}
                    onChange={handleSelectAllToggle}
                    aria-label="Pilih semua batch yang tampil"
                    className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-400"
                  />
                </th>
                <th className="px-4 py-3">Foto</th>
                <th className="px-4 py-3">Box</th>
                <th className="px-4 py-3">Batch</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Total Item</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created At</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageItems.map((batch, index) => {
                const batchItems = items.filter((i) => i.batchId === batch.id)
                const customerIds = new Set(batchItems.map((i) => i.customerId))
                const total = batchItems.reduce((sum, i) => sum + i.priceIDR, 0)
                const hasPendingConfirmation = paymentCountsFor(batch.id)['Menunggu Konfirmasi'] > 0
                return (
                  <tr
                    key={batch.id}
                    className={`cursor-pointer hover:bg-slate-50 ${
                      selectedIds.has(batch.id) ? 'bg-rose-50/60' : ''
                    }`}
                    onClick={() => setViewingBatchId(batch.id)}
                  >
                    <td
                      className={`border-l-4 px-4 py-3 ${
                        hasPendingConfirmation ? 'border-l-amber-400' : 'border-l-transparent'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(batch.id)}
                        onChange={() => {}}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRowCheckboxClick(batch.id, index, e.shiftKey)
                        }}
                        aria-label={`Pilih ${batch.batchNumber}`}
                        className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-400"
                      />
                    </td>
                    <td className="px-4 py-3">
                      {batch.photoDataUrls?.[0] ? (
                        <img
                          src={batch.photoDataUrls[0]}
                          alt="batch"
                          className="h-10 w-10 rounded object-cover"
                        />
                      ) : (
                        <span className="text-xs text-slate-400">no photo</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{batch.boxNumber ?? '—'}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{batch.batchNumber}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {Array.from(customerIds)
                        .map((cid) => getCustomerName(cid))
                        .join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{formatIDR(total)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {paymentPillsFor(batch.id).length === 0 ? (
                          <span className="text-xs text-slate-400">—</span>
                        ) : (
                          paymentPillsFor(batch.id).map(([status, count]) => (
                            <span
                              key={status}
                              className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${PAYMENT_PILL_TONE[status]}`}
                            >
                              {count} {status}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        {batch.orderStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(batch.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingBatch(batch)
                        }}
                        className="text-xs font-medium text-rose-600 hover:underline"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <Pagination page={safePage} totalItems={sorted.length} onPageChange={setPage} />
        </div>
      )}

      <p className="text-xs text-slate-400">
        Data terakhir diperbarui:{' '}
        {batches.length > 0
          ? formatDate(
              batches.reduce((latest, b) => (b.updatedAt > latest ? b.updatedAt : latest), batches[0].updatedAt),
            )
          : '—'}
      </p>

      {formOpen && (
        <Modal title="New Batch Record" onClose={() => setFormOpen(false)} wide>
          <BatchForm customers={customers} onSubmit={handleCreate} onCancel={() => setFormOpen(false)} />
        </Modal>
      )}

      {editingBatch && (
        <Modal title="Edit Batch Record" onClose={() => setEditingBatch(null)} wide>
          <BatchForm
            customers={customers}
            initial={{
              batch: editingBatch,
              items: items.filter((i) => i.batchId === editingBatch.id),
            }}
            onSubmit={handleEdit}
            onCancel={() => setEditingBatch(null)}
          />
        </Modal>
      )}

      {viewingBatchId && (
        <BatchDetailDialog
          batchId={viewingBatchId}
          onClose={() => setViewingBatchId(null)}
          onEdit={() => {
            const b = batches.find((x) => x.id === viewingBatchId)
            if (b) {
              setEditingBatch(b)
              setViewingBatchId(null)
            }
          }}
        />
      )}

      {bulkDeleteConfirmOpen && (
        <ConfirmDialog
          title={`Hapus ${selectedIds.size} Batch Record?`}
          message={
            `${eligibleBatchesToDelete.length} batch akan dihapus, beserta item dan tagihannya.` +
            (blockedBatchesToDelete.length > 0
              ? ` ${blockedBatchesToDelete.length} batch dilewati karena punya item di tagihan pajak yang dipublikasikan, atau tagihan yang sudah dibayar/menunggu konfirmasi.`
              : '') +
            ' Tindakan ini tidak bisa dibatalkan.'
          }
          onConfirm={handleBulkDeleteConfirm}
          onCancel={() => setBulkDeleteConfirmOpen(false)}
        />
      )}

      {nothingToDeleteOpen && (
        <AlertDialog
          tone="error"
          title="Tidak Ada yang Bisa Dihapus"
          message="Semua batch yang dipilih punya item di tagihan pajak yang dipublikasikan, atau tagihan yang sudah dibayar/menunggu konfirmasi — jadi tidak ada yang bisa dihapus."
          onClose={() => setNothingToDeleteOpen(false)}
        />
      )}
    </div>
  )
}
