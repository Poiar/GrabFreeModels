# ADR 001: Script Architecture — Unified Rank Script

**Status:** Accepted  
**Date:** 2026-06-12

## Context

The project had two nearly identical ranking scripts:

- `rank-models.js` (529 lines) — ranked free models
- `rank-paid-models.js` (507 lines) — ranked paid models

~90% of code was duplicated: scoring functions, role definitions, variant builders, diff output. Only differences:

- Free models require `supports_tools=true AND status_result='working'`
- Paid models require `is_free=false AND is_removed=false`
- Different metadata keys (`_role_rankings` vs `_role_rankings_paid`)
- Paid models use name-based tag inference as fallback

## Decision

Merge into a single `rank.js` with a `--paid` flag. Shared scoring logic extracted to `scripts/utils/ranker-core.js`.

## Rationale

- Eliminates ~400 lines of duplicate code
- Single point of maintenance for scoring changes
- The `--paid` flag makes the behavioral difference explicit
- Shared unit tests cover both modes from one test file

## Alternatives considered

1. **Keep separate files, extract shared lib.** Would preserve behavioral isolation but still requires maintaining two entry points. Chose full merge because the query difference is small enough to parametrize.
2. **Separate `--free` and `--paid` flags.** `--free` would be the default so no flag needed — `--paid` alone suffices.
