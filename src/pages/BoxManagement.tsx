import { useState } from 'react'
import { useStore } from '../store/useStore'
import { Modal } from '../components/Modal'
import { BoxForm } from '../components/BoxForm'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyState } from '../components/EmptyState'
import { PAGE_SIZE, Pagination } from '../components/Pagination'
import { formatDate } from '../lib/format'
import type { Box } from '../types'

export default function BoxManagement() {
  const boxes = useStore((s) => s.boxes)
  const batches = useStore((s) => s.batches)
  const saveBox = useStore((s) => s.saveBox)
  const deleteBoxes = useStore((s) => s.deleteBoxes)

  const [formOpen, setFormOpen] = useState(false)
  const [viewingBox, setViewingBox] = useState<Box | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [page, setPage] = useState(1)

  const sorted = [...boxes].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageItems = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  function batchNumbersFor(box: Box) {
    return box.batchIds
      .map((id) => batches.find((b) => b.id === id)?.batchNumber)
      .filter((n): n is string => Boolean(n))
  }

  // Delete only ever targets the box currently open in the detail card —
  // there's no bulk/table delete, so a wrong-checkbox mistake isn't possible.
  // BoxForm already disables the delete button once the box is locked, so
  // this is only ever reachable while the box is still deletable.
  function handleDeleteClick() {
    if (!viewingBox) return
    setDeleteConfirmOpen(true)
  }

  function handleDeleteConfirm() {
    if (!viewingBox) return
    deleteBoxes([viewingBox.id])
    setDeleteConfirmOpen(false)
    setViewingBox(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">B · Box Management</h2>
          <p className="text-sm text-slate-500">
            Kelompokkan batch ke dalam satu box pengiriman. Sebuah box dikirim sebagai satu
            kesatuan — mengubah status box otomatis memperbarui status semua batch di dalamnya.
            Klik sebuah box untuk melihat dan mengedit detailnya.
          </p>
        </div>
        <button
          onClick={() => setFormOpen(true)}
          className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-rose-700"
        >
          + New Box
        </button>
      </div>

      {sorted.length === 0 ? (
        <EmptyState message="Belum ada box yang dibuat." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Box Number</th>
                <th className="px-4 py-3">Batch(es)</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageItems.map((box) => {
                const batchNumbers = batchNumbersFor(box)
                return (
                  <tr
                    key={box.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => setViewingBox(box)}
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">{box.boxNumber}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {batchNumbers.length > 0 ? batchNumbers.join(', ') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        {box.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(box.createdAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <Pagination page={safePage} totalItems={sorted.length} onPageChange={setPage} />
        </div>
      )}

      {formOpen && (
        <Modal title="New Box" onClose={() => setFormOpen(false)} wide>
          <BoxForm
            boxes={boxes}
            batches={batches}
            onSubmit={(input) => {
              saveBox(input)
              setFormOpen(false)
            }}
            onCancel={() => setFormOpen(false)}
          />
        </Modal>
      )}

      {viewingBox && (
        <Modal title={`Box Detail — ${viewingBox.boxNumber}`} onClose={() => setViewingBox(null)} wide>
          <BoxForm
            boxes={boxes}
            batches={batches}
            initial={viewingBox}
            onSubmit={(input) => {
              saveBox(input)
              setViewingBox(null)
            }}
            onCancel={() => setViewingBox(null)}
            onDelete={handleDeleteClick}
          />
        </Modal>
      )}

      {deleteConfirmOpen && viewingBox && (
        <ConfirmDialog
          title={`Hapus ${viewingBox.boxNumber}?`}
          message={
            viewingBox.batchIds.length > 0
              ? `${viewingBox.batchIds.length} batch di dalamnya akan kembali ke status "Dibeli dari Seller". Tindakan ini tidak bisa dibatalkan.`
              : 'Tindakan ini tidak bisa dibatalkan.'
          }
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteConfirmOpen(false)}
        />
      )}
    </div>
  )
}
