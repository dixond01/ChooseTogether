import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type AuthState = {
  session: Session | null
  loading: boolean // true until the first session check (incl. magic-link ?code=) finishes
}

const AuthContext = createContext<AuthState>({ session: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, loading: true })
  const claimedFor = useRef<string | null>(null)

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
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
