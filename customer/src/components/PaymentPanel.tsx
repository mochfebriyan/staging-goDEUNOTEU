import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MAX_PROOF_MB, PAYMENT_INSTRUCTIONS } from '../config'
import { formatDateTime, formatIDR } from '../shared/format'
import type { BuktiTransfer, PaymentMethod } from '../shared/types'
import { useStore, type BillKind } from '../store'
import { ImageLightbox, StatusBadge, primaryButton } from './ui'

export interface PanelBill {
  id: string
  status: 'Belum Bayar' | 'Menunggu Konfirmasi' | 'Lunas'
  buktiTransfer?: BuktiTransfer
  paidAt?: string
}

// FR-GO-PAY-002–004 and the payment panels of FR-GO-1-004 / FR-GO-2-003.
export function PaymentPanel({
  kind,
  reference,
  bill,
  rows,
  total,
  methods,
  emptyHint,
  blockedReason,
  onFileStateChange,
}: {
  kind: BillKind
  reference: ReactNode
  bill: PanelBill | null
  rows: Array<{ label: string; value: number; note?: string }>
  total: number
  methods: PaymentMethod[]
  emptyHint: string
  blockedReason?: string
  onFileStateChange?: (hasFile: boolean) => void
}) {
  const submitPayment = useStore((s) => s.submitPayment)
  const [method, setMethod] = useState<PaymentMethod | null>(methods.length === 1 ? methods[0] : null)
  const [file, setFile] = useState<{ name: string; dataUrl: string } | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // A different bill starts with a clean form.
  useEffect(() => {
    setMethod(methods.length === 1 ? methods[0] : null)
    setFile(null)
    setFileError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bill?.id])
  useEffect(() => {
    onFileStateChange?.(Boolean(file))
  }, [file, onFileStateChange])

  async function pickFile(f: File | undefined) {
    setFileError(null)
    if (!f) return
    if (!f.type.startsWith('image/')) return setFileError('File harus berupa gambar.')
    if (f.size > MAX_PROOF_MB * 1024 * 1024) return setFileError(`Ukuran file maksimal ${MAX_PROOF_MB} MB.`)
    try {
      setFile({ name: f.name, dataUrl: await shrinkImage(f) })
    } catch {
      setFileError('Gambar tidak bisa dibaca. Coba file lain.')
    }
  }

  const payable = bill?.status === 'Belum Bayar'
  const disabledReason = !bill
    ? emptyHint
    : !payable
      ? null
      : blockedReason
        ? blockedReason
        : !method
          ? 'Pilih metode pembayaran'
          : !file
            ? 'Upload bukti transfer'
            : null

  async function submit() {
    if (!bill || !method || !file || busy) return
    setBusy(true)
    const ok = await submitPayment({ kind, billId: bill.id, method, fileName: file.name, dataUrl: file.dataUrl })
    setBusy(false)
    if (ok) setFile(null)
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h3 className="text-sm font-semibold text-slate-900">Pembayaran</h3>
        <p className="mt-0.5 text-xs text-slate-500">{reference}</p>
      </div>

      <div className="border-b border-slate-200 px-5 py-4">
        <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Rincian Pembayaran</p>
        {bill ? (
          <dl className="space-y-1.5 text-sm">
            {rows.map((r) => (
              <div key={r.label} className="flex justify-between gap-4">
                <dt className="text-slate-500">
                  {r.label}
                  {r.note && <span className="block text-xs text-slate-400">{r.note}</span>}
                </dt>
                <dd className="text-slate-900 tabular-nums">{formatIDR(r.value)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-slate-400">—</p>
        )}
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
          <span className="text-sm font-semibold text-slate-900">Total Pembayaran</span>
          <span className="text-lg font-bold text-rose-600 tabular-nums">{formatIDR(bill ? total : 0)}</span>
        </div>
      </div>

      {bill && !payable ? (
        <div className="space-y-3 px-5 py-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Status</span>
            <StatusBadge status={bill.status} />
          </div>
          {bill.buktiTransfer && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Metode</span>
                <span className="font-medium text-slate-900">{bill.buktiTransfer.paymentMethod}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Bukti dikirim</span>
                <span className="text-slate-900">{formatDateTime(bill.buktiTransfer.uploadedAt)}</span>
              </div>
            </>
          )}
          {bill.paidAt && (
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Dikonfirmasi</span>
              <span className="text-slate-900">{formatDateTime(bill.paidAt)}</span>
            </div>
          )}
          {bill.buktiTransfer && (
            <button type="button" onClick={() => setLightbox(bill.buktiTransfer!.dataUrl)} className="block">
              <img src={bill.buktiTransfer.dataUrl} alt="Bukti transfer" className="h-28 rounded-md border border-slate-200 object-cover" />
            </button>
          )}
          {bill.status === 'Menunggu Konfirmasi' && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs text-amber-800">Bukti transfer sedang dicek admin.</p>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="border-b border-slate-200 px-5 py-4">
            <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Metode Pembayaran</p>
            {!bill ? (
              <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-400">{emptyHint} untuk memunculkan cara bayarnya.</p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Metode pembayaran">
                  {methods.map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={method === m}
                      aria-label={PAYMENT_INSTRUCTIONS[m].title}
                      title={PAYMENT_INSTRUCTIONS[m].title}
                      onClick={() => setMethod(m)}
                      className={`flex h-12 items-center justify-center rounded-md border bg-white px-2.5 transition ${
                        method === m ? 'border-rose-600 ring-2 ring-rose-200' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      <img src={PAYMENT_INSTRUCTIONS[m].logoSrc} alt="" className="max-h-6 max-w-full object-contain" />
                    </button>
                  ))}
                </div>
                {method && (
                  <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
                    {PAYMENT_INSTRUCTIONS[method].lines.map((l) => (
                      <p key={l}>{l}</p>
                    ))}
                    {PAYMENT_INSTRUCTIONS[method].imageSrc && (
                      <div className="mt-3 flex flex-col items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setLightbox(PAYMENT_INSTRUCTIONS[method].imageSrc!)}
                          aria-label={`Perbesar gambar ${PAYMENT_INSTRUCTIONS[method].title}`}
                          className="w-full max-w-72 overflow-hidden rounded-lg border border-slate-200 bg-white"
                        >
                          <img src={PAYMENT_INSTRUCTIONS[method].imageSrc} alt={`Kode ${PAYMENT_INSTRUCTIONS[method].title} DEUNOTEU GO`} className="block w-full" />
                        </button>
                        <a
                          href={PAYMENT_INSTRUCTIONS[method].imageSrc}
                          download
                          className="text-sm font-medium text-rose-600 hover:text-rose-700"
                        >
                          Simpan gambar {PAYMENT_INSTRUCTIONS[method].title}
                        </a>
                      </div>
                    )}
                    <p className="mt-1 text-xs text-slate-500">Transfer tepat {formatIDR(total)}.</p>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="border-b border-slate-200 px-5 py-4">
            <label className="mb-2 block text-xs font-semibold tracking-wide text-slate-500 uppercase" htmlFor={`proof-${kind}`}>
              Upload Bukti Transfer <span className="text-rose-500">*</span>
            </label>
            {file ? (
              <div className="flex items-center gap-3">
                <img src={file.dataUrl} alt="Pratinjau bukti transfer" className="h-16 w-16 rounded-md border border-slate-200 object-cover" />
                <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{file.name}</span>
                <button type="button" onClick={() => setFile(null)} className="text-xs font-medium text-rose-600 hover:text-rose-700">
                  Hapus
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={!bill}
                className="flex w-full flex-col items-center rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500 hover:border-rose-300 hover:text-rose-600 disabled:cursor-not-allowed disabled:hover:border-slate-300 disabled:hover:text-slate-500"
              >
                Pilih file bukti transfer
                <span className="text-xs text-slate-400">Format gambar, maksimal {MAX_PROOF_MB} MB</span>
              </button>
            )}
            <input
              ref={inputRef}
              id={`proof-${kind}`}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                pickFile(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            {fileError && <p className="mt-2 text-xs text-rose-600">{fileError}</p>}
          </div>

          <div className="px-5 py-4">
            <button type="button" onClick={submit} disabled={Boolean(disabledReason) || busy} className={`${primaryButton} w-full`}>
              {disabledReason ?? 'Kirim Bukti Pembayaran'}
            </button>
          </div>
        </>
      )}
      {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}

// Keeps demo storage small: photos are scaled to at most 1200 px and
// re-encoded as JPEG before they are saved in the browser.
function shrinkImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, 1200 / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.8))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('unreadable'))
    }
    img.src = url
  })
}
