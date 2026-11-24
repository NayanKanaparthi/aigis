#!/usr/bin/env node
/**
 * Generates content/index/atlas.json, the vendored MITRE ATLAS catalog subset,
 * from the pinned upstream release file. The catalog is never edited by hand.
 *
 *   node scripts/build-atlas-index.js --source <path-to-ATLAS-2026.10.yaml> [--check]
 *
 * Without --check: verifies the source sha256 against ATLAS_SHA256, derives the
 * catalog, and writes it to content/index/atlas.json and to the Python mirror
 * cli-python/aigis_cli/content/index/atlas.json (the two trees must stay
 * byte-identical; see scripts/check-content-sync.js).
 * With --check: derives the catalog in memory and compares it byte for byte
 * with both files on disk. Prints OK and exits 0 when equal; exits 1 otherwise.
 *
 * What is kept: ids, names, maturity, tactic links, sub-technique parents,
 * MITRE's direct `mitigates` links, and case-study counts. No descriptions or
 * references. Derivation rules: build/atlas/SPEC.md section S1.1.
 *
 * This script has no network code. To move to a future ATLAS version:
 *   1. Download the release asset by hand from
 *      https://github.com/mitre-atlas/atlas-data/releases (tag v<version>,
 *      file dist/v6/ATLAS-<version>.yaml) and its LICENSE notice.
 *   2. Change ATLAS_VERSION, ATLAS_SHA256, MODIFIED_DATE and FORMAT_VERSION
 *      below (and the shared constants in lib/atlas.js and the tests).
 *   3. Rerun this script with --source pointing at the downloaded file, then
 *      update content/index/atlas-NOTICE.md.
 *   4. A version bump needs new gold approval for the Aigis mappings
 *      (`controls.atlas` in area frontmatter and atlas-entry-points.json),
 *      because MITRE may rename, split or relink techniques and mitigations.
 *
 * YAML is parsed with js-yaml, which is already installed as a dependency of
 * gray-matter. It is not a direct dependency of this package and is only
 * needed when this developer script runs.
 *
 * Exit codes: 0 success (or --check OK), 1 usage error, unreadable source,
 * sha256 mismatch, unexpected source structure, or --check difference.
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const ATLAS_VERSION = '2026.10';
const ATLAS_SHA256 = 'ac41ee9f99a47084ba5fdfc77ae83a28687e12390240fffeb37df7914ffe142d';
const FORMAT_VERSION = '6.1.0';
const MODIFIED_DATE = '2026-10-28';

const OUTPUT_REL = 'content/index/atlas.json';
const MIRROR_REL = 'cli-python/aigis_cli/content/index/atlas.json';
const MAX_BYTES = 64000;

const MATURITY_LEVELS = ['Realized', 'Demonstrated', 'Feasible'];
const MATRIX_ID = 'ATLAS-matrix';
const CASE_STUDY_PREFIX = 'AML.CS';

const USAGE = 'Usage: node scripts/build-atlas-index.js --source <path-to-ATLAS-2026.10.yaml> [--check]';

class BuildError extends Error {}

function parseArgs(argv) {
  const opts = { source: null, check: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--check') opts.check = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--source') {
      const value = argv[++i];
      if (value === undefined || value.startsWith('--')) throw new BuildError(`--source needs a path.\n${USAGE}`);
      opts.source = value;
    } else if (arg.startsWith('--source=')) {
      opts.source = arg.slice('--source='.length);
      if (!opts.source) throw new BuildError(`--source needs a path.\n${USAGE}`);
    } else throw new BuildError(`Unknown argument: ${arg}\n${USAGE}`);
  }
  if (!opts.help && !opts.source) throw new BuildError(USAGE);
  return opts;
}

function loadYamlParser() {
  let yaml;
  try {
    yaml = require('js-yaml');
  } catch (_) {
    throw new BuildError('Cannot load js-yaml (normally installed with gray-matter). Run `npm install` in the repo root first.');
  }
  // js-yaml 3.x: safeLoad is the schema without JS types. js-yaml 4.x: load is safe by default.
  return typeof yaml.safeLoad === 'function' ? yaml.safeLoad : yaml.load;
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function byId(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function expect(condition, message) {
  if (!condition) throw new BuildError(`Unexpected source structure: ${message}`);
}

function relationshipsOf(rels, id, type) {
  const entry = rels[id];
  if (!entry || entry[type] === undefined) return [];
  expect(Array.isArray(entry[type]), `relationships["${id}"].${type} is not a list`);
  for (const r of entry[type]) {
    expect(r && r.source === id && r['relationship-type'] === type && typeof r.target === 'string',
      `malformed ${type} relationship under "${id}"`);
  }
  return entry[type];
}

function sortedUnique(ids) {
  return [...new Set(ids)].sort(byId);
}

function buildCatalog(doc) {
  expect(doc && typeof doc === 'object', 'top level is not a mapping');
  for (const key of ['collection', 'tactics', 'techniques', 'mitigations', 'case-studies', 'relationships']) {
    expect(doc[key] && typeof doc[key] === 'object' && !Array.isArray(doc[key]), `missing mapping "${key}"`);
  }
  expect(String(doc['format-version']) === FORMAT_VERSION, `format-version is ${doc['format-version']}, expected ${FORMAT_VERSION}`);
  expect(String(doc.collection.version) === ATLAS_VERSION, `collection.version is ${doc.collection.version}, expected ${ATLAS_VERSION}`);
  expect(String(doc.collection['modified-date']) === MODIFIED_DATE, `collection.modified-date is ${doc.collection['modified-date']}, expected ${MODIFIED_DATE}`);

  const rels = doc.relationships;
  const name = (obj, id) => {
    expect(typeof obj.name === 'string' && obj.name.trim() === obj.name && obj.name.length > 0, `"${id}" has no usable name`);
    return obj.name;
  };

  // Tactics, in matrix order.
  const sequence = relationshipsOf(rels, MATRIX_ID, 'sequences');
  expect(sequence.length > 0, `relationships["${MATRIX_ID}"].sequences is empty`);
  const positions = new Set();
  for (const s of sequence) {
    expect(Number.isInteger(s.position), `sequence entry for ${s.target} has no integer position`);
    expect(!positions.has(s.position), `duplicate matrix position ${s.position}`);
    positions.add(s.position);
  }
  const tactics = [...sequence]
    .sort((a, b) => a.position - b.position)
    .map((s) => {
      expect(doc.tactics[s.target], `matrix lists unknown tactic ${s.target}`);
      return { id: s.target, name: name(doc.tactics[s.target], s.target) };
    });
  expect(tactics.length === Object.keys(doc.tactics).length, 'matrix sequence does not list every tactic exactly once');
  const tacticIds = new Set(tactics.map((t) => t.id));
  expect(tacticIds.size === tactics.length, 'matrix lists a tactic twice');

  // Case-study counts: distinct AML.CS* sources with an `employs` link to the technique.
  const caseStudiesByTechnique = new Map();
  for (const source of Object.keys(rels).sort(byId)) {
    if (!source.startsWith(CASE_STUDY_PREFIX)) continue;
    for (const r of relationshipsOf(rels, source, 'employs')) {
      if (!caseStudiesByTechnique.has(r.target)) caseStudiesByTechnique.set(r.target, new Set());
      caseStudiesByTechnique.get(r.target).add(source);
    }
  }

  // Techniques, ascending id.
  const techniqueIds = Object.keys(doc.techniques).sort(byId);
  const techniqueSet = new Set(techniqueIds);
  const techniques = {};
  let subtechniques = 0;
  const maturityCounts = Object.fromEntries(MATURITY_LEVELS.map((m) => [m, 0]));
  for (const id of techniqueIds) {
    const src = doc.techniques[id];
    expect(MATURITY_LEVELS.includes(src.maturity), `technique ${id} has maturity "${src.maturity}"`);
    const tacticLinks = sortedUnique(relationshipsOf(rels, id, 'achieves').map((r) => r.target));
    expect(tacticLinks.length > 0, `technique ${id} achieves no tactic`);
    tacticLinks.forEach((t) => expect(tacticIds.has(t), `technique ${id} achieves unknown tactic ${t}`));
    const parents = sortedUnique(relationshipsOf(rels, id, 'specializes').map((r) => r.target));
    expect(parents.length <= 1, `technique ${id} specializes more than one technique`);

    const out = { name: name(src, id), maturity: src.maturity, tactics: tacticLinks };
    if (parents.length === 1) {
      expect(techniqueSet.has(parents[0]), `technique ${id} specializes unknown technique ${parents[0]}`);
      out.parent = parents[0];
      subtechniques++;
    }
    out.case_studies = caseStudiesByTechnique.has(id) ? caseStudiesByTechnique.get(id).size : 0;
    techniques[id] = out;
    maturityCounts[src.maturity]++;
  }
  for (const target of caseStudiesByTechnique.keys()) expect(techniqueSet.has(target), `a case study employs unknown technique ${target}`);

  // Mitigations, ascending id, with MITRE's direct `mitigates` links only.
  const mitigations = {};
  let mitigationLinks = 0;
  for (const id of Object.keys(doc.mitigations).sort(byId)) {
    const links = relationshipsOf(rels, id, 'mitigates').map((r) => r.target);
    const targets = sortedUnique(links);
    expect(targets.length === links.length, `mitigation ${id} lists a technique twice`);
    targets.forEach((t) => expect(techniqueSet.has(t), `mitigation ${id} mitigates unknown technique ${t}`));
    mitigations[id] = { name: name(doc.mitigations[id], id), techniques: targets };
    mitigationLinks += targets.length;
  }

  return {
    source: {
      name: 'MITRE ATLAS',
      repository: 'https://github.com/mitre-atlas/atlas-data',
      release_tag: `v${ATLAS_VERSION}`,
      file: `dist/v6/ATLAS-${ATLAS_VERSION}.yaml`,
      format_version: FORMAT_VERSION,
      version: ATLAS_VERSION,
      modified_date: MODIFIED_DATE,
      sha256: ATLAS_SHA256,
      license: 'Apache-2.0',
      notice: 'content/index/atlas-NOTICE.md',
      subset: 'ids, names, maturity, tactic links, sub-technique parents, mitigation links, case-study counts; no descriptions',
    },
    counts: {
      tactics: tactics.length,
      techniques: techniqueIds.length,
      subtechniques,
      mitigations: Object.keys(mitigations).length,
      mitigation_links: mitigationLinks,
      case_studies: Object.keys(doc['case-studies']).length,
      maturity: maturityCounts,
    },
    tactics,
    techniques,
    mitigations,
  };
}

function serialize(catalog) {
  const pretty = `${JSON.stringify(catalog, null, 1)}\n`;
  if (Buffer.byteLength(pretty) <= MAX_BYTES) return pretty;
  const minified = `${JSON.stringify(catalog)}\n`;
  if (Buffer.byteLength(minified) > MAX_BYTES) {
    throw new BuildError(`Catalog is ${Buffer.byteLength(minified)} bytes minified, over the ${MAX_BYTES}-byte cap.`);
  }
  return minified;
}

function generate(sourcePath) {
  let raw;
  try {
    raw = fs.readFileSync(sourcePath);
  } catch (_) {
    throw new BuildError(`Cannot read ${sourcePath}`);
  }
  const actual = sha256(raw);
  if (actual !== ATLAS_SHA256) {
    throw new BuildError(`sha256 mismatch: expected ${ATLAS_SHA256}, got ${actual}. Refusing to generate.`);
  }
  const parse = loadYamlParser();
  let doc;
  try {
    doc = parse(raw.toString('utf8'), { filename: sourcePath });
  } catch (error) {
    throw new BuildError(`Cannot parse ${sourcePath}: ${error.message}`);
  }
  return serialize(buildCatalog(doc));
}

function writeAtomic(rel, text) {
  const target = path.join(ROOT, rel);
  const tmp = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, target);
}

function readIfExists(rel) {
  const target = path.join(ROOT, rel);
  return fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
}

function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  const text = generate(opts.source);

  if (opts.check) {
    const problems = [];
    for (const rel of [OUTPUT_REL, MIRROR_REL]) {
      const onDisk = readIfExists(rel);
      if (onDisk === null) problems.push(`${rel} is missing`);
      else if (onDisk !== text) problems.push(`${rel} differs from the generated catalog`);
    }
    if (problems.length) {
      process.stderr.write(`${problems.join('\n')}\nRegenerate with: node scripts/build-atlas-index.js --source ${opts.source}\n`);
      return 1;
    }
    process.stdout.write(`OK (source sha256 ${ATLAS_SHA256})\n`);
    return 0;
  }

  writeAtomic(OUTPUT_REL, text);
  writeAtomic(MIRROR_REL, text);
  process.stdout.write(`Wrote ${OUTPUT_REL} (${Buffer.byteLength(text)} bytes, ATLAS ${ATLAS_VERSION})\n`);
  process.stdout.write(`Wrote ${MIRROR_REL} (mirror)\n`);
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof BuildError)) throw error;
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { ATLAS_VERSION, ATLAS_SHA256, buildCatalog, serialize };
