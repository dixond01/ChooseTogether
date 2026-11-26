/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  // Cloudflare Turnstile site key (public). Optional in dev.
  readonly VITE_TURNSTILE_SITE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
