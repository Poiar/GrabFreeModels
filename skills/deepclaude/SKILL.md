---
name: deepclaude
description: Use when adding, updating, or managing backends in deepclaude.ps1. Triggers: "add backend", "update deepclaude", "new or entry", "change opus model".
---

# Deepclaude Backend Manager

File: `C:\Users\pc\.local\bin\deepclaude.ps1` — routes Claude Code through cheap API backends.

## Registry

| Slug | Name | Key | Notes |
|------|------|-----|-------|
| `ds` | DeepSeek (direct) | `DEEPSEEK_API_KEY` | Default |
| `or` | OpenRouter (owl-alpha) | `OPENROUTER_API_KEY` | |
| `or2` | OpenRouter (deepseek) | `OPENROUTER_API_KEY` | Clone of `or` |
| `or3` | OpenRouter (best free) | `OPENROUTER_API_KEY` | Clone of `or`, no owl-alpha |
| `fw` | Fireworks AI | `FIREWORKS_API_KEY` | |
| `oc` | OpenCode Zen | `OPENCODEZEN_API_KEY` | |

## Adding a Backend

Update these 6 places:

1. `$Providers` — add entry (OpenRouter: `$Providers.new = $Providers.or.Clone()` then override slots). OpenRouter model IDs are relative (e.g. `openai/gpt-oss-120b:free`).
2. Status block — `Write-Host` under "Backends:"
3. Help block — `-b, --backend` usage
4. Error message — "Unknown backend" list
5. Benchmark loop — add slug to `@("ds","or",...)`
6. `.SYNOPSIS` comments — usage example

## Model Slots

`opus` → `ANTHROPIC_MODEL` + `ANTHROPIC_DEFAULT_OPUS_MODEL`
`sonnet` → `ANTHROPIC_DEFAULT_SONNET_MODEL`
`haiku` → `ANTHROPIC_DEFAULT_HAIKU_MODEL`
`subagent` → `CLAUDE_CODE_SUBAGENT_MODEL`

## Validating Models

Test via OpenRouter API: `POST https://openrouter.ai/api/v1/chat/completions` with `max_tokens: 16`, `messages: [{role:"user",content:"Reply: ok"}]`. Headers: `Authorization: Bearer $key`, `HTTP-Referer`, `X-Title`.
