-- Merge datapoint_model_input_types and datapoint_model_output_types into
-- a single datapoint_model_io_types table with a direction discriminator.
-- The two tables have identical structure — this removes a schema smell.

-- Create the unified table
CREATE TABLE datapoint_model_io_types (
    id                 SERIAL PRIMARY KEY,
    datapoint_model_id INTEGER NOT NULL REFERENCES datapoint_models(id) ON DELETE CASCADE,
    direction          VARCHAR(6) NOT NULL CHECK (direction IN ('input', 'output')),
    io_type            VARCHAR(32) NOT NULL,
    UNIQUE (datapoint_model_id, direction, io_type)
);

-- Migrate input types
INSERT INTO datapoint_model_io_types (datapoint_model_id, direction, io_type)
  SELECT datapoint_model_id, 'input', input_type
  FROM datapoint_model_input_types
ON CONFLICT (datapoint_model_id, direction, io_type) DO NOTHING;

-- Migrate output types
INSERT INTO datapoint_model_io_types (datapoint_model_id, direction, io_type)
  SELECT datapoint_model_id, 'output', output_type
  FROM datapoint_model_output_types
ON CONFLICT (datapoint_model_id, direction, io_type) DO NOTHING;

-- Verify row counts match (optional — uncomment to check)
-- DO $$
-- DECLARE
--   old_count INTEGER;
--   new_count INTEGER;
-- BEGIN
--   SELECT count(*) INTO old_count FROM datapoint_model_input_types;
--   SELECT count(*) INTO old_count FROM datapoint_model_output_types;
--   SELECT count(*) INTO new_count FROM datapoint_model_io_types;
--   IF old_count <> new_count THEN
--     RAISE WARNING 'IO type count mismatch: old=% new=%', old_count, new_count;
--   END IF;
-- END $$;

-- Drop old tables
DROP TABLE datapoint_model_input_types;
DROP TABLE datapoint_model_output_types;

-- Index for lookups
CREATE INDEX idx_io_types_dm ON datapoint_model_io_types(datapoint_model_id);
CREATE INDEX idx_io_types_direction ON datapoint_model_io_types(direction);
