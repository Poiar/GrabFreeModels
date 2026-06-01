# Provider Details

## OpenRouter
- API endpoint: `https://openrouter.ai/api/v1/chat/completions`
- Auth: `Authorization: Bearer <key>` (also set `HTTP-Referer` and `X-Title` headers)
- Returns `:free` tagged models — filter by `$_.id -like "*:free"` or `$_.pricing -eq "0"`
- Do NOT use `openrouter/` prefix in API IDs — returned IDs already include provider prefix (e.g., `qwen/qwen3-coder:free`)
- Store in JSON as `openrouter/<id>`

## Cerebras
- Uses authenticated endpoint: `https://api.cerebras.ai/v1/models`
- Auth: `Authorization: Bearer <key>` (uses `@ai-sdk/cerebras` provider)
- Small free tier
- Synced automatically via `sync-models.js` (authenticated `/v1/models` endpoint)

## NVIDIA
- Free tier is huge (~117 models) but very noisy — most are embed, safety, reward, or VLMs
- Auth: `Authorization: Bearer <key>`
- Filter to chat/LLM only: exclude models matching `embed|reward|detector|translate|clip|neva|vila|kosmos|riva|gliner|ising|calibration|nemoguard|nemoretriever|content-safety|parse`
- Use `https://integrate.api.nvidia.com/v1/models`

## HuggingFace Router
- Auth: `Authorization: Bearer <key>`
- Free model listing API: `https://huggingface.co/api/models?inference_provider=huggingface&tags=text-generation&limit=200`
  - Filter by `inference === 'free'` or `inference === 'feather'` or `tags.includes('free')`
- Chat completions: `https://router.huggingface.co/v1/chat/completions`
- Stored in JSON as `huggingface/<modelId>`
- Auto-discovered by `sync-models.js`

## LLM Gateway
- No public model listing API — add manually
- Auth: `Authorization: Bearer <key>`
- Base URL: `https://api.llmgateway.io/v1`