---
name: bundle-size-optimization
description: Large JavaScript main bundle (136KB) could impact initial page load
metadata:
  type: issue
---

## Bundle Size Optimization

**Issue**: Large main JavaScript bundle (136.54kB unzipped)
**Impact**: Slower first paint, longer time to interactive
**Location**: `vue-model-manager/vite.config.ts`
**Severity**: 🟡 Warning

### Current Bundle Size
- Main chunk: 136.54kB (unzipped)
- Gzipped: 50.74kB
- Routes: 17-28kB each (gzipped)

### Analysis
- Vue 3 + Vite provides good tree shaking
- Bundle splitting already implemented per route
- Main bundle includes: core Vue, Pinia, router, utilities

### Optimization Options

#### Option 1: Lazy Load Non-Critical Routes
```typescript
// router/index.ts
const routes = [
  {
    path: '/free',
    name: 'Free',
    component: () => import('@/views/Free.vue') // Already lazy loaded
  },
  {
    path: '/dashboard',
    name: 'Dashboard', 
    component: () => import('@/views/Dashboard.vue')
  }
];
```

#### Option 2: Code Split Utilities
```typescript
// Split large utilities
const useJqlFilter = () => import('@/composables/useJqlFilter');
const useBreakpoint = () => import('@/composables/useBreakpoint');
```

#### Option 3: Optimize Vite Configuration
```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Split vendor chunks
          'vue-vendor': ['vue', 'pinia'],
          'router-vendor': ['vue-router'],
          'ui-vendor': ['@vueuse/core']
        }
      }
    },
    chunkSizeWarningLimit: 100
  }
});
```

#### Option 4: Preload Critical Resources
```html
<!-- index.html -->
<link rel="preload" href="/assets/index-Db4rwp7c.js" as="script">
<link rel="modulepreload" href="/assets/index-Db4rwp7c.js">
```

### Advanced: Preloading Strategy
```typescript
// App.vue
onMounted(() => {
  // Preload critical routes
  const criticalRoutes = ['/free', '/all'];
  criticalRoutes.forEach(route => {
    import(`@/views${route}.vue`).catch(() => {});
  });
});
```

### Expected Impact
- 20-30% reduction in initial bundle load time
- Better performance on slow networks
- Improved LCP (Largest Contentful Paint)

### Verification
1. Use WebPageTest or Lighthouse to measure performance
2. Check bundle analyzer output
3. Monitor real user monitoring (RUM) metrics