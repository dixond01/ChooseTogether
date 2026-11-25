import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { SLUG_PATTERN, slugify } from '../lib/format'

export default function NewProject() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [closesAt, setClosesAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    // create_project() inserts the project and the owner membership in one transaction.
    const { data, error } = await supabase.rpc('create_project', {
      p_name: name.trim(),
      p_slug: slug,
      p_submissions_close_at: new Date(closesAt).toISOString(),
    })
    setSaving(false)
    if (error) {
      setError(error.code === '23505' ? 'That form link is already taken.' : error.message)
      return
    }
    navigate(`/projects/${data.id}/settings`)
  }

  return (
    <main className="page">
      <Link to="/" className="back">← Projects</Link>
      <h1 className="page-title">New Project</h1>
      <form onSubmit={onSubmit}>
        <div className="fields">
          <div className="field">
            <label className="label" htmlFor="name">Project Name</label>
            <div className="input">
              <input
                id="name"
                required
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
        </div>
        <div className="actions">
          <button className="btn" type="submit" disabled={saving}>
            {saving ? 'Creating…' : 'Create Project'}
          </button>
          {error && <p className="error">{error}</p>}
        </div>
      </form>
    </main>
  )
}
