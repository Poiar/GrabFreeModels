-- 026: Add failure_category column to datapoint_models
-- Parses unstructured status_detail into structured categories for filtering/analysis.
-- Categories: timeout, not_found, auth_error, rate_limited, server_error, network_error, unknown

ALTER TABLE datapoint_models ADD COLUMN IF NOT EXISTS failure_category VARCHAR(32);

-- Backfill from existing status_detail text
UPDATE datapoint_models SET failure_category = CASE
  WHEN status_detail IS NULL THEN NULL
  WHEN status_detail ILIKE '%timeout%' OR status_detail ILIKE '%timed out%' OR status_detail ILIKE '%ETIMEDOUT%' THEN 'timeout'
  WHEN status_detail ILIKE '%not found%' OR status_detail ILIKE '%404%' OR status_detail ILIKE '%not_found%' THEN 'not_found'
  WHEN status_detail ILIKE '%401%' OR status_detail ILIKE '%403%' OR status_detail ILIKE '%unauthorized%' OR status_detail ILIKE '%forbidden%' OR status_detail ILIKE '%auth%' OR status_detail ILIKE '%key%' OR status_detail ILIKE '%expired%' OR status_detail ILIKE '%invalid%' THEN 'auth_error'
  WHEN status_detail ILIKE '%429%' OR status_detail ILIKE '%rate%limit%' THEN 'rate_limited'
  WHEN status_detail ILIKE '%500%' OR status_detail ILIKE '%502%' OR status_detail ILIKE '%503%' OR status_detail ILIKE '%server error%' THEN 'server_error'
  WHEN status_detail ILIKE '%ECONNREFUSED%' OR status_detail ILIKE '%ECONNRESET%' OR status_detail ILIKE '%ENOTFOUND%' OR status_detail ILIKE '%network%' OR status_detail ILIKE '%DNS%' THEN 'network_error'
  WHEN status_result = 'working' THEN NULL
  ELSE 'unknown'
END
WHERE failure_category IS NULL AND status_detail IS NOT NULL;
