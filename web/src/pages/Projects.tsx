import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import type { Tables } from '../lib/database.types'
import { formatDeadline } from '../lib/format'

type ProjectRow = Pick<Tables<'projects'>, 'id' | 'name' | 'submissions_close_at'>

export default function Projects() {
  const [projects, setProjects] = useState<ProjectRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // RLS only returns projects the user is an active member of.
    supabase
      .from('projects')
      .select('id, name, submissions_close_at')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setProjects(data)
      })
  }, [])

  return (
    <main className="page">
      <div className="list-head">
        <h1 className="page-title">Projects</h1>
        <Link className="btn" to="/projects/new">New project</Link>
      </div>
      {error && <p className="error">{error}</p>}
      {projects === null && !error && <p className="muted">Loading…</p>}
      {projects?.length === 0 && <p className="muted">No projects yet.</p>}
      {projects && projects.length > 0 && (
        <ul className="projects">
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
