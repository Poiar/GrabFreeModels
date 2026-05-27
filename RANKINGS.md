# Model Ranking Criteria

The repository maintains several role‑specific ranking lists in **available-models.json** under the `_role_rankings` key.  These lists are curated automatically based on model capabilities and test results.

## General Rules
- **Only free models** (`is_free: true`) are considered for any ranking.
- A model must have a **working** status (`status.result === "working"`) to appear in a ranking.
- **Rate‑limited** or **broken** models are excluded from all rankings.

## Role Definitions
| Role | Intended Use | Selection Heuristics |
|------|--------------|----------------------|
| `model` | Primary general‑purpose model for production workloads | Highest‑capacity, widely‑available models with strong performance. Preference for models with the largest context windows and no API‑key restrictions. |
| `build` | Coding‑assistant / code‑generation tasks | Models specifically trained for instruction or coding (e.g., Qwen‑3‑Coder). Also includes the universal default (`owl‑alpha`) for fallback. |
| `general` | Broad chat / reasoning tasks | Balanced models with good language understanding and generation quality. |
| `small_model` | Low‑latency or resource‑constrained scenarios | Models ≤ 12 B parameters, fast inference, typically flash‑optimized. |
| `explore` | Experimental / rapid prototyping | Same as `small_model` but focused on models that are cheap to call and easy to iterate on. |
| `stable` | Long‑term reliable models | Subset of free models that have been **working** for at least 30 days (tested date older than 30 days). Used for services requiring guaranteed uptime. |

## Stability Threshold
- The `stable` list is generated automatically:
  ```powershell
  $stable = $json.models |
      Where-Object { $_.is_free -and $_.status.result -eq 'working' -and (Get-Date $_.status.tested) -le (Get-Date).AddDays(-30) } |
      ForEach-Object { $_.id }
  ```
- When the stable list changes, the nightly maintenance script creates a Git tag (`stable-YYYYMMDD`).

## Updating Rankings
- Adding a new model: ensure it is marked `is_free: true` and passes validation (`validate‑free‑models.ps1`). If it is `working`, it will be added to the appropriate role lists automatically.
- Removing a model: set `status.result` to `rate_limited` or `broken`; the script will prune it from all rankings.
- Manual adjustments: edit `_role_rankings` directly, then run `check‑rankings.ps1` to verify integrity.

These guidelines keep the ranking lists focused, reliable, and easy to understand for downstream consumers.
