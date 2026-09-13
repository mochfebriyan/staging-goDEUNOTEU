import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { Modal } from '../components/Modal'
import { TaxCalculationForm } from '../components/TaxCalculationForm'
import { TaxBoxDetailDialog } from '../components/TaxBoxDetailDialog'
import { DeadlineBadge } from '../components/DeadlineBadge'
import { EmptyState } from '../components/EmptyState'
import { PAGE_SIZE, Pagination } from '../components/Pagination'
import { daysRemaining, formatDate, formatIDR } from '../lib/format'
import { TAX_BILL_STATUSES, type TaxBill, type TaxBillStatus } from '../types'

const STATUS_PILL_TONE: Record<TaxBillStatus, string> = {
  'Belum Bayar': 'bg-rose-100 text-rose-700',
  'Menunggu Konfirmasi': 'bg-amber-100 text-amber-800',
  Lunas: 'bg-emerald-100 text-emerald-700',
}

interface BoxGroup {
  boxId: string
  boxNumber: string
  bills: TaxBill[]
  total: number
  counts: Record<TaxBillStatus, number>
  boxDeadline?: string
  publishedAt: string
}

export default function TaxBills() {
  const customers = useStore((s) => s.customers)
  const batches = useStore((s) => s.batches)
  const boxes = useStore((s) => s.boxes)
  const items = useStore((s) => s.items)
  const taxBills = useStore((s) => s.taxBills)
  const publishTaxBills = useStore((s) => s.publishTaxBills)
  const setItemWeights = useStore((s) => s.setItemWeights)
  const getCustomerName = useStore((s) => s.getCustomerName)
  const getBoxNumber = useStore((s) => s.getBoxNumber)

  const [formOpen, setFormOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<TaxBillStatus | ''>('')
  const [customerQuery, setCustomerQuery] = useState('')
  const [viewingBoxId, setViewingBoxId] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const boxOptions = useMemo(() => {
    const idsWithBatches = new Set(batches.map((b) => b.boxId).filter(Boolean))
    return boxes
      .filter((box) => idsWithBatches.has(box.id))
      .map((box) => ({ id: box.id, boxNumber: box.boxNumber }))
  }, [boxes, batches])

  function itemsByBox(boxId: string) {
    const batchIds = new Set(batches.filter((b) => b.boxId === boxId).map((b) => b.id))
    return items.filter((i) => batchIds.has(i.batchId))
  }

  function alreadyPublishedCustomerIds(boxId: string) {
    return new Set(taxBills.filter((t) => t.boxId === boxId).map((t) => t.customerId))
  }

  function boxDeadlineFor(boxId: string) {
    return taxBills.find((t) => t.boxId === boxId)?.deadline
  }

  // Dashboard shows one row per box; clicking a box opens the per-customer
  // breakdown of every tax bill published for that box.
  const boxGroups: BoxGroup[] = useMemo(() => {
    const map = new Map<string, TaxBill[]>()
    for (const t of taxBills) {
      map.set(t.boxId, [...(map.get(t.boxId) ?? []), t])
    }
    return Array.from(map.entries()).map(([boxId, bills]) => {
      const counts = TAX_BILL_STATUSES.reduce(
        (acc, s) => {
          acc[s] = bills.filter((b) => b.status === s).length
          return acc
        },
        {} as Record<TaxBillStatus, number>,
      )
      // Every batch under one box shares a single payment deadline, so
      // there's no "nearest" to pick between customers — any bill's
      // deadline represents the whole box.
      const hasUnpaid = bills.some((b) => b.status !== 'Lunas')
      const publishedAt = bills.reduce(
        (latest, b) => (b.publishedAt > latest ? b.publishedAt : latest),
        bills[0].publishedAt,
      )
      return {
        boxId,
        boxNumber: getBoxNumber(boxId),
        bills,
        total: bills.reduce((sum, b) => sum + b.total, 0),
        counts,
        boxDeadline: hasUnpaid ? bills[0].deadline : undefined,
        publishedAt,
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taxBills])

  const normalizedQuery = customerQuery.trim().toLowerCase()
  const filteredBoxes = boxGroups.filter((g) => {
    if (statusFilter && g.counts[statusFilter] === 0) return false
    if (normalizedQuery) {
      const hasMatchingCustomer = g.bills.some((b) =>
        getCustomerName(b.customerId).toLowerCase().includes(normalizedQuery),
      )
      if (!hasMatchingCustomer) return false
    }
    return true
  })
  const sortedBoxes = [...filteredBoxes].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))

  const totalPages = Math.max(1, Math.ceil(sortedBoxes.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageItems = sortedBoxes.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const counts = TAX_BILL_STATUSES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = taxBills.filter((t) => t.status === s).length
    return acc
  }, {})
  const overdueCount = taxBills.filter((t) => t.status !== 'Lunas' && daysRemaining(t.deadline) < 0).length

  // A pending confirmation outranks "how many are paid/unpaid" until it's
  // resolved — same rule as the batch Payment column on Order Recap.
  function statusPillsFor(group: BoxGroup): Array<[TaxBillStatus, number]> {
    if (group.counts['Menunggu Konfirmasi'] > 0) {
      return [['Menunggu Konfirmasi', group.counts['Menunggu Konfirmasi']]]
    }
    return TAX_BILL_STATUSES.filter((s) => s !== 'Menunggu Konfirmasi' && group.counts[s] > 0).map((s) => [
      s,
      group.counts[s],
    ])
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">C · Tax Bill Management (Tagihan Pajak EMS)</h2>
          <p className="text-sm text-slate-500">
            Hitung pembagian pajak per box, publikasikan ke customer, dan pantau deadline pembayaran. Klik
            sebuah box untuk melihat rincian tagihan tiap customer.
          </p>
        </div>
        <button
          onClick={() => setFormOpen(true)}
          className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-rose-700"
        >
          + Calculate & Publish
        </button>
      </div>

      {overdueCount > 0 && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
          {overdueCount} tagihan pajak sudah melewati deadline pembayaran dan masih belum lunas.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setStatusFilter('')
              setPage(1)
            }}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset ${
              statusFilter === '' ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200'
            }`}
          >
            Semua ({taxBills.length})
          </button>
          {TAX_BILL_STATUSES.map((s) => {
            const isPending = s === 'Menunggu Konfirmasi'
            return (
              <button
                key={s}
                onClick={() => {
                  setStatusFilter(s)
                  setPage(1)
                }}
                className={`relative rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset ${
                  statusFilter === s
                    ? 'bg-slate-900 text-white ring-slate-900'
                    : 'bg-white text-slate-600 ring-slate-200'
                }`}
              >
                {isPending ? s : `${s} (${counts[s]})`}
                {isPending && counts[s] > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white ring-2 ring-white">
                    {counts[s]}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <div className="relative w-full max-w-xs sm:w-64">
          <input
            type="text"
            value={customerQuery}
            onChange={(e) => {
              setCustomerQuery(e.target.value)
              setPage(1)
            }}
            placeholder="Cari nama customer…"
            aria-label="Cari nama customer"
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
          />
          {customerQuery && (
            <button
              type="button"
              onClick={() => {
                setCustomerQuery('')
                setPage(1)
              }}
              aria-label="Hapus pencarian"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {sortedBoxes.length === 0 ? (
        <EmptyState
          message={
            taxBills.length === 0
              ? 'Belum ada tagihan pajak yang dipublikasikan.'
              : 'Tidak ada box yang cocok dengan filter/pencarian ini.'
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Box</th>
                <th className="px-4 py-3">Total Pajak</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Published At</th>
                <th className="px-4 py-3">Deadline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageItems.map((group) => {
                const hasPendingConfirmation = group.counts['Menunggu Konfirmasi'] > 0
                return (
                <tr
                  key={group.boxId}
                  className={`cursor-pointer border-l-4 hover:bg-slate-50 ${
                    hasPendingConfirmation ? 'border-l-amber-400' : 'border-l-transparent'
                  }`}
                  onClick={() => setViewingBoxId(group.boxId)}
                >
                  <td className="px-4 py-3 font-medium text-slate-900">{group.boxNumber}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{formatIDR(group.total)}</td>
                  <td className="px-4 py-3 text-slate-700">{group.bills.length} customer</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {statusPillsFor(group).map(([s, count]) => (
                        <span
                          key={s}
                          className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_PILL_TONE[s]}`}
                        >
                          {count} {s}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(group.publishedAt)}</td>
                  <td className="px-4 py-3">
                    {group.boxDeadline ? (
                      <DeadlineBadge deadline={group.boxDeadline} isPaid={false} />
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        Semua Lunas
                      </span>
                    )}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
          <Pagination page={safePage} totalItems={sortedBoxes.length} onPageChange={setPage} />
        </div>
      )}

      {formOpen && (
        <Modal title="Calculate & Publish Tax Bill" onClose={() => setFormOpen(false)} wide>
          <TaxCalculationForm
            boxOptions={boxOptions}
            itemsByBox={itemsByBox}
            customers={customers}
            alreadyPublishedCustomerIds={alreadyPublishedCustomerIds}
            boxDeadlineFor={boxDeadlineFor}
            onSaveWeights={setItemWeights}
            onPublish={publishTaxBills}
            onCancel={() => setFormOpen(false)}
          />
        </Modal>
      )}

      {viewingBoxId && (
        <TaxBoxDetailDialog boxId={viewingBoxId} onClose={() => setViewingBoxId(null)} />
      )}
    </div>
  )
}
