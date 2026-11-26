// Settings → Form Fields: the project's custom fields (Documents/spec/submission-form.md).
// Each field saves on its own. The database protects submitted answers: a
// field's type never changes, options with answers can only grow, and a field
// with answers can only be hidden, not deleted.
import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { Tables } from '../lib/database.types'
import { FIELD_TYPES, fieldTypeLabel, hasPlaceholder, type FieldType } from '../lib/formFields'

type Field = Tables<'project_fields'>

export default function FormFieldsSection({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const [fields, setFields] = useState<Field[] | null>(null)
  // A field id, 'new', or null (nothing open).
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('project_fields')
      .select('*')
      .eq('project_id', projectId)
      .order('position')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        setFields(data ?? [])
      })
  }, [projectId])

  if (!fields) return <p className="muted">Loading…</p>

  async function move(index: number, by: -1 | 1) {
    const next = [...fields!]
    ;[next[index], next[index + by]] = [next[index + by], next[index]]
    const { error } = await supabase.rpc('reorder_project_fields', {
      p_project_id: projectId,
      p_ids: next.map((f) => f.id),
    })
    if (error) return setError(error.message)
    setFields(next.map((f, i) => ({ ...f, position: i + 1 })))
    setError(null)
  }

  async function setHidden(field: Field, hidden: boolean) {
    const { data, error } = await supabase
      .from('project_fields')
      .update({ archived_at: hidden ? new Date().toISOString() : null })
      .eq('id', field.id)
      .select()
      .single()
    if (error) return setError(error.message)
    replace(data)
  }

  async function remove(field: Field) {
    const { error } = await supabase.from('project_fields').delete().eq('id', field.id)
    if (error) {
      setError(error.code === '23503' ? `"${field.label}" already has answers, so it can only be hidden.` : error.message)
      return
    }
    setFields((fs) => fs!.filter((f) => f.id !== field.id))
    setEditing(null)
    setError(null)
  }

  function replace(field: Field) {
    setFields((fs) => fs!.map((f) => (f.id === field.id ? field : f)))
    setError(null)
  }

  return (
    <div className="fields">
      {fields.length === 0 ? (
        <p className="muted">No custom fields yet.</p>
      ) : (
        <ol className="form-fields">
          {fields.map((f, i) => (
            <li key={f.id} className={f.archived_at ? 'is-hidden' : undefined}>
              {editing === f.id ? (
                <FieldEditor
                  projectId={projectId}
                  field={f}
                  nextPosition={0}
                  onSaved={(saved) => {
                    replace(saved)
                    setEditing(null)
                  }}
                  onCancel={() => setEditing(null)}
                  onDelete={() => remove(f)}
                />
              ) : (
                <div className="ff-row">
                  {canEdit && (
                    <span className="ff-move">
                      <button type="button" aria-label={`Move ${f.label} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                        <Chevron up />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${f.label} down`}
                        disabled={i === fields.length - 1}
                        onClick={() => move(i, 1)}
                      >
                        <Chevron />
                      </button>
                    </span>
                  )}
                  <span className="ff-label">{f.label}</span>
                  <span className="pill">{fieldTypeLabel(f.type)}</span>
                  {f.required && <span className="pill">Required</span>}
                  {f.archived_at && <span className="pill">Hidden</span>}
                  {canEdit && (
                    <span className="team-actions">
                      <button type="button" className="textbtn" onClick={() => setEditing(f.id)}>Edit</button>
                      <button type="button" className="textbtn" onClick={() => setHidden(f, !f.archived_at)}>
                        {f.archived_at ? 'Show on Form' : 'Hide'}
                      </button>
                    </span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {canEdit &&
        (editing === 'new' ? (
          <FieldEditor
            projectId={projectId}
            field={null}
            nextPosition={Math.max(0, ...fields.map((f) => f.position)) + 1}
            onSaved={(saved) => {
              setFields((fs) => [...fs!, saved])
              setEditing(null)
              setError(null)
            }}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <div>
            <button type="button" className="btn" onClick={() => setEditing('new')}>Add Field</button>
          </div>
        ))}
      {error && <p className="error">{error}</p>}
    </div>
  )
}

function Chevron({ up = false }: { up?: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d={up ? 'M2 8 L6 4 L10 8' : 'M2 4 L6 8 L10 4'} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

type EditorProps = {
  projectId: string
  field: Field | null // null = new field
  nextPosition: number
  onSaved: (f: Field) => void
  onCancel: () => void
  onDelete?: () => void
}

function FieldEditor({ projectId, field, nextPosition, onSaved, onCancel, onDelete }: EditorProps) {
  const [label, setLabel] = useState(field?.label ?? '')
  const [type, setType] = useState<FieldType>(field?.type ?? 'short_text')
  const [required, setRequired] = useState(field?.required ?? false)
  const [placeholder, setPlaceholder] = useState(field?.placeholder ?? '')
  const [options, setOptions] = useState<string[]>(field?.options ?? ['', ''])
  // Options already saved on a field with answers are locked (only new ones can be added).
  const [lockedCount, setLockedCount] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!field || field.type !== 'choice') return
    supabase
      .from('submission_answers')
      .select('field_id', { count: 'exact', head: true })
      .eq('field_id', field.id)
      .then(({ count }) => {
        if (count) setLockedCount(field.options?.length ?? 0)
      })
  }, [field])

  const cleanOptions = options.map((o) => o.trim()).filter(Boolean)
  const duplicate = new Set(cleanOptions.map((o) => o.toLowerCase())).size !== cleanOptions.length
  const valid = label.trim() && (type !== 'choice' || (cleanOptions.length >= 2 && !duplicate))
  const dirty =
    !field ||
    label !== field.label ||
    required !== field.required ||
    placeholder !== (field.placeholder ?? '') ||
    (type === 'choice' && cleanOptions.join('\n') !== (field.options ?? []).join('\n'))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    setSaving(true)
    const values = {
      label: label.trim(),
      required,
      placeholder: hasPlaceholder(type) ? placeholder.trim() || null : null,
      options: type === 'choice' ? cleanOptions : null,
    }
    const result = field
      ? await supabase.from('project_fields').update(values).eq('id', field.id).select().single()
      : await supabase
          .from('project_fields')
          .insert({ ...values, project_id: projectId, type, position: nextPosition })
          .select()
          .single()
    setSaving(false)
    if (result.error) return setError(result.error.message)
    onSaved(result.data)
  }

  return (
    <form className="ff-editor fields" onSubmit={onSubmit}>
      <div className="field">
        <label className="label" htmlFor="ff-label">Label</label>
        <div className="input">
          <input
            id="ff-label"
            required
            autoFocus
            maxLength={120}
            placeholder="Stage & Equipment Needs"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <span className="label">Type</span>
        {field ? (
          <div className="value"><strong>{fieldTypeLabel(field.type)}</strong></div>
        ) : (
          <div className="choices" role="radiogroup">
            {FIELD_TYPES.map(([code, name]) => (
              <label key={code} className="choice">
                <input type="radio" name="ff-type" checked={type === code} onChange={() => setType(code)} />
                {name}
              </label>
            ))}
          </div>
        )}
      </div>

      {type === 'choice' && (
        <div className="field">
          <span className="label">Options</span>
          <ul className="ff-options">
            {options.map((o, i) => (
              <li key={i}>
                <div className="input">
                  <input
                    aria-label={`Option ${i + 1}`}
                    placeholder={`Option ${i + 1}`}
                    value={o}
                    readOnly={i < lockedCount}
                    onChange={(e) => setOptions((os) => os.map((x, j) => (j === i ? e.target.value : x)))}
                  />
                </div>
                {i >= lockedCount && options.length > 2 && (
                  <button
                    type="button"
                    className="textbtn"
                    onClick={() => setOptions((os) => os.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div>
            <button type="button" className="textbtn" onClick={() => setOptions((os) => [...os, ''])}>Add Option</button>
          </div>
          {lockedCount > 0 && <p className="warn">This field has answers, so its options can't be changed or removed.</p>}
          {duplicate && <p className="error">Each option must be different.</p>}
        </div>
      )}

      {hasPlaceholder(type) && (
        <div className="field">
          <label className="label" htmlFor="ff-ph">Placeholder</label>
          <div className="input">
            <input
              id="ff-ph"
              maxLength={200}
              placeholder="e.g. 2 handheld mics, piano, chair"
              value={placeholder}
              onChange={(e) => setPlaceholder(e.target.value)}
            />
          </div>
        </div>
      )}

      <label className="switch">
        <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
        {type === 'checkbox' ? 'Must Be Checked' : 'Required'}
      </label>

      {!field && <p className="warn">A field's type can't be changed after it's added.</p>}

      <div className="row">
        <button className="btn" type="submit" disabled={!valid || !dirty || saving}>
          {saving ? 'Saving…' : field ? 'Save Field' : 'Add Field'}
        </button>
        <button type="button" className="textbtn" onClick={onCancel}>Cancel</button>
        {onDelete && (
          <button type="button" className="textbtn danger" style={{ marginLeft: 'auto' }} onClick={onDelete}>
            Delete Field
          </button>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </form>
  )
}
