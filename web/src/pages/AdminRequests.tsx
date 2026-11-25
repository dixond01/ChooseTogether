import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import { callFunction } from '../lib/functions'
import type { Tables } from '../lib/database.types'
import { formatDeadline } from '../lib/format'

type Request = Tables<'project_requests'>

const STATUS_LABEL: Record<Request['status'], string> = {
  pending: 'Waiting',
  approved: 'Approved',
  denied: 'Not Approved',
}

// Site admins approve or deny project requests. RLS only returns requests to
// admins (and each requester's own), and decide_project_request() re-checks.
export default function AdminRequests() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [requests, setRequests] = useState<Request[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: admin } = await supabase.rpc('is_site_admin')
      setIsAdmin(admin ?? false)
      if (!admin) return
      const { data, error } = await supabase
        .from('project_requests')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) setError(error.message)
      setRequests(data ?? [])
    }
    load()
  }, [])

  if (isAdmin === null) return <p className="loading">Loading…</p>

  const pending = requests.filter((r) => r.status === 'pending').reverse() // oldest first
  const decided = requests.filter((r) => r.status !== 'pending')

  // The decision is saved even if the email failed, so the request moves to
  // Decided either way; the notice says whether the requester was told.
  function onDecided(r: Request, emailError?: string) {
    setRequests((list) => list.map((x) => (x.id === r.id ? r : x)))
    const what = r.status === 'approved' ? 'Approved' : 'Denied'
    setNotice(
      emailError
        ? `${what} ${r.project_name}, but the email to ${r.email} wasn't sent: ${emailError}`
        : `${what} ${r.project_name}. ${r.email} was emailed.`,
    )
  }

  return (
    <main className="page">
      <Link to="/" className="back">← Projects</Link>
      <h1 className="page-title">Project Requests</h1>
      {!isAdmin ? (
        <p className="muted">This page is for site admins.</p>
      ) : (
        <>
          {error && <p className="error">{error}</p>}
          {notice && <p className="status-msg notice">{notice}</p>}
          {pending.length === 0 ? (
            <p className="muted">No requests waiting.</p>
          ) : (
            <ul className="requests">
              {pending.map((r) => (
                <PendingRequest key={r.id} request={r} onDecided={onDecided} />
              ))}
            </ul>
          )}

          {decided.length > 0 && (
            <details className="decided">
              <summary>Decided ({decided.length})</summary>
              <ul className="team">
                {decided.map((r) => (
                  <li key={r.id}>
                    <span className="team-email">{r.project_name}</span>
                    <a className="team-role" href={`mailto:${r.email}`}>{r.email}</a>
                    <span className="pill">{STATUS_LABEL[r.status]}</span>
                    {r.decided_at && <span className="team-actions muted">{formatDeadline(r.decided_at)}</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </main>
  )
}

function PendingRequest({ request: r, onDecided }: { request: Request; onDecided: (r: Request, emailError?: string) => void }) {
  const [denying, setDenying] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function decide(approve: boolean) {
    setBusy(true)
    setMessage(null)
    const res = await callFunction<{ request?: Request }>('decide-project-request', {
      requestId: r.id,
      approve,
      note: approve ? undefined : note,
    })
    setBusy(false)
    if (res.error || !res.request) {
      setMessage({ ok: false, text: res.error ?? 'Something went wrong.' })
      return
    }
    onDecided(res.request, res.emailError)
  }

  return (
    <li className="request">
      <h2 className="request-name">{r.project_name}</h2>
      <dl className="request-facts">
        <dt>Requested By</dt>
        <dd><a href={`mailto:${r.email}`}>{r.email}</a></dd>
        <dt>Form Link</dt>
        <dd>/f/{r.slug}</dd>
        <dt>Closes</dt>
        <dd>{formatDeadline(r.submissions_close_at)}</dd>
        <dt>Requested</dt>
        <dd>{formatDeadline(r.created_at)}</dd>
      </dl>
      <p className="request-note">{r.note}</p>

      {denying ? (
        <div className="fields deny">
          <div className="field">
            <label className="label" htmlFor={`deny-${r.id}`}>Message to Requester</label>
            <div className="input wide">
              <textarea
                id={`deny-${r.id}`}
                rows={3}
                maxLength={2000}
                placeholder="Optional"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
          <div className="row">
            <button className="btn danger" disabled={busy} onClick={() => decide(false)}>
              {busy ? 'Sending…' : 'Deny Request'}
            </button>
            <button className="textbtn" disabled={busy} onClick={() => setDenying(false)}>Cancel</button>
            {message && <span className="error">{message.text}</span>}
          </div>
        </div>
      ) : (
        <div className="row">
          <button className="btn" disabled={busy} onClick={() => decide(true)}>
            {busy ? 'Approving…' : 'Approve'}
          </button>
          <button className="textbtn" disabled={busy} onClick={() => setDenying(true)}>Deny</button>
          {message && <span className="error">{message.text}</span>}
        </div>
      )}
    </li>
  )
}
