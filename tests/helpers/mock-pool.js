/**
 * mock-pool.js — Reusable mock for pg.Pool that returns canned data.
 *
 * Usage in tests:
 *   jest.mock('pg', () => { const mock = require('../helpers/mock-pool'); return { Pool: mock.createMockPool }; });
 *
 * Or with plain Node assert (no test framework):
 *   const pool = require('./helpers/mock-pool').createMockPool(queries);
 */

function createMockClient(queries = {}) {
  const client = {
    query: async (sql, params) => {
      // Match by SQL substring or exact match
      for (const [pattern, result] of Object.entries(queries)) {
        if (sql.includes(pattern)) {
          if (typeof result === 'function') return result(sql, params);
          return Array.isArray(result) ? { rows: result } : result;
        }
      }
      return { rows: [] };
    },
    release: () => {},
  };
  return client;
}

function createMockPool(queries = {}) {
  let client = null;

  const pool = {
    connect: async () => {
      client = createMockClient(queries);
      return client;
    },
    query: async (sql, params) => {
      // Direct pool.query (used by some scripts)
      const c = createMockClient(queries);
      return c.query(sql, params);
    },
    end: async () => {
      client = null;
    },
  };

  return pool;
}

/** Shorthand: pool.connect returns a client that responds to known queries */
function mockConnect(queries) {
  return {
    connect: async () => createMockClient(queries),
    query: async (sql, params) => createMockClient(queries).query(sql, params),
    end: async () => {},
  };
}

module.exports = { createMockPool, createMockClient, mockConnect };
