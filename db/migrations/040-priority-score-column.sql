-- Persist priority_score on datapoint_models so it doesn't need to be
-- recomputed (with Date.now() drift) on every read.
--
-- The score is still computed by build-models-data.js during the nightly
-- pipeline; this column just caches the result.

ALTER TABLE datapoint_models
  ADD COLUMN priority_score NUMERIC(8,2);

ALTER TABLE datapoint_models
  ADD COLUMN priority_computed_at TIMESTAMPTZ;

CREATE INDEX idx_dm_priority ON datapoint_models(priority_score DESC NULLS LAST);

COMMENT ON COLUMN datapoint_models.priority_score IS
  'Cached priority score (context + tools + coding + hardware + freshness). Computed nightly.';
COMMENT ON COLUMN datapoint_models.priority_computed_at IS
  'When priority_score was last computed. Used to detect stale scores.';
