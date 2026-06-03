# Handoff — Next Session

## Author coverage: 95% (600/630, up from 53%)

`scripts/fix-authors.js` expanded with 5 matching strategies + 40+ creator aliases + 60+ model name prefixes.

## No DB snapshot exported

Run `npm run db:export` to update `available-models.json` — the last one is stale.

## Frontend needs dev server restart

The Vue app won't reflect new author data or UI fixes until restarted.
Tell the user: `cd vue-model-manager && npm run dev`

## Remaining 30 models without authors

These are routing/aggregator models with no clear creator. Intentional gap.

## Low-hanging fruit

- `import-modelsdev-backfill.js --apply` (matches 7 more models)
- Validate rankings: `node scripts/check-rankings.js`
- Validate JSONC: `node scripts/validate-jsonc.js`

## Cleanup

- `scripts/_*.js` files can be removed (analysis temp scripts)
- `skills/neon-ops/` should be tracked or gitignored
