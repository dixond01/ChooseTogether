// Cloudflare Turnstile, the public form's bot check. Usually invisible; it
// only shows a box when Cloudflare wants the visitor to click. The submit
// Edge Function checks the token it gives.
import { useEffect, useRef } from 'react'

// The site key is public by design (it only identifies the widget). In dev,
// Cloudflare's always-pass test key pairs with the test secret in
// supabase/functions/.env.
const SITE_KEY: string =
  import.meta.env.VITE_TURNSTILE_SITE_KEY || (import.meta.env.DEV ? '1x00000000000000000000AA' : '')

type Api = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  reset: (id: string) => void
  remove: (id: string) => void
}
declare global {
  interface Window { turnstile?: Api }
}

let loading: Promise<Api> | null = null
function loadApi(): Promise<Api> {
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('no turnstile')))
    s.onerror = () => {
      loading = null
      reject(new Error('turnstile script failed'))
    }
    document.head.appendChild(s)
  })
  return loading
}

type Props = {
  // A fresh token, or null when it expired or was used.
  onToken: (token: string | null) => void
  onError: () => void
  // Change this number to get a new token (each token works once).
  resetKey: number
}

export function Turnstile({ onToken, onError, resetKey }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const widget = useRef<{ api: Api; id: string } | null>(null)
  // Callbacks change every render; the widget keeps the first ones it got.
  const handlers = useRef({ onToken, onError })
  useEffect(() => {
    handlers.current = { onToken, onError }
  })

  useEffect(() => {
    let cancelled = false
    if (!SITE_KEY) {
      handlers.current.onError()
      return
    }
    loadApi().then(
      (api) => {
        if (cancelled || !box.current) return
        const id = api.render(box.current, {
          sitekey: SITE_KEY,
          appearance: 'interaction-only',
          theme: 'light',
          callback: (t: string) => handlers.current.onToken(t),
          'expired-callback': () => handlers.current.onToken(null),
          'error-callback': () => handlers.current.onError(),
        })
        widget.current = { api, id }
      },
      () => !cancelled && handlers.current.onError(),
    )
    return () => {
      cancelled = true
      widget.current?.api.remove(widget.current.id)
      widget.current = null
    }
  }, [])

  useEffect(() => {
    if (resetKey === 0 || !widget.current) return
    handlers.current.onToken(null)
    widget.current.api.reset(widget.current.id)
  }, [resetKey])

  return <div ref={box} className="turnstile" />
}
