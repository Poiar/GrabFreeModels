# TEAM.md — GrabFreeModels

## Team Roster

### 1. UI/UX Lead
- **Owns:** Vue 3 SPA (`vue-model-manager/`), user flows, accessibility, visual design
- **Key files:** `vue-model-manager/src/`, `vue-gotchas` skill
- **Responsibilities:**
  - Component design and Pinia store architecture
  - HMR/dev server issues (known: RecycleScroller/DynamicScroller swaps need restart)
  - Responsive layout, dark/light themes, keyboard nav
  - Dashboard generation (`generate-dashboard.js`)
- **Escalation:** Performance Lead (render bottlenecks), Code Quality Lead (anti-patterns)

### 2. Performance Lead
- **Owns:** API response times, DB query optimization, bundle size, caching
- **Key files:** `server/index.js`, `load-models.js`, `rank-models.js`
- **Responsibilities:**
  - Neon Postgres query profiling and index tuning
  - Vite bundle analysis, lazy loading, code splitting
  - Prometheus metrics (`metrics-exporter.js`) and alerting thresholds
  - Context backfill efficiency (`backfill-context.js`)
- **Escalation:** Scraping Lead (slow external fetches), Security Lead (rate limiting)

### 3. Scraping Lead
- **Owns:** External data ingestion from model providers
- **Key files:** `sync-models.js`, `extract-modelsdev.js`, `extract-groq.js`, `extract-openrouter-categories.js`, `snapshot-openrouter-catalog.js`
- **Responsibilities:**
  - Playwright-based scraping (models.dev, Groq docs, OpenRouter categories)
  - Provider API polling (OpenRouter, Cerebras, NVIDIA, HuggingFace, Google, DeepSeek, Groq)
  - Data normalization and diff logic (`--apply` inserts/removals)
  - Snapshot rotation (`cleanup-snapshots.js`)
- **Escalation:** Security Lead (API key rotation, bot detection), Performance Lead (timeouts)

### 4. Security Lead
- **Owns:** Secret management, auth, CI security, dependency audits
- **Key files:** `secret-scanning` skill, `get-auth-key.js`, `sync-auth-keys.js`, `auth.json`
- **Responsibilities:**
  - Gitleaks local scanning and allowlist maintenance
  - API key lifecycle: auth.json (source of truth) → opencode.jsonc sync
  - `.env` protection — never commit `DATABASE_URL` or keys
  - CI pipeline security gates
  - Rate limit compliance across provider APIs
- **Escalation:** Scraping Lead (credential issues), Code Quality Lead (vulnerable deps)

### 5. QA Lead
- **Owns:** Test coverage, validation pipelines, bug triage
- **Key files:** `validate-free-models.js`, `health-check.js`, `nightly-maintenance.js`, `playwright-test` skill
- **Responsibilities:**
  - Model validation against live APIs (free tier detection)
  - DB integrity checks: slug uniqueness, author coverage, orphan detection
  - Nightly pipeline orchestration (validate → rank → commit)
  - Playwright frontend tests at `localhost:5173`
  - Exploratory QA of the web app (`dogfood` skill)
- **Escalation:** Code Quality Lead (test gaps), Performance Lead (flaky timeouts)

### 6. Code Quality Lead
- **Owns:** Linting, review standards, refactoring, architecture decisions
- **Key skills:** `requesting-code-review`, `systematic-debugging`, `test-driven-development`
- **Responsibilities:**
  - Pre-commit review: security scan, quality gates, auto-fix
  - Vue anti-pattern enforcement (see `vue-gotchas`)
  - JSONC validation (`validate-jsonc.js`) before session end
  - TDD enforcement for new features (RED-GREEN-REFACTOR)
  - Debugging protocol: 4-phase root cause before fixing
- **Escalation:** Security Lead (vulnerable patterns), UI/UX Lead (component architecture)

### 7. Memory Management Lead
- **Owns:** Persistent context, session memory, cross-session knowledge
- **Key tools:** `memory` tool, `session_search`, `AGENTS.md`
- **Responsibilities:**
  - Maintain `memory/user` (preferences, environment facts, tool quirks)
  - Maintain `memory/memory` (project conventions, API quirks, lessons learned)
  - No stale snapshots: never hardcode counts, dates, "currently" lists
  - No task progress in memory; use `session_search` for recall
  - Audit memory bloat — keep entries compact and declarative
  - Onboard new sessions: ensure AGENTS.md and skills are loaded
- **Escalation:** Skill Management Lead (outdated skills causing bad memory)

### 8. Skill Management Lead
- **Owns:** Skill lifecycle — create, patch, deprecate, consolidate
- **Key tools:** `skill_manage`, `skill_view`, `skills_list`
- **Responsibilities:**
  - All project skills live in `skills/`
  - Patch skills immediately when pitfalls are found (don't wait)
  - Delete stale skills with `absorbed_into` for proper consolidation tracking
  - Pin critical skills to prevent accidental deletion
  - After complex tasks (5+ tool calls), create new skills
  - Keep skill frontmatter concise — trigger conditions, not implementation
- **Escalation:** Code Quality Lead (skill content review), Memory Management Lead (skill references)

## Cross-Cutting Workflows

| Workflow                      | Leads Involved                                  |
|-------------------------------|------------------------------------------------|
| New model provider onboarding | Scraping → QA → Performance → Code Quality     |
| Security incident             | Security → Scraping → Code Quality → Memory    |
| Nightly pipeline failure      | QA → Performance → Scraping → Code Quality     |
| Vue feature development       | UI/UX → Code Quality → QA → Performance        |
| Skill deprecation             | Skill Mgmt → Memory → Code Quality             |
| Auth/key rotation             | Security → Scraping → QA                       |

## Escalation Order

1. Domain Lead owns it
2. Cross-cutting: involved leads collaborate (table above)
3. Architecture decision: Code Quality + Performance + Security triad
4. User decides on trade-offs
