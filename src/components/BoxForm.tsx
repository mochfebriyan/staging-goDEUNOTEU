import { useState } from 'react'
import { formatDate } from '../lib/format'
import { BOX_NUMBER_PREFIX, extractNumber, formatWithPrefix } from '../lib/numberedId'
import type { SaveBoxInput } from '../store/useStore'
import { BOX_STATUS_OPTIONS, DEFAULT_BOX_STATUS, type Batch, type Box, type BoxStatus } from '../types'
import { TrashIcon } from './TrashIcon'

export function BoxForm({
  boxes,
  batches,
  initial,
  onSubmit,
  onCancel,
  onDelete,
}: {
  boxes: Box[]
  batches: Batch[]
  initial?: Box
  onSubmit: (input: SaveBoxInput) => void
  onCancel: () => void
  onDelete?: () => void
}) {
  const [boxNumberValue, setBoxNumberValue] = useState<number | ''>(() => {
    if (initial) return extractNumber(initial.boxNumber, BOX_NUMBER_PREFIX)
    const latest = boxes.reduce((max, b) => {
      const n = extractNumber(b.boxNumber, BOX_NUMBER_PREFIX)
      return typeof n === 'number' && n > max ? n : max
    }, 0)
    return latest + 1
  })
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(
    new Set(initial?.batchIds ?? []),
  )
  const [status, setStatus] = useState<BoxStatus>(initial?.status ?? DEFAULT_BOX_STATUS)
  const [error, setError] = useState<string | null>(null)

  // A batch can only be in one box at a time — offer batches with no box
  // yet, plus whatever is already in the box being edited.
  const choosableBatches = batches.filter((b) => !b.boxId || b.boxId === initial?.id)

  function toggleBatch(batchId: string) {
    setSelectedBatchIds((set) => {
      const next = new Set(set)
      if (next.has(batchId)) next.delete(batchId)
      else next.add(batchId)
      return next
    })
    setError(null)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const formatted = formatWithPrefix(BOX_NUMBER_PREFIX, boxNumberValue, 3)
    if (!formatted) {
      setError('Box Number wajib diisi dengan angka.')
      return
    }
    const isDuplicate = boxes.some((b) => b.boxNumber === formatted && b.id !== initial?.id)
    if (isDuplicate) {
      setError('Box Number ini sudah dipakai box lain.')
      return
    }
    if (selectedBatchIds.size === 0) {
      setError('Pilih minimal satu batch untuk dimasukkan ke box ini.')
      return
    }
    onSubmit({
      boxId: initial?.id,
      boxNumber: formatted,
      batchIds: Array.from(selectedBatchIds),
      status,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Box Number <span className="text-rose-500">*</span>
          </label>
          <div className="flex items-stretch gap-2">
            <span className="flex items-center whitespace-nowrap rounded-md border border-slate-300 bg-slate-50 px-3 text-sm font-medium text-slate-500">
              {BOX_NUMBER_PREFIX} -
            </span>
            <input
              type="number"
              min={1}
              step={1}
              autoFocus
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
              value={boxNumberValue}
              onChange={(e) => {
                setBoxNumberValue(e.target.value === '' ? '' : Math.trunc(Number(e.target.value)))
                setError(null)
              }}
              placeholder="001"
            />
          </div>
        </div>

        {initial ? (
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Status</label>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
              value={status}
              onChange={(e) => setStatus(e.target.value as BoxStatus)}
            >
              {BOX_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">Status</span>
            <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-500">
              {DEFAULT_BOX_STATUS} <span className="text-xs text-slate-400">(bisa diubah setelah dibuat)</span>
            </p>
          </div>
        )}

        {initial && (
          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">Created At</span>
            <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-500">
              {formatDate(initial.createdAt)}
            </p>
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="block text-sm font-medium text-slate-700">
            Pilih Batch <span className="text-rose-500">*</span>
          </label>
          <span className="text-xs text-slate-400">{selectedBatchIds.size} batch dipilih</span>
        </div>
        {choosableBatches.length === 0 ? (
          <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
            Tidak ada batch yang bisa dipilih — semua batch sudah masuk ke box lain.
          </p>
        ) : (
          <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="w-10 px-3 py-2"></th>
                  <th className="px-3 py-2">Batch Number</th>
                  <th className="px-3 py-2">Order ID (WH)</th>
                  <th className="px-3 py-2">Created At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {choosableBatches.map((b) => (
                  <tr
                    key={b.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => toggleBatch(b.id)}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedBatchIds.has(b.id)}
                        readOnly
                        aria-label={`Pilih ${b.batchNumber}`}
                        className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-400"
                      />
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-900">{b.batchNumber}</td>
                    <td className="px-3 py-2 text-slate-600">{b.orderIdWH || '—'}</td>
                    <td className="px-3 py-2 text-slate-500">{formatDate(b.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
      </div>

      <div className="mt-1 flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
        {initial && onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 rounded-md border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50"
          >
            <TrashIcon className="h-4 w-4 text-rose-600" />
            Hapus Box
          </button>
        ) : (
          <span />
        )}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Batal
          </button>
          <button
            type="submit"
            className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
          >
            {initial ? 'Simpan Perubahan' : 'Buat Box'}
          </button>
        </div>
      </div>
    </form>
  )
}
