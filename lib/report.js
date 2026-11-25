/**
 * v2.1 — `aigis report` audit-ready compliance documentation.
 *
 * Compiles a structured audit report from `aigis verify --auto` results across
 * one or more areas. Output is the multi-framework traceability artifact:
 * for each area, what was implemented, what verified, what evidence exists,
 * and which framework controls (OWASP, NIST, ISO 42001, EU AI Act) the
 * implementation satisfies.
 *
 * Entry points:
 *   - buildReport({ projectDir, areas, jurisdictions, version, timestamp })
 *       → structured report object (no I/O for output; caller renders)
 *   - formatReportMarkdown(reportObj)
 *       → audit-ready markdown
 *   - formatReportJSON(reportObj)
 *       → JSON.stringify-able tree
 *
 * Aigis writes nothing into the user's source code. The report is OUTPUT,
 * intended for the user to write to a file (via shell redirect or --output)
 * and submit/file as part of audit prep. This is consistent with the v2.0
 * principle: Aigis produces text; the user/agent decides what to do with it.
 *
 * No LLM calls. No external HTTP. Deterministic — same project + same options
 * (modulo timestamp) produces identical report.
 */

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { autoVerifyArea } = require('./auto-verify');
const atlas = require('./atlas');

const AREAS_DIR = path.join(__dirname, '..', 'content', 'skills', 'areas');

/**
 * Run verify on each requested area, aggregate into a structured report tree.
 *
 * @param {Object}   opts
 * @param {string}   opts.projectDir   — absolute path to project to verify
 * @param {string[]} opts.areas         — area ids to evaluate
 * @param {string[]} opts.jurisdictions — e.g. ['eu']; gates EU AI Act citations
 * @param {string}   opts.version       — aigis version string for the report header
 * @param {Date}     opts.timestamp     — injectable for tests
 * @returns {Object}  report tree
 */
function buildReport({ projectDir, areas, jurisdictions = [], version = null, timestamp = null } = {}) {
  if (!projectDir) throw new Error('buildReport: projectDir is required');
  if (!Array.isArray(areas) || areas.length === 0) {
    throw new Error('buildReport: areas must be a non-empty array of area ids');
  }
  const ts = (timestamp || new Date()).toISOString();
  const ver = version || readPackageVersion();

  const perArea = [];
  let aggOwasp = new Set();
  let aggNist = new Set();
  let aggIso = new Set();
  let aggEu = new Set();
  let aggAtlas = new Set();
  let totalAutoPass = 0, totalAutoFail = 0, totalOverclaims = 0, totalJudgment = 0;
  let areasFullyPassing = 0;

  for (const area of areas) {
    let result;
    try {
      result = autoVerifyArea(area, projectDir, { jurisdictions });
    } catch (e) {
      perArea.push({
        area,
        status: 'ERROR',
        error: e.message,
        cited_controls: null,
        auto_checks: {},
        overclaim_checks: {},
        judgment_checks: {},
        evidence: [],
      });
      continue;
    }
    const s = result.summary;
    const status = s.auto_fail === 0 && s.overclaims_raised === 0
      ? (s.auto_total > 0 ? 'PASS' : 'NO_CHECKS')
      : (s.auto_pass > 0 ? 'PARTIAL' : 'FAIL');
    if (status === 'PASS') areasFullyPassing++;

    // Aggregate cited controls.
    if (result.cited_controls) {
      for (const v of result.cited_controls.owasp) aggOwasp.add(v);
      for (const v of result.cited_controls.nist) aggNist.add(v);
      for (const v of result.cited_controls.iso42001) aggIso.add(v);
      for (const v of result.cited_controls.eu_ai_act) aggEu.add(v);
      for (const v of (result.cited_controls.atlas || [])) aggAtlas.add(v);
    }

    totalAutoPass += s.auto_pass;
    totalAutoFail += s.auto_fail;
    totalOverclaims += s.overclaims_raised;
    totalJudgment += s.judgment_required;

    // Collect evidence — file:line snippets from PASS auto checks.
    const evidence = [];
    for (const [checkId, r] of Object.entries(result.auto_checks)) {
      if (r.status !== 'PASS') continue;
      for (const e of (r.evidence || []).slice(0, 3)) {
        evidence.push({ check_id: checkId, file: e.file, line: e.line, snippet: e.snippet });
      }
    }

    perArea.push({
      area,
      title: readAreaTitle(area),
      status,
      summary: s,
      cited_controls: result.cited_controls,
      auto_checks: result.auto_checks,
      overclaim_checks: result.overclaim_checks,
      judgment_checks: result.judgment_checks,
      evidence,
    });
  }

  // v3.0: MITRE ATLAS (SPEC S4.3). Omitted entirely when the catalog is
  // unavailable (fail-soft, S4.5); verify then also omits cited_controls.atlas.
  const atlasHeader = atlas.withAtlas(() => {
    atlas.loadCatalog();
    return { version: atlas.PINNED.version, disclaimer: atlas.DISCLAIMER };
  }, null);

  const report = {
    generated_at: ts,
    aigis_version: ver,
    project_dir: projectDir,
    user_jurisdictions: [...(jurisdictions || [])].sort(),
    areas_requested: [...areas],
    summary: {
      areas_evaluated: areas.length,
      areas_fully_passing: areasFullyPassing,
      total_auto_pass: totalAutoPass,
      total_auto_fail: totalAutoFail,
      total_overclaims_raised: totalOverclaims,
      total_judgment_required: totalJudgment,
      cross_framework_coverage: {
        owasp_count: aggOwasp.size,
        nist_count: aggNist.size,
        iso42001_count: aggIso.size,
        eu_ai_act_count: aggEu.size,
      },
      cross_framework_citations: {
        owasp: [...aggOwasp].sort(),
        nist: [...aggNist].sort(),
        iso42001: [...aggIso].sort(),
        eu_ai_act: [...aggEu].sort(),
      },
    },
    per_area: perArea,
  };
  if (atlasHeader) {
    report.summary.cross_framework_coverage.atlas_count = aggAtlas.size;
    report.summary.cross_framework_citations.atlas = [...aggAtlas].sort();
    report.atlas = atlasHeader;
  }
  return report;
}

/** Format the structured report as audit-ready markdown. */
function formatReportMarkdown(report) {
  const L = [];
  L.push(`# Aigis Compliance Report`);
  L.push('');
  L.push(`> Generated: ${report.generated_at}`);
  L.push(`> Aigis version: ${report.aigis_version}`);
  L.push(`> Project: \`${report.project_dir}\``);
  if (report.user_jurisdictions.length > 0) {
    L.push(`> Jurisdictions in scope: ${report.user_jurisdictions.join(', ')}`);
  } else {
    L.push(`> Jurisdictions in scope: (none — pass \`--jurisdiction eu\` to surface EU AI Act citations)`);
  }
  L.push('');
  L.push(`> *This report is content output. Aigis writes nothing into your source code. The agent and the user remain responsible for what is submitted to auditors.*`);
  L.push('');

  // ── Summary ─────────────────────────────────────────────────────────────
  const s = report.summary;
  L.push(`## Summary`);
  L.push('');
  L.push(`- Areas evaluated: **${s.areas_evaluated}**`);
  L.push(`- Areas fully passing (no FAIL, no OVERCLAIM): **${s.areas_fully_passing} / ${s.areas_evaluated}**`);
  L.push(`- Auto-checks: **${s.total_auto_pass} PASS, ${s.total_auto_fail} FAIL** across all areas`);
  L.push(`- Overclaim recognizers raised: **${s.total_overclaims_raised}**`);
  L.push(`- Judgment items requiring agent/human review: **${s.total_judgment_required}**`);
  L.push('');
  L.push(`### Cross-framework coverage`);
  L.push('');
  L.push(`| Framework | Citations across all areas |`);
  L.push(`|---|---:|`);
  L.push(`| OWASP LLM Top 10 | ${s.cross_framework_coverage.owasp_count} |`);
  L.push(`| NIST AI RMF | ${s.cross_framework_coverage.nist_count} |`);
  L.push(`| ISO/IEC 42001 | ${s.cross_framework_coverage.iso42001_count} |`);
  L.push(`| EU AI Act | ${s.cross_framework_coverage.eu_ai_act_count}${report.user_jurisdictions.includes('eu') ? '' : ' _(not surfaced — no EU jurisdiction)_'} |`);
  if (report.atlas) L.push(`| MITRE ATLAS mitigations (threat catalog, not a standard) | ${s.cross_framework_coverage.atlas_count} |`);
  L.push('');

  // ── Per-area results ────────────────────────────────────────────────────
  L.push(`## Per-area results`);
  L.push('');
  for (const a of report.per_area) {
    L.push(`### ${a.area}`);
    if (a.title) L.push(`*${a.title}*`);
    L.push('');
    if (a.status === 'ERROR') {
      L.push(`**Status: ERROR** — ${a.error}`);
      L.push('');
      continue;
    }
    L.push(`**Status: ${a.status}**`);
    L.push('');
    L.push(`Verify breakdown: ${a.summary.auto_pass}/${a.summary.auto_total} auto checks PASS, ${a.summary.overclaims_raised} overclaims raised, ${a.summary.judgment_required} judgment item${a.summary.judgment_required === 1 ? '' : 's'}`);
    L.push('');

    // Cited controls
    if (a.cited_controls) {
      const c = a.cited_controls;
      const total = c.owasp.length + c.nist.length + c.iso42001.length + c.eu_ai_act.length;
      if (total > 0) {
        L.push(`**Controls in scope:**`);
        if (c.owasp.length > 0)    L.push(`- OWASP LLM Top 10: ${c.owasp.map((v) => `\`${v}\``).join(', ')}`);
        if (c.nist.length > 0)     L.push(`- NIST AI RMF: ${c.nist.map((v) => `\`${v}\``).join(', ')}`);
        if (c.iso42001.length > 0) L.push(`- ISO/IEC 42001: ${c.iso42001.map((v) => `\`${v}\``).join(', ')}`);
        if (c.eu_ai_act.length > 0) L.push(`- EU AI Act: ${c.eu_ai_act.map((v) => `\`${v}\``).join(', ')}`);
        if (report.atlas && c.atlas && c.atlas.length > 0) L.push(`- MITRE ATLAS mitigations (helps implement, in part): ${c.atlas.map((v) => `\`${v}\``).join(', ')}`);
        L.push('');
      }
    }

    // Evidence
    if (a.evidence.length > 0) {
      L.push(`**Evidence (file:line excerpts from PASS checks, max 3 per check):**`);
      L.push('');
      for (const e of a.evidence) {
        const snippet = e.snippet.length > 120 ? e.snippet.slice(0, 117) + '…' : e.snippet;
        L.push(`- \`${e.check_id}\` — \`${e.file}:${e.line}\` — \`${snippet.replace(/`/g, '\\`')}\``);
      }
      L.push('');
    } else if (a.summary.auto_pass > 0) {
      L.push(`*Evidence collected but not surfaced here (PASS checks without grep-able evidence — e.g. config-file presence checks).*`);
      L.push('');
    }

    // Open gaps for this area
    const fails = Object.entries(a.auto_checks).filter(([, r]) => r.status === 'FAIL');
    const overclaims = Object.entries(a.overclaim_checks).filter(([, r]) => r.raised);
    if (fails.length > 0 || overclaims.length > 0) {
      L.push(`**Open items in this area:**`);
      L.push('');
      for (const [id, r] of fails) {
        L.push(`- ❌ FAIL \`${id}\` — ${r.desc || ''}`);
      }
      for (const [id, r] of overclaims) {
        L.push(`- ⚠ OVERCLAIM \`${id}\` — ${r.desc || ''} _(recognizer: ${r.recognizer})_`);
      }
      L.push('');
    }
    L.push('---');
    L.push('');
  }

  // ── Aggregated open gaps section ────────────────────────────────────────
  const allFails = [];
  const allOverclaims = [];
  for (const a of report.per_area) {
    for (const [id, r] of Object.entries(a.auto_checks || {})) {
      if (r.status === 'FAIL') allFails.push({ area: a.area, id, desc: r.desc });
    }
    for (const [id, r] of Object.entries(a.overclaim_checks || {})) {
      if (r.raised) allOverclaims.push({ area: a.area, id, desc: r.desc, recognizer: r.recognizer });
    }
  }
  if (allFails.length > 0 || allOverclaims.length > 0) {
    L.push(`## Aggregated open gaps`);
    L.push('');
    if (allFails.length > 0) {
      L.push(`### FAIL (${allFails.length})`);
      L.push('');
      for (const f of allFails) {
        L.push(`- **\`${f.area}\` / \`${f.id}\`** — ${f.desc || ''}`);
      }
      L.push('');
    }
    if (allOverclaims.length > 0) {
      L.push(`### OVERCLAIM (${allOverclaims.length})`);
      L.push('');
      for (const o of allOverclaims) {
        L.push(`- **\`${o.area}\` / \`${o.id}\`** — ${o.desc || ''} _(recognizer: ${o.recognizer})_`);
      }
      L.push('');
    }
  } else {
    L.push(`## Aggregated open gaps`);
    L.push('');
    L.push(`_No FAIL or OVERCLAIM signals across the evaluated areas._`);
    L.push('');
  }

  // ── Methodology ─────────────────────────────────────────────────────────
  L.push(`## Methodology`);
  L.push('');
  L.push(`This report was generated by \`aigis report\` (v${report.aigis_version}) running deterministic regex-based scanners (\`aigis verify <area> --auto\`) against the project at \`${report.project_dir}\`.`);
  L.push('');
  L.push(`- **Scanner**: heuristic regex patterns over project source files. Matches drive PASS / FAIL. See \`content/index/auto-verify-rules.json\` for the rule definitions.`);
  L.push(`- **Overclaim recognizers**: targeted detectors for known anti-patterns (e.g. kill switches that re-arm on restart). When raised, the literal check passes but a stricter operational bar may not.`);
  L.push(`- **Judgment items**: not auto-gradable. The agent (or auditor) must evaluate.`);
  L.push(`- **Cross-framework citations**: each area's \`controls\` frontmatter declares which OWASP / NIST / ISO 42001 / EU AI Act controls it satisfies. Citations are surfaced when the area's auto checks PASS (or PARTIAL — flagged accordingly).`);
  L.push(`- **Jurisdiction gating**: EU AI Act citations are only surfaced when \`--jurisdiction eu\` was passed. This report's "Jurisdictions in scope" header documents what was requested.`);
  L.push(`- **Determinism**: same project + same options + same Aigis version produces byte-identical reports (modulo the timestamp line).`);
  if (report.atlas) {
    L.push(`- **MITRE ATLAS**: mitigation ids come from each area's \`controls.atlas\` frontmatter (Aigis's own mapping, pinned to ATLAS v${report.atlas.version}). A cited mitigation means the area helps implement it (in part). ${report.atlas.disclaimer}`);
  }
  L.push('');
  L.push(`This report is content output. It is not a certification. EU AI Act conformity assessment requires notified-body involvement; this report is preparation material.`);
  L.push('');

  return L.join('\n');
}

function formatReportJSON(report) {
  return JSON.stringify(report, null, 2);
}

function readAreaTitle(areaId) {
  try {
    const filepath = path.join(AREAS_DIR, `${areaId}.md`);
    if (!fs.existsSync(filepath)) return null;
    const fm = matter(fs.readFileSync(filepath, 'utf8')).data;
    return fm.title || null;
  } catch (_) {
    return null;
  }
}

let _cachedVersion = null;
function readPackageVersion() {
  if (_cachedVersion) return _cachedVersion;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    _cachedVersion = pkg.version || 'unknown';
  } catch (_) {
    _cachedVersion = 'unknown';
  }
  return _cachedVersion;
}

module.exports = { buildReport, formatReportMarkdown, formatReportJSON };
