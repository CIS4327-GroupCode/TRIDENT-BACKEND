#!/usr/bin/env node
/**
 * validate-seed-consistency.js
 *
 * Compares seed-database.js payload keys against Sequelize model rawAttributes
 * for every seeded entity. Reports phantom keys (seed uses but model lacks)
 * and missing required fields (model requires but seed omits).
 *
 * Exit code 0 = clean, 1 = mismatches found.
 *
 * Usage:  node scripts/validate-seed-consistency.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ---- Load all models ----
const modelsDir = path.join(__dirname, '..', 'src', 'database', 'models');
const modelFiles = fs.readdirSync(modelsDir).filter(f => f.endsWith('.js') && f !== 'index.js');

const models = {};
for (const file of modelFiles) {
  const model = require(path.join(modelsDir, file));
  if (model && model.rawAttributes) {
    models[model.name] = model;
  }
}

// ---- Parse seed script for payload keys ----
const seedPath = path.join(__dirname, '..', 'seed-database.js');
const seedSource = fs.readFileSync(seedPath, 'utf-8');

/**
 * Extract object-literal keys from seed payloads by scanning for known patterns:
 *   { key: value, key2: value2 }
 * inside arrays or direct objects assigned to *Payload variables.
 *
 * This is a best-effort static analysis — it won't catch every dynamic key
 * but covers the literal-object patterns used in the seed script.
 */
function extractPayloadKeys(source, modelName) {
  // Match property names in object literals: `word:` at the start of a line or after `{` / `,`
  // We look for blocks between the step header and the next step header or bulkCreate/upsertBatch call.
  const keys = new Set();

  // Build regex for common payload variable names
  const varPatterns = [
    `${modelName.charAt(0).toLowerCase() + modelName.slice(1)}Payload`,
    `${modelName.toLowerCase()}Payload`,
    'Payload'
  ];

  // Simple approach: find all `key:` patterns inside the seed file that appear
  // within 200 chars after a known model reference
  const modelRefRegex = new RegExp(
    `(?:${modelName}\\.(?:bulkCreate|findOrCreate|create)|upsertBatch\\(${modelName})`,
    'g'
  );

  let match;
  while ((match = modelRefRegex.exec(source)) !== null) {
    // Scan backwards up to 5000 chars to find the payload array/object
    const start = Math.max(0, match.index - 5000);
    const block = source.slice(start, match.index + 200);

    // Extract all `identifier:` patterns (object keys)
    const keyRegex = /(?:^|[{,\s])(\w+)\s*:/gm;
    let keyMatch;
    while ((keyMatch = keyRegex.exec(block)) !== null) {
      const key = keyMatch[1];
      // Filter out common JS noise (not column names)
      if (!['const', 'let', 'var', 'if', 'else', 'return', 'function', 'async', 'await',
            'true', 'false', 'null', 'undefined', 'require', 'console', 'Math',
            'try', 'catch', 'new', 'for', 'while', 'switch', 'case', 'default',
            'module', 'exports', 'this', 'class', 'typeof', 'instanceof',
            // nested JSON keys inside JSONB fields
            'scope', 'duration_months', 'jurisdiction', 'data_types', 'retention_years',
            'hipaa_compliant', 'deliverables', 'payment_schedule', 'seeded', 'scenario',
            'source', 'title', 'field', 'from', 'to', 'section', 'name', 'decision',
            'report', 'channel', 'quality', 'communication', 'timeliness', 'overall'
           ].includes(key)) {
        keys.add(key);
      }
    }
  }

  return keys;
}

// ---- Map model names to their table & seed sections ----
const seededModels = [
  'Organization', 'User', 'ResearcherProfile', 'Project', 'Milestone',
  'UserPreferences', 'Application', 'AcademicHistory', 'Certification',
  'Match', 'Message', 'Rating', 'ProjectReview', 'SavedProject',
  'AuditLog', 'Attachment', 'Notification', 'Contract'
];

// Auto-managed columns that Sequelize handles — never expected in seed payloads
const autoColumns = new Set([
  'id', 'createdAt', 'updatedAt', 'created_at', 'updated_at',
  'deletedAt', 'deleted_at'
]);

let hasErrors = false;

console.log('🔍 Seed-Model Consistency Validation\n');
console.log('='.repeat(60));

for (const modelName of seededModels) {
  const model = models[modelName];
  if (!model) {
    console.log(`\n⚠️  ${modelName}: model not found, skipping`);
    continue;
  }

  const rawAttrs = model.rawAttributes;
  const modelKeys = new Set(Object.keys(rawAttrs));
  const seedKeys = extractPayloadKeys(seedSource, modelName);

  if (seedKeys.size === 0) {
    console.log(`\n⚠️  ${modelName}: could not extract seed payload keys (dynamic payloads?)`);
    continue;
  }

  // Keys in seed but NOT in model (phantom/typo)
  const phantomKeys = [...seedKeys].filter(k => !modelKeys.has(k));

  // Required model columns missing from seed (NOT NULL + no defaultValue + not auto-managed)
  const requiredMissing = [];
  for (const [col, def] of Object.entries(rawAttrs)) {
    if (autoColumns.has(col)) continue;
    if (def.primaryKey) continue; // auto-increment PKs
    if (def.allowNull === false && def.defaultValue === undefined && !seedKeys.has(col)) {
      requiredMissing.push(col);
    }
  }

  const ok = phantomKeys.length === 0 && requiredMissing.length === 0;

  if (!ok) {
    hasErrors = true;
    console.log(`\n❌ ${modelName}:`);
    if (phantomKeys.length > 0) {
      console.log(`   Phantom keys (in seed, NOT in model): ${phantomKeys.join(', ')}`);
    }
    if (requiredMissing.length > 0) {
      console.log(`   Required missing (NOT NULL, no default, not in seed): ${requiredMissing.join(', ')}`);
    }
  } else {
    console.log(`\n✅ ${modelName}: OK (${seedKeys.size} seed keys, ${modelKeys.size} model columns)`);
  }
}

console.log('\n' + '='.repeat(60));
if (hasErrors) {
  console.log('❌ FAILED — mismatches detected. Fix seed payloads or model definitions.');
  process.exit(1);
} else {
  console.log('✅ PASSED — all seed payloads are consistent with model definitions.');
  process.exit(0);
}
