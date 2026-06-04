---
name: performance-metrics
description: Baseline performance metrics for GrabFreeModels
metadata:
  type: reference
---

## Performance Metrics - Baseline 2026-06-04

### API Performance
- **Response Time**: ~0.5s (local development)
- **Payload Size**: 1.1MB (uncompressed)
- **Gzipped Size**: ~300KB (estimated)
- **Compression Ratio**: 70%+ (target)
- **Status**: No compression enabled

### Database Performance
- **Connection Pool**: Max 3 (Neon-appropriate)
- **Query Pattern**: N+1 identified in build-models-data.js
- **Index Usage**: Basic indexes present
- **Join Optimization**: Opportunity for materialized views

### Frontend Performance
- **Main Bundle**: 136.54kB (unzipped)
- **Main Bundle (gzipped)**: 50.74kB
- **Route Chunks**: 17-28kB each (gzipped)
- **Virtual Scroller**: DynamicScroller with variable heights
- **Framework**: Vue 3 + Vite (good tree shaking)

### Network Performance
- **HTTP Caching**: Not implemented
- **Compression**: Not enabled
- **CDN**: Not using (static files served locally)
- **Static Assets**: 4.76-45.01kB CSS (gzipped 1.16-8.47kB)

### Memory Usage
- **Nightly Pipeline**: Potential memory leaks during long runs
- **Virtual Scroller**: Efficient for large lists
- **Store Computed Properties**: Well memoized

### Target Metrics (After Optimization)
1. **API Payload**: <400KB (70% compression)
2. **Initial Load Time**: <2s (currently ~3s with 1.1MB)
3. **Time to Interactive**: <1.5s
4. **LCP**: <1.2s
5. **Database Query Time**: 50% reduction
6. **Bundle Size**: Main <100KB gzipped

### Monitoring Plan
1. **Lighthouse Audits**: Weekly
2. **Bundle Analyzer**: After each build
3. **Query Performance**: EXPLAIN ANALYZE on critical queries
4. **API Response Times**: Track with middleware
5. **Real User Monitoring**: Implement RUM

### Tools for Measurement
- WebPageTest.org
- Lighthouse CI
- Chrome DevTools
- Bundle Analyzer (webpack-bundle-analyzer)
- pg_stat_statements (Postgres)