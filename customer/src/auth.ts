import type { Session } from '@supabase/supabase-js'
import { create } from 'zustand'
import { startLineLogin } from './lib/lineLogin'
import { LINE_CHANNEL_ID, supabase } from './lib/supabase'
import { useStore } from './store'

// LINE Login (via the `line-auth` Edge Function, see lib/lineLogin.ts). Every
// customer signs up with LINE: on the first login a customers row is created
// from the LINE display name (register_customer, migrations 0004/0005).
//
// status:
//   disabled     – Supabase or VITE_LINE_CHANNEL_ID missing in .env; demo login only
//   loading      – checking the session / creating the profile
//   signedOut    – not signed in with LINE
//   needsProfile – signed in, but creating the profile failed; retry with register()
//   linked       – signed in with a customers row; `customer` is set

export interface LinkedCustomer {
  id: string
  name: string
  avatarUrl: string | null
}

interface AuthState {
  status: 'disabled' | 'loading' | 'signedOut' | 'needsProfile' | 'linked'
  session: Session | null
  customer: LinkedCustomer | null
  lineName: string | null
  linePicture: string | null
  signInWithLine: () => Promise<string | null>
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

// One register call at a time: refresh() can run twice on login (getSession
// + SIGNED_IN), and customers.auth_user_id is unique.
let registering: Promise<string | null> | null = null

export const useAuth = create<AuthState>()((set) => ({
  status: enabled ? 'loading' : 'disabled',
  session: null,
  customer: null,
  lineName: null,
  linePicture: null,

  signInWithLine: () => startLineLogin(),

  // Creates (or returns the existing) customers row for this LINE account.
  register: () => {
    if (!supabase) return Promise.resolve('LINE Login belum dikonfigurasi.')
    const client = supabase
    registering ??= (async () => {
      set({ status: 'loading' })
      const { data, error } = await client.rpc('register_customer')
      if (error) {
        set({ status: 'needsProfile' })
        useStore.getState().pushToast(`Gagal membuat profil: ${error.message}`, 'error')
        return error.message
      }
      set({ status: 'linked', customer: toCustomer(data as CustomerRow) })
      useStore.getState().pushToast('Selamat datang! Profil kamu sudah dibuat.', 'success')
      return null
    })().finally(() => {
      registering = null
    })
    return registering
  },

  signOut: async () => {
    await supabase?.auth.signOut()
    set(signedOutState)
  },
}))

// Looks up the customer row for this auth user (RLS: "customer reads self");
// creates it on the first login.
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
    // Don't create a second profile on a network error.
    console.error('Gagal memuat customer:', error.message)
    return
  }
  if (data) {
    useAuth.setState({ status: 'linked', customer: toCustomer(data) })
    return
  }
  await useAuth.getState().register()
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
