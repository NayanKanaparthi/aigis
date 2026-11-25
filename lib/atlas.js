/**
 * v2.2 — MITRE ATLAS lookups over the vendored catalog.
 *
 * Aigis owns two small judgments (D1): area -> ATLAS mitigations
 * (`controls.atlas` in area frontmatter) and trait -> entry-point
 * techniques (`content/index/atlas-entry-points.json`). Everything else
 * (names, maturity, tactics, mitigation -> technique links, case-study
 * counts) is read from `content/index/atlas.json`.
 *
 * Rules:
 *   - Only MITRE's direct `mitigates` links are used (D6). A sub-technique
 *     does not inherit its parent's mitigations, and a parent does not
 *     inherit its children's.
 *   - Ordering is maturity, then MITRE case-study count descending, then
 *     id (D7). ATLAS does not rank threats and this module adds no ranking.
 *   - Pure, synchronous, cached per path. No network, no clock, no
 *     randomness. Every returned array or object is a fresh copy.
 *   - Load failures throw AtlasCatalogError; callers that must keep
 *     working without ATLAS wrap their ATLAS code in withAtlas (D12).
 */

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const ROOT = path.join(__dirname, '..');
const CATALOG_PATH = path.join(ROOT, 'content', 'index', 'atlas.json');
const ENTRY_POINTS_PATH = path.join(ROOT, 'content', 'index', 'atlas-entry-points.json');
const AREAS_DIR = path.join(ROOT, 'content', 'skills', 'areas');

const PINNED = Object.freeze({
  version: '2026.10',
  sha256: 'ac41ee9f99a47084ba5fdfc77ae83a28687e12390240fffeb37df7914ffe142d',
});

// The only place this sentence is typed in runtime code (S0, AC14).
const DISCLAIMER = 'MITRE ATLAS is a threat catalog, not a standard. Nobody is "ATLAS compliant". It does not score risk, and it does not cover bias or fairness.';

const MATURITY_RANK = Object.freeze({ Realized: 0, Demonstrated: 1, Feasible: 2 });
const CATALOG_KEYS = ['source', 'counts', 'tactics', 'techniques', 'mitigations'];

class AtlasCatalogError extends Error {
  constructor(message, file, code) {
    super(message);
    this.name = 'AtlasCatalogError';
    this.file = file;
    this.code = code;
  }
}

// ── Loading ─────────────────────────────────────────────────────────────

const catalogCache = new Map();
const entryPointCache = new Map();
const indexCache = new WeakMap();
const areaCache = new Map();

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readJson(filepath, file) {
  let raw;
  try {
    raw = fs.readFileSync(filepath, 'utf8');
  } catch (err) {
    const code = err && (err.code === 'ENOENT' || err.code === 'ENOTDIR') ? 'missing' : 'corrupt';
    throw new AtlasCatalogError(`Cannot read ATLAS ${file} at ${filepath}`, file, code);
  }
  try {
    return JSON.parse(raw);
  } catch (_) {
    throw new AtlasCatalogError(`ATLAS ${file} at ${filepath} is not valid JSON`, file, 'corrupt');
  }
}

function loadCatalog(opts = {}) {
  const filepath = path.resolve(opts.path || CATALOG_PATH);
  if (catalogCache.has(filepath)) return catalogCache.get(filepath);

  const data = readJson(filepath, 'catalog');
  const shapeOk = isObject(data)
    && CATALOG_KEYS.every((k) => Object.hasOwn(data, k))
    && isObject(data.source) && isObject(data.counts) && Array.isArray(data.tactics)
    && isObject(data.techniques) && isObject(data.mitigations);
  if (!shapeOk) {
    throw new AtlasCatalogError(`ATLAS catalog at ${filepath} is missing top-level keys`, 'catalog', 'corrupt');
  }
  if (data.source.version !== PINNED.version || data.source.sha256 !== PINNED.sha256) {
    throw new AtlasCatalogError(
      `ATLAS catalog at ${filepath} is not the pinned release ${PINNED.version}`, 'catalog', 'pin-mismatch');
  }
  catalogCache.set(filepath, data);
  return data;
}

function loadEntryPoints(opts = {}) {
  const filepath = path.resolve(opts.path || ENTRY_POINTS_PATH);
  if (entryPointCache.has(filepath)) return entryPointCache.get(filepath);

  const data = readJson(filepath, 'entry-points');
  const corrupt = (why) => new AtlasCatalogError(`ATLAS entry points at ${filepath}: ${why}`, 'entry-points', 'corrupt');
  if (!isObject(data) || !isObject(data.entry_points)) throw corrupt('missing entry_points');

  // Lazy require: classify may itself depend on this module (S4.1).
  const { ALL_TRAITS } = require('./classify');
  const catalog = loadCatalog();
  for (const [trait, entry] of Object.entries(data.entry_points)) {
    if (!ALL_TRAITS.includes(trait)) throw corrupt(`unknown trait ${trait}`);
    if (!isObject(entry) || !Array.isArray(entry.techniques)) throw corrupt(`trait ${trait} has no techniques list`);
    for (const id of entry.techniques) {
      if (typeof id !== 'string' || !Object.hasOwn(catalog.techniques, id)) {
        throw corrupt(`trait ${trait} names unknown technique ${id}`);
      }
    }
  }
  if (data.atlas_version !== PINNED.version) {
    throw new AtlasCatalogError(
      `ATLAS entry points at ${filepath} target ${data.atlas_version}, not ${PINNED.version}`, 'entry-points', 'pin-mismatch');
  }
  entryPointCache.set(filepath, data);
  return data;
}

// Reverse index technique -> direct mitigation ids, built once per catalog.
function mitigationIndex(catalog) {
  if (indexCache.has(catalog)) return indexCache.get(catalog);
  const index = new Map();
  for (const mid of Object.keys(catalog.mitigations).sort()) {
    for (const tid of catalog.mitigations[mid].techniques || []) {
      if (!index.has(tid)) index.set(tid, []);
      index.get(tid).push(mid);
    }
  }
  indexCache.set(catalog, index);
  return index;
}

// ── Catalog lookups ─────────────────────────────────────────────────────

function technique(id) {
  const catalog = loadCatalog();
  if (typeof id !== 'string' || !Object.hasOwn(catalog.techniques, id)) return null;
  const t = catalog.techniques[id];
  const parent = t.parent || null;
  const parentEntry = parent && Object.hasOwn(catalog.techniques, parent) ? catalog.techniques[parent] : null;
  const tacticNames = new Map(catalog.tactics.map((x) => [x.id, x.name]));
  return {
    id,
    name: t.name,
    display_name: parentEntry ? `${parentEntry.name}: ${t.name}` : t.name,
    maturity: t.maturity,
    tactics: (t.tactics || []).map((tid) => ({ id: tid, name: tacticNames.has(tid) ? tacticNames.get(tid) : tid })),
    parent,
    case_studies: t.case_studies || 0,
  };
}

function mitigation(id) {
  const catalog = loadCatalog();
  if (typeof id !== 'string' || !Object.hasOwn(catalog.mitigations, id)) return null;
  const m = catalog.mitigations[id];
  return { id, name: m.name, techniques: [...(m.techniques || [])] };
}

function mitigationsForTechnique(id) {
  const catalog = loadCatalog();
  const mids = mitigationIndex(catalog).get(id) || [];
  return mids.map((mid) => ({ id: mid, name: catalog.mitigations[mid].name }));
}

function compareTechniques(a, b) {
  const rank = (t) => (Object.hasOwn(MATURITY_RANK, t.maturity) ? MATURITY_RANK[t.maturity] : 3);
  const byMaturity = rank(a) - rank(b);
  if (byMaturity) return byMaturity;
  const byCases = (b.case_studies || 0) - (a.case_studies || 0);
  if (byCases) return byCases;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

function techniquesForMitigations(ids) {
  const catalog = loadCatalog();
  const seen = new Set();
  for (const mid of ids || []) {
    if (typeof mid !== 'string' || !Object.hasOwn(catalog.mitigations, mid)) continue;
    for (const tid of catalog.mitigations[mid].techniques || []) {
      if (Object.hasOwn(catalog.techniques, tid)) seen.add(tid);
    }
  }
  return [...seen].map(technique).sort(compareTechniques).map((t) => t.id);
}

// ── Area labels (frontmatter controls.atlas) ────────────────────────────

function areasDirOf(opts) {
  return path.resolve((opts && opts.areasDir) || AREAS_DIR);
}

// Map<areaId, sorted mitigation ids> for every area file in the directory.
function areaLabels(dir) {
  if (areaCache.has(dir)) return areaCache.get(dir);
  const labels = new Map();
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
  } catch (_) {
    files = [];
  }
  for (const file of files) {
    let ids = [];
    try {
      const fm = matter(fs.readFileSync(path.join(dir, file), 'utf8')).data;
      const atlas = fm && fm.controls && fm.controls.atlas;
      if (Array.isArray(atlas)) ids = [...new Set(atlas.filter((x) => typeof x === 'string'))].sort();
    } catch (_) {
      ids = [];
    }
    labels.set(file.slice(0, -'.md'.length), ids);
  }
  areaCache.set(dir, labels);
  return labels;
}

function areaMitigations(areaId, opts) {
  const ids = areaLabels(areasDirOf(opts)).get(areaId);
  return ids ? [...ids] : [];
}

function mitigationAreas(opts) {
  const reverse = {};
  for (const [areaId, mids] of areaLabels(areasDirOf(opts))) {
    for (const mid of mids) (reverse[mid] ||= []).push(areaId);
  }
  const out = {};
  for (const mid of Object.keys(reverse).sort()) out[mid] = reverse[mid].sort();
  return out;
}

function summarizeAreas(areaIds, opts) {
  const catalog = loadCatalog();
  const mids = new Set();
  for (const areaId of areaIds || []) {
    for (const mid of areaMitigations(areaId, opts)) {
      if (Object.hasOwn(catalog.mitigations, mid)) mids.add(mid);
    }
  }
  const sortedMids = [...mids].sort();
  const techniques = techniquesForMitigations(sortedMids).map(technique);
  const count = (m) => techniques.filter((t) => t.maturity === m).length;
  return {
    version: PINNED.version,
    disclaimer: DISCLAIMER,
    mitigations: sortedMids.map((id) => ({ id, name: catalog.mitigations[id].name })),
    techniques_addressed: {
      total: techniques.length,
      realized: count('Realized'),
      demonstrated: count('Demonstrated'),
      feasible: count('Feasible'),
    },
    top_techniques: techniques.slice(0, 2).map((t) => ({ id: t.id, name: t.display_name, maturity: t.maturity })),
  };
}

// ── Fail-soft wrapper (D12) ─────────────────────────────────────────────

let warnedDefault = false;

function defaultWarn(message) {
  if (warnedDefault) return;
  warnedDefault = true;
  process.stderr.write(`${message}\n`);
}

function withAtlas(fn, fallback, warn = defaultWarn) {
  try {
    return fn();
  } catch (err) {
    if (!(err instanceof AtlasCatalogError)) throw err;
    warn(`aigis: ATLAS catalog unavailable (${err.file} ${err.code}); ATLAS output omitted`);
    return fallback;
  }
}

module.exports = {
  PINNED,
  DISCLAIMER,
  MATURITY_RANK,
  AtlasCatalogError,
  loadCatalog,
  loadEntryPoints,
  technique,
  mitigation,
  mitigationsForTechnique,
  techniquesForMitigations,
  compareTechniques,
  areaMitigations,
  mitigationAreas,
  summarizeAreas,
  withAtlas,
};
