#!/usr/bin/env node
/**
 * Verify cli-python/aigis_cli/content/ is byte-identical to canonical content/.
 *
 * The Python package ships a copy of the content tree (see
 * cli-python/pyproject.toml [tool.setuptools.package-data]). It is a copy, not
 * a symlink, so sdist/wheel builds can include it. That copy drifted four
 * steps behind canonical between Step 5 and Step 7 without detection because
 * nothing forced parity.
 *
 * This script enforces parity. Run it locally before commit (or via the
 * content-sync workflow on every PR touching either tree) and any byte-level
 * divergence — missing files, extra files, modified bytes — fails the check
 * with a list of offending paths.
 *
 * Exit 0: trees match. Exit 1: drift detected; sync with
 *   rm -rf cli-python/aigis_cli/content && cp -R content cli-python/aigis_cli/content
 * then re-run this script.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const CANONICAL = path.join(ROOT, 'content');
const PYTHON = path.join(ROOT, 'cli-python', 'aigis_cli', 'content');

function walk(root) {
  const out = new Map();
  function recurse(dir, relBase) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.join(relBase, entry.name);
      if (entry.isDirectory()) recurse(full, rel);
      else if (entry.isFile()) {
        const buf = fs.readFileSync(full);
        out.set(rel, crypto.createHash('sha256').update(buf).digest('hex'));
      }
    }
  }
  recurse(root, '');
  return out;
}

if (!fs.existsSync(CANONICAL)) {
  console.error(`Canonical content tree not found: ${CANONICAL}`);
  process.exit(2);
}
if (!fs.existsSync(PYTHON)) {
  console.error(`Python content tree not found: ${PYTHON}`);
  console.error('Sync with: cp -R content cli-python/aigis_cli/content');
  process.exit(1);
}

const canonical = walk(CANONICAL);
const python = walk(PYTHON);

const missing = [];   // in canonical, not in python
const extra = [];     // in python, not in canonical
const modified = [];  // in both, hash differs

for (const [rel, hash] of canonical) {
  if (!python.has(rel)) missing.push(rel);
  else if (python.get(rel) !== hash) modified.push(rel);
}
for (const rel of python.keys()) {
  if (!canonical.has(rel)) extra.push(rel);
}

if (missing.length === 0 && extra.length === 0 && modified.length === 0) {
  console.log(`✓ content/ and cli-python/aigis_cli/content/ are byte-identical (${canonical.size} files).`);
  process.exit(0);
}

console.error('✗ Content drift detected between content/ and cli-python/aigis_cli/content/');
if (missing.length > 0) {
  console.error(`\n  Missing from Python copy (${missing.length}):`);
  for (const f of missing) console.error(`    - ${f}`);
}
if (extra.length > 0) {
  console.error(`\n  Extra in Python copy / removed from canonical (${extra.length}):`);
  for (const f of extra) console.error(`    - ${f}`);
}
if (modified.length > 0) {
  console.error(`\n  Bytes differ (${modified.length}):`);
  for (const f of modified) console.error(`    - ${f}`);
}
console.error('\nFix: rm -rf cli-python/aigis_cli/content && cp -R content cli-python/aigis_cli/content');
console.error('Then re-run: node scripts/check-content-sync.js');
process.exit(1);
