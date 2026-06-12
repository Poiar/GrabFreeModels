-- Rankings table — replaces the _role_rankings JSONB blob in the metadata table.
-- Provides referential integrity (FK to datapoint_models.full_id), queryability,
-- and structured score storage.

-- Each row = one model's ranking in one role under one variant for free or paid.
-- The UNIQUE constraint prevents duplicate rankings for the same (role, full_id, variant, is_paid).

CREATE TABLE rankings (
    id              SERIAL PRIMARY KEY,
    role            VARCHAR(32) NOT NULL,    -- 'model', 'build', 'general', 'small_model', 'explore'
    full_id         VARCHAR(512) NOT NULL REFERENCES datapoint_models(full_id) ON DELETE CASCADE,
    rank            INTEGER NOT NULL,        -- 1-based position within (role, variant, is_paid)
    score           NUMERIC(10,4),           -- composite score that determined this rank
    variant         VARCHAR(32) NOT NULL DEFAULT 'combined',  -- 'combined', '_benchmarks', 'artificial_analysis', 'modelsdev'
    is_paid         BOOLEAN NOT NULL DEFAULT false,
    score_components JSONB,                  -- { ctx, ctxScore, ctxWeight, ctxContrib, tagBonus, tagPenalty,
                                             --   qualityBonus, qualityIntel, qualityCoding, qualitySpeed,
                                             --   qualityLatency, freshness, deprecated, quantFactor }
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (role, full_id, variant, is_paid)
);

-- Indexes for common query patterns
CREATE INDEX idx_rankings_role_variant ON rankings(role, variant, is_paid);
CREATE INDEX idx_rankings_full_id ON rankings(full_id);
CREATE INDEX idx_rankings_computed ON rankings(computed_at DESC);

-- Seed from existing metadata._role_rankings and _role_rankings_paid if they exist.
-- We use a DO block because seed data may not exist on a fresh install.
DO $$
DECLARE
    rankings_json JSONB;
    role_name TEXT;
    role_ids JSONB;
    variant_name TEXT;
    variant_data JSONB;
    is_paid_flag BOOLEAN;
    metadata_key TEXT;
BEGIN
    FOR metadata_key, is_paid_flag IN
        SELECT * FROM (VALUES ('_role_rankings', false), ('_role_rankings_paid', true)) AS t(k, p)
    LOOP
        BEGIN
            SELECT value INTO rankings_json FROM metadata WHERE key = metadata_key;
            IF rankings_json IS NULL THEN CONTINUE; END IF;
        EXCEPTION WHEN undefined_table THEN
            CONTINUE;
        END;

        -- Seed base rankings per role
        FOR role_name IN SELECT jsonb_object_keys(rankings_json)
        LOOP
            IF role_name LIKE '\_%' THEN CONTINUE; END IF;  -- skip _meta, _scores, _variants

            role_ids := rankings_json -> role_name;
            IF jsonb_typeof(role_ids) = 'array' THEN
                FOR i IN 0..jsonb_array_length(role_ids) - 1
                LOOP
                    INSERT INTO rankings (role, full_id, rank, variant, is_paid, computed_at)
                    VALUES (role_name, role_ids ->> i, i + 1, 'combined', is_paid_flag, now())
                    ON CONFLICT (role, full_id, variant, is_paid) DO NOTHING;
                END LOOP;
            END IF;
        END LOOP;

        -- Seed variant rankings (_variants)
        IF rankings_json ? '_variants' THEN
            FOR variant_name IN SELECT jsonb_object_keys(rankings_json -> '_variants')
            LOOP
                variant_data := rankings_json -> '_variants' -> variant_name;
                FOR role_name IN SELECT jsonb_object_keys(variant_data)
                LOOP
                    IF role_name LIKE '\_%' THEN CONTINUE; END IF;
                    role_ids := variant_data -> role_name;
                    IF jsonb_typeof(role_ids) = 'array' THEN
                        FOR i IN 0..jsonb_array_length(role_ids) - 1
                        LOOP
                            INSERT INTO rankings (role, full_id, rank, variant, is_paid, computed_at)
                            VALUES (role_name, role_ids ->> i, i + 1, variant_name, is_paid_flag, now())
                            ON CONFLICT (role, full_id, variant, is_paid) DO NOTHING;
                        END LOOP;
                    END IF;
                END LOOP;
            END LOOP;
        END IF;

        -- Seed detailed scores (_scores per role → score_components per entry)
        IF rankings_json ? '_scores' THEN
            FOR role_name IN SELECT jsonb_object_keys(rankings_json -> '_scores')
            LOOP
                -- _scores.{role} is an array of { id, score, ctx, ctxScore, ... }
                -- Update the score and score_components for already-inserted ranking rows
                FOR i IN 0..jsonb_array_length(rankings_json -> '_scores' -> role_name) - 1
                LOOP
                    UPDATE rankings SET
                        score = ((rankings_json -> '_scores' -> role_name -> i) ->> 'score')::NUMERIC(10,4),
                        score_components = (rankings_json -> '_scores' -> role_name -> i) - 'id'
                    WHERE role = role_name
                      AND full_id = (rankings_json -> '_scores' -> role_name -> i) ->> 'id'
                      AND variant = 'combined'
                      AND is_paid = is_paid_flag;
                END LOOP;
            END LOOP;
        END IF;
    END LOOP;
END $$;

COMMENT ON TABLE rankings IS 'Per-role model rankings with scores. Replaces metadata._role_rankings JSONB. FK to datapoint_models.full_id ensures referential integrity.';
