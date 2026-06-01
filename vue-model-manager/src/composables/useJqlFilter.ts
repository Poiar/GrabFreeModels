import { ref, computed, type Ref, type ComputedRef } from 'vue'
import type { Model } from '@/types'

/* ─── Token / AST types ─── */

export type Op = ':' | '=' | '!=' | ':>' | ':<' | 'NOT IN' | 'IN' | 'IS EMPTY' | 'IS NOT EMPTY'

export interface FilterToken {
  field: string
  op: Op
  rawValue: string
  values: string[]
  label: string
  modelField: string
}

/** A clause = one or more tokens ANDed together */
export type JqlClause = FilterToken[]
/** Expression = clauses ORed together */
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
} {
  let body = raw.trim()

  // Extract trailing ORDER BY
  const orderMatch = body.match(/\s+ORDER\s+BY\s+(\w+)\s*(ASC|DESC)?\s*$/i)
  let extractedOrderField = ''
  let extractedOrderDir: 'ASC' | 'DESC' = 'ASC'
  if (orderMatch) {
    extractedOrderField = orderMatch[1].toLowerCase()
    extractedOrderDir = (orderMatch[2]?.toUpperCase() === 'DESC') ? 'DESC' : 'ASC'
    body = body.slice(0, body.length - orderMatch[0].length).trim()
  }

  // Split on OR (whole word, case-insensitive)
  const orGroups = body.split(/\bOR\b/i).map(s => s.trim())

  const expression: JqlExpression = []

  for (const group of orGroups) {
    const clause: JqlClause = []

    // Master regex matching (in order of priority):
    //   1. field IN (v1, v2, ...)  /  field NOT IN (v1, v2, ...)
    //   2. field IS NOT EMPTY
    //   3. field IS EMPTY
    //   4. field:> "quoted" | val
    //   5. field:< "quoted" | val
    //   6. field:!= "quoted" | val
    //   7. field!= "quoted" | val
    //   8. field:= "quoted" | val
    //   9. field: "quoted" | val
    //  10. NOT field:…  (negation wrapper — we store the inner token with a __negate meta)
    const tokenRegex =
      /(\w+)\s+NOT\s+IN\s*\(\s*((?:"[^"]*"|[^)])+)\)|(\w+)\s+IS\s+NOT\s+EMPTY|(\w+)\s+IS\s+EMPTY|(\w+)\s*(?::>|:<|:=|!=|:|=)\s*(?:"([^"]*?)"|(\S+))|(?:NOT\s+)?(\w+)\s*(?:::=|:!=|:>+|:<+|=)\s*(?:"([^"]*?)"|(\S+))/gi

    let match: RegExpExecArray | null
    const consumed: Array<[number, number]> = []

    while ((match = tokenRegex.exec(group)) !== null) {
      consumed.push([match.index, match.index + match[0].length])

      let field: string
      let op: Op
      let rawValue: string

      if (match[1] != null) {
        // field NOT IN (v1, v2, ...)
        field = match[1].toLowerCase()
        const listStr = match[2]
        pushInToken(clause, field, listStr, true)
        continue
      }

      if (match[3] != null) {
        // field IS NOT EMPTY
        field = match[3].toLowerCase()
        pushEmptyToken(clause, field, false)
        continue
      }

      if (match[5] != null) {
        // field IS EMPTY
        field = match[5].toLowerCase()
        pushEmptyToken(clause, field, true)
        continue
      }

      if (match[7] != null) {
        // field:op value  (standard form)
        field = match[7].toLowerCase()
        const opRaw = match[8] as string
        const quotedVal = match[9]
        const unquotedVal = match[10]
        rawValue = quotedVal ?? unquotedVal ?? ''
        op = normalizeOp(opRaw)
      } else if (match[11] != null) {
        // [NOT] field:op value  (NOT prefix form)
        const isNegated = match[0].toUpperCase().startsWith('NOT')
        field = match[11].toLowerCase()
        const opRaw = match[12] as string
        const quotedVal = match[13]
        const unquotedVal = match[14]
        rawValue = quotedVal ?? unquotedVal ?? ''
        op = normalizeOp(opRaw)
        if (isNegated) {
          // Flip the operator to its negated form
          if (op === ':') op = '!='
          else if (op === '!=') op = ':'
          else if (op === 'IN') op = 'NOT IN'
          else if (op === 'NOT IN') op = 'IN'
        }
      } else {
        continue
      }

      const fieldDef = FIELD_MAP[field]
      if (!fieldDef) continue

      const values = [rawValue]
      clause.push({
        field,
        op,
        rawValue,
        values,
        label: buildTokenLabel(fieldDef, op, rawValue),
        modelField: field,
      })
    }

    // Extract free text from non-consumed spans
    let ft = ''
    let p = 0
    for (const [s, e] of consumed) {
      if (p < s) ft += group.slice(p, s)
      p = e
    }
    if (p < group.length) ft += group.slice(p)
    ft = ft.trim().replace(/\s{2,}/g, ' ')

    if (ft) {
      clause.push({ field: '_text', op: ':', rawValue: ft, values: [], label: `"${ft}"`, modelField: '_text' })
    }

    if (clause.length > 0) {
      expression.push(clause)
    }
  }

  const allFreeText = expression.flat()
    .filter(t => t.field === '_text')
    .map(t => t.rawValue)
    .join(' ')

  return { expression, freeText: allFreeText, orderBy: extractedOrderField, orderDir: extractedOrderDir }
}

function normalizeOp(raw: string): Op {
  if (raw === ':>' || raw === '>') return ':>'
  if (raw === ':<' || raw === '<') return ':<'
  if (raw === ':=' || raw === '=' || raw === ':') return ':'
  if (raw === ':!=' || raw === '!=') return '!='
  return ':'
}

function pushInToken(clause: JqlClause, field: string, listStr: string, negated: boolean) {
  const fieldDef = FIELD_MAP[field]
  if (!fieldDef) return
  const vals = listStr.split(',').map((v: string) => v.trim().replace(/^"|"$/g, ''))
  clause.push({
    field,
    op: negated ? 'NOT IN' : 'IN',
    rawValue: listStr,
    values: vals,
    label: buildTokenLabel(fieldDef, negated ? 'NOT IN' : 'IN', listStr),
    modelField: field,
  })
}

function pushEmptyToken(clause: JqlClause, field: string, isEmpty: boolean) {
  const fieldDef = FIELD_MAP[field]
  if (!fieldDef) return
  const op: Op = isEmpty ? 'IS EMPTY' : 'IS NOT EMPTY'
  clause.push({
    field,
    op,
    rawValue: isEmpty ? 'EMPTY' : 'NOT EMPTY',
    values: [],
    label: `${fieldDef.label} ${op}`,
    modelField: field,
  })
}

function buildTokenLabel(fieldDef: FieldDef, op: Op, rawValue: string): string {
  const omitFields: Op[] = ['IS EMPTY', 'IS NOT EMPTY']
  if (omitFields.includes(op)) {
    return `${fieldDef.label} ${op}`
  }
  if (fieldDef.type === 'select' && fieldDef.options && (op === ':' || op === '=' || op === '!=')) {
    const opt = fieldDef.options.find(o => o.value.toLowerCase() === rawValue.toLowerCase())
    const val = opt?.label ?? rawValue
    return op === '!=' ? `${fieldDef.label}!=${val}` : `${fieldDef.label}:${val}`
  }
  if (fieldDef.type === 'select' && (op === 'IN' || op === 'NOT IN')) {
    return `${fieldDef.label} ${op} (${rawValue})`
  }
  if (op === 'IN' || op === 'NOT IN') return `${fieldDef.label} ${op} (${rawValue})`
  if (op === '!=') return `${fieldDef.label}!=${rawValue}`
  if (op === ':>' || op === ':<') return `${fieldDef.label}${op}${rawValue}`
  return `${fieldDef.label}:${rawValue}`
}

/* ─── Matching ─── */

export function modelMatches(model: Model, expression: JqlExpression, freeText: string): boolean {
  if (expression.length === 0 && !freeText) return true

  const orMatch = expression.some(clause => clause.every(token => matchToken(model, token)))
  if (!orMatch) return false

  if (freeText) {
    const q = freeText.toLowerCase()
    const haystack = [model.name, model.id, model.notes, model.provider, ...model.best_for].join(' ').toLowerCase()
    if (!haystack.includes(q)) return false
  }
  return true
}

function matchToken(model: Model, token: FilterToken): boolean {
  if (token.field === '_text') return true

  const negate = token.op === '!=' || token.op === 'NOT IN'

  let result: boolean
  switch (token.field) {
    case 'provider':
      result = model.provider.toLowerCase() === token.rawValue.toLowerCase()
      break
    case 'status':
      result = model.status.result.toLowerCase() === token.rawValue.toLowerCase()
      break
    case 'type': {
      const wantFree = token.rawValue.toLowerCase() === 'free'
      const wantPaid = token.rawValue.toLowerCase() === 'paid'
      result = wantFree ? model.is_free : wantPaid ? !model.is_free : false
      break
    }
    case 'context': {
      if (token.op === 'IS EMPTY') { result = model.context_length == null; break }
      if (token.op === 'IS NOT EMPTY') { result = model.context_length != null; break }
      const ctx = model.context_length
      if (ctx == null) { result = false; break }
      const num = Number(token.rawValue)
      if (isNaN(num)) { result = false; break }
      if (token.op === ':>') result = ctx > num
      else if (token.op === ':<') result = ctx < num
      else result = ctx === num
      break
    }
    case 'notes':
      if (token.op === 'IS EMPTY') { result = !model.notes || model.notes.trim() === ''; break }
      if (token.op === 'IS NOT EMPTY') { result = !!model.notes && model.notes.trim() !== ''; break }
      // fall through to text match
      result = model.notes.toLowerCase().includes(token.rawValue.toLowerCase())
      break
    default: {
      const hay = getTextField(model, token.field)?.toLowerCase() ?? ''
      result = token.values.some(v => hay.includes(v.toLowerCase()))
    }
  }

  return negate ? !result : result
}

function getTextField(model: Model, field: string): string | null {
  switch (field) {
    case 'name': return model.name
    case 'id': return model.id
    case 'notes': return model.notes
    case 'provider': return model.provider
    case 'status': return model.status.result
    case 'best_for': return model.best_for.join(', ')
    default: return null
  }
}

/* ─── Suggestions ─── */

export interface SuggestionOption {
  value: string
  label: string
  insert: string
}

export function getSuggestions(
  raw: string,
  cursorPos: number,
  providerNames: string[],
): { field: string; options: SuggestionOption[] } | null {
  const beforeCursor = raw.slice(0, cursorPos)
  const spaceIdx = beforeCursor.lastIndexOf(' ')
  const tokenStart = spaceIdx + 1
  const currentToken = beforeCursor.slice(tokenStart).trimStart()

  // Check if we're right after OR
  const trimmedBefore = beforeCursor.trimEnd()
  const isAfterOR = /\bOR\s*$/i.test(trimmedBefore)

  // Detect NOT prefix
  const isNotPrefix = currentToken.toUpperCase().startsWith('NOT ')
  const tokenWithoutNot = isNotPrefix ? currentToken.slice(4) : currentToken

  // No colon yet → suggest fields
  if (!tokenWithoutNot.includes(':') && !tokenWithoutNot.includes('!=') && !/\bIS\b/i.test(tokenWithoutNot)) {
    const partial = currentToken.toLowerCase()
    if (isAfterOR || partial.length > 0) {
      const matching = FILTERABLE_FIELDS.filter(f =>
        f.key.startsWith(partial) || f.label.toLowerCase().startsWith(partial)
      )
      if (matching.length > 0) {
        return {
          field: 'field',
          options: matching.map(f => ({ value: f.key, label: f.label, insert: f.key + ':' })),
        }
      }
    }
    return null
  }

  // Parse field name from the token (handling NOT prefix)
  const tokenBody = tokenWithoutNot
  const fieldMatch = tokenBody.match(/^(\w+)\s*(?::(=?>|=|<|!=)?|!=|\s+IS\s+(NOT\s+)?EMPTY)?/i)
  if (!fieldMatch) return null

  const fieldName = fieldMatch[1].toLowerCase()
  const opPart = fieldMatch[2] ?? ''
  const rest = tokenBody.slice(fieldMatch[0].length).trimStart()

  const fieldDef = FIELD_MAP[fieldName]
  if (!fieldDef) return null

  // IS EMPTY / IS NOT EMPTY suggestions
  if (fieldDef.nullable && !opPart && !rest) {
    const baseInsert = isNotPrefix ? `NOT ${fieldName}` : fieldName
    return {
      field: fieldName,
      options: [
        { value: 'is-empty',     label: 'Is empty',     insert: `${baseInsert} IS EMPTY` },
        { value: 'is-not-empty', label: 'Is not empty', insert: `${baseInsert} IS NOT EMPTY` },
      ],
    }
  }

  // Operator suggestions for number fields (when no op typed yet)
  if (fieldDef.type === 'number' && !opPart) {
    const baseInsert = isNotPrefix ? `NOT ${fieldName}` : fieldName
    const ops: Array<{ op: string; label: string }> = [
      { op: ':',  label: 'Equals' },
      { op: ':>', label: 'Greater than' },
      { op: ':<', label: 'Less than' },
      { op: '!=', label: 'Not equals' },
    ]
    if (fieldDef.nullable) {
      ops.push({ op: 'IS EMPTY', label: 'Is empty' })
      ops.push({ op: 'IS NOT EMPTY', label: 'Is not empty' })
    }
    return {
      field: fieldName,
      options: ops.map(o => ({
        value: o.op,
        label: o.label,
        insert: o.op.startsWith('IS') ? `${baseInsert} ${o.op}` : `${baseInsert}${o.op}`,
      })),
    }
  }

  // Value suggestions for select fields
  if (fieldDef.type === 'select') {
    let options: { value: string; label: string }[]
    if (fieldName === 'provider') {
      options = providerNames.map(p => ({ value: p, label: p }))
    } else if (fieldDef.options) {
      options = fieldDef.options
    } else {
      return null
    }
    const filtered: Array<{ value: string; label: string }> = rest
      ? options.filter(o =>
          o.label.toLowerCase().startsWith(rest.toLowerCase()) ||
          o.value.toLowerCase().startsWith(rest.toLowerCase()))
      : options.slice()

    const baseInsert = isNotPrefix ? `NOT ${fieldName}` : fieldName
    const out: SuggestionOption[] = filtered.slice(0, 12).flatMap(o => {
      const item: SuggestionOption[] = [{
        value: o.value,
        label: o.label,
        insert: `${baseInsert}:${o.value}`,
      }]
      if (!isNotPrefix && filtered.length <= 5) {
        item.push({ value: `!${o.value}`, label: `Not ${o.label}`, insert: `${baseInsert}:!=${o.value}` })
      }
      return item
    })
    // Also suggest IN variant
    if (!isNotPrefix && filtered.length >= 2) {
      out.push({ value: 'in', label: 'In list …', insert: `${baseInsert} IN (` })
    }
    return { field: fieldName, options: out }
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

  const sortSpec = computed<SortSpec | null>(() => {
    if (!parsed.value.orderBy) return null
    return { field: parsed.value.orderBy, desc: parsed.value.orderDir === 'DESC' }
  })

  const filteredModels = computed(() =>
    models.value.filter(m => modelMatches(m, parsed.value.expression, parsed.value.freeText)),
  )

  const suggestions = computed(() =>
    showSuggestions.value
      ? getSuggestions(rawQuery.value, cursorPos.value, providerNames.value)
      : null,
  )

  function applySuggestion(insert: string) {
    const raw = rawQuery.value
    const before = raw.slice(0, cursorPos.value)
    const after = raw.slice(cursorPos.value)

    const spaceIdx = before.lastIndexOf(' ')
    const tokenStart = spaceIdx + 1
    const beforeToken = before.slice(0, tokenStart).trimEnd()
    const needsOR = beforeToken.length > 0 && !beforeToken.endsWith('OR') && !beforeToken.endsWith('or')
    const needsSpace = beforeToken.length > 0
    const prefix = needsOR ? 'OR ' : needsSpace ? ' ' : ''

    // If insert ends with '(' (IN list), don't add a space; otherwise add trailing space
    const trailing = insert.endsWith('(') ? '' : ' '
    rawQuery.value = before.slice(0, tokenStart) + prefix + insert + trailing + after.trimStart()

    showSuggestions.value = false
    activeSuggestion.value = -1

    setTimeout(() => {
      const el = inputRef.value
      if (!el) return
      el.focus()
      const newPos = tokenStart + prefix.length + insert.length + trailing.length
      el.setSelectionRange(newPos, newPos)
      cursorPos.value = newPos
    }, 0)
  }

  function removeToken(index: number) {
    const all = parsed.value.expression.flat().filter(t => t.field !== '_text')
    if (index < 0 || index >= all.length) return

    // Rebuild query by stringifying all non-removed tokens
    let ti = 0
    const parts: string[] = []
    for (const clause of parsed.value.expression) {
      const clauseParts: string[] = []
      for (const t of clause) {
        if (t.field === '_text') continue
        if (ti !== index) clauseParts.push(stringifyToken(t))
        ti++
      }
      if (clauseParts.length > 0) parts.push(clauseParts.join(' '))
    }

    // Preserve ORDER BY
    let result = parts.join(' OR ')
    if (parsed.value.orderBy) {
      result += ` ORDER BY ${parsed.value.orderBy} ${parsed.value.orderDir}`
    }
    rawQuery.value = result
  }

  function onInput(e: Event) {
    const el = e.target as HTMLInputElement
    cursorPos.value = el.selectionStart ?? el.value.length
    showSuggestions.value = true
    activeSuggestion.value = -1
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      showSuggestions.value = false
      activeSuggestion.value = -1
      return
    }
    if (!showSuggestions.value || !suggestions.value) return
    const opts = suggestions.value.options
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      activeSuggestion.value = Math.min(activeSuggestion.value + 1, opts.length - 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      activeSuggestion.value = Math.max(activeSuggestion.value - 1, 0)
    } else if (e.key === 'Enter' && activeSuggestion.value >= 0) {
      e.preventDefault()
      applySuggestion(opts[activeSuggestion.value].insert)
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (activeSuggestion.value < 0) showSuggestions.value = false
    }
  }

  function onFocus() { showSuggestions.value = true }
  function onBlur() { setTimeout(() => { showSuggestions.value = false; activeSuggestion.value = -1 }, 150) }

  return {
    rawQuery, cursorPos, inputRef, showSuggestions, activeSuggestion,
    parsed, sortSpec, filteredModels, suggestions,
    applySuggestion, removeToken, onInput, onKeydown, onFocus, onBlur,
  }
}

export function stringifyToken(token: FilterToken): string {
  if (token.field === '_text') return token.label
  const op = token.op
  const vals = token.values.join(',')
  if (op === 'IS EMPTY') return `${token.field} IS EMPTY`
  if (op === 'IS NOT EMPTY') return `${token.field} IS NOT EMPTY`
  if (op === 'NOT IN') return `${token.field} NOT IN (${vals})`
  if (op === 'IN') return `${token.field} IN (${vals})`
  if (op === '!=') return `${token.field}!=${vals}`
  return `${token.field}${op}${vals}`
}
