-- Populate base_url for providers where it's currently missing.
-- URLs sourced from provider-config.json, ENDPOINT_CONFIG, and official docs.

UPDATE datapoint_providers SET base_url = 'https://openrouter.ai/api/v1' WHERE slug = 'openrouter';
UPDATE datapoint_providers SET base_url = 'https://api.cerebras.ai/v1' WHERE slug = 'cerebras';
UPDATE datapoint_providers SET base_url = 'https://integrate.api.nvidia.com/v1' WHERE slug = 'nvidia';
UPDATE datapoint_providers SET base_url = 'https://router.huggingface.co/v1' WHERE slug = 'huggingface';
UPDATE datapoint_providers SET base_url = 'https://api.deepseek.com/v1' WHERE slug = 'deepseek';
UPDATE datapoint_providers SET base_url = 'https://generativelanguage.googleapis.com/v1beta' WHERE slug = 'google';
UPDATE datapoint_providers SET base_url = 'https://api.groq.com/openai/v1' WHERE slug = 'groq';
UPDATE datapoint_providers SET base_url = 'https://api.deepinfra.com/v1/openai' WHERE slug = 'deepinfra';
UPDATE datapoint_providers SET base_url = 'https://api.novita.ai/v3/openai' WHERE slug = 'novitaai';
UPDATE datapoint_providers SET base_url = 'https://api.novita.ai/v3/openai' WHERE slug = 'novita-ai';
UPDATE datapoint_providers SET base_url = 'https://api.siliconflow.cn/v1' WHERE slug = 'siliconflow';
UPDATE datapoint_providers SET base_url = 'https://api.siliconflow.cn/v1' WHERE slug = 'siliconflow-cn';
UPDATE datapoint_providers SET base_url = 'https://api.x.ai/v1' WHERE slug = 'xai';
UPDATE datapoint_providers SET base_url = 'https://open.bigmodel.cn/api/paas/v4' WHERE slug = 'zhipuai';
UPDATE datapoint_providers SET base_url = 'https://open.bigmodel.cn/api/paas/v4' WHERE slug = 'zhipuai-coding-plan';
UPDATE datapoint_providers SET base_url = 'https://opencode.ai/zen/v1' WHERE slug = 'opencode';
UPDATE datapoint_providers SET base_url = 'https://api.cloudflare.com/client/v4' WHERE slug = 'cloudflare';
UPDATE datapoint_providers SET base_url = 'https://gateway.ai.cloudflare.com/v1' WHERE slug = 'cloudflare-ai-gateway';
UPDATE datapoint_providers SET base_url = 'https://api.llmgateway.io/v1' WHERE slug = 'llmgateway';
UPDATE datapoint_providers SET base_url = 'https://dashscope.aliyuncs.com/api/v1' WHERE slug = 'alibaba-cn';
UPDATE datapoint_providers SET base_url = 'https://dashscope.aliyuncs.com/api/v1' WHERE slug = 'alibaba-coding-plan';
UPDATE datapoint_providers SET base_url = 'https://dashscope.aliyuncs.com/api/v1' WHERE slug = 'alibaba-coding-plan-cn';
UPDATE datapoint_providers SET base_url = 'https://models.inference.ai.azure.com' WHERE slug = 'github-models';
UPDATE datapoint_providers SET base_url = 'https://api.cohere.ai/v1' WHERE slug = 'cohere';
UPDATE datapoint_providers SET base_url = 'https://api.mistral.ai/v1' WHERE slug = 'mistral';
UPDATE datapoint_providers SET base_url = 'https://api.fireworks.ai' WHERE slug = 'firepass';
UPDATE datapoint_providers SET base_url = 'http://localhost:1234/v1' WHERE slug = 'lmstudio';
UPDATE datapoint_providers SET base_url = 'https://api.z.ai/api/v1' WHERE slug = 'zai';
UPDATE datapoint_providers SET base_url = 'https://api.z.ai/api/v1' WHERE slug = 'zai-coding-plan';
