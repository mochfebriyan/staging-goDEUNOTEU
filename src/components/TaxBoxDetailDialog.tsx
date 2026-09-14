import { useState } from 'react'
import { useStore } from '../store/useStore'
import { copyText } from '../lib/clipboard'
import { guardTaxBillDeletion } from '../lib/deleteGuards'
import { formatDate, formatIDR } from '../lib/format'
import { buildTaxTagihanTemplate } from '../lib/taxTagihanTemplate'
import { KARTU_FLAT_TAX_IDR } from '../types'
import { AlertDialog } from './AlertDialog'
import { ConfirmDialog } from './ConfirmDialog'
import { DeadlineBadge } from './DeadlineBadge'
import { ImageLightbox } from './ImageLightbox'
import { StatusBadge } from './StatusBadge'
import { TrashIcon } from './TrashIcon'

export function TaxBoxDetailDialog({
  boxId,
  onClose,
}: {
  boxId: string
  onClose: () => void
}) {
  const allTaxBills = useStore((s) => s.taxBills)
  const allItems = useStore((s) => s.items)
  const allBatches = useStore((s) => s.batches)
  const taxBills = allTaxBills.filter((t) => t.boxId === boxId)
  const getCustomerName = useStore((s) => s.getCustomerName)
  const boxNumber = useStore((s) => s.getBoxNumber(boxId))
  const confirmTaxBill = useStore((s) => s.confirmTaxBill)
  const rejectTaxBill = useStore((s) => s.rejectTaxBill)
  const simulateCustomerUploadTax = useStore((s) => s.simulateCustomerUploadTax)
  const updateTaxBillAmount = useStore((s) => s.updateTaxBillAmount)
  const updateTaxBillLateFee = useStore((s) => s.updateTaxBillLateFee)
  const updateBoxDeadline = useStore((s) => s.updateBoxDeadline)
  const deleteTaxBills = useStore((s) => s.deleteTaxBills)
  const pushToast = useStore((s) => s.pushToast)

  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [editingAmountId, setEditingAmountId] = useState<string | null>(null)
  const [amountDraft, setAmountDraft] = useState('')
  const [editingLateFeeId, setEditingLateFeeId] = useState<string | null>(null)
  const [lateFeeDraft, setLateFeeDraft] = useState('')
  const [editingDeadline, setEditingDeadline] = useState(false)
  const [deadlineDraft, setDeadlineDraft] = useState('')
  // Publishing is one-shot per box, so deleting is too: either every bill
  // in the box goes (to let Admin fix a miscalculated publish and redo it
  // cleanly), or none do — never a partial delete. Blocked outright the
  // moment even one bill in the box is no longer Belum Bayar.
  const [deleteAllConfirmOpen, setDeleteAllConfirmOpen] = useState(false)
  const [deleteAllBlockedOpen, setDeleteAllBlockedOpen] = useState(false)

  if (taxBills.length === 0) return null

  const grandTotal = taxBills.reduce((sum, t) => sum + t.total, 0)
  const lunasCount = taxBills.filter((t) => t.status === 'Lunas').length
  const allLunas = lunasCount === taxBills.length
  const publishedAt = taxBills.reduce(
    (earliest, t) => (t.publishedAt < earliest ? t.publishedAt : earliest),
    taxBills[0].publishedAt,
  )
  // Every batch under one box shares a single payment deadline.
  const boxDeadline = taxBills[0].deadline
  const boxBatchNumbers = Array.from(
    new Set(allBatches.filter((b) => b.boxId === boxId).map((b) => b.batchNumber)),
  ).sort()

  const tagihanText = buildTaxTagihanTemplate({
    boxNumber,
    customerNames: taxBills.map((t) => getCustomerName(t.customerId)),
    deadline: boxDeadline,
  })

  async function handleCopyTagihan() {
    const ok = await copyText(tagihanText)
    pushToast(ok ? 'Teks tagihan pajak disalin.' : 'Gagal menyalin teks tagihan.', ok ? 'success' : 'error')
  }

  function toggle(id: string) {
    setExpanded((set) => {
      const next = new Set(set)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function startEditingAmount(taxBillId: string, currentTotal: number) {
    setEditingAmountId(taxBillId)
    setAmountDraft(String(currentTotal))
  }

  function saveAmount(taxBillId: string) {
    const value = Number(amountDraft)
    if (Number.isFinite(value) && value >= 0) {
      updateTaxBillAmount(taxBillId, value)
    }
    setEditingAmountId(null)
  }

  function startEditingLateFee(taxBillId: string, currentLateFee: number) {
    setEditingLateFeeId(taxBillId)
    setLateFeeDraft(String(currentLateFee))
  }

  function saveLateFee(taxBillId: string) {
    const value = Number(lateFeeDraft)
    if (Number.isFinite(value) && value >= 0) {
      updateTaxBillLateFee(taxBillId, value)
    }
    setEditingLateFeeId(null)
  }

  function startEditingDeadline() {
    setDeadlineDraft(boxDeadline.slice(0, 10))
    setEditingDeadline(true)
  }

  function saveDeadline() {
    if (deadlineDraft) {
      const existingTime = boxDeadline.slice(11)
      updateBoxDeadline(boxId, new Date(`${deadlineDraft}T${existingTime}`).toISOString())
    }
    setEditingDeadline(false)
  }

  function handleDeleteAllClick() {
    const { blocked } = guardTaxBillDeletion(taxBills)
    if (blocked.length > 0) {
      setDeleteAllBlockedOpen(true)
    } else {
      setDeleteAllConfirmOpen(true)
    }
  }

  function confirmDeleteAll() {
    deleteTaxBills(taxBills.map((t) => t.id))
    setDeleteAllConfirmOpen(false)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 px-4 py-8"
      onClick={(e) => {
        // Guards against nested overlays (ConfirmDialog, AlertDialog,
        // ImageLightbox) rendered inside this same backdrop — a click
        // bubbling up from one of those shouldn't also close this dialog.
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-4xl rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-rose-600">
              {boxNumber} <span className="text-slate-400">🧾</span>{' '}
              <span className="text-sm font-normal text-slate-400">
                · Dipublikasikan {formatDate(publishedAt)}
              </span>
            </h2>
            {boxBatchNumbers.length > 0 && (
              <p className="mt-0.5 text-xs text-slate-400">Batches: {boxBatchNumbers.join(', ')}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="p-6">
          <div className="mb-4 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-500 sm:grid-cols-4">
            <div>
              <span className="block text-slate-400">Total Pajak Box</span>
              <span className="text-sm font-semibold text-slate-800">{formatIDR(grandTotal)}</span>
            </div>
            <div>
              <span className="block text-slate-400">Jumlah Customer</span>
              <span className="text-sm font-semibold text-slate-800">{taxBills.length}</span>
            </div>
            <div>
              <span className="block text-slate-400">Sudah Lunas</span>
              <span className="text-sm font-semibold text-slate-800">
                {lunasCount}/{taxBills.length}
              </span>
            </div>
            <div>
              <span className="mb-0.5 block text-slate-400">
                Deadline Pembayaran <span className="text-slate-300">(satu box, satu deadline)</span>
              </span>
              {editingDeadline ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    autoFocus
                    value={deadlineDraft}
                    onChange={(e) => setDeadlineDraft(e.target.value)}
                    className="rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                  />
                  <button
                    type="button"
                    onClick={saveDeadline}
                    className="text-xs font-medium text-emerald-600 hover:underline"
                  >
                    Simpan
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingDeadline(false)}
                    className="text-xs text-slate-400 hover:underline"
                  >
                    Batal
                  </button>
                </div>
              ) : (
                <span className="flex items-center gap-2">
                  <DeadlineBadge deadline={boxDeadline} isPaid={allLunas} />
                  <button
                    type="button"
                    onClick={startEditingDeadline}
                    className="text-xs text-rose-600 hover:underline"
                    title="Edit deadline pembayaran box ini"
                  >
                    Edit
                  </button>
                </span>
              )}
            </div>
          </div>

          <div className="mb-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Template Tagihan Pajak
            </p>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-700">
                {tagihanText}
              </pre>
              <button
                onClick={handleCopyTagihan}
                className="mt-2 text-xs font-medium text-rose-600 hover:underline"
              >
                copy
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {taxBills.map((t) => {
              const isOpen = expanded.has(t.id)
              const itemIds = t.itemIds ?? []
              const billItems = itemIds
                .map((id) => allItems.find((i) => i.id === id))
                .filter((i): i is NonNullable<typeof i> => Boolean(i))
              const batchIds = Array.from(new Set(billItems.map((i) => i.batchId)))

              return (
                <div key={t.id} className="overflow-hidden rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => toggle(t.id)}
                    className="flex w-full items-center justify-between gap-3 bg-white px-4 py-3 text-left hover:bg-slate-50"
                  >
                    <span className="font-semibold text-rose-600">{getCustomerName(t.customerId)}</span>
                    <span className="flex items-center gap-3">
                      <span className="text-right text-xs text-slate-500">
                        <span className="block">{itemIds.length} item</span>
                        <span className="font-semibold text-slate-800">
                          {formatIDR(t.total + t.lateFeeIDR)}
                        </span>
                      </span>
                      <StatusBadge status={t.status} />
                      <span className="text-slate-400">{isOpen ? '︿' : '﹀'}</span>
                    </span>
                  </button>

                  {isOpen && (
                    <div className="border-t border-slate-200 bg-white px-4 py-3">
                      <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm text-slate-600 sm:grid-cols-3">
                        <div>
                          <span className="mb-0.5 block text-xs text-slate-400">bukti transfer</span>
                          {t.buktiTransfer ? (
                            <button
                              type="button"
                              onClick={() => setLightboxSrc(t.buktiTransfer!.dataUrl)}
                              className="block h-12 w-12 overflow-hidden rounded-md border border-slate-200"
                              title="Klik untuk memperbesar"
                            >
                              <img
                                src={t.buktiTransfer.dataUrl}
                                alt="bukti transfer"
                                className="h-full w-full object-cover"
                              />
                            </button>
                          ) : (
                            <span className="font-medium text-slate-400">—</span>
                          )}
                        </div>
                        <div>
                          <span className="block text-xs text-slate-400">payment method</span>
                          <span className="font-medium text-slate-800">
                            {t.buktiTransfer?.paymentMethod ?? '—'}
                          </span>
                        </div>
                        <div>
                          <span className="block text-xs text-slate-400">pajak produk</span>
                          {editingAmountId === t.id ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min={0}
                                autoFocus
                                value={amountDraft}
                                onChange={(e) => setAmountDraft(e.target.value)}
                                className="w-28 rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                              />
                              <button
                                type="button"
                                onClick={() => saveAmount(t.id)}
                                className="text-xs font-medium text-emerald-600 hover:underline"
                              >
                                Simpan
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingAmountId(null)}
                                className="text-xs text-slate-400 hover:underline"
                              >
                                Batal
                              </button>
                            </div>
                          ) : (
                            <span className="flex items-center gap-2">
                              <span className="font-medium text-slate-800">{formatIDR(t.total)}</span>
                              {t.status !== 'Lunas' ? (
                                <button
                                  type="button"
                                  onClick={() => startEditingAmount(t.id, t.total)}
                                  className="text-xs text-rose-600 hover:underline"
                                  title="Edit jumlah tagihan"
                                >
                                  Edit
                                </button>
                              ) : (
                                <span
                                  className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500"
                                  title="Tagihan yang sudah lunas tidak bisa diubah"
                                >
                                  Terkunci
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                        <div>
                          <span className="block text-xs text-slate-400">denda telat</span>
                          {editingLateFeeId === t.id ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min={0}
                                autoFocus
                                value={lateFeeDraft}
                                onChange={(e) => setLateFeeDraft(e.target.value)}
                                className="w-28 rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                              />
                              <button
                                type="button"
                                onClick={() => saveLateFee(t.id)}
                                className="text-xs font-medium text-emerald-600 hover:underline"
                              >
                                Simpan
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingLateFeeId(null)}
                                className="text-xs text-slate-400 hover:underline"
                              >
                                Batal
                              </button>
                            </div>
                          ) : (
                            <span className="flex items-center gap-2">
                              <span className="font-medium text-slate-800">{formatIDR(t.lateFeeIDR)}</span>
                              {t.status === 'Belum Bayar' ? (
                                <button
                                  type="button"
                                  onClick={() => startEditingLateFee(t.id, t.lateFeeIDR)}
                                  className="text-xs text-rose-600 hover:underline"
                                  title="Edit denda telat"
                                >
                                  Edit
                                </button>
                              ) : (
                                <span
                                  className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500"
                                  title="Denda telat hanya bisa diubah selama tagihan masih Belum Bayar"
                                >
                                  Terkunci
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                        <div>
                          <span className="block text-xs text-slate-400">total tagihan</span>
                          <span className="font-semibold text-slate-800">
                            {formatIDR(t.total + t.lateFeeIDR)}
                          </span>
                        </div>
                      </div>

                      {t.status === 'Menunggu Konfirmasi' && (
                        <div className="mb-3 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                          <span className="text-xs font-medium text-amber-800">
                            Menunggu konfirmasi pembayaran
                          </span>
                          <div className="flex gap-2">
                            <button
                              onClick={() => confirmTaxBill(t.id)}
                              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => rejectTaxBill(t.id)}
                              className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      )}

                      {t.status === 'Belum Bayar' && (
                        <div className="mb-3 flex justify-end">
                          <button
                            onClick={() => simulateCustomerUploadTax(t.id)}
                            className="text-xs text-slate-400 underline hover:text-slate-600"
                            title="Demo helper: simulasikan customer meng-upload bukti transfer"
                          >
                            Simulate customer upload (demo)
                          </button>
                        </div>
                      )}

                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Rincian per Batch{' '}
                        <span className="font-normal normal-case text-slate-400">
                          — acuan awal dari perhitungan proporsional. Jumlah final ada di "total tagihan" di atas.
                        </span>
                      </p>
                      <div className="overflow-hidden rounded-lg border border-slate-200">
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-sm">
                            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                              <tr>
                                <th className="px-3 py-2">Batch</th>
                                <th className="px-3 py-2">Items</th>
                                <th className="px-3 py-2">Weight</th>
                                <th className="px-3 py-2">Qty</th>
                                <th className="px-3 py-2 text-right">Tax</th>
                                <th className="px-3 py-2 text-right">Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {batchIds.map((batchId) => {
                                const batch = allBatches.find((b) => b.id === batchId)
                                const itemsInBatch = billItems.filter((i) => i.batchId === batchId)
                                const batchTaxTotal = itemsInBatch.reduce(
                                  (sum, i) =>
                                    sum +
                                    (i.tipeBarang === 'Kartu'
                                      ? KARTU_FLAT_TAX_IDR
                                      : t.nonKartuWeightGrams > 0
                                        ? ((i.weightGrams ?? 0) / t.nonKartuWeightGrams) * t.nonKartuShare
                                        : 0),
                                  0,
                                )
                                return (
                                  <tr key={batchId}>
                                    <td className="px-3 py-2 align-top font-semibold text-rose-600">
                                      {batch?.batchNumber ?? 'Batch dihapus'}
                                    </td>
                                    <td className="px-3 py-2 align-top text-slate-700">
                                      {itemsInBatch.map((i, idx) => (
                                        <div key={i.id}>
                                          {idx + 1}. {i.tipeBarang}
                                          {i.tipeKartu ? ` (${i.tipeKartu})` : ''}
                                        </div>
                                      ))}
                                    </td>
                                    <td className="px-3 py-2 align-top text-slate-500">
                                      {itemsInBatch.map((i) => (
                                        <div key={i.id}>{i.weightGrams ? `${i.weightGrams}gr` : '—'}</div>
                                      ))}
                                    </td>
                                    <td className="px-3 py-2 align-top text-slate-500">
                                      {itemsInBatch.map((i) => (
                                        <div key={i.id}>1</div>
                                      ))}
                                    </td>
                                    <td className="px-3 py-2 align-top text-right text-slate-700">
                                      {itemsInBatch.map((i) => {
                                        const itemTax =
                                          i.tipeBarang === 'Kartu'
                                            ? KARTU_FLAT_TAX_IDR
                                            : t.nonKartuWeightGrams > 0
                                              ? ((i.weightGrams ?? 0) / t.nonKartuWeightGrams) * t.nonKartuShare
                                              : 0
                                        return <div key={i.id}>{formatIDR(itemTax)}</div>
                                      })}
                                    </td>
                                    <td className="px-3 py-2 align-top text-right font-medium text-slate-800">
                                      {formatIDR(batchTaxTotal)}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                            <tfoot>
                              <tr className="border-t-2 border-slate-300">
                                <td colSpan={5} className="px-3 py-2 text-right font-semibold text-slate-700">
                                  Total
                                </td>
                                <td className="px-3 py-2 text-right font-semibold text-slate-900">
                                  {formatIDR(t.total)}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="mt-4 flex justify-start border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={handleDeleteAllClick}
              className="inline-flex items-center gap-1.5 rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
            >
              <TrashIcon className="h-4 w-4 text-rose-600" />
              Hapus Semua Tagihan di Box Ini
            </button>
          </div>
        </div>
      </div>

      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}

      {deleteAllConfirmOpen && (
        <ConfirmDialog
          title={`Hapus Semua Tagihan di ${boxNumber}?`}
          message={`Semua ${taxBills.length} tagihan pajak di box ini akan dihapus, supaya bisa dihitung dan dipublikasikan ulang dari awal. Tindakan ini tidak bisa dibatalkan.`}
          onConfirm={confirmDeleteAll}
          onCancel={() => setDeleteAllConfirmOpen(false)}
        />
      )}

      {deleteAllBlockedOpen && (
        <AlertDialog
          tone="error"
          title="Tidak Bisa Dihapus"
          message="Box ini sudah punya tagihan yang dibayar atau menunggu konfirmasi — begitu ada satu saja, semua tagihan di box ini tidak bisa dihapus lagi."
          onClose={() => setDeleteAllBlockedOpen(false)}
        />
      )}
    </div>
  )
}
