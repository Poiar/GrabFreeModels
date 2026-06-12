-- Normalize family into a lookup table with optional hierarchy.
-- super_models.family (VARCHAR) is kept for backwards compat during migration;
-- applications should migrate to family_id over time.

CREATE TABLE families (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(64) NOT NULL UNIQUE,
    parent_family_id INTEGER REFERENCES families(id) ON DELETE SET NULL,
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed from existing super_models.family values (distinct, non-null)
INSERT INTO families (name)
  SELECT DISTINCT family FROM super_models WHERE family IS NOT NULL
  ORDER BY family;

-- Add family_id FK to super_models (nullable, coexists with family VARCHAR)
ALTER TABLE super_models
  ADD COLUMN family_id INTEGER REFERENCES families(id) ON DELETE SET NULL;

-- Populate family_id from existing family text
UPDATE super_models sm SET family_id = f.id
  FROM families f WHERE sm.family = f.name;

-- Set up known family hierarchies (parent_family_id)
-- Llama family
UPDATE families SET parent_family_id = (SELECT id FROM families WHERE name = 'Llama')
  WHERE name IN ('CodeLlama', 'Llama Guard', 'Llama Vision');
-- Qwen family
UPDATE families SET parent_family_id = (SELECT id FROM families WHERE name = 'Qwen')
  WHERE name IN ('Qwen-VL', 'Qwen-Audio', 'Qwen-Coder', 'Qwen2.5-Coder');
-- Mistral family
UPDATE families SET parent_family_id = (SELECT id FROM families WHERE name = 'Mistral')
  WHERE name IN ('Mistral Small', 'Mistral Large', 'Mistral Nemo', 'Codestral', 'Mathstral');
-- DeepSeek family
UPDATE families SET parent_family_id = (SELECT id FROM families WHERE name = 'DeepSeek')
  WHERE name IN ('DeepSeek-Coder', 'DeepSeek-VL', 'DeepSeek-R1');
-- Gemma family
UPDATE families SET parent_family_id = (SELECT id FROM families WHERE name = 'Gemma')
  WHERE name IN ('CodeGemma', 'PaliGemma', 'Gemma 3');

-- Index
CREATE INDEX idx_families_parent ON families(parent_family_id);
CREATE INDEX idx_super_models_family_id ON super_models(family_id);

COMMENT ON TABLE families IS 'Normalized model family taxonomy with optional parent-child hierarchy.';
COMMENT ON COLUMN super_models.family_id IS 'FK to families(id). Preferred over family VARCHAR during migration.';
