---
name: secret-scanning
description: Use for running secret scans with Gitleaks, updating the Gitleaks allowlist, validating the scan config, or responding to CI secret detection failures. Trigger when adding new files with key-like patterns, when CI fails on secrets-scan, or when auditing the repo for accidental secret commits.
---

# Secret Scanning

Gitleaks scans every push and PR via CI (`.github/workflows/ci.yml`). The `test` job won't run until `secrets-scan` passes.

## Config

- `.gitleaks.toml` — repo-level Gitleaks config (allowlists, rules)
- CI uses `gitleaks/gitleaks-action` with `fetch-depth:0` (full history scan)

## Run Locally

```bash
gitleaks detect --source . --config .gitleaks.toml --no-git --verbose
# or with git history: --verbose
```

## Install Gitleaks

Windows (winget):

```bash
winget install gitleaks.gitleaks
```

Or grab the latest binary from https://github.com/gitleaks/gitleaks/releases and add to PATH.

## Allowlisting False Positives

If Gitleaks flags a file that contains only placeholder/documentation patterns:

1. Add the file path to `.gitleaks.toml` → `[allowlist] → paths`
2. Or add a regex pattern to `[allowlist] → regexes` that matches the placeholder format
3. Re-run the scan to confirm the false positive is gone
4. **Never allowlist a file that contains real secrets** — fix the leak instead

## CI Failure

If the `secrets-scan` job fails on a PR/push:

1. Check the job log or PR comment for the `RuleID`, `Secret`, and `File`
2. If it's a real secret — remove it from the file, rotate the key, and check if it exists in git history (`git log --all -p -- <file>`)
3. If it's a false positive — add an allowlist entry in `.gitleaks.toml` and re-run locally to confirm
