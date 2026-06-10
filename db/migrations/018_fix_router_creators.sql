-- Fix: map router/platform creators to 'unknown' on super_models
-- Routers and inference platforms are not model creators, and should not appear
-- as such. Models whose only known "creator" is a router are genuinely unknown.

UPDATE super_models
SET creator = 'unknown'
WHERE creator IN (
  'OpenRouter',
  'Novita AI',
  'LLMGateway',
  'opencode',
  'switchpoint'
);
