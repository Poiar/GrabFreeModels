# Contributing to GrabFreeModels

## Quick start

```bash
git clone <repo-url>
cd GrabFreeModels
npm ci
cd vue-model-manager && npm ci && cd ..
```

### Environment

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

Required:

- `DATABASE_URL` — Neon Postgres connection string (pooler endpoint)
- `ADMIN_TOKEN` — random 64-char hex for the admin API (generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- `GFM_AUTH_FILE` — path to your opencode `auth.json` (falls back to XDG `~/.local/share/opencode/auth.json`)

### Enable git hooks

```bash
npx gitleaks detect --no-git  # install gitleaks first
git config core.hooksPath .githooks
```

## Project structure

```
├── db/                  # Schema + migrations
│   ├── schema.sql       # Canonical schema (source of truth)
│   └── migrations/      # Ordered .sql migration files
├── server/              # Express API (port 3001)
│   ├── db.js            # Postgres pool (Neon-aware)
│   └── routes/
├── scripts/             # Node.js pipeline scripts (CommonJS)
│   └── utils/           # Shared utility modules
├── vue-model-manager/   # Vue 3 + Pinia SPA (port 5173)
│   └── src/
│       ├── composables/ # Shared composables
│       ├── components/  # Reusable Vue components
│       ├── store/       # Pinia store
│       ├── views/       # Route-level views
│       └── types.ts     # TypeScript interfaces
├── tests/               # Test suite
│   ├── helpers/         # Test utilities (mock pool, etc.)
│   ├── unit/            # Unit tests (import + execute modules)
│   └── integration/     # DB integration tests
└── data/                # Static configuration
```

## Development workflow

```bash
# Start full dev environment (API + Vite)
npm run dev:all

# Or start individually
npm run api    # Express API with --watch
npm run dev    # Vue dev server

# Run the pipeline
npm run sync            # Dry-run model sync
npm run sync:apply      # Apply sync changes
npm run validate        # Dry-run model validation
npm run validate:apply  # Apply validation results
npm run rank             # Report mode rankings
npm run rank:apply       # Write rankings to DB
npm run rank:paid -- --apply  # Write paid rankings
```

## Database migrations

Migrations are plain `.sql` files in `db/migrations/`, numbered sequentially.

```bash
npm run migrate:status  # See what's applied vs pending
npm run migrate:dry     # Preview what would run
npm run migrate         # Apply all pending migrations
```

### Creating a migration

1. Find the highest migration number in `db/migrations/`
2. Create a new file with the next number: `036-your-change.sql`
3. Use `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, etc.
4. Run `npm run migrate:dry` to preview
5. Run `npm run migrate` to apply

## Code conventions

### Root (CommonJS)

- All `scripts/` and `server/` files use `require`/`module.exports`
- Use the shared utilities in `scripts/utils/` — don't copy-paste functions
- Import `http-client.js` instead of writing inline httpGet
- Use `config.js` for constants instead of hardcoding

### Vue frontend (ESM/TypeScript)

- Use composables (`useFormatters`, `useDerivationChips`) for shared logic
- Don't copy-paste `formatFamily`/`formatContext` into new components
- Add loading, error, and empty states to every view

### Script conventions

- Default mode is dry-run / report — use `--apply` to write changes
- Read from `scripts/utils/config.js` for configurable values
- Use `process.on('exit', () => pool.end())` if your script connects to DB
- Import from `scripts/utils/` for shared functions

## Testing

```bash
npm test           # Full suite
npm run test:unit  # Unit tests only (no DB required)
```

Unit tests import and execute actual modules — no regex-grep on source files.

## Commit messages

Follow conventional commits:

- `feat:` — new feature
- `fix:` — bug fix
- `chore:` — maintenance, deps
- `docs:` — documentation

End each commit with:

```
Co-Authored-By: Claude <noreply@anthropic.com>
```
