---
name: http-caching-headers
description: API missing HTTP caching headers causing unnecessary re-downloads
metadata:
  type: issue
---

## HTTP C Headers Missing

**Issue**: No Cache-Control or ETag headers on API responses
**Impact**: Browser re-fetches 1.1MB payload on every page reload
**Location**: `server/index.js`
**Severity**: 🟡 Warning

### Current Code
```javascript
// server/routes/data.js - no caching headers
router.get('/data', async (req, res) => {
  try {
    const result = await loadModels(pool);
    res.json(result); // No caching headers
  } catch (err) {
    // Error handling
  }
});
```

### Fix Required
```javascript
const { createHash } = require('crypto');

router.get('/data', async (req, res) => {
  try {
    const result = await loadModels(pool);
    
    // Generate ETag for response
    const dataStr = JSON.stringify(result);
    const etag = createHash('md5').update(dataStr).digest('hex');
    
    // Check If-None-Match header
    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }
    
    // Set caching headers
    res.set({
      'ETag': etag,
      'Cache-Control': 'public, max-age=300', // 5 minutes
      'Content-Type': 'application/json',
    });
    
    res.json(result);
  } catch (err) {
    // Error handling
  }
});
```

### Alternative: Conditional Requests
```javascript
// For very large datasets, consider conditional queries
router.get('/data', async (req, res) => {
  const since = req.headers['if-modified-since'];
  if (since) {
    // Check if data has been modified since
    const lastModified = await getLastModifiedFromDB();
    if (new Date(since) >= lastModified) {
      return res.status(304).end();
    }
  }
  
  // ... rest of implementation
});
```

### Expected Impact
- Eliminate unnecessary re-downloads for unchanged data
- 90%+ reduction in bandwidth for repeated visits
- Faster page reloads

### Verification
1. Check response headers include ETag and Cache-Control
2. Test with browser DevTools Network tab
3. Verify 304 responses when hitting refresh