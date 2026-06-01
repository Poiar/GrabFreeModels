import { parseQuery, modelMatches } from './src/composables/useJqlFilter.ts'
import { readFileSync } from 'fs'

const data = JSON.parse(readFileSync('../available-models.json', 'utf-8'))
const models = data.models

const tests = [
  'status:working',
  'status IN (working,broken)',
  'status NOT IN (working,broken)',
]

for (const q of tests) {
  const r = parseQuery(q)
  const tokens = r.expression.flat().map(t => `${t.field}:${t.op}=${t.rawValue}`)
  const m = models.filter(x => modelMatches(x, r.expression, r.freeText))
  console.log('\nQuery:', q)
  console.log('  Tokens:', tokens)
  console.log('  Matches:', m.length)
  if (m.length > 0 && m.length < 5) m.forEach(x => console.log('  ', x.id, x.status.result))
}
