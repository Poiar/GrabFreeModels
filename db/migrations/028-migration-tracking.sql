-- Migration tracking table
-- Records every applied migration with checksum for change detection.
CREATE TABLE IF NOT EXISTS _migrations (
    id          SERIAL PRIMARY KEY,
    filename    VARCHAR(256) NOT NULL UNIQUE,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    checksum    VARCHAR(64),       -- SHA-256 of file contents at time of application
    duration_ms INTEGER            -- how long the migration took (for monitoring)
);

COMMENT ON TABLE _migrations IS 'Tracks which schema migrations have been applied. Used by scripts/utils/migrate.js.';
