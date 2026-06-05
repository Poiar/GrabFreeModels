#!/usr/bin/env node
/**
 * recommend-models.js
 * Recommends top 3 free working models for a given role.
 *
 * Usage:
 *   node scripts/recommend-models.js --role coding
 *   node scripts/recommend-models.js --role writing --json
 *
 * Roles: coding, writing, analysis, creative, summarization, research, chat, function-calling
 */

require('dotenv').config();
const loadModels = require('./load-models');

const args = process.argv.slice(2);
let role = null;
let jsonOutput = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--role' && args[i + 1]) role = args[++i].toLowerCase();
  if (args[i] === '--json') jsonOutput = true;
}

const VALID_ROLES = ['coding', 'writing', 'analysis', 'creative', 'summarization', 'research', 'chat', 'function-calling'];

if (!role || !VALID_ROLES.includes(role)) {
  if (!jsonOutput) console.error(`Role required. Valid roles: ${VALID_ROLES.join(', ')}`);
  else console.error(JSON.stringify({ error: `Role required. Valid roles: ${VALID_ROLES.join(', ')}` }));
  process.exit(1);
}

// Role → best_for keyword mapping
const ROLE_KEYWORDS = {
  coding: ['coding', 'code', 'programming', 'software', 'developer', 'agentic', 'refactor'],
  writing: ['writing', 'creative writing', 'content', 'blog', 'story', 'copywriting', 'poetry'],
  analysis: ['analysis', 'analytical', 'data', 'research', 'reasoning', 'math', 'science'],
  creative: ['creative', 'creative writing', 'story', 'poetry', 'art', 'design', 'brainstorm'],
  summarization: ['summarization', 'summary', 'concise', 'short', 'lightweight', 'fast'],
  research: ['research', 'analysis', 'reasoning', 'science', 'academic', 'knowledge'],
  chat: ['chat', 'conversational', 'general', 'general purpose', 'everyday', 'assistant'],
  'function-calling': ['tool', 'function calling', 'tool use', 'agentic', 'api', 'structured'],
};

/**
 * Recommend models for a role.
 * @param {string} role - One of VALID_ROLES
 * @param {number} limit - Number of recommendations (default 3)
 * @returns {{ role: string, recommendations: Array<{full_id: string, name: string, provider: string, context_length: number|null, best_for: string[], score: number}> }}
 */
async function recommendModels(role, limit = 3) {
  const json = await loadModels();
  const keywords = ROLE_KEYWORDS[role] || [];

  // Filter: free, working, not removed, supports tools
  const eligible = json.creators
    .flatMap(creator => creator.models)
    .flatMap(model => model.providers
      .filter(dp =>
        dp.is_free &&
        dp.status.result === 'working' &&
        !dp._removed &&
        dp.supports_tools !== false
      )
      .map(dp => ({
        full_id: dp.full_id,
        name: model.name,
        provider: dp.provider,
        provider_slug: dp.provider_slug,
        context_length: dp.context_length,
        best_for: dp.best_for || [],
      }))
    );

  // Score each model
  const scored = eligible.map(m => {
    const tags = m.best_for.map(t => t.toLowerCase());
    let tagScore = 0;
    for (const kw of keywords) {
      for (const tag of tags) {
        if (tag.includes(kw)) {
          tagScore += 1;
          break;
        }
      }
    }

    const CTX_NORM = 1048756;
    const ctxScore = m.context_length ? m.context_length / CTX_NORM : -0.5;
    const score = Math.round((ctxScore * 0.8 + tagScore) * 100) / 100;

    return { ...m, score };
  });

  // Sort by score desc, then context_length desc
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.context_length || 0) - (a.context_length || 0);
  });

  const top = scored.slice(0, limit);

  return {
    role,
    total_eligible: eligible.length,
    recommendations: top.map((m, i) => ({
      rank: i + 1,
      full_id: m.full_id,
      name: m.name,
      provider: m.provider,
      context_length: m.context_length,
      best_for: m.best_for,
      score: m.score,
    })),
  };
}

// CLI mode
if (require.main === module) {
  recommendModels(role)
    .then(result => {
      if (jsonOutput) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`\nTop 3 free models for "${role}":\n`);
        for (const r of result.recommendations) {
          const ctx = r.context_length
            ? r.context_length >= 1048756
              ? (r.context_length / 1048756).toFixed(1) + 'M'
              : Math.round(r.context_length / 1000) + 'K'
            : '?';
          const tags = r.best_for.length > 0 ? ` [${r.best_for.join(', ')}]` : '';
          console.log(`  #${r.rank} ${r.full_id} (score=${r.score.toFixed(2)}, context=${ctx})${tags}`);
        }
        console.log(`\n  ${result.total_eligible} eligible models considered.`);
      }
    })
    .catch(err => {
      console.error(err.message);
      process.exit(1);
    });
}

module.exports = { recommendModels, VALID_ROLES, ROLE_KEYWORDS };
