import { ref, computed, type Ref, type ComputedRef } from 'vue'
import type { Model } from '@/types'

export type Op = ':' | '=' | '!=' | ':>' | ':<' | 'NOT IN' | 'IN' | 'IS EMPTY' | 'IS NOT EMPTY' | '~' | '!~'

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
  searchable?: boolean
  options?: { value: string; label: string }[]
}

export const FILTERABLE_FIELDS: FieldDef[] = [
  { key: 'provider',  label: 'Provider',  type: 'select', searchable: true },
  { key: 'status',    label: 'Status',    type: 'select', options: [
    { value: 'working', label: 'Working' },
    { value: 'broken', label: 'Broken' },
    { value: 'rate_limited', label: 'Rate Limited' },
    { value: 'untested', label: 'Untested' },
    { value: 'paid', label: 'Paid' },
  ]},
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

export const FIELD_MAP: Record<string, FieldDef> = Object.fromEntries(
  FILTERABLE_FIELDS.map(f => [f.key, f]),
)

export const FIELD_ALIASES: Record<string, string> = {
  ...Object.fromEntries(FILTERABLE_FIELDS.map(f => [f.label.toLowerCase(), f.key])),
  p: 'provider', prov: 'provider',
  s: 'status', stat: 'status',
  t: 'type', typ: 'type',
  c: 'context', ctx: 'context',
  n: 'name',
}

export interface ParseError {
  message: string
  start: number
  end: number
}

export interface SortSpec {
  field: string
  desc: boolean
}

/* ─── JQL Functions (value-level, evaluated at query time) ─── */
// For now, we support a minimal set. Dates don't apply to this dataset,
// but these are parsed so they don't cause errors.
const JQL_FUNCTIONS = new Set([
  'currentuser', 'now', 'startofday', 'endofday',
  'startofweek', 'endofweek', 'startofmonth', 'endofmonth',
])

function isJqlFunction(val: string): boolean {
  const name = val.replace(/[()]/g, '').trim().toLowerCase()
  return JQL_FUNCTIONS.has(name)
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

  // Validate parentheses
  let depth = 0, firstErr = -1
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '(') { depth++; if (firstErr < 0 && body[i] === '(' && i === 0) firstErr = i }
    if (body[i] === ')') {
      depth--
      if (depth < 0) { errors.push({ message: 'Unexpected )', start: i, end: i + 1 }); depth = 0 }
    }
  }
  if (depth > 0) {
    const lastOpen = body.lastIndexOf('(')
    errors.push({ message: 'Missing )', start: firstErr >= 0 ? firstErr : lastOpen >= 0 ? lastOpen : 0, end: body.length })
  }

  // Split on OR
  const orGroups = body.split(/\bOR\b/i).map(s => s.trim())
  const expression: JqlExpression = []

  for (const group of orGroups) {
    if (!group) continue

    // Handle parenthesized groups: (a:b AND c:d)
    const groupClean = group.replace(/^\(/, '').replace(/\)$/, '').trim()
    const isGrouped = group.startsWith('(')

    const clause: JqlClause = []
    const tokenRegex = new RegExp([
      '(\\w+)\\s+(?:NOT\\s+)?IN\\s*\\(\\s*((?:"[^"]*"|[^)])+)\\)',
      '(\\w+)\\s+IS\\s+NOT\\s+EMPTY',
      '(\\w+)\\s+IS\\s+EMPTY',
      '(?:NOT\\s+)?(\\w+)\\s*(?:(\\s*:>|\\s*:<|\\s*~|>|<|>=|<=|!=|:|=)\\s*|(\\s*~|>|<|>=|<=|!=))\\s*(?:"([^"]*?)"|(\\S+))',
    ].join('|'), 'gi')
    void 0

    let match: RegExpExecArray | null
    const consumed: Array<[number, number]> = []

    while ((match = tokenRegex.exec(groupClean)) !== null) {
      consumed.push([match.index, match.index + match[0].length])
      process.stderr.write('PARSE match=[' + match[0] + '] g1=' + match[1] + ' g5=' + match[5] + '\n')

      let field: string, op: Op, rawValue: string

      if (match[1] != null) {
        field = match[1].toLowerCase()
        const isNegated = /\bNOT\s+IN\b/i.test(match[0])
        validateField(field, match.index, consumed[consumed.length - 1][1], errors)
        pushInToken(clause, field, match[2], isNegated)
        continue
      }
      if (match[3] != null) {
        field = match[3].toLowerCase()
        if (!validateNullable(field, match.index, consumed[consumed.length - 1][1], errors)) continue
        pushEmptyToken(clause, field, false)
        continue
      }
      if (match[4] != null) {
        field = match[4].toLowerCase()
        if (!validateNullable(field, match.index, consumed[consumed.length - 1][1], errors)) continue
        pushEmptyToken(clause, field, true)
        continue
      }

      if (match[5] != null) {
        const negated = match[0].trimStart().toUpperCase().startsWith('NOT')
        field = match[5].toLowerCase()
        const opRaw = (match[6] ?? match[7] ?? ':').trim()
        const quoted = match[8]
        const unquoted = match[9]
        rawValue = quoted ?? unquoted ?? ''
        op = normalizeOp(opRaw)
        if (negated) op = op === ':' ? '!=' : op === '!=' ? ':' : op
        validateField(field, match.index, match.index + match[0].length, errors)
      } else {
        continue
      }

      // Validate value
      if (!isJqlFunction(rawValue) && rawValue.startsWith('"') && !rawValue.endsWith('"')) {
        errors.push({ message: 'Unterminated quoted string', start: consumed[consumed.length - 1]?.[0] ?? 0, end: consumed[consumed.length - 1]?.[1] ?? 0 })
      }

      // Validate number ops have numeric values
      if ((op === ':>' || op === ':<') && isNaN(Number(rawValue)) && !isJqlFunction(rawValue)) {
        errors.push({ message: `Expected a number for ${op}`, start: consumed[consumed.length - 1]?.[0] ?? 0, end: consumed[consumed.length - 1]?.[1] ?? 0 })
      }

      clause.push({ field, op, rawValue, values: [rawValue], label: buildTokenLabel(FIELD_MAP[field]!, op, rawValue), modelField: field })
    }

    // Free text from non-consumed spans
    let ft = '', p = 0
    for (const [s, e] of consumed) { if (p < s) ft += groupClean.slice(p, s); p = e }
    if (p < groupClean.length) ft += groupClean.slice(p)
    ft = ft.trim().replace(/\s{2,}/g, ' ')

    // Check for orphaned single-char tokens (possible typos like lone operators)
    const orphaned = ft.match(/(^|\s)([><=~!])(\s|$)/g)
    if (orphaned) {
      for (const o of orphaned) {
        const idx = ft.indexOf(o.trim())
        if (idx >= 0) errors.push({ message: `Unexpected operator: ${o.trim()}`, start: idx, end: idx + o.trim().length })
      }
    }

    if (ft && !orphaned?.some(o => ft.trim() === o.trim())) {
      clause.push({ field: '_text', op: ':', rawValue: ft, values: [], label: `"${ft}"`, modelField: '_text' })
    }

    if (clause.length > 0) {
      if (isGrouped) (clause as unknown as FilterToken & { grouped?: boolean }).grouped = true
      expression.push(clause)
    }
  }

  const allFreeText = expression.flat().filter(t => t.field === '_text').map(t => t.rawValue).join(' ')
  return { expression, freeText: allFreeText, orderBy: extractedOrderField, orderDir: extractedOrderDir, errors }
}

function validateField(field: string, start: number, end: number, errors: ParseError[]) {
  const resolved = FIELD_ALIASES[field] ?? field
  if (!FIELD_MAP[resolved]) {
    // Suggest closest match
    const close = FILTERABLE_FIELDS.map(f => f.key).filter(k => k.startsWith(field.charAt(0))).join(', ')
    errors.push({ message: close ? `Unknown field: "${field}". Did you mean: ${close}?` : `Unknown field: "${field}"`, start, end })
    return false
  }
  return true
}

function validateNullable(field: string, start: number, end: number, errors: ParseError[]) {
  if (!FIELD_MAP[field]) { validateField(field, start, end, errors); return false }
  if (!FIELD_MAP[field].nullable) {
    errors.push({ message: `"${field}" does not support IS EMPTY / IS NOT EMPTY`, start, end })
    return false
  }
  return true
}

function normalizeOp(raw: string): Op {
  const t = raw.trim()
  if (t === ':>' || t === '>' || t === '>=') return ':>'
  if (t === ':<' || t === '<' || t === '<=') return ':<'
  if (t === '~') return ':'
  if (t === '!~') return '!='
  if (t === ':=' || t === '=' || t === ':') return ':'
  if (t === '!=' || t === '<>') return '!='
  return ':'
}

function pushInToken(c: JqlClause, field: string, listStr: string, negated: boolean) {
  const fd = FIELD_MAP[field] ?? FIELD_MAP[FIELD_ALIASES[field]]; if (!fd) return
  const vals = listStr.split(',').map((v: string) => v.trim().replace(/^"|"$/g, ''))
  c.push({ field, op: negated ? 'NOT IN' : 'IN', rawValue: listStr, values: vals, label: buildTokenLabel(fd, negated ? 'NOT IN' : 'IN', listStr), modelField: field })
}

function pushEmptyToken(c: JqlClause, field: string, isEmpty: boolean) {
  const fd = FIELD_MAP[field]; if (!fd) return
  const op: Op = isEmpty ? 'IS EMPTY' : 'IS NOT EMPTY'
  c.push({ field, op, rawValue: isEmpty ? 'EMPTY' : 'NOT EMPTY', values: [], label: `${fd.label} ${op}`, modelField: field })
}

function buildTokenLabel(fd: FieldDef, op: Op, raw: string): string {
  const opDisplay = op === ':' ? ':' : op === '!=' ? '≠' : op === ':>' ? '>' : op === ':<' ? '<' : op
  if (op === 'IS EMPTY' || op === 'IS NOT EMPTY') return `${fd.label} ${op}`
  if (fd.type === 'select' && fd.options && (op === ':' || op === '=' || op === '!=')) {
    const opt = fd.options.find(o => o.value.toLowerCase() === raw.toLowerCase())
    return op === '!=' ? `${fd.label}≠${opt?.label ?? raw}` : `${fd.label}:${opt?.label ?? raw}`
  }
  if (op === 'IN' || op === 'NOT IN') return `${fd.label} ${op} (${raw})`
  if (op === '!=') return `${fd.label}≠${raw}`
  return `${fd.label}${opDisplay}${raw}`
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
  const rv = t.rawValue.toLowerCase()
  switch (t.field) {
    case 'provider': r = m.provider.toLowerCase() === rv; break
    case 'status': r = m.status.result.toLowerCase() === rv; break
    case 'type': r = rv === 'free' ? m.is_free : rv === 'paid' ? !m.is_free : false; break
    case 'context':
      if (t.op === 'IS EMPTY') { r = m.context_length == null; break }
      if (t.op === 'IS NOT EMPTY') { r = m.context_length != null; break }
      if (m.context_length == null) { r = false; break }
      const n = Number(rv); if (isNaN(n)) { r = false; break }
      r = t.op === ':>' ? m.context_length > n : t.op === ':<' ? m.context_length < n : m.context_length === n
      break
    case 'notes':
      if (t.op === 'IS EMPTY') { r = !m.notes || !m.notes.trim(); break }
      if (t.op === 'IS NOT EMPTY') { r = !!m.notes && !!m.notes.trim(); break }
      r = m.notes.toLowerCase().includes(rv); break
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
  const after = raw.slice(cursorPos)
  const spaceIdx = before.lastIndexOf(' ')
  const tokenStart = spaceIdx + 1
  const cur = before.slice(tokenStart).trimStart()

  const isNot = cur.toUpperCase().startsWith('NOT ')
  const body = isNot ? cur.slice(4) : cur

  // No colon / no operator yet — suggest fields
  if (!body.includes(':') && !body.includes('!=') && !body.includes('~') && !/\bIS\b/i.test(body) && !/\bIN\b/i.test(body)) {
    const partial = cur.toLowerCase()
    const matching = FILTERABLE_FIELDS.filter(f =>
      f.key.startsWith(partial) ||
      f.label.toLowerCase().startsWith(partial) ||
      FIELD_ALIASES[partial] === f.key
    )
    // Also show functions if they start typing a function-like word
    const fns: SuggestionOption[] = []
    if ('startof'.startsWith(partial) || 'endof'.startsWith(partial) || 'now'.startsWith(partial)) {
      fns.push({ value: 'startofday()', label: 'Start of day', insert: 'startofday()' })
      fns.push({ value: 'endofday()', label: 'End of day', insert: 'endofday()' })
      fns.push({ value: 'now()', label: 'Now', insert: 'now()' })
    }
    if (matching.length > 0 || fns.length > 0) {
      const fieldOpts = matching.map(f => {
        const insert = f.key + ':'
        // If inside parens or after OR, prepend NOT if isNot
        const prefix = isNot ? `NOT ${f.key}:` : insert
        return { value: f.key, label: f.label, insert: prefix }
      })
      return { field: 'field', options: [...fieldOpts, ...fns] }
    }
    return null
  }

  // Parse field name from token
  const fm = body.match(/^(\w+)\s*(?:(\s*[~<>!]=?|\s*~|:|=|\s+!=)|(\s+IS\s+(?:NOT\s+)?EMPTY)|(?:\s+(NOT\s+)?IN\s*\())?/i)
  if (!fm) return null
  const fnRaw = (fm[1] || '').toLowerCase()
  const fn = FIELD_ALIASES[fnRaw] ?? fnRaw
  const opP = (fm[2] ?? '').trim()
  const isEmptyOp = fm[3] != null
  const rest = body.slice(fm[0]?.length ?? 0).trimStart()
  const fd = FIELD_MAP[fn]
  if (!fd && !['startofday','endofday','now','currentuser'].includes(fn)) return null

  const bi = isNot ? `NOT ${fn}` : fn

  // IS EMPTY suggestions
  if (fd?.nullable && !opP && !rest) {
    return { field: fn, options: [
      { value: 'is-empty', label: 'Is empty', insert: `${bi} IS EMPTY` },
      { value: 'is-not-empty', label: 'Is not empty', insert: `${bi} IS NOT EMPTY` },
    ]}
  }

  // Operator suggestions for fields without op yet
  if (fd && !opP && !rest && !isEmptyOp) {
    if (fd.type === 'number') {
      const ops = [{ op: ':', label: '=' }, { op: ':>', label: '>' }, { op: ':<', label: '<' }, { op: '!=', label: '≠' }] as Array<{op:string;label:string}>
      if (fd.nullable) ops.push({ op: 'IS EMPTY', label: 'is empty' }, { op: 'IS NOT EMPTY', label: 'is not empty' })
      return { field: fn, options: ops.map(o => ({ value: o.op, label: o.label, insert: o.op.startsWith('IS') ? `${bi} ${o.op}` : `${bi}${o.op}` })) }
    }
    if (fd.type === 'select') {
      const ops = [{ op: ':', label: '=' }, { op: '!=', label: '≠' }, { op: 'IN', label: 'in' }, { op: 'NOT IN', label: 'not in' }] as Array<{op:string;label:string}>
      if (fd.nullable) ops.push({ op: 'IS EMPTY', label: 'is empty' }, { op: 'IS NOT EMPTY', label: 'is not empty' })
      return { field: fn, options: ops.map(o => ({ value: o.op, label: o.label, insert: o.op.startsWith('IS') || o.op.endsWith('IN') ? `${bi} ${o.op}` + (o.op.endsWith('IN') ? ' (' : '') : `${bi}${o.op}` })) }
    }
    // text
    const ops = [{ op: ':', label: 'contains' }, { op: '!=', label: 'does not contain' }] as Array<{op:string;label:string}>
    if (fd.nullable) ops.push({ op: 'IS EMPTY', label: 'is empty' }, { op: 'IS NOT EMPTY', label: 'is not empty' })
    return { field: fn, options: ops.map(o => ({ value: o.op, label: o.label, insert: `${bi}${o.op}` })) }
  }

  // Value suggestions for select fields
  if (fd?.type === 'select' && (opP === ':' || opP === '=' || opP === '!=')) {
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

  // Suggest IN/NOT IN for select after value typed
  if (fd?.type === 'select' && rest && (opP === ':' || opP === '=')) {
    return { field: fn, options: [
      { value: 'in', label: 'In list …', insert: `${bi} IN (` },
      { value: 'not-in', label: 'Not in list …', insert: `${bi} NOT IN (` },
    ]}
  }

  // Text field value suggestions (just show the typed value)
  if (fd?.type === 'text' && rest && !after.startsWith(' ')) {
    return null // let user type freely
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
    const needsOR = bt.length > 0 && !bt.endsWith('OR') && !bt.endsWith('or') && !bt.endsWith('AND') && !bt.endsWith('and')
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
