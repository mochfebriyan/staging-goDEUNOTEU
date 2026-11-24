import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// Null when .env isn't set: the app then only offers the demo login.
export const supabase = url && anonKey ? createClient(url, anonKey) : null

// LINE Login channel (LINE Developers Console → Basic settings). Public value.
export const LINE_CHANNEL_ID = (import.meta.env.VITE_LINE_CHANNEL_ID as string | undefined) ?? null

// LINE sends the customer back here; this URL must be listed under the
// channel's LINE Login → Callback URL.
export const lineRedirectUri = () => `${window.location.origin}/id/line-callback`
