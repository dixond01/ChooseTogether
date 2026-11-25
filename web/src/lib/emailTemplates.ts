import type { Tables } from './database.types'

export type Template = Pick<Tables<'email_templates'>, 'id' | 'status' | 'subject' | 'body'>
export type Draft = { subject: string; body: string }
export type Drafts = Record<string, Draft>

export function isTemplateDirty(t: Template, drafts: Drafts) {
  const d = drafts[t.status]
  return !!d && (d.subject !== t.subject || d.body !== t.body)
}
