import { useEffect, useState, type ComponentType } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import {
  ABOUT,
  ADMINS,
  HERO,
  REVIEW_PROMPT,
  SOCIALS,
  STATS,
  TESTIMONIALS,
  TESTIMONIALS_SECTION,
} from '../content'
import {
  BagIcon,
  CalculatorIcon,
  ChatIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  FileTextIcon,
  InstagramIcon,
  PackageIcon,
  PlaneIcon,
  ShieldIcon,
  StarIcon,
  StoreIcon,
  WarehouseIcon,
  XLogoIcon,
} from '../components/Icons'
import { useLoginModal } from '../components/Layout'
import { useAuth } from '../auth'
import { Avatar, Card, EmptyState, MediaPlaceholder, PageHeader, StatusBadge, primaryButton, secondaryButton } from '../components/ui'
import { formatDate, formatDateTime, formatIDR } from '../shared/format'
import type { OrderStatus } from '../shared/types'
import { MODE, batchOwners, myBatchBills, myBatches, myNotifications, myTaxBills, useStore } from '../store'

type Icon = ComponentType<{ size?: number; className?: string }>

export default function Landing() {
  const [params] = useSearchParams()
  const tab = params.get('tab')
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [tab])
  if (tab === 'order') return <OrderTab />
  if (tab === 'tagihan') return <TagihanTab />
  if (tab === 'profile') return <ProfileTab />
  return <HomeTab />
}

// ── Home (FR-GO-L-001, FR-GO-L-002) ─────────────────────────────────
const SOCIAL_ICONS: Record<string, Icon> = { line: ChatIcon, x: XLogoIcon, instagram: InstagramIcon, shop: StoreIcon }

function HomeTab() {
  return (
    <div className="flex flex-col gap-8">
      <section>
        <Card className="flex flex-col justify-center p-6 md:p-8">
          <p className="text-xs font-semibold tracking-wide text-rose-500 uppercase">Group Order · Aikatsu</p>
          <h2 className="mt-2 text-3xl leading-tight font-bold text-slate-900 md:text-4xl">
            {HERO.lines.slice(0, -1).join(' ')} <span className="text-rose-600">{HERO.lines[HERO.lines.length - 1]}</span>
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-600 md:text-base">{HERO.body}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/id/order" className={primaryButton}>
              <BagIcon size={16} /> Bayar Batch
            </Link>
            <Link to="/id/calculator" className={secondaryButton}>
              <CalculatorIcon size={16} /> Kalkulator Harga
            </Link>
          </div>
        </Card>
      </section>

      <section className="grid grid-cols-3 gap-4">
        {STATS.map((s) => (
          <Card key={s.label}>
            <p className="text-2xl font-bold text-slate-900 tabular-nums">{s.value}</p>
            <p className="mt-1 text-xs text-slate-500">{s.label}</p>
          </Card>
        ))}
      </section>

      <section className="flex flex-col gap-5">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold tracking-wide text-rose-500 uppercase">{ABOUT.eyebrow}</p>
          <h3 className="mt-1 text-xl font-bold text-slate-900">{ABOUT.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{ABOUT.body}</p>
          <div className="mt-4 flex gap-2">
            {SOCIALS.map((s) => {
              const Icon = SOCIAL_ICONS[s.kind]
              return (
                <a
                  key={s.kind}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={s.title}
                  aria-label={s.title}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-rose-200 hover:text-rose-600"
                >
                  <Icon size={16} />
                </a>
              )
            })}
          </div>
        </div>
        <div>
          <h4 className="mb-3 text-sm font-semibold text-slate-900">Tim admin</h4>
          <div className="grid gap-4 sm:grid-cols-2">
            {ADMINS.map((a, i) => (
              <Card key={i} className="flex flex-col">
                <div className="flex items-center gap-3">
                  <Avatar name={a.name} size={40} src={a.avatarSrc} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{a.name}</p>
                    <p className="text-xs text-slate-500">{a.role}</p>
                  </div>
                </div>
                <p className="mt-3 flex-1 text-sm text-slate-600">{a.bio}</p>
                <a
                  href={a.lineHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-rose-600 hover:text-rose-700"
                >
                  <ChatIcon size={14} /> Hubungi
                </a>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-5">
        <div>
          <p className="text-xs font-semibold tracking-wide text-rose-500 uppercase">{TESTIMONIALS_SECTION.eyebrow}</p>
          <h3 className="mt-1 text-xl font-bold text-slate-900">{TESTIMONIALS_SECTION.title}</h3>
          <p className="mt-1 text-sm text-slate-500">{TESTIMONIALS_SECTION.body}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TESTIMONIALS.slice(0, 6).map((t, i) => (
            <figure key={i} className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              {t.photo && <MediaPlaceholder src={t.photo.photoSrc} label="Foto dari pembeli" className="aspect-[4/3] w-full border-0 border-b" />}
              <div className="flex flex-1 flex-col p-4">
                <p className="flex-1 text-sm text-slate-600">{t.text}</p>
                {t.name && (
                  <figcaption className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
                    <Avatar name={t.name} size={24} />
                    <span className="truncate text-xs font-semibold text-slate-900">{t.name}</span>
                  </figcaption>
                )}
              </div>
            </figure>
          ))}
        </div>
        <ReviewPrompt />
      </section>
    </div>
  )
}

function ReviewPrompt() {
  const [hover, setHover] = useState(0)
  return (
    <Card className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-sm font-semibold text-slate-900">{REVIEW_PROMPT.title}</p>
        <p className="mt-1 text-sm text-slate-500">{REVIEW_PROMPT.body}</p>
      </div>
      <div className="text-center">
        <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
          {REVIEW_PROMPT.starLabels.map((label, i) => (
            <a
              key={label}
              href={REVIEW_PROMPT.href(i + 1)}
              aria-label={`${i + 1} bintang — ${label}`}
              onMouseEnter={() => setHover(i + 1)}
              onFocus={() => setHover(i + 1)}
              className={`flex h-10 w-10 items-center justify-center rounded-lg ${i < hover ? 'text-rose-500' : 'text-slate-300'}`}
            >
              <StarIcon size={24} fill={i < hover ? 'currentColor' : 'none'} />
            </a>
          ))}
        </div>
        <p className="mt-1 text-xs text-slate-400" aria-live="polite">
          {hover ? REVIEW_PROMPT.starLabels[hover - 1] : REVIEW_PROMPT.hint}
        </p>
      </div>
    </Card>
  )
}

// ── Menu tiles used by the Order and Tagihan tabs ─────────────────────
function MenuTile({ to, icon: Icon, title, description, badge }: { to: string; icon: Icon; title: string; description: string; badge?: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-rose-200 hover:shadow-md"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
        <Icon size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          {title}
          {badge && (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-rose-200 ring-inset">{badge}</span>
          )}
        </span>
        <span className="mt-0.5 block text-xs text-slate-500">{description}</span>
      </span>
      <ChevronRightIcon size={18} className="text-slate-400" />
    </Link>
  )
}

// ── Order tab (FR-GO-L-003) ───────────────────────────────────────────
function OrderTab() {
  const unpaid = useStore((s) => (s.customerId ? myBatchBills(s).filter((b) => b.status === 'Belum Bayar').length : 0))
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Layanan Pesanan" description="Bayar tagihan batch kamu atau hitung estimasi harga jajan dari Jepang." />
      <div className="grid gap-4 md:grid-cols-2">
        <MenuTile
          to="/id/order"
          icon={BagIcon}
          title="Bayar Batch"
          description="Lihat tagihan per batch dan upload bukti transfer."
          badge={unpaid ? `${unpaid} belum bayar` : undefined}
        />
        <MenuTile to="/id/calculator" icon={CalculatorIcon} title="Kalkulator Harga" description="Estimasi harga barang dari harga yen." />
      </div>
    </div>
  )
}

// ── Tagihan tab (FR-GO-L-003, FR-GO-L-004) ─────────────────────────────
// Same six order_status values, in the same order, as the admin dashboard.
const STAGES: Array<{ status: OrderStatus; name: string; text: string; icon: Icon }> = [
  { status: 'Dibeli dari Seller', name: 'Di seller', text: 'Sudah dibelikan admin di Mercari. Tinggal tunggu seller kirim ke gudang.', icon: StoreIcon },
  { status: 'Di WH Jepang', name: 'Gudang Jepang', text: 'Sampai di gudang Jepang, dikumpulkan dulu ke dalam box.', icon: WarehouseIcon },
  { status: 'Dikirim ke Indonesia', name: 'Ke Indonesia', text: 'Box sedang dikirim ke Indonesia pakai EMS.', icon: PlaneIcon },
  { status: 'Di Bea Cukai', name: 'Bea cukai', text: 'Box diperiksa bea cukai. Tagihan pajak per customer terbit di sini.', icon: ShieldIcon },
  { status: 'Di WH Indonesia', name: 'Gudang Indonesia', text: 'Sudah di tangan kami. Lunasi pajak, lalu barang disiapkan untuk dikirim.', icon: PackageIcon },
  { status: 'Selesai', name: 'Selesai', text: 'Pesanan selesai dan sudah dikirim ke kamu.', icon: CheckCircleIcon },
]

function TagihanTab() {
  const signedIn = useStore((s) => Boolean(s.customerId))
  const batches = useStore(useShallow((s) => (s.customerId ? myBatches(s) : [])))
  const unpaidTax = useStore((s) => (s.customerId ? myTaxBills(s).filter((t) => t.status === 'Belum Bayar').length : 0))
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Tagihan & Pembayaran" description="Tagihan pajak EMS per box dan posisi barang kamu." />
      <MenuTile
        to="/id/ems-tax"
        icon={FileTextIcon}
        title="Tagihan EMS & Pajak"
        description="Lihat tagihan pajak per box dan upload bukti transfer."
        badge={unpaidTax ? `${unpaidTax} belum bayar` : undefined}
      />
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-base font-semibold text-slate-900">Posisi barang kamu</h3>
          {!signedIn && <span className="text-xs text-slate-500">Masuk untuk melihat batch kamu di tiap tahap.</span>}
        </div>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {STAGES.map((s, i) => {
            const here = batches.filter((b) => b.orderStatus === s.status)
            return (
              <li
                key={s.status}
                className={`relative flex flex-col gap-2 rounded-xl border bg-white p-4 shadow-sm ${
                  here.length ? 'border-rose-300 ring-1 ring-rose-200' : 'border-slate-200'
                }`}
              >
                <span className="absolute top-3 right-4 text-2xl font-bold text-slate-100" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                  <s.icon size={16} />
                </span>
                <span className="text-sm font-semibold text-slate-900">{s.name}</span>
                <span className="self-start rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{s.status}</span>
                <span className="text-xs leading-relaxed text-slate-500">{s.text}</span>
                {here.length > 0 && (
                  <span className="mt-1 flex flex-wrap gap-1">
                    {here.map((b) => (
                      <span key={b.id} className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
                        {b.batchNumber}
                      </span>
                    ))}
                  </span>
                )}
              </li>
            )
          })}
        </ol>
        {/* Only rules the MVP enforces: tax bills are published once a box
            reaches Di Bea Cukai; late fees are entered by admin. */}
        <p className="mt-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
          Tagihan pajak terbit setelah box sampai di bea cukai. Denda keterlambatan, jika ada, ditentukan admin dan tampil di tagihanmu.
        </p>
      </section>
    </div>
  )
}

// ── Profil tab (FR-GO-PAY-001, FR-GO-L-005) ─────────────────────────────
function ProfileTab() {
  const s = useStore()
  const showLogin = useLoginModal((m) => m.show)
  const customer = s.customers.find((c) => c.id === s.customerId)
  const auth = useAuth()

  if (!customer && (auth.status === 'loading' || auth.status === 'needsProfile')) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-6">
        <PageHeader title="Profil" />
        <Card className="text-center text-sm text-slate-600">
          {auth.status === 'loading' ? (
            'Memuat akun…'
          ) : (
            <>
              Profil kamu belum berhasil dibuat.
              <button type="button" onClick={() => auth.register()} className={`${primaryButton} mt-3 w-full`}>
                Coba lagi
              </button>
            </>
          )}
        </Card>
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-6">
        <PageHeader title="Profil" />
        <Card className="text-center">
          <p className="text-sm font-semibold text-slate-900">Masuk ke profil kamu</p>
          <p className="mt-1 text-sm text-slate-500">Masuk dulu untuk memantau status pesanan, rincian tagihan, dan riwayat batch kamu.</p>
          <button type="button" onClick={showLogin} className={`${primaryButton} mt-4 w-full`}>
            Masuk
          </button>
        </Card>
      </div>
    )
  }

  const batchBills = myBatchBills(s)
  const taxBills = myTaxBills(s)
  const notifications = myNotifications(s)
  const unread = notifications.filter((n) => !n.read)
  const linePicture = auth.status === 'linked' ? (auth.linePicture ?? auth.customer?.avatarUrl ?? undefined) : undefined
  const signOut = auth.status === 'linked' ? auth.signOut : s.logout

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Profil" />
      <Card className="flex flex-wrap items-center gap-4">
        <Avatar name={customer.name} size={48} src={linePicture} />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-500">DN Line{auth.lineName && auth.lineName !== customer.name ? ` · ${auth.lineName}` : ''}</p>
          <p className="text-base font-semibold text-slate-900">{customer.name}</p>
        </div>
        <button type="button" onClick={signOut} className={secondaryButton}>
          Keluar
        </button>
      </Card>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Tagihan batch belum bayar" value={batchBills.filter((b) => b.status === 'Belum Bayar').length} to="/id/order" />
        <Stat label="Batch menunggu konfirmasi" value={batchBills.filter((b) => b.status === 'Menunggu Konfirmasi').length} to="/id/order" />
        <Stat label="Pajak belum bayar" value={taxBills.filter((t) => t.status === 'Belum Bayar').length} to="/id/ems-tax" />
        <Stat label="Pajak menunggu konfirmasi" value={taxBills.filter((t) => t.status === 'Menunggu Konfirmasi').length} to="/id/ems-tax" />
      </div>

      <MyBatches />

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            Notifikasi {unread.length > 0 && <span className="ml-1 rounded-full bg-rose-600 px-2 py-0.5 text-xs text-white">{unread.length}</span>}
          </h3>
          {unread.length > 0 && (
            <button type="button" onClick={() => s.markNotificationsRead(unread.map((n) => n.id))} className="text-xs font-medium text-rose-600 hover:text-rose-700">
              Tandai semua dibaca
            </button>
          )}
        </div>
        {notifications.length === 0 ? (
          <EmptyState message="Belum ada notifikasi." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {notifications.map((n) => (
              <li key={n.id}>
                <Link
                  to={n.to}
                  onClick={() => s.markNotificationsRead([n.id])}
                  className="flex items-start justify-between gap-4 py-2.5 text-sm hover:text-rose-700"
                >
                  <span className={n.read ? 'text-slate-500' : 'font-medium text-slate-900'}>
                    {!n.read && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-rose-500" aria-label="belum dibaca" />}
                    {n.message}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400" title={formatDateTime(n.at)}>
                    {formatDate(n.at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {MODE === 'demo' && <div className="text-right">
        <button type="button" onClick={s.resetDemo} className="text-xs text-slate-400 underline hover:text-slate-600">
          Reset data demo
        </button>
      </div>}
    </div>
  )
}

// Quick overview of every batch the customer has items in, grouped by the
// box it ships in, with the batch's status, the customer's own bill and —
// for ReqShare batches — everyone who shares it.
function MyBatches() {
  const s = useStore()
  const batches = myBatches(s).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const myBills = myBatchBills(s)

  // Group by box; batches not in a box yet go last.
  const groups = new Map<string, typeof batches>()
  for (const b of batches) groups.set(b.boxId ?? '', [...(groups.get(b.boxId ?? '') ?? []), b])
  const boxOrder = Array.from(groups.keys()).sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Batch kamu</h3>
        <p className="text-xs text-slate-500">
          {batches.length} batch · {boxOrder.filter((k) => k !== '').length} box
        </p>
      </div>
      {batches.length === 0 ? (
        <EmptyState message="Belum ada batch untuk kamu." />
      ) : (
        boxOrder.map((boxId) => {
          const box = s.boxes.find((x) => x.id === boxId)
          return (
            <div key={boxId || 'no-box'} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
                <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <PackageIcon size={16} className="text-rose-500" />
                  {box ? box.boxNumber : 'Belum masuk box'}
                </p>
                {box && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{box.status}</span>}
              </div>
              <ul className="divide-y divide-slate-100">
                {(groups.get(boxId) ?? []).map((batch) => {
                  const bill = myBills.find((b) => b.batchId === batch.id)
                  const mine = s.items.filter((i) => i.batchId === batch.id && i.customerId === s.customerId)
                  const owners = batch.orderType === 'ReqShare' ? batchOwners(s, batch.id) : []
                  return (
                    <li key={batch.id} className="flex flex-col gap-2 px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link to="/id/order" className="text-sm font-bold text-rose-600 hover:underline">
                            {batch.batchNumber}
                          </Link>
                          <span className="ml-2 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-600">
                            {batch.orderType}
                          </span>
                          <p className="mt-0.5 text-xs text-slate-400">{formatDate(batch.createdAt)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-400">Status order</p>
                          <p className="text-sm font-medium text-slate-800">{batch.orderStatus}</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                        <span className="text-slate-500">
                          Tagihan kamu: {mine.length} item ·{' '}
                          <span className="font-semibold text-slate-800 tabular-nums">{formatIDR(bill?.total ?? mine.reduce((sum, i) => sum + i.priceIDR, 0))}</span>
                        </span>
                        <StatusBadge status={bill?.status ?? 'Belum Bayar'} />
                      </div>

                      {owners.length > 0 && (
                        <div>
                          <p className="mb-1 text-xs text-slate-400">
                            Pemilik batch · {owners.filter((o) => o.status === 'Lunas').length} dari {owners.length} sudah lunas
                          </p>
                          <ul className="flex flex-col gap-1">
                            {owners.map((o) => {
                              const isMe = o.customerId === s.customerId
                              return (
                                <li
                                  key={o.customerId}
                                  className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md px-2 py-1 text-xs ${isMe ? 'bg-rose-50/60' : ''}`}
                                >
                                  <span className="text-slate-700">
                                    {o.name}
                                    {isMe && <span className="ml-1 font-medium text-rose-600">(kamu)</span>}
                                  </span>
                                  <span className="flex items-center gap-2 text-slate-500">
                                    <span className="tabular-nums">{o.itemCount} item</span>
                                    <span className="tabular-nums text-slate-700">{formatIDR(o.total)}</span>
                                    <StatusBadge status={o.status} />
                                  </span>
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })
      )}
    </section>
  )
}

function Stat({ label, value, to }: { label: string; value: number; to: string }) {
  return (
    <Link to={to} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-rose-200">
      <p className={`text-2xl font-bold tabular-nums ${value > 0 ? 'text-rose-600' : 'text-slate-900'}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-500">{label}</p>
    </Link>
  )
}
