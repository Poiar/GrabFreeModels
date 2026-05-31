# Vue 3 + Pinia Code Examples

## Structured String Parsing

When parsing `"key — value"` formatted strings, avoid `split(' — ')` — if the value contains the same delimiter, it splits incorrectly.

```ts
// Bad: breaks if detail contains ' — '
const [key, ...rest] = entry.split(' — ')

// Good: only splits on first occurrence
const sep = entry.indexOf(' — ')
if (sep === -1) return { key: entry.trim(), value: '' }
return { key: entry.substring(0, sep).trim(), value: entry.substring(sep + 3).trim() }
```

## O(1) Model Lookup

For frequent ID-based lookups, build a `Map` computed instead of using `Array.find()`:

```ts
const modelById = computed(() => {
  const map = new Map<string, Model>()
  for (const m of allModels.value) map.set(m.id, m)
  return map
})
```

## Dynamic Page Titles

Add `meta: { title }` to routes and update `document.title` in `router.afterEach`:

```ts
router.afterEach((to) => {
  const page = to.meta?.title as string | undefined
  document.title = page ? `${page} — AppName` : 'AppName'
})
```

## CSS Imports in TypeScript

If creating a new project, add `declare module '*.css'` to a `.d.ts` file and set `"skipLibCheck": true`.