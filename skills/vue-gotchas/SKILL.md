---
name: vue-gotchas
description: Use when building or reviewing Vue 3 + Pinia projects. Covers framework-specific gotchas: lifecycle hooks in stores, router history modes, deriving computed data.
---

# Vue 3 + Pinia Gotchas

## Pinia Stores Are Not Components

`onMounted`, `onUnmounted`, `onBeforeMount`, `onBeforeUnmount`, `onActivated`, `onDeactivated` — none work inside `defineStore()`. Use them only in `<script setup>`.

## Router History Mode

`createWebHistory()` requires server-side fallback to `index.html`. Static hosts (GitHub Pages, Netlify) use `createWebHashHistory()`.

## Derive Computed Data

Never read pre-computed snapshot fields from JSON. Compute from source arrays via `computed()` for consistency.

## Notes

Code examples in `docs/vue-examples.md`.