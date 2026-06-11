-- Drop the orphaned external_sources table.
-- It was created in the original schema but superseded by migration 002's
-- normalized tables: sources, external_source_providers, external_source_models.
-- No code references it — verified during architecture overhaul.
--
-- The normalized tables provide the same data with proper referential integrity.

DROP TABLE IF EXISTS external_sources;
