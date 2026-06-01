import { ref, computed, type Ref, type ComputedRef } from 'vue'
import type { Model } from '@/types'

export type Op = ':' | '=' | '!=' | ':>' | ':<' | 'NOT IN' | 'IN' | 'IS EMPTY' | 'IS NOT EMPTY'

export interface FilterToken {
  field: string
  op: Op
  rawValue: string
  values: string[]
  label: string
  modelField: string
}

export type JqlClause = FilterToken[]
export type JqlExpression = JqlClause[]

export interface FieldDef {
  key: string
  label: string
  type: 'select' | 'text' | 'number'
  nullable?: boolean
  options?: { value: string; label: string }[]
}

export const FILTERABLE_FIELDS: FieldDef[] = [
  { key: 'provider',  label: 'Provider',  type: 'select' },
  { key: 'status',    label: 'Status',    type: 'select' },
  { key: 'type',      label: 'Type',      type: 'select', options: [
    { value: 'free', label: 'Free' },
    { value: 'paid', label: 'Paid' },
  ]},
  { key: 'context',   label: 'Context',   type: 'number', nullable: true },
  { key: 'name',      label: 'Name',      type: 'text' },
  { key: 'id',        label: 'ID',        type: 'text' },
  { key: 'notes',     label: 'Notes',     type: 'text', nullable: true },
  { key: 'best_for',  label: 'Best For',  type: 'text' },
]

const FIELD_MAP: Record<string, FieldDef> = Object.fromEntries(
  FILTERABLE_FIELDS.map(f => [f.key, f]),
)

export interface ParseError {
  message: string
  start: number
  end: number
}

export interface SortSpec {
  field: string
  desc: boolean
}

/* ─── Parser ─── */

export function parseQuery(raw: string): {
  expression: JqlExpression
  freeText: string
  orderBy: string
  orderDir: 'ASC' | 'DESC'
  errors: ParseError[]
} {
  let body = raw.trim()
  const errors: ParseError[] = []

  // Extract trailing ORDER BY
  const orderMatch = body.match(/\s+ORDER\s+BY\s+(\w+)\s*(ASC|DESC)?\s*$/i)
  let extractedOrderField = ''
  let extractedOrderDir: 'ASC' | 'DESC' = 'ASC'
  if (orderMatch) {
    const f = orderMatch[1].toLowerCase()
    if (!FIELD_MAP[f] && f !== 'name') {
      errors.push({ message: `Unknown sort field: ${orderMatch[1]}`, start: orderMatch.index!, end: orderMatch.index! + orderMatch[0].length })
    }
    extractedOrderField = f
    extractedOrderDir = (orderMatch[2]?.toUpperCase() === 'DESC') ? 'DESC' : 'ASC'
    body = body.slice(0, body.length - orderMatch[0].length).trim()
  }

  // Validate parentheses balance
  let depth = 0
  let firstErr = -1
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '(') { depth++; if (firstErr < 0) firstErr = i }
    if (body[i] === ')') { depth--; if (depth < 0) { errors.push({ message: 'Unexpected )', start: i, end: i + 1 }); depth = 0 } }
  }
  if (depth > 0) errors.push({ message: 'Missing )', start: firstErr, end: body.length })

  // Strip outer grouping parentheses for parsing
  const orGroups = body.split(/\bOR\b/i).map(s => s.trim())

  const expression: JqlExpression = []

  for (const group of orGroups) {
    const clause: JqlClause = []

    // Outer group parens: (a:b AND c:d) OR (e:f)
    const groupBody = group.replace(/^\(/, '').replace(/\)$/, '').trim()

    // Match tokens. Order matters — longer/more specific first.
    const tokenRegex =
      /(\w+)\s+NOT\s+IN\s*\(\s*((?:"[^"]*"|[^)])+)\)|(\w+)\s+IS\s+NOT\s+EMPTY|(\w+)\s+IS\s+EMPTY|(?:NOT\s+)?(\w+)\s*(?::>|:<|:=|:!=|!=|:|=)\s*(?:"([^"]*?)"|(\S+))/gi

    let match: RegExpExecArray | null
    const consumed: Array<[number, number]> = []

    while ((match = tokenRegex.exec(groupBody)) !== null) {
      consumed.push([match.index, match.index + match[0].length])

      let field: string
      let op: Op
      let rawValue: string

      if (match[1] != null) {
        field = match[1].toLowerCase()
        validateField(field, match.index, consumed[consumed.length - 1][1], errors)
        pushInToken(clause, field, match[2], true)
        continue
      }
      if (match[3] != null) {
        field = match[3].toLowerCase()
        validateField(field, match.index, consumed[consumed.length - 1][1], errors)
        pushEmptyToken(clause, field, false)
        continue
      }
      if (match[5] != null) {
        field = match[5].toLowerCase()
        validateField(field, match.index, consumed[consumed.length - 1][1], errors)
        pushEmptyToken(clause, field, true)
        continue
      }

      if (match[7] != null) {
        const isNegated = match[0].trimStart().toUpperCase().startsWith('NOT')
        field = isNegated ? match[7].toLowerCase() : match[7].toLowerCase()
        const opRaw = match[8] as string
        const quotedVal = match[9]
        const unquotedVal = match[10]
        rawValue = quotedVal ?? unquotedVal ?? ''
        op = normalizeOp(opRaw)
        if (isNegated) {
          if (op === ':') op = '!='
          else if (op === '!=') op = ':'
        }
        validateField(field, match.index, consumed[consumed.length - 1][1], errors)
      } else if (match[11] != null) {
        const isNegated = match[0].trimStart().toUpperCase().startsWith('NOT')
        field = match[11].toLowerCase()
        const opRaw = match[12] as string
        const quotedVal = match[13]
        const unquotedVal = match[14]
        rawValue = quotedVal ?? unquotedVal ?? ''
        op = normalizeOp(opRaw)
        if (isNegated) {
          if (op === ':') op = '!='
          else if (op === '!=') op = ':'
        }
        validateField(field, match.index, consumed[consumed.length - 1][1], errors)
      } else {
        continue
      }

      clause.push({ field, op, rawValue, values: [rawValue], label: buildTokenLabel(FIELD_MAP[field]!, op, rawValue), modelField: field })
    }

    // Check for orphaned words that aren't valid tokens (possible typos)
    let ft = ''
    let pp = 0
    for (const [s, e] of consumed) {
      if (pp < s) ft += groupBody.slice(pp, s)
      pp = e
    }
    if (pp < groupBody.length) ft += groupBody.slice(pp)
    ft = ft.trim().replace(/\s{2,}/g, ' ')

    if (ft) {
      clause.push({ field: '_text', op: ':', rawValue: ft, values: [], label: `"${ft}"`, modelField: '_text' })
    }

    if (clause.length > 0) expression.push(clause)
  }

  const allFreeText = expression.flat().filter(t => t.field === '_text').map(t => t.rawValue).join(' ')
  return { expression, freeText: allFreeText, orderBy: extractedOrderField, orderDir: extractedOrderDir, errors }
}

function validateField(field: string, start: number, end: number, errors: ParseError[]) {
  if (!FIELD_MAP[field]) {
    errors.push({ message: `Unknown field: ${field}`, start, end })
  }
}

function normalizeOp(raw: string): Op {
  if (raw === ':>' || raw === '>') return ':>'
  if (raw === ':<' || raw === '<') return ':<'
  if (raw === ':=' || raw === '=' || raw === ':') return ':'
  if (raw === ':!=' || raw === '!=') return '!='
  return ':'
}

function pushInToken(c: JqlClause, field: string, listStr: string, negated: boolean) {
  const fd = FIELD_MAP[field]; if (!fd) return
  const vals = listStr.split(',').map((v: string) => v.trim().replace(/^"|"$/g, ''))
  c.push({ field, op: negated ? 'NOT IN' : 'IN', rawValue: listStr, values: vals, label: buildTokenLabel(fd, negated ? 'NOT IN' : 'IN', listStr), modelField: field })
}

function pushEmptyToken(c: JqlClause, field: string, isEmpty: boolean) {
  const fd = FIELD_MAP[field]; if (!fd) return
  const op: Op = isEmpty ? 'IS EMPTY' : 'IS NOT EMPTY'
  c.push({ field, op, rawValue: isEmpty ? 'EMPTY' : 'NOT EMPTY', values: [], label: `${fd.label} ${op}`, modelField: field })
}

function buildTokenLabel(fd: FieldDef, op: Op, raw: string): string {
  if (op === 'IS EMPTY' || op === 'IS NOT EMPTY') return `${fd.label} ${op}`
  if (fd.type === 'select' && fd.options && (op === ':' || op === '=' || op === '!=')) {
    const opt = fd.options.find(o => o.value.toLowerCase() === raw.toLowerCase())
    const v = opt?.label ?? raw
    return op === '!=' ? `${fd.label}!=${v}` : `${fd.label}:${v}`
  }
  if (op === '!=') return `${fd.label}!=${raw}`
  if (op === 'IN' || op === 'NOT IN') return `${fd.label} ${op} (${raw})`
  if (op === ':>' || op === ':<') return `${fd.label}${op}${raw}`
  return `${fd.label}:${raw}`
}

/* ─── Matching ─── */

export function modelMatches(m: Model, expr: JqlExpression, free: string): boolean {
  if (expr.length === 0 && !free) return true
  if (!expr.some(cl => cl.every(t => matchToken(m, t)))) return false
  if (free) {
    const q = free.toLowerCase()
    const hay = [m.name, m.id, m.notes, m.provider, ...m.best_for].join(' ').toLowerCase()
    if (!hay.includes(q)) return false
  }
  return true
}

function matchToken(m: Model, t: FilterToken): boolean {
  if (t.field === '_text') return true
  const neg = t.op === '!=' || t.op === 'NOT IN'
  let r: boolean
  switch (t.field) {
    case 'provider': r = m.provider.toLowerCase() === t.rawValue.toLowerCase(); break
    case 'status': r = m.status.result.toLowerCase() === t.rawValue.toLowerCase(); break
    case 'type': r = t.rawValue.toLowerCase() === 'free' ? m.is_free : t.rawValue.toLowerCase() === 'paid' ? !m.is_free : false; break
    case 'context':
      if (t.op === 'IS EMPTY') { r = m.context_length == null; break }
      if (t.op === 'IS NOT EMPTY') { r = m.context_length != null; break }
      if (m.context_length == null) { r = false; break }
      const n = Number(t.rawValue)
      if (isNaN(n)) { r = false; break }
      r = t.op === ':>' ? m.context_length > n : t.op === ':<' ? m.context_length < n : m.context_length === n
      break
    case 'notes':
      if (t.op === 'IS EMPTY') { r = !m.notes || !m.notes.trim(); break }
      if (t.op === 'IS NOT EMPTY') { r = !!m.notes && !!m.notes.trim(); break }
      r = m.notes.toLowerCase().includes(t.rawValue.toLowerCase()); break
    default: { const h = getTextField(m, t.field)?.toLowerCase() ?? ''; r = t.values.some(v => h.includes(v.toLowerCase())) }
  }
  return neg ? !r : r
}

function getTextField(m: Model, f: string): string | null {
  switch (f) {
    case 'name': return m.name
    case 'id': return m.id
    case 'notes': return m.notes
    case 'provider': return m.provider
    case 'status': return m.status.result
    case 'best_for': return m.best_for.join(', ')
    default: return null
  }
}

/* ─── Suggestions ─── */

export interface SuggestionOption { value: string; label: string; insert: string }

export function getSuggestions(raw: string, cursorPos: number, providerNames: string[]): { field: string; options: SuggestionOption[] } | null {
  const before = raw.slice(0, cursorPos)
  const spaceIdx = before.lastIndexOf(' ')
  const tokenStart = spaceIdx + 1
  const cur = before.slice(tokenStart).trimStart()
  const isAfterOR = /\bOR\s*$/i.test(before.trimEnd())
  const isNot = cur.toUpperCase().startsWith('NOT ')
  const body = isNot ? cur.slice(4) : cur

  if (!body.includes(':') && !body.includes('!=') && !/\bIS\b/i.test(body)) {
    const partial = cur.toLowerCase()
    if (isAfterOR || partial.length > 0) {
      const m = FILTERABLE_FIELDS.filter(f => f.key.startsWith(partial) || f.label.toLowerCase().startsWith(partial))
      if (m.length > 0) return { field: 'field', options: m.map(f => ({ value: f.key, label: f.label, insert: f.key + ':' })) }
    }
    return null
  }

  const fm = body.match(/^(\w+)\s*(?::(=?>|=|<|!=)?|!=|\s+(NOT\s+)?(?:IN\s*\(|IS\s+(NOT\s+)?EMPTY))?/i)
  if (!fm) return null
  const fn = fm[1].toLowerCase()
  const opP = fm[2] ?? ''
  const rest = body.slice(fm[0].length).trimStart()
  const fd = FIELD_MAP[fn]
  if (!fd) return null

  const bi = isNot ? `NOT ${fn}` : fn

  // IS EMPTY suggestions
  if (fd.nullable && !opP && !rest) {
    return { field: fn, options: [
      { value: 'is-empty', label: 'Is empty', insert: `${bi} IS EMPTY` },
      { value: 'is-not-empty', label: 'Is not empty', insert: `${bi} IS NOT EMPTY` },
    ]}
  }

  // Number field operators
  if (fd.type === 'number' && !opP) {
    const ops = [{ op: ':', label: 'Equals' }, { op: ':>', label: 'Greater than' }, { op: ':<', label: 'Less than' }, { op: '!=', label: 'Not equals' } as const]
    if (fd.nullable) {
      (ops as Array<{op:string;label:string}>).push({ op: 'IS EMPTY', label: 'Is empty' }, { op: 'IS NOT EMPTY', label: 'Is not empty' })
    }
    return { field: fn, options: ops.map(o => ({ value: o.op, label: o.label, insert: o.op.startsWith('IS') ? `${bi} ${o.op}` : `${bi}${o.op}` })) }
  }

  // Select field values
  if (fd.type === 'select') {
    let opts: { value: string; label: string }[]
    if (fn === 'provider') opts = providerNames.map(p => ({ value: p, label: p }))
    else if (fd.options) opts = fd.options
    else return null
    const fil = rest ? opts.filter(o => o.label.toLowerCase().startsWith(rest.toLowerCase()) || o.value.toLowerCase().startsWith(rest.toLowerCase())) : opts.slice()
    const out = fil.slice(0, 12).flatMap(o => {
      const r: SuggestionOption[] = [{ value: o.value, label: o.label, insert: `${bi}:${o.value}` }]
      if (!isNot && fil.length <= 5) r.push({ value: `!${o.value}`, label: `Not ${o.label}`, insert: `${bi}:!=${o.value}` })
      return r
    })
    if (!isNot && fil.length >= 2) out.push({ value: 'in', label: 'In list …', insert: `${bi} IN (` })
    return { field: fn, options: out }
  }

  return null
}

/* ─── Composable ─── */

export function useJqlFilter(
  models: Ref<Model[]> | ComputedRef<Model[]>,
  providerNames: Ref<string[]> | ComputedRef<string[]>,
) {
  const rawQuery = ref('')
  const cursorPos = ref(0)
  const inputRef = ref<HTMLInputElement | null>(null)
  const showSuggestions = ref(false)
  const activeSuggestion = ref(-1)

  const parsed = computed(() => parseQuery(rawQuery.value))
  const validationErrors = computed(() => parsed.value.errors)

  const sortSpec = computed<SortSpec | null>(() => {
    if (!parsed.value.orderBy) return null
    return { field: parsed.value.orderBy, desc: parsed.value.orderDir === 'DESC' }
  })

  const filteredModels = computed(() =>
    models.value.filter(m => modelMatches(m, parsed.value.expression, parsed.value.freeText)),
  )

  const suggestions = computed(() =>
    showSuggestions.value ? getSuggestions(rawQuery.value, cursorPos.value, providerNames.value) : null,
  )

  function applySuggestion(insert: string) {
    const raw = rawQuery.value
    const before = raw.slice(0, cursorPos.value)
    const after = raw.slice(cursorPos.value)
    const spaceIdx = before.lastIndexOf(' ')
    const tokenStart = spaceIdx + 1
    const bt = before.slice(0, tokenStart).trimEnd()
    const needsOR = bt.length > 0 && !bt.endsWith('OR') && !bt.endsWith('or')
    const prefix = needsOR ? 'OR ' : bt.length > 0 ? ' ' : ''
    const trailing = insert.endsWith('(') ? '' : ' '
    rawQuery.value = before.slice(0, tokenStart) + prefix + insert + trailing + after.trimStart()
    showSuggestions.value = false
    activeSuggestion.value = -1
    setTimeout(() => {
      const el = inputRef.value
      if (!el) return
      el.focus()
      const np = tokenStart + prefix.length + insert.length + trailing.length
      el.setSelectionRange(np, np)
      cursorPos.value = np
    }, 0)
  }

  function removeToken(index: number) {
    const all = parsed.value.expression.flat().filter(t => t.field !== '_text')
    if (index < 0 || index >= all.length) return
    let ti = 0
    const parts: string[] = []
    for (const clause of parsed.value.expression) {
      const cp: string[] = []
      for (const t of clause) { if (t.field === '_text') continue; if (ti !== index) cp.push(stringifyToken(t)); ti++ }
      if (cp.length > 0) parts.push(cp.join(' '))
    }
    let result = parts.join(' OR ')
    if (parsed.value.orderBy) result += ` ORDER BY ${parsed.value.orderBy} ${parsed.value.orderDir}`
    rawQuery.value = result
  }

  function onInput(e: Event) {
    const el = e.target as HTMLInputElement
    cursorPos.value = el.selectionStart ?? el.value.length
    showSuggestions.value = true
    activeSuggestion.value = -1
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') { showSuggestions.value = false; activeSuggestion.value = -1; return }
    if (!showSuggestions.value || !suggestions.value) return
    const opts = suggestions.value.options
    if (e.key === 'ArrowDown') { e.preventDefault(); activeSuggestion.value = Math.min(activeSuggestion.value + 1, opts.length - 1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeSuggestion.value = Math.max(activeSuggestion.value - 1, 0) }
    else if (e.key === 'Enter' && activeSuggestion.value >= 0) { e.preventDefault(); applySuggestion(opts[activeSuggestion.value].insert) }
    else if (e.key === 'Enter' || e.key === 'Tab') { if (activeSuggestion.value < 0) showSuggestions.value = false }
  }

  function onFocus() { showSuggestions.value = true }
  function onBlur() { setTimeout(() => { showSuggestions.value = false; activeSuggestion.value = -1 }, 150) }

  return {
    rawQuery, cursorPos, inputRef, showSuggestions, activeSuggestion,
    parsed, validationErrors, sortSpec, filteredModels, suggestions,
    applySuggestion, removeToken, onInput, onKeydown, onFocus, onBlur,
  }
}

export function stringifyToken(t: FilterToken): string {
  if (t.field === '_text') return t.label
  const op = t.op
  if (op === 'IS EMPTY') return `${t.field} IS EMPTY`
  if (op === 'IS NOT EMPTY') return `${t.field} IS NOT EMPTY`
  if (op === 'NOT IN') return `${t.field} NOT IN (${t.values.join(',')})`
  if (op === 'IN') return `${t.field} IN (${t.values.join(',')})`
  if (op === '!=') return `${t.field}!=${t.values.join(',')}`
  return `${t.field}${op}${t.values.join(',')}`
}
