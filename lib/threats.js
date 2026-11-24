/**
 * v3.0: `aigis threats`: a starting threat model for a system's entry
 * points, read from the vendored MITRE ATLAS catalog (SPEC S5).
 *
 * Scope comes from the approved trait -> entry-point map, not from the
 * mitigations the areas already cite (D5), so gaps can appear. Every
 * (technique, mitigation) pair printed is one of MITRE's direct
 * `mitigates` links (D6). Order is maturity, then MITRE case-study count,
 * then id (D7). No color, no timestamp, no network (D11).
 *
 * The CLI (bin/aigis.js) only parses flags, calls these functions, prints
 * and sets the exit code. Input problems throw ThreatsInputError (exit 1);
 * catalog problems throw AtlasCatalogError (exit 2, see catalogErrorLine).
 */

const atlas = require('./atlas');
const { classify, ALL_TRAITS } = require('./classify');
const { getUserJurisdictions, filterAreasByJurisdiction } = require('./jurisdiction');
const { normalizeDescription, assignUniqueSlugs, resolveTraits } = require('./build');
const { detectTraitsFromText } = require('./keywords');

const DEFAULT_TOP = 10;
const MAX_TOP = 25;
const MAX_MITIGATION_LINES = 4;
const MAX_GAP_LINES = 8;
const MAX_REDTEAM = 5;

const MISSING_INPUT_LINES = [
  'Provide --traits, a quoted description, or both.',
  'Example: aigis threats --traits uses-llm,uses-rag,is-agentic',
  'Example: aigis threats "customer support agent that answers from our docs and can file tickets"',
];

class ThreatsInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ThreatsInputError';
    this.exitCode = 1;
  }
}

// ── Input parsing ───────────────────────────────────────────────────────

function splitTraits(flag) {
  if (flag === undefined || flag === null || flag === false) return [];
  const list = String(flag).split(',').map((t) => t.trim()).filter(Boolean);
  return [...new Set(list)];
}

/**
 * --top: an integer from 1 to 25, default 10. Throws ThreatsInputError.
 */
function parseTop(value) {
  if (value === undefined || value === null) return DEFAULT_TOP;
  const text = String(value).trim();
  const n = /^\d+$/.test(text) ? Number(text) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > MAX_TOP) {
    throw new ThreatsInputError('--top must be an integer from 1 to 25. The full catalog is at https://atlas.mitre.org.');
  }
  return n;
}

/**
 * Resolve the final trait set (S5.2). Never prompts.
 *   --traits: split, trimmed, unknown -> exit 1.
 *   description: detected like `aigis build` (uncertain traits included and marked).
 * Returns { traits, uncertainTraits, description (normalized or null), traitsFlag }.
 */
function resolveThreatTraits({ description, traitsFlag } = {}) {
  const flagTraits = Array.isArray(traitsFlag) ? [...new Set(traitsFlag)] : splitTraits(traitsFlag);
  const normalized = normalizeDescription(description);

  if (!flagTraits.length && !normalized) throw new ThreatsInputError(MISSING_INPUT_LINES.join('\n'));

  const unknown = flagTraits.filter((t) => !ALL_TRAITS.includes(t));
  if (unknown.length) {
    throw new ThreatsInputError(`Unknown traits: ${unknown.join(', ')}. Run "aigis traits" to see available traits.`);
  }

  let fromDescription = [];
  let uncertain = [];
  if (normalized) {
    const detection = detectTraitsFromText(normalized);
    const withSlugs = { ...detection, low_confidence_matches: assignUniqueSlugs(detection.low_confidence_matches) };
    const resolved = resolveTraits(withSlugs, {}, { uncertainAsIncluded: true });
    fromDescription = resolved.all_traits;
    uncertain = resolved.uncertain_traits;
  }

  if (!flagTraits.length && !fromDescription.length) {
    throw new ThreatsInputError('No traits resolved from description. Pass --traits <list> (run "aigis traits" to see them).');
  }

  const flagSet = new Set(flagTraits);
  const traits = [...new Set([...flagTraits, ...fromDescription])].sort();
  const uncertainTraits = uncertain.filter((t) => !flagSet.has(t)).sort();
  return { traits, uncertainTraits, description: normalized || null, traitsFlag: flagTraits };
}

// ── Model ───────────────────────────────────────────────────────────────

function recommendedAreasFor(traits) {
  const result = classify(traits);
  return filterAreasByJurisdiction(result.implement_files, getUserJurisdictions(traits));
}

/**
 * Build the threat model (S5.3). Loads the catalog and the entry-point map
 * first, so a broken install fails before any other work (AtlasCatalogError).
 */
function buildThreatModel({ traits, uncertainTraits = [], description = null, traitsFlag = [], top, redteam = false } = {}) {
  const catalog = atlas.loadCatalog();
  const entryFile = atlas.loadEntryPoints();
  const shownLimit = top === undefined || top === null ? DEFAULT_TOP : parseTop(top);

  const finalTraits = [...new Set(traits || [])].sort();
  const uncertainSet = new Set(uncertainTraits || []);
  const recommendedAreas = recommendedAreasFor(finalTraits);
  const recommendedSet = new Set(recommendedAreas);
  const areasByMitigation = atlas.mitigationAreas();

  // Entry points: one per final trait that the map knows, trait ascending.
  const entryPoints = finalTraits
    .filter((t) => Object.hasOwn(entryFile.entry_points, t))
    .map((t) => {
      const e = entryFile.entry_points[t];
      return {
        trait: t,
        surface: typeof e.surface === 'string' && e.surface ? e.surface : t,
        uncertain: uncertainSet.has(t),
        techniques: [...e.techniques],
      };
    });

  // In-scope techniques: union over entry points, sorted with compareTechniques.
  const entryTraitsById = new Map();
  for (const e of entryPoints) {
    for (const id of e.techniques) {
      if (!entryTraitsById.has(id)) entryTraitsById.set(id, []);
      entryTraitsById.get(id).push(e.trait);
    }
  }
  const scope = [...entryTraitsById.keys()].map((id) => atlas.technique(id)).sort(atlas.compareTechniques);

  // Mitigations over ALL in-scope techniques (gaps, counts, unmitigated).
  const mitigationToScope = new Map();
  const unmitigated = [];
  for (const t of scope) {
    const mids = atlas.mitigationsForTechnique(t.id);
    if (!mids.length) unmitigated.push(t.id);
    for (const m of mids) {
      if (!mitigationToScope.has(m.id)) mitigationToScope.set(m.id, []);
      mitigationToScope.get(m.id).push(t.id);
    }
  }
  const areasOf = (mid) => areasByMitigation[mid] || [];
  const gaps = [...mitigationToScope.entries()]
    .filter(([mid]) => !areasOf(mid).length)
    .map(([id, tids]) => ({ id, techniques: [...tids].sort() }))
    .sort((a, b) => b.techniques.length - a.techniques.length || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const withArea = [...mitigationToScope.keys()].filter((mid) => areasOf(mid).length).length;

  const shown = scope.slice(0, shownLimit).map((t) => ({
    id: t.id,
    name: t.display_name,
    maturity: t.maturity,
    tactics: t.tactics.map((x) => ({ id: x.id, name: x.name })),
    entry_traits: [...entryTraitsById.get(t.id)].sort(),
    case_studies: t.case_studies,
    mitigations: atlas.mitigationsForTechnique(t.id).map((m) => ({
      id: m.id,
      areas: areasOf(m.id).map((areaId) => ({ id: areaId, recommended: recommendedSet.has(areaId) })),
    })),
  }));

  const usedMitigations = new Set([...gaps.map((g) => g.id), ...shown.flatMap((t) => t.mitigations.map((m) => m.id))]);
  const mitigationNames = {};
  for (const id of [...usedMitigations].sort()) mitigationNames[id] = catalog.mitigations[id].name;

  const model = {
    atlas: {
      version: atlas.PINNED.version,
      disclaimer: atlas.DISCLAIMER,
      source_sha256: atlas.PINNED.sha256,
      license: catalog.source.license || 'Apache-2.0',
    },
    input: { description: description || null, traits_flag: [...(traitsFlag || [])] },
    traits: finalTraits,
    uncertain_traits: finalTraits.filter((t) => uncertainSet.has(t)),
    entry_points: entryPoints,
    techniques_in_scope: scope.length,
    techniques_shown: shown.length,
    techniques: shown,
    mitigation_names: mitigationNames,
    gaps,
    unmitigated_techniques: unmitigated,
    mitigation_counts: { in_scope: mitigationToScope.size, with_area: withArea, without_area: gaps.length },
    recommended_areas: recommendedAreas,
  };
  if (redteam) model.redteam = buildRedteam(model);
  return model;
}

// ── Red-team stubs (S5.5, SHOULD) ───────────────────────────────────────

function buildRedteam(model) {
  const surfaces = Object.fromEntries(model.entry_points.map((e) => [e.trait, e.surface]));
  return model.techniques.slice(0, MAX_REDTEAM).map((t, i) => {
    const trait = t.entry_traits[0];
    return {
      id: `RT-${String(i + 1).padStart(2, '0')}`,
      technique: t.id,
      name: t.name,
      maturity: t.maturity,
      tactics: t.tactics.map((x) => x.name),
      entry_point: { trait, surface: surfaces[trait] },
      attempt: 'TODO: write the concrete attack input for this system through this entry point.',
      expected_defenses: t.mitigations
        .filter((m) => m.areas.length)
        .map((m) => ({ mitigation: m.id, areas: m.areas.map((a) => a.id) })),
      pass_criteria: 'Blocked or contained, no unauthorized tool call or data leaves the system, and the attempt appears in the audit log.',
      rerun_when: 'Tools, write access, memory, data sources or the model change.',
    };
  });
}

// ── Output ──────────────────────────────────────────────────────────────

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function mitigationLine(m, names) {
  if (!m.areas.length) return `   - ${m.id} ${names[m.id]} -> no Aigis area`;
  // `*` marks an area classify did not recommend for these traits (legend in Next).
  const areas = m.areas.map((a) => (a.recommended ? a.id : `${a.id}*`)).join(', ');
  return `   - ${m.id} ${names[m.id]} -> ${areas}`;
}

function formatThreatsText(model) {
  const names = model.mitigation_names;
  const L = [];
  L.push(`# Aigis threat model (MITRE ATLAS v${model.atlas.version})`);
  L.push('');
  L.push(`> ${model.atlas.disclaimer}`);
  L.push('> This is a starting list from your traits, not proof of coverage. Method: `aigis template threat-model`.');
  L.push('');
  L.push(`Traits (${model.traits.length}): ${model.traits.join(', ')}`);
  if (model.uncertain_traits.length) {
    L.push(`Uncertain traits (${model.uncertain_traits.length}, marked ⚠): ${model.uncertain_traits.join(', ')}`);
  }
  L.push('Missing a trait? Rerun with --traits (see `aigis traits`).');
  L.push('');

  L.push(`## Entry points (${model.entry_points.length})`);
  L.push('');
  if (!model.entry_points.length) {
    L.push('No ATLAS entry points are mapped for these traits.');
  } else {
    for (const e of model.entry_points) {
      L.push(`- ${e.uncertain ? '⚠ ' : ''}${e.trait}: ${e.surface} (${plural(e.techniques.length, 'technique')})`);
    }
  }
  L.push('');

  L.push(`## Techniques (showing ${model.techniques_shown} of ${model.techniques_in_scope}; Realized first, then by number of MITRE case studies)`);
  L.push('');
  if (!model.techniques.length) {
    L.push('- None for these traits.');
  }
  model.techniques.forEach((t, i) => {
    const tactics = t.tactics.map((x) => x.name).join(', ');
    L.push(`${i + 1}. ${t.id} ${t.name} [${t.maturity}] | tactic: ${tactics} | entry: ${t.entry_traits.join(', ')} | case studies: ${t.case_studies}`);
    if (!t.mitigations.length) {
      L.push('   - No mitigation listed by MITRE for this technique.');
      return;
    }
    const ordered = [...t.mitigations.filter((m) => m.areas.length), ...t.mitigations.filter((m) => !m.areas.length)];
    for (const m of ordered.slice(0, MAX_MITIGATION_LINES)) L.push(mitigationLine(m, names));
    if (ordered.length > MAX_MITIGATION_LINES) {
      L.push(`   - +${ordered.length - MAX_MITIGATION_LINES} more mitigations (use --json)`);
    }
  });
  L.push('');

  L.push(`## Gaps: mitigations MITRE links to these techniques that no Aigis area implements (${model.gaps.length})`);
  L.push('');
  if (!model.gaps.length) {
    L.push('- None for these techniques.');
  } else {
    for (const g of model.gaps.slice(0, MAX_GAP_LINES)) {
      L.push(`- ${g.id} ${names[g.id]} (MITRE links it to ${g.techniques.join(', ')})`);
    }
    if (model.gaps.length > MAX_GAP_LINES) L.push(`- +${model.gaps.length - MAX_GAP_LINES} more (use --json)`);
  }
  L.push('');

  if (model.redteam && model.redteam.length) {
    L.push(`## Red-team test stubs (${model.redteam.length})`);
    L.push('');
    for (const r of model.redteam) {
      const defenses = r.expected_defenses.length
        ? r.expected_defenses.map((d) => `${d.mitigation} -> ${d.areas.join(', ')}`).join('; ')
        : 'none with an Aigis area (see Gaps)';
      L.push(`${r.id} ${r.technique} ${r.name} [${r.maturity}] | entry: ${r.entry_point.trait} (${r.entry_point.surface})`);
      L.push(`   - Attempt: ${r.attempt}`);
      L.push(`   - Expected defenses: ${defenses}`);
      L.push(`   - Pass: ${r.pass_criteria}`);
      L.push(`   - Rerun when: ${r.rerun_when}`);
    }
    L.push('');
  }

  L.push('## Next');
  L.push('');
  L.push('- Fetch the areas named above with `aigis get <area>`. An area marked * is not in your brief: classify did not recommend it for these traits.');
  L.push('- Fill in the method: `aigis template threat-model`.');
  if (!Object.hasOwn(model, 'redteam')) L.push('- Test-case stubs: rerun with `--redteam`.');
  L.push('- Rerun when you add tools, write access, memory or a data source, before launch, and after an incident.');
  return `${L.join('\n')}\n`;
}

function formatThreatsJSON(model) {
  return `${JSON.stringify(model, null, 2)}\n`;
}

/** The single stderr line for a catalog or entry-point failure (S5.6, exit 2). */
function catalogErrorLine(err) {
  return `ATLAS catalog unavailable: ${err.file} ${err.code}. Reinstall the aigis package.`;
}

module.exports = {
  DEFAULT_TOP,
  MAX_TOP,
  ThreatsInputError,
  AtlasCatalogError: atlas.AtlasCatalogError,
  parseTop,
  resolveThreatTraits,
  buildThreatModel,
  formatThreatsText,
  formatThreatsJSON,
  catalogErrorLine,
};
