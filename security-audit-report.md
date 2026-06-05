# Security Audit Report for GrabFreeModels

**Date:** June 4, 2026  
**Audited By:** Security Auditor Agent

## Executive Summary

This security audit identified 1 critical issue, 6 warning-level issues, and confirmed 7 compliant security practices. The codebase shows good overall security hygiene with proper parameterized queries, no hardcoded secrets, and clean dependencies, but lacks important security middleware and protections at the application layer.

## Critical Findings 🔴

### 1. SQL Injection Risk

**File:** `scripts/archive/migrate-v1-to-v2.js:263`  
**Risk:** High  
**Code:**

```javascript
const r = await client.query(`SELECT count(*) FROM ${tbl}`);
```

**Description:** Table names are interpolated directly into SQL queries. While this appears to be against a static list of tables, it violates the principle of parameterized queries and could be exploited if table names are ever derived from user input.
**Recommendation:**

```javascript
const validTables = [
  'super_models',
  'datapoint_providers',
  'datapoint_models',
  'datapoint_model_features',
  'datapoint_model_input_types',
  'datapoint_model_output_types',
];
if (!validTables.includes(tbl)) throw new Error('Invalid table name');
const r = await client.query('SELECT count(*) FROM $1', [tbl]);
```

## Warning Issues 🟡

### 1. Missing Security Headers

**Files:** `server/index.js`  
**Risk:** Medium  
**Issue:** Express server lacks security headers (helmet, CSP, XSS protection).  
**Impact:** Open to common web attacks like XSS, clickjacking, MITM attacks.

### 2. Unrestricted CORS

**File:** `server/index.js:8`  
**Risk:** Medium  
**Code:**

```javascript
app.use(cors());
```

**Impact:** Allows requests from any origin, potentially exposing the API to malicious sites.

### 3. No Rate Limiting

**Files:** `server/index.js`  
**Risk:** Medium  
**Impact:** No protection against brute force, DDoS, or API abuse attacks.

### 4. Sensitive Error Information Exposure

**Files:** `server/index.js:14`, `server/routes/data.js:12,22`  
**Risk:** Medium  
**Code:**

```javascript
console.error('Unhandled error:', err.message);
```

**Impact:** Error messages may leak sensitive information (stack traces, DB errors).

### 5. Insecure Authentication File Storage

**Files:** Various scripts reference `~/.local/share/opencode/auth.json`  
**Risk:** Medium  
**Issue:** API keys stored in plaintext world-readable file.  
**Impact:** If compromised, all API keys could be stolen.

### 6. Input Validation Missing

**Files:** `server/index.js`  
**Risk:** Medium  
**Issue:** No validation on incoming request bodies or parameters.  
**Impact:** Could allow oversized payloads or malformed data to cause server issues.

## Compliant Practices 🟢

1. **Parameterized Queries** - All database queries properly use `$1`, `$2` placeholders
2. **No Hardcoded Secrets** - API keys properly managed externally
3. **Git Secrets Protection** - `.env` and `auth.json` in `.gitignore`
4. **No XSS in Vue** - No `v-html` usage found
5. **No eval() or innerHTML** - No dangerous DOM patterns
6. **Clean Dependencies** - No known CVEs in npm packages
7. **Proper Error Handling** - Basic error catching in place

## Recommendations

### Immediate Actions

1. Install and configure helmet:

```bash
npm install helmet
```

```javascript
const helmet = require('helmet');
app.use(helmet());
```

2. Configure CORS:

```javascript
app.use(
  cors({
    origin:
      process.env.NODE_ENV === 'production' ? 'https://yourdomain.com' : ['http://localhost:5173'],
    credentials: true,
  }),
);
```

3. Add rate limiting:

```bash
npm install express-rate-limit
```

### Medium Priority

1. Secure the auth file with 600 permissions
2. Add input validation middleware
3. Implement proper error sanitization for production

### Long-term

1. Implement authentication/authorization
2. Add request logging and monitoring
3. Consider API key rotation system

## Conclusion

The codebase demonstrates good security fundamentals at the database level but needs improvement at the application layer. The critical SQL injection issue should be addressed immediately. The warning-level issues should be prioritized based on deployment environment (production vs development).
