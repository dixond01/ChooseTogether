import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { callFunction } from '../lib/functions'
import { SLUG_PATTERN, slugify } from '../lib/format'

// Site admins create projects directly. Everyone else sends a request that an
// admin approves (the database enforces this; see the project_requests migration).
export default function NewProject() {
  const navigate = useNavigate()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [closesAt, setClosesAt] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc('is_site_admin').then(({ data }) => setIsAdmin(data ?? false))
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const closes = new Date(closesAt).toISOString()

    if (isAdmin) {
      // create_project() inserts the project and the owner membership in one transaction.
      const { data, error } = await supabase.rpc('create_project', {
        p_name: name.trim(),
        p_slug: slug,
        p_submissions_close_at: closes,
      })
      setSaving(false)
      if (error) {
        setError(error.code === '23505' ? 'That form link is already taken.' : error.message)
        return
      }
      navigate(`/projects/${data.id}/settings`)
      return
    }

    const res = await callFunction('request-project', { name: name.trim(), slug, closesAt: closes, note: note.trim() })
    setSaving(false)
    if (res.error) {
      setError(res.error)
      return
    }
    navigate('/') // the pending request shows on the Projects page
  }

  if (isAdmin === null) return <p className="loading">Loading…</p>
  const title = isAdmin ? 'New Project' : 'Request a Project'

  return (
    <main className="page">
      <Link to="/" className="back">← Projects</Link>
      <h1 className="page-title">{title}</h1>
      <form onSubmit={onSubmit}>
        <div className="fields">
          <div className="field">
            <label className="label" htmlFor="name">Project Name</label>
            <div className="input" style={{ maxWidth: 420 }}>
              <input
                id="name"
                required
                maxLength={200}
                placeholder="Talent Show 2027"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (!slugEdited) setSlug(slugify(e.target.value))
                }}
              />
            </div>
          </div>
          <div className="field">
            <label className="label" htmlFor="slug">Form Link</label>
            <div className="input" style={{ maxWidth: 340 }}>
              <span className="unit prefix">/f/</span>
              <input
                id="slug"
                required
                pattern={SLUG_PATTERN}
                title="Lowercase letters, numbers and single dashes"
                value={slug}
                onChange={(e) => {
                  setSlugEdited(true)
                  setSlug(e.target.value)
                }}
              />
            </div>
          </div>
          <div className="field">
            <label className="label" htmlFor="closes">Submissions Close</label>
            <div className="input date">
              <input
                id="closes"
                type="datetime-local"
                required
                value={closesAt}
                onChange={(e) => setClosesAt(e.target.value)}
              />
            </div>
          </div>
          {!isAdmin && (
            <div className="field">
              <label className="label" htmlFor="note">What's It For?</label>
              <div className="input wide">
                <textarea
                  id="note"
                  rows={4}
                  required
                  maxLength={2000}
                  placeholder="Who's running it, and about how many submissions you expect"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
        <div className="actions">
          <button className="btn" type="submit" disabled={saving}>
            {isAdmin ? (saving ? 'Creating…' : 'Create Project') : saving ? 'Sending…' : 'Send Request'}
          </button>
          {error && <p className="error">{error}</p>}
        </div>
      </form>
    </main>
  )
}
