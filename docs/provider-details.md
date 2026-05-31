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
- Deprecated — models still functional but may be removed

## NVIDIA
- Free tier is huge (~117 models) but very noisy — most are embed, safety, reward, or VLMs
- Auth: `Authorization: Bearer <key>`
- Filter to chat/LLM only: exclude models matching `embed|reward|detector|translate|clip|neva|vila|kosmos|riva|gliner|ising|calibration|nemoguard|nemoretriever|content-safety|parse`
- Use `https://integrate.api.nvidia.com/v1/models`

## HuggingFace Router
- No zero-cost pricing flag in API — free models must be tested manually
- Auth: `Authorization: Bearer <key>`
- Base URL: `https://router.huggingface.co/v1/models`
- Manual testing required

## LLM Gateway
- No public model listing API — add manually
- Auth: `Authorization: Bearer <key>`
- Base URL: `https://api.llmgateway.io/v1`