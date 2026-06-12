#!/usr/bin/env node
/**
 * build-models-data.js — shared core for building models data from PostgreSQL.
 *
 * Delegates to scripts/builders/index.js which orchestrates the decomposed
 * builder modules (load-metadata, load-models, load-features, load-scores,
 * load-rankings, load-health, build-creators, build-providers, build-failover,
 * compute-priority, name-inference).
 *
 * Takes a connected pg client, returns the full ModelsData object
 * (same shape as GET /api/data).
 *
 * Usage:
 *   const buildModelsData = require('./build-models-data');
 *   const data = await buildModelsData(client);
 */

const buildModelsData = require('./builders');

module.exports = buildModelsData;
