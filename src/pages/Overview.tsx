import { Link } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { formatDate, formatIDR, daysRemaining } from '../lib/format'
import { StatusBadge } from '../components/StatusBadge'

function Card({
  title,
  question,
  children,
  to,
}: {
  title: string
  question: string
  children: React.ReactNode
  to: string
}) {
  return (
    <Link
      to={to}
      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-rose-200 hover:shadow-md"
    >
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <p className="mt-0.5 text-xs italic text-slate-400">"{question}"</p>
      </div>
      {children}
    </Link>
  )
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: 'danger' | 'warning' }) {
  const color =
    tone === 'danger' ? 'text-rose-600' : tone === 'warning' ? 'text-amber-600' : 'text-slate-900'
  return (
    <div className="flex items-baseline justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={`font-semibold ${color}`}>{value}</span>
    </div>
  )
}

export default function Overview() {
  const batches = useStore((s) => s.batches)
  const boxes = useStore((s) => s.boxes)
  const batchBills = useStore((s) => s.batchBills)
  const taxBills = useStore((s) => s.taxBills)
  const estimatorConfig = useStore((s) => s.estimatorConfig)
  const getCustomerName = useStore((s) => s.getCustomerName)
  const getBoxNumber = useStore((s) => s.getBoxNumber)

  const batchesMissingPhoto = batches.filter((b) => (b.photoDataUrls ?? []).length === 0).length
  const batchesWithoutBox = batches.filter((b) => !b.boxId).length

  const bbBelumBayar = batchBills.filter((b) => b.status === 'Belum Bayar').length
  const bbMenunggu = batchBills.filter((b) => b.status === 'Menunggu Konfirmasi').length
  const bbLunas = batchBills.filter((b) => b.status === 'Lunas').length

  const overdueTax = taxBills.filter(
    (t) => t.status !== 'Lunas' && daysRemaining(t.deadline) < 0,
  )
  const nearDeadlineTax = taxBills.filter(
    (t) => t.status !== 'Lunas' && daysRemaining(t.deadline) >= 0 && daysRemaining(t.deadline) <= 2,
  )
  const taxMenunggu = taxBills.filter((t) => t.status === 'Menunggu Konfirmasi').length
  const taxLunas = taxBills.filter((t) => t.status === 'Lunas').length

  const attention = [
    ...overdueTax.map((t) => ({
      key: t.id,
      label: `Tax bill overdue — ${getCustomerName(t.customerId)} (Box ${getBoxNumber(t.boxId)})`,
      detail: `${Math.abs(daysRemaining(t.deadline))} hari lewat deadline · ${formatIDR(t.total + t.lateFeeIDR)}`,
      to: '/tax-bills',
    })),
    ...batchBills
      .filter((b) => b.status === 'Menunggu Konfirmasi')
      .map((b) => ({
        key: b.id,
        label: `Bukti transfer menunggu konfirmasi — ${getCustomerName(b.customerId)} (${b.batchNumber})`,
        detail: formatIDR(b.total),
        to: '/orders',
      })),
    ...taxBills
      .filter((t) => t.status === 'Menunggu Konfirmasi')
      .map((t) => ({
        key: t.id,
        label: `Bukti transfer pajak menunggu konfirmasi — ${getCustomerName(t.customerId)} (Box ${getBoxNumber(t.boxId)})`,
        detail: formatIDR(t.total + t.lateFeeIDR),
        to: '/tax-bills',
      })),
  ]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Overview</h2>
        <p className="text-sm text-slate-500">
          Ringkasan operasional GO Aikatsu — reconciliation, billing, dan konfigurasi estimator.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card
          title="A · Order Recap & Payments"
          question="Is the bill given to each customer, and has their payment been confirmed?"
          to="/orders"
        >
          <Stat label="Total batch" value={batches.length} />
          <Stat
            label="Batch belum ada foto"
            value={batchesMissingPhoto}
            tone={batchesMissingPhoto > 0 ? 'warning' : undefined}
          />
          <Stat label="Belum Bayar" value={bbBelumBayar} tone={bbBelumBayar > 0 ? 'danger' : undefined} />
          <Stat
            label="Menunggu Konfirmasi"
            value={bbMenunggu}
            tone={bbMenunggu > 0 ? 'warning' : undefined}
          />
          <Stat label="Lunas" value={bbLunas} />
        </Card>

        <Card
          title="B · Box Management"
          question="Which batches are grouped into which box, and what's each box's current status?"
          to="/boxes"
        >
          <Stat label="Total box" value={boxes.length} />
          <Stat
            label="Batch belum masuk box"
            value={batchesWithoutBox}
            tone={batchesWithoutBox > 0 ? 'warning' : undefined}
          />
        </Card>

        <Card
          title="C · Tax Bills (EMS)"
          question="Has each customer's tax share been published, paid, and confirmed within the 7-day deadline?"
          to="/tax-bills"
        >
          <Stat label="Overdue" value={overdueTax.length} tone={overdueTax.length > 0 ? 'danger' : undefined} />
          <Stat
            label="≤ 2 hari lagi"
            value={nearDeadlineTax.length}
            tone={nearDeadlineTax.length > 0 ? 'warning' : undefined}
          />
          <Stat label="Menunggu Konfirmasi" value={taxMenunggu} />
          <Stat label="Lunas" value={taxLunas} />
        </Card>

        <Card
          title="D · Estimator Config"
          question="Is the exchange rate and service fee used by the estimator up to date?"
          to="/estimator-config"
        >
          <Stat label="Kurs JPY → IDR" value={estimatorConfig.exchangeRate.toLocaleString('id-ID')} />
          <Stat
            label="Service fee"
            value={
              estimatorConfig.serviceFeeType === 'flat'
                ? formatIDR(estimatorConfig.serviceFeeValue)
                : `${estimatorConfig.serviceFeeValue}%`
            }
          />
          <Stat label="Update terakhir" value={formatDate(estimatorConfig.updatedAt)} />
        </Card>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Perlu Perhatian</h3>
        {attention.length === 0 ? (
          <p className="text-sm text-slate-500">Tidak ada item yang butuh tindakan Admin saat ini.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {attention.map((a) => (
              <li key={a.key}>
                <Link
                  to={a.to}
                  className="flex items-center justify-between gap-4 py-2.5 text-sm hover:text-rose-700"
                >
                  <span className="text-slate-700">{a.label}</span>
                  <span className="whitespace-nowrap text-slate-400">{a.detail}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Semua Status Tagihan Batch</h3>
        <div className="flex flex-wrap gap-2">
          {batchBills.map((b) => (
            <div key={b.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-1.5">
              <span className="text-xs text-slate-500">
                {getCustomerName(b.customerId)} · {b.batchNumber}
              </span>
              <StatusBadge status={b.status} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
