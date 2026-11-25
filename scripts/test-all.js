#!/usr/bin/env node
/**
 * Fast suite: every validator and test file, in one command (`npm test`).
 *
 * Runs each check as its own process so one crash can't hide another, prints
 * one line per check, and exits non-zero if anything failed. Plain Node, no
 * test framework, matching the rest of the repo.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function versionAgreement() {
  const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
  const found = {
    'package.json': JSON.parse(read('package.json')).version,
    'package-lock.json': JSON.parse(read('package-lock.json')).version,
    'package-lock.json packages[""]': JSON.parse(read('package-lock.json')).packages[''].version,
    'bin/aigis.js': (read('bin/aigis.js').match(/\.version\('([^']+)'\)/) || [])[1],
    'cli-python/pyproject.toml': (read('cli-python/pyproject.toml').match(/^version\s*=\s*"([^"]+)"/m) || [])[1],
  };
  const versions = new Set(Object.values(found));
  if (versions.size === 1 && !versions.has(undefined)) return { ok: true, detail: `all at ${[...versions][0]}` };
  return { ok: false, detail: Object.entries(found).map(([k, v]) => `${k}=${v}`).join(', ') };
}

const checks = [
  ['validate-triggers', ['scripts/validate-triggers.js']],
  ['validate-area-frontmatter', ['scripts/validate-area-frontmatter.js']],
  ['check-content-sync', ['scripts/check-content-sync.js']],
  ...fs.readdirSync(path.join(ROOT, 'test'))
    .filter((f) => f.endsWith('.test.js'))
    .sort()
    .map((f) => [f, [path.join('test', f)]]),
];

let failed = 0;
const started = Date.now();

const v = versionAgreement();
console.log(`${v.ok ? 'PASS' : 'FAIL'}  version-agreement  (${v.detail})`);
if (!v.ok) failed++;

for (const [name, args] of checks) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });
  const ok = r.status === 0;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${Date.now() - t0} ms)`);
  if (!ok) {
    failed++;
    const out = `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n').slice(-15).join('\n');
    console.log(out.replace(/^/gm, '      '));
  }
}

const total = checks.length + 1;
console.log(`\n${total - failed}/${total} checks passed in ${Date.now() - started} ms`);
process.exit(failed ? 1 : 0);
