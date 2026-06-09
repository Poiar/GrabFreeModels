-- M20: Index on datapoint_model_features(feature_type, value)
-- Speeds up feature-type-based queries across all models
CREATE INDEX IF NOT EXISTS idx_datapoint_model_features_feature_type
  ON datapoint_model_features(feature_type, value);
