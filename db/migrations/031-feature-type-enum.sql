-- Feature type reference table — enumerates the valid feature_type values
-- for datapoint_model_features, replacing the free-form VARCHAR(32) with
-- a lookup that also records the expected value type.

CREATE TABLE feature_types (
    slug            VARCHAR(32) PRIMARY KEY,
    description     TEXT,
    value_type      VARCHAR(16) NOT NULL DEFAULT 'string'
        CHECK (value_type IN ('string', 'boolean', 'numeric', 'date', 'text')),
    allowed_values  TEXT[],          -- for enum-like features (e.g. best_for values)
    min_value       NUMERIC,        -- for numeric features
    max_value       NUMERIC         -- for numeric features
);

-- Seed all 25 known feature types
INSERT INTO feature_types (slug, description, value_type) VALUES
    ('best_for',                    'Curated use-case suitability tags', 'string'),
    ('tag',                         'Generic ad-hoc tags', 'string'),
    ('supports_reasoning',          'Model supports chain-of-thought / reasoning', 'boolean'),
    ('supports_attachment',         'Model accepts file attachments', 'boolean'),
    ('supports_structured_output',  'Model supports JSON mode / structured output', 'boolean'),
    ('open_weights',                'Model weights are publicly available', 'boolean'),
    ('output_limit',                'Max output tokens per request', 'numeric'),
    ('temperature',                 'Default temperature setting', 'numeric'),
    ('description',                 'Human-readable model description', 'text'),
    ('model_tier',                  'Tier label from provider (e.g. free, pro, enterprise)', 'string'),
    ('model_variant',               'Variant name (e.g. instruct, chat, base)', 'string'),
    ('param_count_b',               'Total parameter count in billions', 'numeric'),
    ('active_param_count_b',        'Active parameters (MoE) in billions', 'numeric'),
    ('expert_count',                'Number of experts (MoE models)', 'numeric'),
    ('thinking_variant',            'Model has a thinking/reasoning variant', 'boolean'),
    ('model_version',               'Provider-assigned version string', 'string'),
    ('release_stage',               'Release stage (preview, stable, deprecated)', 'string'),
    ('coding_specialized',          'Model is specialized for code generation', 'boolean'),
    ('modality_vision',             'Model accepts image inputs', 'boolean'),
    ('modality_video',              'Model accepts video inputs', 'boolean'),
    ('modality_audio',              'Model accepts audio inputs', 'boolean'),
    ('knowledge_cutoff',            'Training data cutoff date', 'date'),
    ('release_date',                'Model release date', 'date'),
    ('last_updated',                'Last model update date', 'date'),
    ('weights',                     'Weight format / availability', 'string'),
ON CONFLICT (slug) DO NOTHING;

-- Add FK from features to feature_types
-- This replaces the CHECK constraint from 029 with a proper referential constraint.
-- First drop the CHECK if it exists (it may have been created by 029)
DO $$
BEGIN
    ALTER TABLE datapoint_model_features DROP CONSTRAINT IF EXISTS ck_feature_type;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE datapoint_model_features
  ADD CONSTRAINT fk_feature_type FOREIGN KEY (feature_type) REFERENCES feature_types(slug);
