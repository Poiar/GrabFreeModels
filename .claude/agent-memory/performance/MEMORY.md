# Agent Memory Index — Performance

- [Performance Audit - June 4, 2026](performance-audit-2026-06-04.md) — Comprehensive performance audit identifying critical bottlenecks
- [API Compression Missing](api-compression-missing.md) — Express server missing compression middleware leading to large 1.1MB payloads
- [Database Query Optimization](database-query-optimization.md) — N+1 query pattern in build-models-data.js needs optimization
- [HTTP Caching Headers](http-caching-headers.md) — API missing HTTP caching headers causing unnecessary re-downloads
- [Virtual Scroller Optimization](virtual-scroller-optimization.md) — Virtual scroller using DynamicScroller with variable item heights may cause scroll jank
- [Bundle Size Optimization](bundle-size-optimization.md) — Large JavaScript main bundle (136KB) could impact initial page load
- [Performance Metrics](performance-metrics.md) — Baseline performance metrics for GrabFreeModels
