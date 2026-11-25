// "Sat, Dec 12 · 11:59 PM" in the viewer's time zone.
export function formatDeadline(iso: string) {
  const d = new Date(iso)
  const day = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${day} · ${time}`
}

// "Dec 12"
export function formatShortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// <input type="datetime-local"> wants local "YYYY-MM-DDTHH:mm", not ISO/UTC.
export function toLocalInput(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// "Talent Show 2027!" -> "talent-show-2027" (matches the slug check in the schema).
export function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Public form URL for a project slug (the form page itself is built later).
export function publicFormUrl(slug: string) {
  return `${window.location.origin}${import.meta.env.BASE_URL}#/f/${slug}`
}

export const SLUG_PATTERN = '[a-z0-9]+(-[a-z0-9]+)*'

// Served from web/public; BASE_URL is / (the site root).
export const LOGO_URL = `${import.meta.env.BASE_URL}logo.svg`
