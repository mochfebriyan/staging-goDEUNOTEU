import { useEffect, useMemo, useState } from 'react'
import type { Customer, Item, TaxBill } from '../types'
import { calculateTaxShares, type TaxCalcItemInput } from '../lib/calc'
import { formatIDR } from '../lib/format'
import { AlertDialog } from './AlertDialog'

// yyyy-mm-dd, +7 days from today — just a starting suggestion for the date
// input, not a rule; Admin can pick any deadline before publishing.
function suggestedDeadlineDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  return d.toISOString().slice(0, 10)
}

export function TaxCalculationForm({
  boxOptions,
  itemsByBox,
  customers,
  alreadyPublishedCustomerIds,
  boxDeadlineFor,
  onSaveWeights,
  onPublish,
  onCancel,
}: {
  boxOptions: Array<{ id: string; boxNumber: string }>
  itemsByBox: (boxId: string) => Item[]
  customers: Customer[]
  alreadyPublishedCustomerIds: (boxId: string) => Set<string>
  boxDeadlineFor: (boxId: string) => string | undefined
  onSaveWeights: (weights: Array<{ itemId: string; weightGrams: number }>) => void
  onPublish: (
    bills: Array<
      Omit<TaxBill, 'id' | 'publishedAt' | 'deadline' | 'status' | 'buktiTransfer' | 'lateFeeIDR'>
    >,
    deadline: string,
  ) => void
  onCancel: () => void
}) {
  const [boxId, setBoxId] = useState('')
  const [totalTax, setTotalTax] = useState<number>(0)
  const [weights, setWeights] = useState<Record<string, number>>({})
  const [deadlineDate, setDeadlineDate] = useState(suggestedDeadlineDate())
  const [existingDeadlineIso, setExistingDeadlineIso] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)

  const boxItems = boxId ? itemsByBox(boxId) : []
  const alreadyPublished = boxId ? alreadyPublishedCustomerIds(boxId) : new Set<string>()
  const eligibleItems = boxItems.filter((i) => !alreadyPublished.has(i.customerId))
  const nonKartuItems = eligibleItems.filter((i) => i.tipeBarang !== 'Kartu')

  // A box only ever has one deadline — if it already has published bills,
  // switch the picker to that existing deadline instead of the +7-day
  // suggestion, since publishing more customers into it must share it.
  useEffect(() => {
    if (!boxId) return
    const existing = boxDeadlineFor(boxId) ?? null
    setExistingDeadlineIso(existing)
    if (existing) setDeadlineDate(existing.slice(0, 10))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxId])

  function getCustomerName(id: string) {
    return customers.find((c) => c.id === id)?.name ?? 'Unknown'
  }

  const calcInputs: TaxCalcItemInput[] = eligibleItems.map((i) => ({
    customerId: i.customerId,
    isKartu: i.tipeBarang === 'Kartu',
    weightGrams: weights[i.id] ?? i.weightGrams ?? 0,
  }))

  const result = useMemo(
    () => calculateTaxShares(calcInputs, totalTax),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(calcInputs), totalTax],
  )

  function handlePublish() {
    const fail = (message: string) => setDialog({ tone: 'error', message })
    if (!boxId) return fail('Pilih box terlebih dahulu.')
    if (!deadlineDate) return fail('Pilih deadline pembayaran.')
    if (totalTax <= 0) return fail('Total tax box harus lebih dari 0.')
    if (nonKartuItems.some((i) => !(weights[i.id] ?? i.weightGrams))) {
      return fail('Isi berat (gram) untuk semua item non-kartu di box ini.')
    }
    if (result.breakdown.length === 0) {
      return fail('Tidak ada customer baru yang bisa dipublikasikan pada box ini.')
    }

    // Preserve the existing deadline's exact timestamp if Admin left the
    // date picker on the box's already-set deadline; otherwise build a new
    // one from the chosen date (noon local time, matching the LINE example's
    // "batas pembayaran ... jam 12:00 siang" convention).
    const deadlineIso =
      existingDeadlineIso && existingDeadlineIso.slice(0, 10) === deadlineDate
        ? existingDeadlineIso
        : new Date(`${deadlineDate}T12:00:00`).toISOString()

    // onSaveWeights/onPublish hand off to the store synchronously — if
    // either throws for any reason, still surface a dialog rather than
    // leaving the sheet open with no feedback.
    try {
      onSaveWeights(
        nonKartuItems.map((i) => ({ itemId: i.id, weightGrams: weights[i.id] ?? i.weightGrams ?? 0 })),
      )
      onPublish(
        result.breakdown.map((b) => ({
          boxId,
          customerId: b.customerId,
          itemIds: eligibleItems.filter((i) => i.customerId === b.customerId).map((i) => i.id),
          kartuCount: b.kartuCount,
          kartuTax: b.kartuTax,
          nonKartuWeightGrams: b.nonKartuWeightGrams,
          nonKartuShare: b.nonKartuShare,
          total: b.total,
        })),
        deadlineIso,
      )
      setDialog({
        tone: 'success',
        message: `Tagihan pajak untuk ${result.breakdown.length} customer berhasil dipublikasikan.`,
      })
    } catch (err) {
      setDialog({
        tone: 'error',
        message: `Gagal mempublikasikan tagihan pajak: ${err instanceof Error ? err.message : 'terjadi kesalahan tak terduga.'}`,
      })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Box Number</label>
          <select
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={boxId}
            onChange={(e) => setBoxId(e.target.value)}
          >
            <option value="">Pilih box…</option>
            {boxOptions.map((b) => (
              <option key={b.id} value={b.id}>
                {b.boxNumber}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Total Tax Box (IDR)</label>
          <input
            type="number"
            min={0}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={totalTax || ''}
            onChange={(e) => setTotalTax(Number(e.target.value))}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Deadline Pembayaran</label>
          <input
            type="date"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={deadlineDate}
            onChange={(e) => setDeadlineDate(e.target.value)}
          />
          {boxId && existingDeadlineIso && (
            <p className="mt-1 text-xs text-slate-400">
              Box ini sudah punya deadline — ubah di sini akan menerapkannya ke semua tagihan di box ini.
            </p>
          )}
        </div>
      </div>

      {boxId && alreadyPublished.size > 0 && (
        <p className="text-xs text-slate-400">
          {alreadyPublished.size} customer pada box ini sudah memiliki tagihan pajak dan tidak akan
          dipublikasikan ulang.
        </p>
      )}

      {boxId && nonKartuItems.length > 0 && (
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Berat item non-kartu (gram)
          </p>
          <ul className="space-y-2">
            {nonKartuItems.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-700">
                  {getCustomerName(i.customerId)} · {i.tipeBarang}
                </span>
                <input
                  type="number"
                  min={0}
                  className="w-28 rounded-md border border-slate-300 px-2 py-1 text-sm"
                  value={weights[i.id] ?? i.weightGrams ?? ''}
                  onChange={(e) =>
                    setWeights((w) => ({ ...w, [i.id]: Number(e.target.value) }))
                  }
                  placeholder="gram"
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {boxId && result.breakdown.length > 0 && (
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Preview Pembagian Pajak per Customer
          </p>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-400">
              <tr>
                <th className="py-1">Customer</th>
                <th className="py-1">Kartu (flat)</th>
                <th className="py-1">Non-kartu (proporsional)</th>
                <th className="py-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {result.breakdown.map((b) => (
                <tr key={b.customerId} className="border-t border-slate-200">
                  <td className="py-1.5 text-slate-700">{getCustomerName(b.customerId)}</td>
                  <td className="py-1.5 text-slate-500">
                    {b.kartuCount > 0 ? `${b.kartuCount}× ${formatIDR(5000)} = ${formatIDR(b.kartuTax)}` : '—'}
                  </td>
                  <td className="py-1.5 text-slate-500">
                    {b.nonKartuWeightGrams > 0
                      ? `${b.nonKartuWeightGrams}g → ${formatIDR(b.nonKartuShare)}`
                      : '—'}
                  </td>
                  <td className="py-1.5 text-right font-semibold text-slate-900">{formatIDR(b.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-1 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Batal
        </button>
        <button
          type="button"
          onClick={handlePublish}
          className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
        >
          Publish Tax Bill
        </button>
      </div>

      {dialog && (
        <AlertDialog
          tone={dialog.tone}
          title={dialog.tone === 'success' ? 'Berhasil' : 'Gagal Mempublikasikan'}
          message={dialog.message}
          onClose={() => {
            const wasSuccess = dialog.tone === 'success'
            setDialog(null)
            if (wasSuccess) onCancel()
          }}
        />
      )}
    </div>
  )
}
