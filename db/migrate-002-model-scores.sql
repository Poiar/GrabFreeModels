-- Migration 002: Model scores from external benchmark providers
-- Stores scraped scores (Elo, Intelligence Index, benchmark results) per model per source

CREATE TABLE model_scores (
    id                SERIAL PRIMARY KEY,
    datapoint_model_id INTEGER NOT NULL REFERENCES datapoint_models(id) ON DELETE CASCADE,
    source            VARCHAR(64) NOT NULL,   -- e.g. 'artificial_analysis', 'arena', 'huggingface'
    score_type        VARCHAR(64) NOT NULL,   -- e.g. 'intelligence', 'elo', 'mmlu', 'humaneval', 'gsm8k', 'price', 'speed', 'latency'
    score_value       NUMERIC(12,4),
    raw_data          JSONB,                  -- optional: store the full scraped row
    fetched_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (datapoint_model_id, source, score_type)
);

CREATE INDEX idx_model_scores_dm ON model_scores(datapoint_model_id);
CREATE INDEX idx_model_scores_source ON model_scores(source);
CREATE INDEX idx_model_scores_type ON model_scores(score_type);
CREATE INDEX idx_model_scores_source_type ON model_scores(source, score_type);
