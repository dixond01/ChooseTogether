// Accepted file types per kind. Same lists as web/src/lib/formFields.ts.

export const MEDIA_KINDS = ['video', 'audio', 'image', 'text'] as const

const EXTENSIONS: Record<string, string[]> = {
  video: ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', '3gp'],
  audio: ['mp3', 'm4a', 'wav', 'aac', 'ogg', 'flac'],
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'],
  text: ['txt', 'md', 'rtf', 'pdf', 'doc', 'docx'],
}
const TEXT_MIMES = [
  'application/pdf', 'application/rtf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

export function extensionOf(name: string): string | null {
  const m = /\.([a-z0-9]{1,10})$/i.exec(name)
  return m ? m[1].toLowerCase() : null
}

// The browser decides the kind from the MIME type, or the extension when it
// reports none. Accept the file when either one fits the kind.
export function fileMatchesKind(name: string, mime: string | null, kind: string): boolean {
  const ext = extensionOf(name)
  if (ext && EXTENSIONS[kind]?.includes(ext)) return true
  if (!mime) return false
  if (kind === 'text') return mime.startsWith('text/') || TEXT_MIMES.includes(mime)
  return mime.startsWith(`${kind}/`)
}
