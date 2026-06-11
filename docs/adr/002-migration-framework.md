# ADR 002: Custom Migration Framework

**Status:** Accepted  
**Date:** 2026-06-12

## Context

The project had 27 raw SQL migration files in `db/migrations/` with no tracking mechanism. Migrations used `IF NOT EXISTS`/`IF EXISTS` defensively, but merge migrations (014, 019, 026) were destructive (`DELETE`/`UPDATE`) and would corrupt data if re-run. There was no way to know which migrations had been applied.

## Decision

Build a lightweight custom migration runner (`scripts/utils/migrate.js`) with a `_migrations` tracking table, rather than adopting a heavier framework like Knex or Umzug.

## Rationale

- The project already has 27+ SQL files — migrating to a framework would require renaming/reformatting all of them
- A custom runner adds only ~150 lines of code (less than the migration framework itself would add)
- Supports `--dry-run`, `--status`, `--redo`, and SHA-256 checksum verification
- Zero new dependencies
- Fits the project's existing CommonJS pattern

## Alternatives considered

1. **node-pg-migrate.** Well-established but requires renaming all migration files to timestamp-based naming and changing the SQL syntax to use its helper functions.
2. **Knex.** Overkill — the project doesn't use a query builder and Knex migrations require a different file format.
3. **Manual tracking.** The previous approach — just hope migrations aren't re-run. Insufficient protection.
