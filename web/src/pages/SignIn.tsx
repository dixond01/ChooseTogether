import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

import { LOGO_URL } from '../lib/format'

// Supabase puts ?error_description=... on the URL when a link is expired or already used.
function linkError(): string | null {
  return new URLSearchParams(window.location.search).get('error_description')
}

export default function SignIn() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(linkError())

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setStatus('sending')
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        // Must be listed under Supabase Auth -> URL Configuration -> Redirect URLs.
        emailRedirectTo: window.location.origin + import.meta.env.BASE_URL,
      },
    })
    if (error) {
      setError(error.message)
      setStatus('idle')
    } else {
      setStatus('sent')
    }
  }

  return (
    <main className="signin">
      <div className="signin-brand">
        <img src={LOGO_URL} alt="" />
        <h1>ChooseTogether</h1>
      </div>
      <div className="signin-form">
        {status === 'sent' ? (
          <div className="sent">
            <h2>Check Your Email</h2>
            <p>
              Sign-in link sent to <strong>{email}</strong>. Open it in this browser.
            </p>
            <div>
              <button className="textbtn" onClick={() => setStatus('idle')}>Use a Different Email</button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit}>
            <h2>Sign In</h2>
            <div className="field">
              <label className="label" htmlFor="email">Email</label>
              <div className="input">
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            {error && <p className="error">{error}</p>}
            <div>
              <button className="btn" type="submit" disabled={status === 'sending'}>
                {status === 'sending' ? 'Sending…' : 'Email Me a Sign-In Link'}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  )
}
