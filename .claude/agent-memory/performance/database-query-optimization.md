---
name: database-query-optimization
description: N+1 query pattern in build-models-data.js needs optimization
metadata:
  type: issue
---

## Database Query Optimization

**Issue**: N+1 query pattern in data builder
**Impact**: Poor database performance with scale
**Location**: `scripts/build-models-data.js` lines 39-42
**Severity**: 🔴 Critical

### Current Pattern
```javascript
// N+1 queries - inefficient for large datasets
const [inputResult, outputResult, featResult] = await Promise.all([
  useClient.query('SELECT datapoint_model_id, input_type FROM datapoint_model_input_types WHERE datapoint_model_id = ANY($1)', [dmIds]),
  useClient.query('SELECT datapoint_model_id, output_type FROM datapoint_model_output_types WHERE datapoint_model_id = ANY($1)', [dmIds]),
  useClient.query('SELECT datapoint_model_id, feature_type, value FROM datapoint_model_features WHERE datapoint_model_id = ANY($1)', [dmIds]),
]);
```

### Optimization Options

#### Option 1: Single JOIN Query
```javascript
// Single query with JOIN - better performance
const query = `
  SELECT 
    dm.id as datapoint_model_id,
    mit.input_type,
    mot.output_type,
    mft.feature_type,
    mft.value
  FROM datapoint_models dm
  LEFT JOIN datapoint_model_input_types mit ON dm.id = mit.datapoint_model_id
  LEFT JOIN datapoint_model_output_types mot ON dm.id = mot.datapoint_model_id
  LEFT JOIN datapoint_model_features mft ON dm.id = mft.datapoint_model_id
  WHERE dm.id = ANY($1)
`;
const result = await useClient.query(query, [dmIds]);

// Process in application code
const inputMap = new Map();
const outputMap = new Map();
const featMap = new Map();

result.rows.forEach(row => {
  if (row.input_type) {
    if (!inputMap.has(row.datapoint_model_id)) inputMap.set(row.datapoint_model_id, []);
    inputMap.get(row.datapoint_model_id).push(row.input_type);
  }
  // ... similar for output and features
});
```

#### Option 2: Materialized View
```sql
-- Create materialized view for frequently accessed data
CREATE MATERIALIZED VIEW mv_model_features AS
SELECT dm.id, dm.super_model_id, dp.name as provider_name,
       mit.input_type, mot.output_type, mft.feature_type, mft.value
FROM datapoint_models dm
JOIN super_models mm ON dm.super_model_id = mm.id
JOIN datapoint_providers dp ON dm.datapoint_provider_id = dp.id
LEFT JOIN datapoint_model_input_types mit ON dm.id = mit.datapoint_model_id
LEFT JOIN datapoint_model_output_types mot ON dm.id = mot.datapoint_model_id
LEFT JOIN datapoint_model_features mft ON dm.id = mft.datapoint_model_id;

-- Index for performance
CREATE INDEX idx_mv_model_features_datapoint_id ON mv_model_features(id);
```

### Expected Impact
- 50-70% reduction in query execution time
- Better database scalability
- Reduced connection load

### Verification
1. EXPLAIN ANALYZE before and after
2. Monitor query times with large datasets
3. Check CPU usage on database