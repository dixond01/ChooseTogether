import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type AuthState = {
  session: Session | null
  loading: boolean // true until the first session check (incl. magic-link ?code=) finishes
}

const AuthContext = createContext<AuthState>({ session: null, loading: true })

// Sign-in emails (owner sign-in and team invites) link to
// /ChooseTogether/?token_hash=...&type=email; see supabase/templates/magic_link.html.
// Verified once at module load: the token works only once, and React StrictMode
// runs effects twice in development.
const tokenVerification: Promise<void> | null = (() => {
  const url = new URL(window.location.href)
  const tokenHash = url.searchParams.get('token_hash')
  if (!tokenHash) return null
  return supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' }).then(async ({ error }) => {
    url.searchParams.delete('token_hash')
    url.searchParams.delete('type')
    // Already signed in (e.g. clicked an old link again): just carry on.
    if (error && !(await supabase.auth.getSession()).data.session) {
      // SignIn shows ?error_description.
      url.searchParams.set('error_description', 'That sign-in link has expired or was already used. Request a new one.')
    }
    window.history.replaceState(null, '', url.pathname + url.search + url.hash)
  })
})()

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, loading: true })
  const claimedFor = useRef<string | null>(null)

  useEffect(() => {
    let verifying = tokenVerification !== null
    // Expired or already-used link: show the sign-in page (with the error).
    tokenVerification?.then(async () => {
      verifying = false
      const { data } = await supabase.auth.getSession()
      setState({ session: data.session, loading: false })
    })

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      // Stay "loading" while the emailed link is checked, so the sign-in page doesn't flash.
      if (verifying && !session) return
      setState({ session, loading: false })

      const userId = session?.user.id ?? null
      if (userId && claimedFor.current !== userId) {
        claimedFor.current = userId
        // Link any pending invites for this email to the account.
        // setTimeout: Supabase warns against awaiting its own calls inside this callback.
        setTimeout(() => {
          supabase.rpc('claim_memberships').then(({ error }) => {
            if (error) console.error('claim_memberships failed', error)
          })
        }, 0)
      }

      // The magic link lands on /ChooseTogether/?code=...; drop it once handled.
      if (session && window.location.search.includes('code=')) {
        window.history.replaceState(null, '', window.location.pathname + window.location.hash)
      }
    })
    return () => data.subscription.unsubscribe()
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext)
}
