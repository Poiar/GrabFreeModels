/**
 * load-metadata.js — Reads the metadata key-value table.
 *
 * Returns a plain object { key: parsedValue } for all metadata rows.
 */

async function loadMetadata(client) {
  const { rows } = await client.query(
    'SELECT key, value::text FROM metadata ORDER BY key',
  );
  const meta = {};
  for (const r of rows) {
    try {
      meta[r.key] = JSON.parse(r.value);
    } catch {
      meta[r.key] = r.value;
    }
  }
  return meta;
}

module.exports = loadMetadata;
