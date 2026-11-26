import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'

// Calls an Edge Function and returns its JSON either way. On a 4xx/5xx the
// functions send { error }, sometimes with the saved row too (e.g. the change
// was saved but the email failed).
export async function callFunction<T extends object>(
  name: string,
  body: Record<string, unknown>,
): Promise<T & { error?: string; emailError?: string }> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (!error) return data
  if (error instanceof FunctionsHttpError) {
    try {
      return await error.context.json()
    } catch {
      /* fall through */
    }
  }
  // Network failure: the request never reached the function.
  return { error: 'Couldn’t reach the server. Check your connection and try again.' } as T & { error: string }
}

// Uploads a file straight to R2 through a signed URL. XMLHttpRequest instead
// of fetch because fetch can't report upload progress.
export function putFile(url: string, file: File, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    if (file.type) xhr.setRequestHeader('Content-Type', file.type)
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`R2 ${xhr.status}`)))
    xhr.onerror = () => reject(new Error('network'))
    xhr.send(file)
  })
}
