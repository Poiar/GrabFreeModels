# Webhook Setup

Two scripts send Slack/Discord webhook notifications: **check-degradation.js** (model health alerts) and **nightly-summary.js** (pipeline digest).

## Creating a webhook URL

### Slack

1. Go to https://api.slack.com/apps and create an app (or use an existing one).
2. Enable **Incoming Webhooks** and click **Add New Webhook to Workspace**.
3. Pick a channel and authorize. Copy the webhook URL.

### Discord

1. Open Server Settings > Integrations > Webhooks.
2. Click **Create Webhook**, name it, pick a channel, and copy the URL.

Both webhooks accept Slack-compatible JSON payloads, so the same payload format works for either platform.

## Environment variables

| Variable                  | Used by                | Required for                     |
| ------------------------- | ---------------------- | -------------------------------- |
| `DEGRADATION_WEBHOOK_URL` | `check-degradation.js` | Sending degradation alerts       |
| `NIGHTLY_WEBHOOK_URL`     | `nightly-summary.js`   | Sending nightly pipeline summary |

Add them to `.env` at the project root:

```
DEGRADATION_WEBHOOK_URL=https://hooks.slack.com/services/...
NIGHTLY_WEBHOOK_URL=https://hooks.slack.com/services/...
```

Or set them as system/user environment variables for the Windows Task Scheduler nightly run.

## Payload format

Both scripts send Slack Block Kit JSON. The payload contains a `text` fallback field and a `blocks` array for rich formatting.

**Degradation alert payload** (`check-degradation.js`):

```json
{
  "text": "Degradation Alert: 2 model(s) affected",
  "blocks": [
    { "type": "header", "text": { "type": "plain_text", "text": "Model Degradation Detected" } },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Run date:* 2026-06-09\n*Models checked:* 827\n*Alerts:* 2"
      }
    },
    { "type": "divider" },
    {
      "type": "section",
      "text": { "type": "mrkdwn", "text": "*openrouter/meta-llama/llama-4* (openrouter)" }
    },
    {
      "type": "section",
      "text": { "type": "mrkdwn", "text": "Latency increased 3.2 sigma above baseline" }
    }
  ]
}
```

**Nightly summary payload** (`nightly-summary.js`) -- Slack Block Kit with validation stats, new models, degradation alerts, and ranking changes in an attachment block.

## Testing webhooks

### Degradation alerts

Send a test alert using the `--alert` flag (skips baseline comparison, sends with sample data):

```bash
node scripts/check-degradation.js --alert
```

To use a specific webhook URL instead of the env var:

```bash
node scripts/check-degradation.js --alert --webhook-url https://hooks.slack.com/services/...
```

### Nightly summary

Print the summary to stdout without sending a webhook:

```bash
node scripts/nightly-summary.js --dry-run
```

To send to the configured webhook:

```bash
node scripts/nightly-summary.js
```

## Integration with nightly pipeline

Both scripts are called automatically by `nightly-maintenance.js`. The webhook URLs are read from environment variables at runtime. The pipeline runs daily at 2 AM via Windows Task Scheduler.
