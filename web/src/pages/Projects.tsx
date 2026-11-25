import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import type { Tables } from '../lib/database.types'
import { formatDeadline } from '../lib/format'

type ProjectRow = Pick<Tables<'projects'>, 'id' | 'name' | 'submissions_close_at'>
type RequestRow = Pick<Tables<'project_requests'>, 'id' | 'project_name' | 'status' | 'decision_note' | 'decided_at'>

// Denied requests stay on the list for a while so the requester sees the answer.
const SHOW_DENIED_DAYS = 30

export default function Projects() {
  const [projects, setProjects] = useState<ProjectRow[] | null>(null)
  const [requests, setRequests] = useState<RequestRow[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [pendingForAdmin, setPendingForAdmin] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const since = new Date(Date.now() - SHOW_DENIED_DAYS * 86_400_000).toISOString()
      const { data: { user } } = await supabase.auth.getUser()
      const [p, admin, mine] = await Promise.all([
        // RLS only returns projects the user is an active member of.
        supabase.from('projects').select('id, name, submissions_close_at').order('created_at', { ascending: false }),
        supabase.rpc('is_site_admin'),
        supabase
          .from('project_requests')
          .select('id, project_name, status, decision_note, decided_at')
          .eq('user_id', user?.id ?? '')
          .is('dismissed_at', null)
          .or(`status.eq.pending,and(status.eq.denied,decided_at.gte.${since})`)
          .order('created_at', { ascending: false }),
      ])
      if (p.error) setError(p.error.message)
      else setProjects(p.data)
      setRequests(mine.data ?? [])
      setIsAdmin(admin.data ?? false)
      if (admin.data) {
        const { count } = await supabase
          .from('project_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending')
        setPendingForAdmin(count ?? 0)
      }
    }
    load()
  }, [])

  // Hides a denied request from this list (the admin keeps the record).
  async function dismiss(id: string) {
    const { error } = await supabase.rpc('dismiss_project_request', { p_request_id: id })
    if (error) {
      setError(error.message)
      return
    }
    setRequests((list) => list.filter((r) => r.id !== id))
  }

  // One waiting request at a time.
  const hasPending = requests.some((r) => r.status === 'pending')

  return (
    <main className="page">
      <div className="list-head">
        <h1 className="page-title">Projects</h1>
        <div className="row">
          {isAdmin && (
            <Link className="textbtn" to="/admin/requests">
              Project Requests{pendingForAdmin > 0 && ` (${pendingForAdmin})`}
            </Link>
          )}
          {isAdmin ? (
            <Link className="btn" to="/projects/new">New Project</Link>
          ) : (
            !hasPending && <Link className="btn" to="/projects/new">Request a Project</Link>
          )}
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {projects === null && !error && <p className="muted">Loading…</p>}
      {projects?.length === 0 && requests.length === 0 && <p className="muted">No projects yet.</p>}
      {projects && (projects.length > 0 || requests.length > 0) && (
        <ul className="projects">
          {requests.map((r) => (
            <li key={r.id} className="request-row">
              <div>
                <span className="pname muted">{r.project_name}</span>
                <span className="pill">{r.status === 'pending' ? 'Waiting for Approval' : 'Not Approved'}</span>
                {r.status === 'denied' && (
                  <button className="textbtn request-remove" onClick={() => dismiss(r.id)}>Remove</button>
                )}
              </div>
              {r.decision_note && <p className="muted request-note">{r.decision_note}</p>}
            </li>
          ))}
          {projects.map((p) => (
            <li key={p.id}>
              <Link to={`/projects/${p.id}/settings`}>
                <span className="pname">{p.name}</span>
                <span className="muted">Closes {formatDeadline(p.submissions_close_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
