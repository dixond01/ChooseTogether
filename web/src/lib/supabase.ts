import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

// Only the public project URL and anon/publishable key belong here.
// Never put a service role or secret key in a VITE_ variable: it ships to the browser.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
      'Set them in web/.env.local (local) or as GitHub repository variables (deploy).',
  )
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    // PKCE returns the magic-link result as ?code=... instead of #access_token=...,
    // so it doesn't collide with the hash router's /#/ routes.
    flowType: 'pkce',
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
  },
})
