import { useEffect, useState, type FormEvent } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Enums, Tables } from '../lib/database.types'

type Member = Tables<'project_members'>

// What a manager picks when inviting. Stored as role + in_review_rotation
// (a member with rotation on is a Reviewer, off is a Viewer).
type InviteAs = 'co_manager' | 'reviewer' | 'viewer'
const INVITE_AS: [InviteAs, string][] = [
  ['reviewer', 'Reviewer'],
  ['viewer', 'Viewer'],
  ['co_manager', 'Co-Manager'],
]
function toRole(a: InviteAs): { role: Exclude<Enums<'member_role'>, 'owner'>; inReviewRotation: boolean } {
  if (a === 'co_manager') return { role: 'co_manager', inReviewRotation: false }
  return { role: 'member', inReviewRotation: a === 'reviewer' }
}

function roleLabel(m: Pick<Member, 'role' | 'in_review_rotation'>) {
  if (m.role === 'owner') return 'Owner'
  if (m.role === 'co_manager') return 'Co-Manager'
  return m.in_review_rotation ? 'Reviewer' : 'Viewer'
}

const ROLE_ORDER: Record<Enums<'member_role'>, number> = { owner: 0, co_manager: 1, member: 2 }
const byRole = (a: Member, b: Member) =>
  ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.email.localeCompare(b.email)

type InviteBody = {
  projectId: string
  email: string
  role?: string
  inReviewRotation?: boolean
  resend?: boolean
}

// Calls the invite-member Edge Function. On a 4xx/5xx it still returns the
// member row when the person was added but the email failed.
async function callInvite(body: InviteBody): Promise<{ member?: Member; error?: string }> {
  const { data, error } = await supabase.functions.invoke('invite-member', {
    body: { ...body, redirectTo: window.location.origin + import.meta.env.BASE_URL },
  })
  if (!error) return data
  if (error instanceof FunctionsHttpError) {
    try {
      return await error.context.json()
    } catch {
      /* fall through */
    }
  }
  return { error: error.message }
}

type Props = { projectId: string; canEdit: boolean }

export default function TeamSection({ projectId, canEdit }: Props) {
  const [members, setMembers] = useState<Member[] | null>(null)
  const [email, setEmail] = useState('')
  const [inviteAs, setInviteAs] = useState<InviteAs>('reviewer')
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('project_members')
      .select('*')
      .eq('project_id', projectId)
      .then(({ data, error }) => {
        if (error) setMessage({ ok: false, text: error.message })
        setMembers(data ?? [])
      })
  }, [projectId])

  function upsert(m: Member) {
    setMembers((list) => [...(list ?? []).filter((x) => x.id !== m.id), m])
  }

  async function onInvite(e: FormEvent) {
    e.preventDefault()
    setSending(true)
    setMessage(null)
    const address = email.trim().toLowerCase()
    const res = await callInvite({ projectId, email: address, ...toRole(inviteAs) })
    setSending(false)
    if (res.member) upsert(res.member)
    if (res.error) {
      setMessage({ ok: false, text: res.error })
      if (res.member) setEmail('')
      return
    }
    setEmail('')
    setMessage({ ok: true, text: `Invite sent to ${address}` })
  }

  async function resend(m: Member) {
    setBusyId(m.id)
    setMessage(null)
    const res = await callInvite({ projectId, email: m.email, resend: true })
    setBusyId(null)
    setMessage(res.error ? { ok: false, text: res.error } : { ok: true, text: `Invite resent to ${m.email}` })
  }

  async function inviteAgain(m: Member) {
    setBusyId(m.id)
    setMessage(null)
    const res = await callInvite({
      projectId,
      email: m.email,
      role: m.role,
      inReviewRotation: m.in_review_rotation,
    })
    setBusyId(null)
    if (res.member) upsert(res.member)
    setMessage(res.error ? { ok: false, text: res.error } : { ok: true, text: `Invite sent to ${m.email}` })
  }

  // Soft delete: revoked_at cuts access through RLS right away, even with a
  // valid session. TODO (review MVP): reassign unfinished assignments and ask
  // "Keep their votes?" once votes exist.
  async function remove(m: Member) {
    setBusyId(m.id)
    setMessage(null)
    const { data, error } = await supabase
      .from('project_members')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', m.id)
      .select()
      .single()
    setBusyId(null)
    setConfirmRemove(null)
    if (error) {
      setMessage({ ok: false, text: error.message })
      return
    }
    upsert(data)
  }

  if (!members) return <p className="muted">Loading…</p>

  const active = members.filter((m) => !m.revoked_at).sort(byRole)
  const removed = members.filter((m) => m.revoked_at).sort(byRole)

  return (
    <div className="fields">
      {canEdit && (
        <form className="fields invite" onSubmit={onInvite}>
          <div className="field">
            <label className="label" htmlFor="invite-email">Email</label>
            <div className="input" style={{ maxWidth: 420 }}>
              <input
                id="invite-email"
                type="email"
                required
                autoComplete="off"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setMessage(null)
                }}
              />
            </div>
          </div>
          <div className="field">
            <span className="label">Role</span>
            <div className="choices" role="radiogroup">
              {INVITE_AS.map(([code, label]) => (
                <label key={code} className="choice">
                  <input
                    type="radio"
                    name="invite_as"
                    checked={inviteAs === code}
                    onChange={() => setInviteAs(code)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <div className="row">
            <button className="btn" type="submit" disabled={!email.trim() || sending}>
              {sending ? 'Sending…' : 'Send Invite'}
            </button>
            {message && <span className={message.ok ? 'status-msg' : 'error'}>{message.text}</span>}
          </div>
        </form>
      )}

      <ul className="team">
        {active.map((m) => (
          <li key={m.id}>
            <span className="team-email">{m.email}</span>
            <span className="team-role">{roleLabel(m)}</span>
            {m.user_id === null && <span className="pill">Invited</span>}
            {canEdit && m.role !== 'owner' && (
              <span className="team-actions">
                {confirmRemove === m.id ? (
                  <>
                    <button className="textbtn danger" disabled={busyId === m.id} onClick={() => remove(m)}>
                      Confirm Remove
                    </button>
                    <button className="textbtn" onClick={() => setConfirmRemove(null)}>Cancel</button>
                  </>
                ) : (
                  <>
                    {m.user_id === null && (
                      <button className="textbtn" disabled={busyId === m.id} onClick={() => resend(m)}>
                        {busyId === m.id ? 'Sending…' : 'Resend Invite'}
                      </button>
                    )}
                    <button className="textbtn" onClick={() => setConfirmRemove(m.id)}>Remove</button>
                  </>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>

      {!canEdit && message && !message.ok && <p className="error">{message.text}</p>}

      {canEdit && removed.length > 0 && (
        <details>
          <summary>Removed ({removed.length})</summary>
          <ul className="team">
            {removed.map((m) => (
              <li key={m.id}>
                <span className="team-email muted">{m.email}</span>
                <span className="team-role muted">{roleLabel(m)}</span>
                <span className="team-actions">
                  <button className="textbtn" disabled={busyId === m.id} onClick={() => inviteAgain(m)}>
                    {busyId === m.id ? 'Sending…' : 'Invite Again'}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
