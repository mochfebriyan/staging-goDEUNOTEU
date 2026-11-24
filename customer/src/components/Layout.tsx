import { useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { create } from 'zustand'
import { useAuth } from '../auth'
import { BRAND } from '../content'
import { MODE, useStore } from '../store'
import { BagIcon, CardIcon, ChatIcon, HomeIcon, UserIcon } from './Icons'
import { Avatar, Modal, Toaster, primaryButton, secondaryButton } from './ui'

// Login modal state, opened from any page ("Masuk" buttons).
export const useLoginModal = create<{ open: boolean; show: () => void; hide: () => void }>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}))

export type TabKey = 'home' | 'order' | 'tagihan' | 'profile'

const NAV: Array<{ key: TabKey; label: string; to: string; icon: typeof HomeIcon }> = [
  { key: 'home', label: 'Home', to: '/id', icon: HomeIcon },
  { key: 'order', label: 'Order', to: '/id?tab=order', icon: BagIcon },
  { key: 'tagihan', label: 'Tagihan', to: '/id?tab=tagihan', icon: CardIcon },
  { key: 'profile', label: 'Profil', to: '/id?tab=profile', icon: UserIcon },
]

// Sub-pages belong to the tab they were opened from (FR-GO-L-003).
function activeTab(pathname: string, search: string): TabKey {
  if (pathname === '/id/order' || pathname === '/id/calculator') return 'order'
  if (pathname === '/id/ems-tax') return 'tagihan'
  const tab = new URLSearchParams(search).get('tab')
  return tab === 'order' || tab === 'tagihan' || tab === 'profile' ? tab : 'home'
}

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation()
  const active = activeTab(location.pathname, location.search)
  const customerId = useStore((s) => s.customerId)
  const customer = useStore((s) => s.customers.find((c) => c.id === s.customerId))
  const logout = useStore((s) => s.logout)
  const showLogin = useLoginModal((s) => s.show)
  const auth = useAuth()
  const loading = useStore((s) => s.loading)

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="flex justify-center border-b border-slate-200 px-5 py-5">
          <img src={BRAND.logoSrc} alt={BRAND.name} className="w-full max-w-48 rounded-lg" />
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Navigasi utama">
          {NAV.map((item) => (
            <Link
              key={item.key}
              to={item.to}
              aria-current={item.key === active ? 'page' : undefined}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                item.key === active
                  ? 'bg-rose-50 text-rose-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <item.icon size={17} />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-slate-200 px-5 py-4 text-xs text-slate-400">
          Ada kendala? Hubungi admin lewat LINE.
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 md:px-8 md:py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide text-rose-500 uppercase md:hidden">{BRAND.name}</p>
            <p className="hidden text-sm text-slate-500 md:block">Group Order · Aikatsu (Mercari Japan)</p>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-sm font-medium text-slate-700">
            {MODE === 'demo' && (
              <span
                className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                title="Data contoh, disimpan di browser ini saja."
              >
                Mode demo
              </span>
            )}
            {auth.status === 'linked' && auth.customer ? (
              <>
                <Avatar name={auth.customer.name} src={auth.linePicture ?? auth.customer.avatarUrl ?? undefined} />
                <span className="hidden max-w-40 truncate sm:inline">{auth.customer.name}</span>
                <button
                  type="button"
                  onClick={auth.signOut}
                  className="ml-1 rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Keluar
                </button>
              </>
            ) : auth.status === 'needsCode' ? (
              <button type="button" onClick={() => useClaimModal.setState({ open: true })} className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700">
                Lengkapi profil
              </button>
            ) : customer ? (
              <>
                <Avatar name={customer.name} />
                <span className="hidden max-w-40 truncate sm:inline">{customer.name}</span>
                <button
                  type="button"
                  onClick={logout}
                  className="ml-1 rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Keluar
                </button>
              </>
            ) : (
              <button type="button" onClick={showLogin} className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700">
                Masuk
              </button>
            )}
          </div>
        </header>

        <main id="main-content" className="flex-1 px-4 py-6 pb-28 md:px-8 md:pb-10">
          {loading && (
            <p role="status" className="mx-auto mb-4 max-w-3xl rounded-lg bg-slate-100 px-4 py-2 text-center text-xs text-slate-500">
              Memuat data kamu…
            </p>
          )}
          {children}
        </main>
      </div>

      {/* Bottom navigation on phones */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white md:hidden"
        aria-label="Navigasi utama"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="grid grid-cols-4">
          {NAV.map((item) => (
            <Link
              key={item.key}
              to={item.to}
              aria-current={item.key === active ? 'page' : undefined}
              className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${
                item.key === active ? 'text-rose-600' : 'text-slate-500'
              }`}
            >
              <item.icon size={20} />
              {item.label}
            </Link>
          ))}
        </div>
      </nav>

      <LoginModal key={customerId ?? 'out'} />
      <ClaimCodeModal />
      <Toaster />
    </div>
  )
}

// FR-GO-PAY-001: LINE Login only (lib/lineLogin.ts). Without Supabase in
// .env (demo mode) a customer picker replaces it.
function LoginModal() {
  const open = useLoginModal((s) => s.open)
  const hide = useLoginModal((s) => s.hide)
  const customers = useStore((s) => s.customers)
  const login = useStore((s) => s.login)
  const [picked, setPicked] = useState('')
  const authStatus = useAuth((a) => a.status)
  const signInWithLine = useAuth((a) => a.signInWithLine)
  const [lineError, setLineError] = useState<string | null>(null)
  const [redirecting, setRedirecting] = useState(false)
  const lineReady = authStatus === 'signedOut'
  if (!open) return null
  return (
    <Modal title="Masuk dulu ya" onClose={hide}>
      <p className="text-sm text-slate-600">Supaya tagihan kamu bisa tampil dan pembayaranmu tercatat.</p>
      <button
        type="button"
        disabled={!lineReady || redirecting}
        title={authStatus === 'disabled' ? 'LINE Login belum tersedia' : undefined}
        onClick={async () => {
          setRedirecting(true)
          setLineError(null)
          const err = await signInWithLine()
          if (err) {
            setLineError(err)
            setRedirecting(false)
          }
        }}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-[#06c755] px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ChatIcon size={18} />
        {redirecting ? 'Membuka LINE…' : 'Lanjut dengan LINE'}
      </button>
      {authStatus === 'disabled' && <p className="mt-1.5 text-center text-xs text-slate-400">LINE Login belum tersedia.</p>}
      {lineError && <p className="mt-1.5 text-center text-xs text-rose-600">{lineError}</p>}

      {MODE === 'demo' && <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-xs font-semibold tracking-wide text-amber-800 uppercase">Mode demo</p>
        <label htmlFor="demo-customer" className="mt-2 block text-sm font-medium text-slate-700">
          Masuk sebagai customer demo
        </label>
        <div className="mt-1.5 flex gap-2">
          <select
            id="demo-customer"
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Pilih customer…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!picked}
            onClick={() => {
              login(picked)
              hide()
            }}
            className={primaryButton}
          >
            Masuk
          </button>
        </div>
      </div>}

      <p className="mt-4 text-center text-xs text-slate-500">Belum pernah join GO? Masuk dengan LINE, profil kamu langsung dibuat.</p>
      <button type="button" onClick={hide} className={`${secondaryButton} mt-3 w-full`}>
        Lihat-lihat dulu
      </button>
    </Modal>
  )
}

// First LINE login: the account isn't linked to a customer yet. New
// customers create their profile from their LINE display name; customers
// Admin GO already recorded enter the one-time code from the admin instead,
// so their existing orders stay theirs. Opens by itself once.
export const useClaimModal = create<{ open: boolean }>(() => ({ open: true }))

function ClaimCodeModal() {
  const status = useAuth((a) => a.status)
  const lineName = useAuth((a) => a.lineName)
  const linePicture = useAuth((a) => a.linePicture)
  const claim = useAuth((a) => a.claim)
  const register = useAuth((a) => a.register)
  const signOut = useAuth((a) => a.signOut)
  const open = useClaimModal((m) => m.open)
  const pushToast = useStore((s) => s.pushToast)
  const [mode, setMode] = useState<'choose' | 'code'>('choose')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (status !== 'needsCode' || !open) return null
  const close = () => useClaimModal.setState({ open: false })

  const run = async (action: () => Promise<string | null>, success: string) => {
    setBusy(true)
    setError(null)
    const err = await action()
    setBusy(false)
    if (err) setError(err)
    else pushToast(success, 'success')
  }

  return (
    <Modal title="Selamat datang!" onClose={close}>
      <div className="flex items-center gap-3">
        <Avatar name={lineName ?? 'LINE'} src={linePicture ?? undefined} size={40} />
        <p className="text-sm text-slate-600">
          Halo{lineName ? <>, <span className="font-semibold text-slate-900">{lineName}</span></> : ''}! Kamu baru pertama kali masuk.
        </p>
      </div>

      {mode === 'choose' ? (
        <div className="mt-5 flex flex-col gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => run(register, 'Profil kamu sudah dibuat.')}
            className={`${primaryButton} w-full`}
          >
            {busy ? 'Membuat profil…' : 'Saya customer baru, buat profil'}
          </button>
          <p className="-mt-1 text-center text-xs text-slate-500">Nama profil diambil dari nama LINE kamu.</p>
          <button type="button" disabled={busy} onClick={() => setMode('code')} className={`${secondaryButton} w-full`}>
            Saya sudah pernah order (punya kode dari admin)
          </button>
        </div>
      ) : (
        <form
          className="mt-5 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            run(() => claim(code), 'Akun LINE kamu sudah tersambung.')
          }}
        >
          <label htmlFor="claim-code" className="text-sm font-medium text-slate-700">
            Kode customer dari admin
          </label>
          <input
            id="claim-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="GO-XXXX-XXXX"
            autoComplete="off"
            className="rounded-md border border-slate-300 px-3 py-2 font-mono text-sm tracking-wider uppercase"
          />
          <button type="submit" disabled={busy || code.trim().length < 6} className={primaryButton}>
            {busy ? 'Menyambungkan…' : 'Sambungkan'}
          </button>
          <button type="button" onClick={() => { setMode('choose'); setError(null) }} className="text-xs text-slate-500 underline">
            Kembali
          </button>
        </form>
      )}
      {error && <p className="mt-2 text-center text-xs text-rose-600">{error}</p>}

      <button type="button" onClick={signOut} className="mt-5 w-full text-center text-xs text-slate-400 underline hover:text-slate-600">
        Keluar dari LINE
      </button>
    </Modal>
  )
}
