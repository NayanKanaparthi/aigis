const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures', 'atlas');
const BASELINE = path.join(FIXTURES, 'baseline');
const DISCLAIMER = 'MITRE ATLAS is a threat catalog, not a standard. Nobody is "ATLAS compliant". It does not score risk, and it does not cover bias or fairness.';
const ATLAS_VERSION = '2026.10';
const ATLAS_SHA256 = 'ac41ee9f99a47084ba5fdfc77ae83a28687e12390240fffeb37df7914ffe142d';
const DS1 = 'Build me a customer support chatbot that uses Claude to answer questions about our product. It should remember conversation history.';
const DS2 = 'Add a search feature that lets users ask natural-language questions and get answers from our 10,000-page documentation.';
const DS3 = 'Build a voice assistant for our smart home product that uses an LLM to interpret natural-language commands and decide which IoT devices to control (lights, thermostat, locks).';
const TS1 = 'uses-llm,accepts-user-input,uses-rag';
const TS2 = 'uses-llm,is-agentic,accepts-user-input,is-external,uses-thirdparty-api';
const TS3 = 'is-internal';
const TS5 = `${TS1},jurisdiction-eu`;
const AREA_IDS = ['audit-logging', 'bias-monitoring', 'confidence-scoring', 'data-integrity', 'explainability', 'fallback-patterns', 'human-oversight', 'input-validation', 'monitoring', 'output-sanitization', 'pii-handling', 'prompt-security', 'rag-security', 'rate-limiting', 'supply-chain'];
const EU_AREA_IDS = ['eu-ai-act-art-9-risk-management', 'eu-ai-act-art-13-deployer-transparency', 'eu-ai-act-art-50-transparency-disclosure', 'eu-ai-act-art-73-incident-reporting'];
const NEW_AREA_IDS = ['agent-permissions', 'agent-tool-safety'];
const UNIVERSAL_AREA_IDS = [...AREA_IDS, ...NEW_AREA_IDS];
const FORBIDDEN = /ATLAS[ -]?(compliant|compliance|certified|certification)|complies with ATLAS|risk[ -]?scor(e|es|ed|ing)/i;

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function json(rel) { return JSON.parse(read(rel)); }
function requireFile(rel, message = `${rel} missing`) {
  const target = path.join(ROOT, rel);
  assert.ok(fs.existsSync(target), message);
  return target;
}
function requireGold(name) {
  const rel = `build/atlas/gold/${name}.json`;
  requireFile(rel, `gold file missing: ${rel}`);
  const value = json(rel);
  assert.ok(value.approved_by, `${rel} approved_by missing`);
  assert.ok(value.approved_at, `${rel} approved_at missing`);
  return value;
}
function run(args, opts = {}) {
  return spawnSync(process.execPath, [path.join(opts.root || ROOT, 'bin', 'aigis.js'), ...args], {
    cwd: opts.cwd || opts.root || ROOT,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', ...(opts.env || {}) },
  });
}
function commandRecord(args, opts) {
  const r = run(args, opts);
  return { args, status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}
function baseline(name) { return JSON.parse(fs.readFileSync(path.join(BASELINE, `${name}.json`), 'utf8')); }
function baselineRoot() {
  try {
    const record = baseline('sur-verify-input-json');
    const projectDir = JSON.parse(record.stdout).project_dir;
    return projectDir.slice(0, -'/test/fixtures/atlas/project'.length);
  } catch (_) { return ROOT; }
}
function maskVolatile(text) {
  return String(text)
    .split(baselineRoot()).join('<ROOT>')
    .split(ROOT).join('<ROOT>')
    .replace(/^> aigis [^\n]* — generated [^\n]+$/gm, '> aigis <VERSION> — generated <TIMESTAMP>')
    .replace(/^> Generated: [^\n]+$/gm, '> Generated: <TIMESTAMP>')
    .replace(/^> Aigis version: [^\n]+$/gm, '> Aigis version: <VERSION>')
    .replace(/\b2\.1\.1\b/g, '<VERSION>')
    .replace(/\b2\.2\.0\b/g, '<VERSION>')
    .replace(/\b3\.0\.0\b/g, '<VERSION>')
    .replace(/"generated_at":\s*"[^"]+"/g, '"generated_at":"<TIMESTAMP>"');
}
function stripAtlas(value) {
  const copy = JSON.parse(JSON.stringify(value));
  delete copy.atlas;
  if (copy.controls) delete copy.controls.atlas;
  if (copy.cited_controls) delete copy.cited_controls.atlas;
  if (copy.meta) delete copy.meta.atlas;
  if (copy.summary && copy.summary.cross_framework_coverage) delete copy.summary.cross_framework_coverage.atlas_count;
  if (copy.summary && copy.summary.cross_framework_citations) delete copy.summary.cross_framework_citations.atlas;
  for (const row of copy.per_area || []) if (row.cited_controls) delete row.cited_controls.atlas;
  return copy;
}
function parseJsonOutput(r, label = 'command') {
  assert.strictEqual(r.status, 0, `${label} exited ${r.status}: ${r.stderr}`);
  assert.doesNotThrow(() => JSON.parse(r.stdout), `${label} did not print valid JSON`);
  return JSON.parse(r.stdout);
}
function includedByArea(gold, areaIds = AREA_IDS) {
  const out = Object.fromEntries(areaIds.map((id) => [id, []]));
  for (const row of gold.rows.filter((r) => r.decision === 'include')) (out[row.area] ||= []).push(row.mitigation);
  for (const ids of Object.values(out)) ids.sort();
  return out;
}
function entryPointRows(gold) {
  const out = {};
  for (const row of gold.rows.filter((r) => r.decision === 'include')) (out[row.trait] ||= []).push(row.technique);
  for (const ids of Object.values(out)) ids.sort();
  return out;
}
function directMitigations(catalog, techniqueId) {
  return Object.entries(catalog.mitigations).filter(([, m]) => m.techniques.includes(techniqueId)).map(([id]) => id).sort();
}
function assertNoForbidden(text, label) {
  const cleaned = String(text).split(DISCLAIMER).join('');
  const match = cleaned.match(FORBIDDEN);
  assert.ok(!match, `${label}: forbidden phrase ${match && match[0]}`);
}
function makeScratch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aigis-atlas-'));
  for (const name of ['bin', 'lib', 'content']) fs.cpSync(path.join(ROOT, name), path.join(dir, name), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(dir, 'package.json'));
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
  return dir;
}
function mutateScratch(dir, mutation) {
  const catalogPath = path.join(dir, 'content/index/atlas.json');
  const entryPath = path.join(dir, 'content/index/atlas-entry-points.json');
  if (mutation === 'catalog-missing') fs.rmSync(catalogPath, { force: true });
  else if (mutation === 'catalog-corrupt') fs.writeFileSync(catalogPath, '{ not json');
  else if (mutation === 'catalog-nokey') fs.writeFileSync(catalogPath, JSON.stringify({ source: { version: ATLAS_VERSION, sha256: ATLAS_SHA256 } }));
  else if (mutation.startsWith('catalog-')) {
    const c = JSON.parse(fs.readFileSync(catalogPath));
    if (mutation === 'catalog-sha') c.source.sha256 = `${c.source.sha256.slice(0, -1)}0`;
    if (mutation === 'catalog-version') c.source.version = '2026.09';
    fs.writeFileSync(catalogPath, JSON.stringify(c));
  } else if (mutation === 'entry-missing') fs.rmSync(entryPath, { force: true });
  else if (mutation === 'entry-corrupt') fs.writeFileSync(entryPath, '{ invalid');
  else {
    const e = JSON.parse(fs.readFileSync(entryPath));
    if (mutation === 'entry-version') e.atlas_version = '2026.09';
    if (mutation === 'entry-badtech') e.entry_points[Object.keys(e.entry_points)[0]].techniques[0] = 'AML.T9999';
    if (mutation === 'entry-badtrait') { const key = Object.keys(e.entry_points)[0]; e.entry_points['not-a-trait'] = e.entry_points[key]; delete e.entry_points[key]; }
    fs.writeFileSync(entryPath, JSON.stringify(e));
  }
}
function runCases(cases) {
  let failures = 0;
  for (const [id, fn] of cases) {
    try { fn(); console.log(`PASS ${id}`); }
    catch (error) { failures++; console.log(`FAIL ${id}: ${String(error.message).split('\n')[0]}`); }
  }
  process.exitCode = failures ? 1 : 0;
}

module.exports = { assert, fs, os, path, ROOT, FIXTURES, BASELINE, DISCLAIMER, ATLAS_VERSION, ATLAS_SHA256, FORBIDDEN, DS1, DS2, DS3, TS1, TS2, TS3, TS5, AREA_IDS, EU_AREA_IDS, NEW_AREA_IDS, UNIVERSAL_AREA_IDS, sha256, read, json, requireFile, requireGold, run, commandRecord, baseline, maskVolatile, stripAtlas, parseJsonOutput, includedByArea, entryPointRows, directMitigations, assertNoForbidden, makeScratch, mutateScratch, runCases };
