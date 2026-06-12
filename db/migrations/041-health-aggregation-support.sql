-- Prepare test_observations to replace model_health_snapshots.
--
-- model_health_snapshots stores one aggregated row per model per validation run
-- (status = 'working'|'broken'|'rate_limited'). test_observations stores per-request
-- rows (status = 'pass'|'fail', 6 rows per model per run).
--
-- This migration adds indexes and a helper function so consumers can derive
-- snapshot-style data from test_observations without duplicating the aggregation logic.
--
-- model_health_snapshots is NOT dropped here — that happens in the cleanup phase
-- after all consumers have migrated.

-- Composite index for health-style queries: last N days, grouped by full_id.
-- Migration 034 would add idx_test_obs_full_tested; add it now without the drop.
CREATE INDEX IF NOT EXISTS idx_test_obs_full_tested
  ON test_observations(full_id, tested_at DESC);

-- ── Helper: aggregate per-validation-run health for a model ──
-- Each validation run tests a model 6 times (burst + delayed requests).
-- A "run" is defined as all test_observations for the same full_id on the same date.
-- If ALL requests passed → 'working'; otherwise → 'broken'.
-- Returns the same shape model_health_snapshots consumers expect.

CREATE OR REPLACE FUNCTION model_health_from_observations(
    p_full_id VARCHAR,
    p_days INTEGER DEFAULT 30
) RETURNS TABLE(
    tested_date DATE,
    status TEXT,
    detail TEXT,
    latency_ms NUMERIC(10,2),
    total_requests BIGINT,
    passed_requests BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        tob.tested_at::date AS tested_date,
        CASE WHEN bool_and(tob.status = 'pass') THEN 'working' ELSE 'broken' END AS status,
        string_agg(DISTINCT tob.error_type, ', ' ORDER BY tob.error_type)
            FILTER (WHERE tob.error_type IS NOT NULL) AS detail,
        ROUND(AVG(tob.latency_ms) FILTER (WHERE tob.latency_ms IS NOT NULL), 2) AS latency_ms,
        COUNT(*) AS total_requests,
        COUNT(*) FILTER (WHERE tob.status = 'pass') AS passed_requests
    FROM test_observations tob
    WHERE tob.full_id = p_full_id
      AND tob.tested_at >= now() - (p_days || ' days')::INTERVAL
    GROUP BY tob.full_id, tob.tested_at::date
    ORDER BY tested_date DESC;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION model_health_from_observations(VARCHAR, INTEGER) IS
  'Derives per-validation-run health snapshots from test_observations. Replaces direct model_health_snapshots queries.';

-- ── Helper: compute stability stats from observations ──
-- Returns stability %, streak count, and last_working date for a model.

CREATE OR REPLACE FUNCTION model_health_stats(
    p_full_id VARCHAR,
    p_days INTEGER DEFAULT 30,
    p_max_snapshots INTEGER DEFAULT 20
) RETURNS TABLE(
    stability NUMERIC,
    last_working DATE,
    streak INTEGER
) AS $$
DECLARE
    total_runs INTEGER;
    working_runs INTEGER;
    last_working_date DATE;
    streak_count INTEGER := 0;
    run RECORD;
BEGIN
    -- Count total and working from aggregated runs
    SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'working')
    INTO total_runs, working_runs
    FROM model_health_from_observations(p_full_id, p_days);

    stability := CASE WHEN total_runs > 0
        THEN ROUND((working_runs::NUMERIC / total_runs) * 100) ELSE 0 END;

    -- Find last working date
    SELECT tested_date INTO last_working_date
    FROM model_health_from_observations(p_full_id, p_days)
    WHERE status = 'working'
    ORDER BY tested_date DESC LIMIT 1;

    last_working := last_working_date;

    -- Compute streak: consecutive 'working' from most recent backward
    FOR run IN SELECT * FROM model_health_from_observations(p_full_id, p_days) LIMIT p_max_snapshots
    LOOP
        IF run.status = 'working' THEN
            streak_count := streak_count + 1;
        ELSE
            EXIT;
        END IF;
    END LOOP;

    streak := streak_count;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION model_health_stats(VARCHAR, INTEGER, INTEGER) IS
  'Computes stability %, last working date, and consecutive working streak from test_observations.';
