-- M16-M17: CHECK constraints on test_observations status and error_type
-- Verified against validate-free-models.js: status is always 'pass' or 'fail',
-- error_type is always NULL or one of the known values.
ALTER TABLE test_observations ADD CONSTRAINT ck_test_observations_status
  CHECK (status IN ('pass', 'fail'));

ALTER TABLE test_observations ADD CONSTRAINT ck_test_observations_error_type
  CHECK (error_type IS NULL OR error_type IN ('timeout', 'rate_limited', 'server_error', 'client_error', 'network_error', 'not_found'));
