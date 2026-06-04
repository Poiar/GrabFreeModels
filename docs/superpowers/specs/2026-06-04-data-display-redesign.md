# GrabFreeModels Data Display Redesign

**Date:** 2026-06-04  
**Status:** Approved  
**Inspiration:** Mastra.ai/models/providers layout

## Problem

The current GrabFreeModels UI treats providers as second-class citizens (badges on model rows), has no creator-level navigation, and scatters the data across 9 overlapping views (Dashboard, Free, Paid, All, SuperModels, SuperModel detail, Family, Author, Issues). The data model is flat — a single `models[]` array where each entry is a per-provider datapoint — making it hard to see "who made this model" vs "who offers it."

## Goals

1. **Creator-first identity** — Model creators (Google, Meta, Anthropic) are the primary organizational unit
2. **Rich provider comparison** — Each model shows all providers as rows with pricing, context, tools, status (Mastra-style table)
3. **Model-centric main view** — Flat list of model cards with compact provider strips underneath
4. **Preserve functional data** — Keep all the ranking, validation, scoring, and health data, just present it better

---

## Design

### 1. New API Response Shape

`build-models-data.js` returns a hierarchical structure instead of a flat array:

```
{
  creators: [
    {
      id: "google",               // normalized slug from author field
      name: "Google",             // original author display name
      model_count: 12,
      provider_count: 8,
      models: [
        {
          super_id: 42,
          name: "Gemini 3 Flash",
          slug: "gemini-3-flash",
          family: "gemini",
          best_for: ["general", "multimodal"],
          best_context: 1048576,
          cheapest_input_price: 0,
          cheapest_output_price: 0,
          role_rankings: { model: 3, build: 7 },
          providers: [
            {
              full_id: "openrouter/google/gemini-3-flash",
              provider: "OpenRouter",
              provider_slug: "openrouter",
              context_length: 1048576,
              pricing: { input: 0, output: 0 },
              supports_tools: true,
              status: "working",
              last_success: "2026-06-04T01:23:00Z",
              // ... all existing datapoint fields
            }
          ]
        }
      ]
    }
  ],
  providers: [
    {
      id: "openrouter",
      slug: "openrouter",
      name: "OpenRouter",
      base_url: "https://openrouter.ai/api/v1",
      model_count: 450,
      working_count: 410,
      health_status: "healthy"
    }
  ],
  metadata: {
    _role_rankings,    // unchanged
    _test_summary,     // unchanged
    _model_scores,     // unchanged
    _known_issues,     // unchanged
    _validation_method,// unchanged
    _provider_usage    // unchanged
  }
}
```

**Key changes from current:**
- `creators[]` replaces flat `models[]` as the primary response body
- Each creator contains `models[]`, each model contains `providers[]`
- `providers[]` is a flat reference array at top level (for dashboard, filtering)
- `metadata` section is unchanged
- Each model gets pre-computed `best_context`, `cheapest_input_price`, etc. in the builder

### 2. Main View — Model List (`/`)

New landing page. Replaces the current Dashboard as the default route.

**Card layout (each virtual-scrolled item):**

```
┌──────────────────────────────────────────────────────┐
│ Gemini 3 Flash              [Google]  ⭐ #3 Model   │
│ Max: 1.0M context  |  Free: $0.00/$0.00  |  8 providers │
├──────────────────────────────────────────────────────┤
│ [OpenRouter]  1.0M  ✓  $0/$0   🟢  │ [Cerebras]  8K  ✓  $0/$0   🟢  │
│ [Google]  1.0M  ✓  Free  🟢  │ [Groq]  8K  ✓  Free  🟡  │
│ [Together]  32K  ✗  $0/$0   🔴  │ ... +3 more                             │
└──────────────────────────────────────────────────────┘
```

- Header: model name + creator badge (colored pill) + role ranking badges
- Best stats across all providers (max context, cheapest pricing, provider count)
- Provider strip: compact blocks showing provider name, context, tools, pricing, status
- Strip shows 4-6 providers inline, then "+N more" for overflow
- Click card → open detail panel. Click provider block → inline expand that provider

**Controls above the list:**

```
[Search models...]  [All Creators ▾]  [All ▾]  [Sort: Role Rank ▾ ▼]
```

- Search: filters by model name (debounced)
- Creator filter chips: dropdown with "All" + alphabetized creator names
- Status filter: All / Working / Untested / Mixed / Down (model-level, based on provider statuses)
- Sort: Name / Context / Price / Role Rank + direction toggle
- Free/Paid toggle: replaces the old Free and Paid views

### 3. Model Detail Panel (Slide-Out)

Opens when clicking a model card. Slides in from the right (like current `ModelDetail.vue`).

**Top section:**
```
[←] Gemini 3 Flash  [Google]  [close]

Role Rankings: #3 Model, #7 Build, General
Family: gemini
Best For: general, multimodal
```

**Provider comparison table (Mastra-style):**

| Provider | Context | Tools | Reasoning | Image | Audio | Input $/1M | Output $/1M | Status | Last Success |
|---|---|---|---|---|---|---|---|---|---|
| OpenRouter | 1.0M | ✓ | ✓ | ✓ | — | $0 | $0 | 🟢 working | 2h ago |
| Google | 1.0M | ✓ | ✓ | ✓ | — | Free | Free | 🟢 working | 1h ago |
| Groq | 8K | ✓ | — | — | — | Free | Free | 🟡 rate-limited | 3d ago |

- All existing capability columns (input_types, output_types, features) rendered as ✓/— icons
- Pricing formatted to show "Free" when $0
- Status with color coding and relative timestamp
- Sortable by any column

**Bottom sections:**
- Known issues (if any for this model or providers)
- Raw metadata (collapsible)
- Previous/Next navigation between models

### 4. Dashboard (`/dashboard`)

Secondary route. Ecosystem-level overview:

- **Stats bar:** Total creators, total models, total providers, free count, broken count
- **Creator distribution:** Bar chart of models per creator
- **Provider health grid:** Compact cards showing each provider's working/total count, health status, model count. Click to see all models from that provider
- **Recent activity:** Last validation time, models added/removed, ranking changes since last cycle
- **Usage tracking:** Token usage by provider (from `_provider_usage`)

### 5. Creator Pages (`/creators` → `/creator/:id`)

**Creator list (`/creators`):**
- Grid of creator cards: name, model count, provider count, top model
- Click to drill into creator detail

**Creator detail (`/creator/:id`):**
- Header: creator name, total models, total providers
- Model table: all models from this creator, each with a provider strip (same format as main view)
- Cross-model provider analysis: which providers carry the most models? which is cheapest overall?
- Aggregate stats: best context across all models, cheapest provider, most reliable

### 6. Navigation Structure

```
┌────────────────────────────────────────────┐
│ [Logo]  Models  Dashboard  Creators  Issues │
└────────────────────────────────────────────┘
```

| Route | Purpose | Notes |
|---|---|---|
| `/` | Main model list | New landing page |
| `/dashboard` | Ecosystem overview | Was `/`, now secondary |
| `/creators` | Creator list | New |
| `/creator/:id` | Creator detail | New |
| `/issues` | Known issues | Largely unchanged |

**Deprecated views (removed):**
- `/free`, `/paid` → replaced by Free/Paid toggle on main view
- `/all` → replaced by main view (which already shows all models)
- `/models` (SuperModels list) → replaced by main view
- `/super/:id` (SuperModel detail) → replaced by model detail panel
- `/family`, `/author` → replaced by creator pages

### 7. TypeScript Types

New types in `vue-model-manager/src/types.ts`:

```typescript
interface CreatorData {
  id: string;
  name: string;
  model_count: number;
  provider_count: number;
  models: ModelData[];
}

interface ModelData {
  super_id: number;
  name: string;
  slug: string;
  family: string | null;
  best_for: string[];
  best_context: number;
  cheapest_input_price: number;
  cheapest_output_price: number;
  role_rankings: Record<string, number>;
  providers: ProviderDatapoint[];
}

interface ProviderReference {
  id: string;
  slug: string;
  name: string;
  base_url: string;
  model_count: number;
  working_count: number;
  health_status: string;
}

interface ModelsData {
  creators: CreatorData[];
  providers: ProviderReference[];
  metadata: Record<string, any>; // unchanged from current
}
```

`ProviderDatapoint` extends the current `DatapointModel` fields but without the super-model denormalized fields (those live one level up in `ModelData`).

---

## Implementation Notes

### Data layer changes
- `scripts/build-models-data.js`: Restructure output from flat array to `creators[]` hierarchy. Compute `best_*` and `cheapest_*` fields per model. Build `providers[]` reference array with aggregated stats.
  - **Creator slug normalization:** `author` strings (e.g., "Google LLC", "Meta Platforms, Inc.") are normalized to slugs via a deterministic `slugify()` function: lowercase, strip common legal suffixes ("LLC", "Inc.", "Ltd.", "Corp.", "PBC", "Inc"), replace spaces/special chars with hyphens. The `name` field retains the original display name. A small override map handles known edge cases (e.g., "Google LLC" → `{ id: "google", name: "Google" }`).
- `server/routes/data.js`: No structural changes needed — just passes through the new shape from builder.
- API consumers: The fallback to `/available-models.json` needs the same shape.

### Frontend changes
- Pinia store: Rewrite to consume `creators[]` hierarchy. Computed properties now work at creator/model/provider levels.
- New components: `ModelCard.vue`, `ProviderStrip.vue`, `ProviderBlock.vue`, `ProviderTable.vue`, `CreatorGrid.vue`, `CreatorDetail.vue`
- Modified components: `ModelDetail.vue` (redesign), `Dashboard.vue` (redesign)
- New views: `ModelList.vue` (main, replaces Dashboard as `/`), `CreatorList.vue`, `CreatorDetail.vue`
- Removed views: `Free.vue`, `Paid.vue`, `All.vue`, `SuperModels.vue`, `SuperModel.vue`, `Family.vue`, `Author.vue`
- Keep `QueryBuilder.vue`, `FilterBar.vue` if JQL filtering is retained (likely not — replace with simple search + filter chips)

### Routing changes
- `vue-model-manager/src/router/index.ts`: New routes for `/`, `/dashboard`, `/creators`, `/creator/:id`, `/issues`

### Preserved functionality
- Role rankings (now shown per model in card header and detail panel)
- Validation status (shown as status dots and in provider table)
- JQL filtering → replaced with simpler search + filter chips
- Export CSV/JSON → still available on main view
- Known issues → still available on `/issues` and per-model in detail panel

---

## Trade-offs

**Why hierarchical API vs flat:**
- Hierarchical is the natural shape for the new UI. Computing hierarchy on the frontend would duplicate logic across views and make the store bloated.
- Downside: requires changes to `build-models-data.js` and the JSON fallback file.

**Why remove 7 views:**
- Free/Paid/All are just filter variants of the same list — a toggle on the main view handles this.
- SuperModels list and detail are replaced by the new model-centric view and slide-out panel.
- Family/Author were string-grouping hacks — creator pages do the same thing but with proper entity semantics.
- Downside: if users relied heavily on a specific deprecated view, they lose that workflow. But all functionality is preserved in filters/navigation.
