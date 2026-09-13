import { useState } from 'react'
import { useStore } from '../store/useStore'
import { formatDate, formatIDR } from '../lib/format'
import { copyText } from '../lib/clipboard'
import { buildTagihanTemplate } from '../lib/tagihanTemplate'
import { ImageCarousel } from './ImageCarousel'
import { ImageLightbox } from './ImageLightbox'
import { StatusBadge } from './StatusBadge'

export function BatchDetailDialog({
  batchId,
  onClose,
  onEdit,
}: {
  batchId: string
  onClose: () => void
  onEdit: () => void
}) {
  const batch = useStore((s) => s.batches.find((b) => b.id === batchId))
  const allItems = useStore((s) => s.items)
  const allBatchBills = useStore((s) => s.batchBills)
  const items = allItems.filter((i) => i.batchId === batchId)
  const batchBills = allBatchBills.filter((b) => b.batchId === batchId)
  const getCustomerName = useStore((s) => s.getCustomerName)
  const confirmBatchBill = useStore((s) => s.confirmBatchBill)
  const rejectBatchBill = useStore((s) => s.rejectBatchBill)
  const simulateCustomerUploadBatch = useStore((s) => s.simulateCustomerUploadBatch)
  const pushToast = useStore((s) => s.pushToast)

  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(
      Array.from(new Set(items.map((i) => i.customerId))).filter((customerId) => {
        const bill = batchBills.find((b) => b.customerId === customerId)
        return !bill || bill.status !== 'Lunas'
      }),
    ),
  )
  if (!batch) return null

  const customerIds = Array.from(new Set(items.map((i) => i.customerId)))
  const grandTotal = items.reduce((sum, i) => sum + i.priceIDR, 0)

  const tagihanText = buildTagihanTemplate({
    batchNumber: batch.batchNumber,
    orderType: batch.orderType,
    customerNames: customerIds.map((cid) => getCustomerName(cid)),
  })

  function toggle(customerId: string) {
    setExpanded((set) => {
      const next = new Set(set)
      if (next.has(customerId)) next.delete(customerId)
      else next.add(customerId)
      return next
    })
  }

  async function handleCopyTagihan() {
    const ok = await copyText(tagihanText)
    pushToast(ok ? 'Teks tagihan disalin.' : 'Gagal menyalin teks tagihan.', ok ? 'success' : 'error')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 px-4 py-8"
      onClick={(e) => {
        // Guards against nested overlays (ImageLightbox) rendered inside
        // this same backdrop — a click bubbling up from one of those
        // shouldn't also close this dialog.
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-4xl rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-rose-600">
              {batch.batchNumber} <span className="text-slate-400">🗃️</span>{' '}
              {batch.boxNumber ? `(${batch.boxNumber})` : (
                <span className="text-sm font-normal text-slate-400">(Box belum ditentukan)</span>
              )}{' '}
              <span className="text-sm font-normal text-slate-400">· {formatDate(batch.createdAt)}</span>
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-600"
              title="Order Type (diisi di form New Batch Record)"
            >
              {batch.orderType}
            </span>
            <button
              onClick={onEdit}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Edit
            </button>
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 p-6 md:grid-cols-[280px_1fr]">
          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Foto Produk
              </p>
              <ImageCarousel images={batch.photoDataUrls ?? []} onImageClick={setLightboxSrc} />
            </div>

            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Template Tagihan
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

            <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
              <div className="flex justify-between">
                <span>Order ID (WH)</span>
                <span className="font-medium text-slate-700">{batch.orderIdWH || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span>Order status</span>
                <span className="font-medium text-slate-700">{batch.orderStatus}</span>
              </div>
              <div className="flex justify-between">
                <span>Total item</span>
                <span className="font-medium text-slate-700">{formatIDR(grandTotal)}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {customerIds.length === 0 ? (
              <p className="text-sm text-slate-500">Belum ada customer pada batch ini.</p>
            ) : (
              customerIds.map((customerId) => {
                const customerItems = items.filter((i) => i.customerId === customerId)
                const customerTotal = customerItems.reduce((sum, i) => sum + i.priceIDR, 0)
                const bill = batchBills.find((b) => b.customerId === customerId)
                const isOpen = expanded.has(customerId)
                return (
                  <div key={customerId} className="overflow-hidden rounded-lg border border-slate-200">
                    <button
                      type="button"
                      onClick={() => toggle(customerId)}
                      className="flex w-full items-center justify-between gap-3 bg-white px-4 py-3 text-left hover:bg-slate-50"
                    >
                      <span className="font-semibold text-rose-600">{getCustomerName(customerId)}</span>
                      <span className="flex items-center gap-3">
                        <span className="text-right text-xs text-slate-500">
                          <span className="block">{customerItems.length} item</span>
                          <span className="font-semibold text-slate-800">{formatIDR(customerTotal)}</span>
                        </span>
                        <StatusBadge status={bill?.status ?? 'Belum Bayar'} />
                        <span className="text-slate-400">{isOpen ? '︿' : '﹀'}</span>
                      </span>
                    </button>

                    {isOpen && (
                      <div className="border-t border-slate-200 bg-white px-4 py-3">
                        {bill && (
                          <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm text-slate-600 sm:grid-cols-4">
                            <div>
                              <span className="block text-xs text-slate-400">payment date</span>
                              <span className="font-medium text-slate-800">
                                {bill.paidAt ? formatDate(bill.paidAt) : 'None'}
                              </span>
                            </div>
                            <div>
                              <span className="mb-0.5 block text-xs text-slate-400">payment proof</span>
                              {bill.buktiTransfer ? (
                                <button
                                  type="button"
                                  onClick={() => setLightboxSrc(bill.buktiTransfer!.dataUrl)}
                                  className="block h-12 w-12 overflow-hidden rounded-md border border-slate-200"
                                  title="Klik untuk memperbesar"
                                >
                                  <img
                                    src={bill.buktiTransfer.dataUrl}
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
                                {bill.buktiTransfer?.paymentMethod ?? '—'}
                              </span>
                            </div>
                            {bill.upnotesTotal > 0 && (
                              <div>
                                <span className="block text-xs text-slate-400">upnotes</span>
                                <span className="font-medium text-slate-800">
                                  {formatIDR(bill.upnotesTotal)}
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        {bill?.status === 'Menunggu Konfirmasi' && (
                          <div className="mb-3 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                            <span className="text-xs font-medium text-amber-800">
                              Menunggu konfirmasi pembayaran
                            </span>
                            <div className="flex gap-2">
                              <button
                                onClick={() => confirmBatchBill(bill.id)}
                                className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => rejectBatchBill(bill.id)}
                                className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                        )}

                        {bill && bill.status === 'Belum Bayar' && (
                          <div className="mb-3 flex justify-end">
                            <button
                              onClick={() => simulateCustomerUploadBatch(bill.id)}
                              className="text-xs text-slate-400 underline hover:text-slate-600"
                              title="Demo helper: simulasikan customer meng-upload bukti transfer (belum ada Customer Dashboard)"
                            >
                              Simulate customer upload (demo)
                            </button>
                          </div>
                        )}

                        {!bill && (
                          <p className="mb-3 text-xs text-slate-400">Tagihan belum tersedia untuk customer ini.</p>
                        )}

                        <div className="overflow-x-auto rounded-md border border-slate-100">
                          <table className="min-w-full text-sm">
                            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                              <tr>
                                <th className="px-3 py-2">Tipe Barang</th>
                                <th className="px-3 py-2">Tipe Kartu</th>
                                <th className="px-3 py-2">Harga (IDR)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {customerItems.map((it) => (
                                <tr key={it.id}>
                                  <td className="px-3 py-2 text-slate-700">{it.tipeBarang}</td>
                                  <td className="px-3 py-2 text-slate-500">{it.tipeKartu ?? '—'}</td>
                                  <td className="px-3 py-2 text-slate-700">{formatIDR(it.priceIDR)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </div>
  )
}
