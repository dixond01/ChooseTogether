import {
  forwardRef, useEffect, useImperativeHandle, useRef,
  type ClipboardEvent, type KeyboardEvent, type MouseEvent,
} from 'react'

// A text field where placeholders like {participant_name} show as chips
// ("Participant name"). Chips can be inserted or deleted as a whole, but their
// text can't be edited. The value is still plain text with {key} tokens.

export type TokenFieldHandle = { insert: (key: string) => void; focus: () => void }

type Props = {
  value: string
  onChange: (value: string) => void
  labels: Record<string, string> // known placeholder keys -> chip text
  multiline?: boolean
  disabled?: boolean
  labelledBy: string
  onFocus?: () => void
}

// Invisible spacer after each chip so the caret has somewhere to sit next to it.
const ZWSP = '​'
const TOKEN = /\{([a-z_]+)\}/g

function makeChip(key: string, label: string) {
  const chip = document.createElement('span')
  chip.className = 'ph'
  chip.contentEditable = 'false'
  chip.dataset.key = key
  chip.textContent = label
  return chip
}

// Builds the field's content from a {token} string.
function render(el: HTMLElement, value: string, labels: Record<string, string>) {
  el.replaceChildren()
  let last = 0
  for (const m of value.matchAll(TOKEN)) {
    if (!(m[1] in labels)) continue // unknown tokens stay as text (save will flag them)
    if (m.index > last) el.append(value.slice(last, m.index))
    el.append(makeChip(m[1], labels[m[1]]), ZWSP)
    last = m.index + m[0].length
  }
  if (last < value.length) el.append(value.slice(last))
  if (value.endsWith('\n')) el.append(ZWSP) // a trailing newline needs something after it to show
}

// Reads the field back into a {token} string.
function serialize(node: Node): string {
  let out = ''
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      out += child.textContent ?? ''
    } else if (child instanceof HTMLElement) {
      if (child.dataset.key) out += `{${child.dataset.key}}`
      else if (child.tagName === 'BR') out += '\n'
      else {
        // Browsers sometimes wrap lines in <div>/<p> (e.g. after a paste).
        const block = child.tagName === 'DIV' || child.tagName === 'P'
        if (block && out && !out.endsWith('\n')) out += '\n'
        out += serialize(child)
      }
    }
  })
  return out.replaceAll(ZWSP, '')
}

const isChip = (n: Node | null): n is HTMLElement => n instanceof HTMLElement && !!n.dataset.key
const isBlank = (n: Node | null) =>
  !!n && n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').replaceAll(ZWSP, '') === ''

// The chip right before/after a collapsed caret, ignoring invisible spacers.
function chipBeside(range: Range, dir: 'before' | 'after'): HTMLElement | null {
  const { startContainer: n, startOffset: o } = range
  let sib: Node | null
  if (n.nodeType === Node.TEXT_NODE) {
    const text = n.textContent ?? ''
    const side = dir === 'before' ? text.slice(0, o) : text.slice(o)
    if (side.replaceAll(ZWSP, '') !== '') return null
    sib = dir === 'before' ? n.previousSibling : n.nextSibling
  } else {
    sib = dir === 'before' ? n.childNodes[o - 1] ?? null : n.childNodes[o] ?? null
  }
  while (isBlank(sib)) sib = dir === 'before' ? sib!.previousSibling : sib!.nextSibling
  return isChip(sib) ? sib : null
}

const TokenField = forwardRef<TokenFieldHandle, Props>(function TokenField(
  { value, onChange, labels, multiline = false, disabled = false, labelledBy, onFocus },
  ref,
) {
  const el = useRef<HTMLDivElement>(null)
  const lastEmitted = useRef<string | null>(null)
  const savedRange = useRef<Range | null>(null)

  // Re-render only when the value changes from outside (load, discard, switching
  // template); re-rendering on our own edits would move the caret.
  useEffect(() => {
    if (el.current && value !== lastEmitted.current) {
      render(el.current, value, labels)
      lastEmitted.current = value
    }
  }, [value, labels])

  // Block typed { and } however they arrive (keyboard, phone keyboards, autocorrect),
  // so placeholders only ever come from the buttons.
  useEffect(() => {
    const node = el.current
    if (!node) return
    function onBeforeInput(e: InputEvent) {
      if (e.data && /[{}]/.test(e.data)) {
        e.preventDefault()
        const rest = e.data.replaceAll(/[{}]/g, '')
        if (rest) document.execCommand('insertText', false, rest)
      }
    }
    node.addEventListener('beforeinput', onBeforeInput)
    return () => node.removeEventListener('beforeinput', onBeforeInput)
  }, [])

  // Remember the caret so the insert buttons know where to put a chip.
  useEffect(() => {
    function onSelection() {
      const sel = document.getSelection()
      if (sel && sel.rangeCount && el.current?.contains(sel.anchorNode)) {
        savedRange.current = sel.getRangeAt(0).cloneRange()
      }
    }
    document.addEventListener('selectionchange', onSelection)
    return () => document.removeEventListener('selectionchange', onSelection)
  }, [])

  function emit() {
    if (!el.current) return
    let v = serialize(el.current)
    if (!multiline) v = v.replaceAll('\n', ' ')
    lastEmitted.current = v
    onChange(v)
  }

  // Inserts nodes at the caret (or the end) and leaves the caret after them.
  function insertAtCaret(...nodes: Node[]) {
    const root = el.current
    if (!root) return
    root.focus()
    const sel = document.getSelection()!
    let range = sel.rangeCount ? sel.getRangeAt(0) : null
    if (!range || !root.contains(range.startContainer)) {
      range = savedRange.current && root.contains(savedRange.current.startContainer)
        ? savedRange.current
        : null
    }
    if (!range) {
      range = document.createRange()
      range.selectNodeContents(root)
      range.collapse(false)
    }
    range.deleteContents()
    for (const node of [...nodes].reverse()) range.insertNode(node)
    range.setStartAfter(nodes[nodes.length - 1])
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
    emit()
  }

  useImperativeHandle(ref, () => ({
    insert(key: string) {
      if (disabled || !(key in labels)) return
      insertAtCaret(makeChip(key, labels[key]), document.createTextNode(ZWSP))
    },
    focus() {
      el.current?.focus()
    },
  }))

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    // Placeholders only come from the buttons, never typed by hand.
    if (e.key === '{' || e.key === '}') {
      e.preventDefault()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (!multiline) return
      const nl = document.createTextNode('\n')
      // At the very end, a newline needs a spacer after it to show the new line.
      const sel = document.getSelection()
      const atEnd = !!sel?.rangeCount && (() => {
        const r = document.createRange()
        r.selectNodeContents(el.current!)
        r.setStart(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset)
        return r.toString().replaceAll(ZWSP, '') === ''
      })()
      if (atEnd) insertAtCaret(nl, document.createTextNode(ZWSP))
      else insertAtCaret(nl)
      return
    }
    // Delete a whole chip with one Backspace/Delete, even across the spacer.
    if (e.key === 'Backspace' || e.key === 'Delete') {
      const sel = document.getSelection()
      if (!sel?.rangeCount || !sel.isCollapsed) return
      const chip = chipBeside(sel.getRangeAt(0), e.key === 'Backspace' ? 'before' : 'after')
      if (chip) {
        e.preventDefault()
        const spacer = chip.nextSibling
        if (isBlank(spacer)) spacer!.remove()
        chip.remove()
        emit()
      }
    }
  }

  // Clicking a chip puts the caret right after it (the chip itself isn't editable).
  function onMouseDown(e: MouseEvent<HTMLDivElement>) {
    const chip = (e.target as HTMLElement).closest('.ph')
    if (disabled || !chip || !el.current?.contains(chip)) return
    e.preventDefault()
    el.current.focus()
    const after = isBlank(chip.nextSibling) ? chip.nextSibling! : chip
    const range = document.createRange()
    range.setStartAfter(after)
    range.collapse(true)
    const sel = document.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)
  }

  // Paste as plain text; known {tokens} in it become chips.
  function onPaste(e: ClipboardEvent<HTMLDivElement>) {
    e.preventDefault()
    let text = e.clipboardData.getData('text/plain')
    if (!multiline) text = text.replaceAll(/\s*\n\s*/g, ' ')
    const nodes: Node[] = []
    let last = 0
    for (const m of text.matchAll(TOKEN)) {
      if (!(m[1] in labels)) continue
      if (m.index > last) nodes.push(document.createTextNode(text.slice(last, m.index)))
      nodes.push(makeChip(m[1], labels[m[1]]), document.createTextNode(ZWSP))
      last = m.index + m[0].length
    }
    if (last < text.length) nodes.push(document.createTextNode(text.slice(last)))
    if (nodes.length) insertAtCaret(...nodes)
  }

  return (
    <div
      ref={el}
      className={multiline ? 'token-field multiline' : 'token-field'}
      role="textbox"
      aria-multiline={multiline}
      aria-labelledby={labelledBy}
      aria-disabled={disabled}
      contentEditable={!disabled}
      suppressContentEditableWarning
      spellCheck
      onInput={emit}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onMouseDown={onMouseDown}
      onFocus={onFocus}
    />
  )
})

export default TokenField
