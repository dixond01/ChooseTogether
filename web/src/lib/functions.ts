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
  return { error: error.message } as T & { error: string }
}
