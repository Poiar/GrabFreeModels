---
name: vue-gotchas
description: Use when building or reviewing Vue 3 + Pinia projects. Covers framework-specific gotchas discovered through real debugging: lifecycle hooks in stores, router history modes, deriving computed data from source arrays vs static snapshots, and common TypeScript/Vite pitfalls. Trigger when writing new Vue components, stores, or routing config.
---

# Vue 3 + Pinia Gotchas

## Pinia Stores Are Not Components

`onMounted`, `onUnmounted`, `onBeforeMount`, `onBeforeUnmount`, `onActivated`, `onDeactivated` — **none of these work inside `defineStore()`**. They silently do nothing.

- **Timers/intervals in stores**: Use plain `let timer = setInterval(...)`. No cleanup needed — the store lives for the app's entire lifecycle. If you must clean up, expose a manual `dispose()` action.
- **Component lifecycle**: Use these hooks only inside `<script setup>` or `setup()` functions, not in stores.

## Router History Mode

`createWebHistory()` requires server-side fallback to `index.html` for all routes. Without it, direct URL access or refresh on `/models` returns 404.

- **Static hosts** (GitHub Pages, nginx, Netlify without `_redirects`): Use `createWebHashHistory()` — zero config, works everywhere.
- **When to use WebHistory**: Only if you control the server and can configure SPA fallback.

## Derive Computed Data from Source Arrays

Never read pre-computed snapshot fields from JSON when you can derive the same data from the source array. Snapshots go stale the moment the source changes.

- **Bad**: Reading `data.provider_health` from JSON (static snapshot)
- **Good**: Computing `providerHealth` from `freeModels` array via `computed()` — always consistent

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

Already handled in this project (`src/vite-env.d.ts` + `skipLibCheck: true` in tsconfig). If you create a new project, add `declare module '*.css'` to a `.d.ts` file and set `"skipLibCheck": true`.
