import type { Session } from '@supabase/supabase-js'
import { create } from 'zustand'
import { startLineLogin } from './lib/lineLogin'
import { LINE_CHANNEL_ID, supabase } from './lib/supabase'
import { useStore } from './store'

// LINE Login (via the `line-auth` Edge Function, see lib/lineLogin.ts) and
// linking the LINE account to a customers row: a new customer registers
// (register_customer), a customer Admin GO already created enters a one-time
// code (link_customer). See supabase/migrations/0003–0005.
//
// status:
//   disabled  – Supabase or VITE_LINE_CHANNEL_ID missing in .env; demo login only
//   loading   – checking the session
//   signedOut – not signed in with LINE
//   needsCode – signed in with LINE, not linked to a customer yet
//   linked    – signed in and linked; `customer` is set

export interface LinkedCustomer {
  id: string
  name: string
  avatarUrl: string | null
}

interface AuthState {
  status: 'disabled' | 'loading' | 'signedOut' | 'needsCode' | 'linked'
  session: Session | null
  customer: LinkedCustomer | null
  lineName: string | null
  linePicture: string | null
  signInWithLine: () => Promise<string | null>
  claim: (code: string) => Promise<string | null>
  register: () => Promise<string | null>
  signOut: () => Promise<void>
}

const enabled = Boolean(supabase && LINE_CHANNEL_ID)
const signedOutState = { status: 'signedOut' as const, session: null, customer: null, lineName: null, linePicture: null }

function lineProfile(session: Session) {
  const meta = session.user.user_metadata ?? {}
  return {
    lineName: (meta.name ?? null) as string | null,
    linePicture: (meta.picture ?? null) as string | null,
  }
}

type CustomerRow = { id: string; name: string; avatar_url: string | null }
const toCustomer = (c: CustomerRow): LinkedCustomer => ({ id: c.id, name: c.name, avatarUrl: c.avatar_url })

export const useAuth = create<AuthState>()((set) => ({
  status: enabled ? 'loading' : 'disabled',
  session: null,
  customer: null,
  lineName: null,
  linePicture: null,

  signInWithLine: () => startLineLogin(),

  // Existing customer: one-time code from Admin GO (0003 / 0005).
  claim: async (code) => {
    if (!supabase) return 'LINE Login belum dikonfigurasi.'
    const { data, error } = await supabase.rpc('link_customer', { p_code: code })
    if (error) return error.message
    set({ status: 'linked', customer: toCustomer(data as CustomerRow) })
    return null
  },

  // New customer: profile from the LINE display name (0004 / 0005).
  register: async () => {
    if (!supabase) return 'LINE Login belum dikonfigurasi.'
    const { data, error } = await supabase.rpc('register_customer')
    if (error) return error.message
    set({ status: 'linked', customer: toCustomer(data as CustomerRow) })
    return null
  },

  signOut: async () => {
    await supabase?.auth.signOut()
    set(signedOutState)
  },
}))

// Looks up the customer row linked to this auth user (RLS: "customer reads self").
async function refresh(session: Session | null) {
  if (!supabase) return
  if (!session) {
    useAuth.setState(signedOutState)
    return
  }
  useAuth.setState({ session, ...lineProfile(session) })
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, avatar_url')
    .eq('auth_user_id', session.user.id)
    .maybeSingle()
  if (error) {
    // Don't ask a possibly-linked customer to register again on a network error.
    console.error('Gagal memuat customer:', error.message)
    return
  }
  useAuth.setState(data ? { status: 'linked', customer: toCustomer(data) } : { status: 'needsCode', customer: null })
}

if (supabase && LINE_CHANNEL_ID) {
  supabase.auth.getSession().then(({ data }) => refresh(data.session))
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
      // Supabase warns against awaiting other calls inside this callback.
      setTimeout(() => refresh(session), 0)
    }
  })
}

// Load the customer's Supabase data once linked; clear it on sign-out.
useAuth.subscribe((a, prev) => {
  if (a.customer && a.customer.id !== prev.customer?.id) {
    useStore.getState().loadRemote({ id: a.customer.id, name: a.customer.name })
  } else if (!a.customer && prev.customer) {
    useStore.getState().clearRemote()
  }
})
