---
name: api-compression-missing
description: Express server missing compression middleware leading to large 1.1MB payloads
metadata:
  type: issue
---

## API Compression Missing

**Issue**: Express server serves 1.1MB uncompressed JSON payloads
**Impact**: Slow initial page load, high bandwidth usage
**Location**: `server/index.js`
**Severity**: 🔴 Critical

### Current Code

```javascript
// server/index.js - no compression middleware
const express = require('express');
const cors = require('cors');
const dataRouter = require('./routes/data');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', dataRouter);
```

### Fix Required

```javascript
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const dataRouter = require('./routes/data');

const app = express();
app.use(cors());
app.use(compression()); // Add compression middleware
app.use(express.json());
app.use('/api', dataRouter);
```

### Expected Impact

- 70%+ reduction in payload size (1.1MB → ~300KB gzipped)
- Faster initial page load
- Reduced bandwidth usage

### Dependencies

- Need to install: `npm install compression`
- Update package.json dependencies

### Verification

After implementing:

1. Check response headers contain `Content-Encoding: gzip`
2. Measure payload size with `curl -I` and `Content-Length`
3. Test in browser network tab
