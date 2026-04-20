/**
 * `aigis build "<description>"` — Step 8.
 *
 * Pure functions. No I/O beyond reading the canonical content tree (which
 * `lib/fetch.js` already does). The CLI wrapper in bin/aigis.js handles the
 * interactive prompt loop, --confirm/--reject flags, TTY detection, and stdout.
 *
 * Outputs:
 *   - buildBrief({...}) → { brief, meta }   for Shape B (default)
 *   - buildList({...})  → string             for Shape A (--list)
 *
 * Design decisions worth flagging in code (see Step 8 design proposal):
 *   - Description is normalized (trim, collapse whitespace, strip trailing
 *     punctuation, lowercase) BEFORE classify and BEFORE display, so
 *     "Customer Chatbot" and "customer chatbot" produce byte-identical briefs.
 *   - Trigger IDs in the brief use a human-readable t-<slug> form (e.g.
 *     `t-influence`) derived from the phrase, not the numeric ids that
 *     `lib/keywords.js` emits. The CLI translates --confirm/--reject flag
 *     values back to numeric before calling applyConfirmations.
 *   - Uncertain traits (low-confidence triggers the user marked `unsure`, or
 *     the non-TTY default) are *included* in the trait set passed to classify
 *     — they affect area selection — and are flagged with ⚠ in the brief.
 *     This is a deliberate divergence from Step 6's default-reject behavior
 *     in `aigis classify`. See design proposal §3.
 *   - Hard char cap (default 20,000). Throws BriefTooLargeError; never
 *     produces a partial brief.
 */

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { classify, ALL_TRAITS } = require('./classify');
const { detectTraitsFromText, applyConfirmations } = require('./keywords');
const { get: fetchAreas, getInfra } = require('./fetch');

const CONTENT_DIR = path.join(__dirname, '..', 'content');

// Caps per mode (Step 8 design proposal addendum):
//   AUTO:    try full at 120k; if exceeded, silently fall back to compact.
//   FULL:    hard fail at 200k.
//   COMPACT: no cap (it is pointer-only and small by construction).
const AUTO_FULL_CAP = 120000;
const FULL_HARD_CAP = 200000;

class BriefTooLargeError extends Error {
  constructor(charCount, charCap, areas) {
    super(
      `Brief is ${charCount} chars; cap is ${charCap}. Your description matched ` +
      `${areas.length} area${areas.length === 1 ? '' : 's'} (${areas.join(', ')}). ` +
      `Try a more focused description, or split the build into per-domain runs. ` +
      `To see what would be included without rendering: aigis build "..." --list`
    );
    this.name = 'BriefTooLargeError';
    this.charCount = charCount;
    this.charCap = charCap;
    this.areas = areas;
  }
}

/**
 * Normalize a user-provided description.
 *   - trim leading/trailing whitespace
 *   - collapse runs of internal whitespace to a single space
 *   - strip trailing .!? punctuation
 *   - lowercase
 *
 * Determinism contract: any two inputs that normalize to the same string
 * MUST produce byte-identical briefs (modulo the timestamp line, which the
 * test suite masks).
 */
function normalizeDescription(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/, '')
    .toLowerCase();
}

/**
 * Convert a trigger phrase into a human-readable id like `t-influence`.
 * Slug rules: lowercase, non-alphanumerics → '-', collapse multiple '-',
 * trim leading/trailing '-'. Max 24 chars (longer phrases get truncated
 * cleanly at a word boundary).
 *
 * If two low-confidence triggers in the same detection produce the same
 * slug, the second gets a `-2` suffix, third `-3`, etc. Caller is
 * responsible for passing all slugs through assignUniqueSlugs() to handle
 * collisions deterministically.
 */
function phraseToSlug(phrase) {
  let slug = phrase
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (slug.length > 24) {
    // truncate at the last word boundary within 24 chars
    const truncated = slug.slice(0, 24);
    const lastDash = truncated.lastIndexOf('-');
    slug = lastDash > 0 ? truncated.slice(0, lastDash) : truncated;
  }
  return `t-${slug || 'trigger'}`;
}

function assignUniqueSlugs(lowConfMatches) {
  // Returns parallel arrays: { numericId, slug, phrase, ... } per match.
  const slugCounts = new Map();
  return lowConfMatches.map((m) => {
    const baseSlug = phraseToSlug(m.phrase);
    const count = slugCounts.get(baseSlug) || 0;
    slugCounts.set(baseSlug, count + 1);
    const slug = count === 0 ? baseSlug : `${baseSlug}-${count + 1}`;
    return { ...m, slug };
  });
}

/**
 * Strip YAML frontmatter from a file's content. Used to inline area + infra
 * markdown into the brief without per-section frontmatter noise.
 */
function stripFrontmatterRaw(content) {
  if (!content.startsWith('---\n')) return content.trim();
  const end = content.indexOf('\n---\n', 4);
  if (end === -1) return content.trim();
  return content.slice(end + 5).trim();
}

/**
 * Parse the "Related infrastructure" pointer block from an area's content.
 * Returns the list of infra ids referenced (in order, deduped).
 *
 * Pointer block format (canonical, established in Step 7):
 *   ## Related infrastructure
 *
 *   - `aigis infra <id>` — explanation
 *   - `aigis infra <id>` — explanation
 *
 * If an area has no such block, returns [].
 */
function extractInfraReferences(areaContent) {
  const infraIds = [];
  const seen = new Set();
  const blockMatch = areaContent.match(/##\s+Related infrastructure\s*\n([\s\S]*?)(?:\n##\s|$)/);
  if (!blockMatch) return infraIds;
  const lineRe = /aigis infra ([a-z0-9][a-z0-9-]*)/gi;
  let m;
  while ((m = lineRe.exec(blockMatch[1])) !== null) {
    const id = m[1].toLowerCase();
    if (!seen.has(id)) {
      seen.add(id);
      infraIds.push(id);
    }
  }
  return infraIds;
}

/**
 * Resolve traits + decisions into the final classify input.
 *
 * decisionMap shape: { '<numericId>': 'yes' | 'no' | 'unsure' }
 *
 * Returns:
 *   confirmedTraits: traits from high-confidence + low-conf with 'yes' decision
 *   uncertainTraits: traits from low-conf with 'unsure' decision (kept distinct
 *                    so the brief can flag them with ⚠)
 *   allTraits:       union — what gets passed to classify()
 *   userDecisions:   array preserving the per-trigger decisions for display
 */
function resolveTraits(detection, decisionMap, opts = {}) {
  const { uncertainAsIncluded = true } = opts;

  const confirmed = new Set(detection.traits_auto_applied);
  const uncertain = new Set();
  const userDecisions = [];

  for (const sug of detection.low_confidence_matches) {
    const raw = (decisionMap[sug.id] || (uncertainAsIncluded ? 'unsure' : 'no')).toLowerCase();
    let decision;
    if (raw === 'y' || raw === 'yes') decision = 'yes';
    else if (raw === 'n' || raw === 'no') decision = 'no';
    else decision = 'unsure';
    userDecisions.push({ ...sug, user_decision: decision });
    if (decision === 'yes') {
      for (const t of sug.traits) confirmed.add(t);
    } else if (decision === 'unsure') {
      for (const t of sug.traits) {
        if (!confirmed.has(t)) uncertain.add(t);
      }
    }
  }

  // A trait that is both confirmed and uncertain is treated as confirmed
  // (high-confidence wins; the uncertain branch was redundant).
  for (const t of confirmed) uncertain.delete(t);

  const all = new Set([...confirmed, ...uncertain]);
  return {
    confirmed_traits: [...confirmed].sort(),
    uncertain_traits: [...uncertain].sort(),
    all_traits: [...all].sort(),
    user_decisions: userDecisions,
  };
}

/**
 * Shape A — `aigis build --list` output (text). Includes trigger IDs so
 * users can pre-build --confirm/--reject flags without an interactive run.
 */
function buildList({ description } = {}) {
  const normalized = normalizeDescription(description);
  if (!normalized) {
    throw new Error('Provide a description in quotes. Example: aigis build "customer chatbot with RAG"');
  }
  const detection = detectTraitsFromText(normalized);
  const lowConfWithSlugs = assignUniqueSlugs(detection.low_confidence_matches);
  const detectionWithSlugs = { ...detection, low_confidence_matches: lowConfWithSlugs };
  const resolved = resolveTraits(detectionWithSlugs, {}, { uncertainAsIncluded: true });
  if (resolved.all_traits.length === 0) {
    throw new Error('No traits resolved from description. Try a more specific description, or use `aigis classify --traits ...` directly.');
  }
  const cls = classify(resolved.all_traits);
  const areas = cls.implement_files;

  // Collect referenced infra (best-effort; missing files are skipped quietly).
  const infraIds = collectInfraReferences(areas);

  const lines = [];
  lines.push(`Description: ${normalized}`);
  lines.push(`Risk tier: ${cls.risk_tier}`);
  lines.push('');
  lines.push(`Confirmed traits (${resolved.confirmed_traits.length}):`);
  lines.push(`  ${resolved.confirmed_traits.join(', ') || '(none)'}`);
  lines.push('');
  lines.push(`Uncertain traits (${resolved.uncertain_traits.length}):`);
  if (lowConfWithSlugs.length === 0) {
    lines.push('  (none)');
  } else {
    for (const m of lowConfWithSlugs) {
      lines.push(`  [${m.slug}] ${m.traits.join(', ')}  ← "${m.phrase}"`);
    }
    lines.push('');
    lines.push(`Pre-build flags (run non-interactively):`);
    const slugs = lowConfWithSlugs.map((m) => m.slug);
    lines.push(`  aigis build "${normalized}" --confirm ${slugs.join(',')}`);
    lines.push(`  aigis build "${normalized}" --reject ${slugs.join(',')}`);
  }
  lines.push('');
  lines.push(`Recommended areas (${areas.length}):`);
  for (const a of areas) lines.push(`  aigis get ${a}`);
  if (infraIds.length > 0) {
    lines.push('');
    lines.push(`Referenced infrastructure (${infraIds.length}):`);
    for (const i of infraIds) lines.push(`  aigis infra ${i}`);
  }
  if (cls.templates.length > 0) {
    lines.push('');
    lines.push(`Documentation templates (${cls.templates.length}):`);
    for (const t of cls.templates) lines.push(`  aigis template ${t}`);
  }
  return lines.join('\n') + '\n';
}

function collectInfraReferences(areas) {
  const infraIds = [];
  const seen = new Set();
  for (const area of areas) {
    let content;
    try {
      content = fs.readFileSync(path.join(CONTENT_DIR, 'skills', 'areas', `${area}.md`), 'utf8');
    } catch (_) {
      continue; // missing area file — caller will surface this elsewhere
    }
    for (const id of extractInfraReferences(content)) {
      if (!seen.has(id)) {
        seen.add(id);
        infraIds.push(id);
      }
    }
  }
  return infraIds;
}

/**
 * Read the YAML frontmatter `title` field from an area or infra file.
 * Returns the file id as fallback if no title is set or the file is unreadable.
 */
function readTitle(subdir, id) {
  try {
    const raw = fs.readFileSync(path.join(CONTENT_DIR, subdir, `${id}.md`), 'utf8');
    const parsed = matter(raw);
    return parsed.data && parsed.data.title ? String(parsed.data.title) : id;
  } catch (_) {
    return id;
  }
}

/**
 * Shared header + instructions + verification — used by both full and compact
 * briefs. Returns an array of section strings (joined with '\n' by the caller).
 */
function renderCommonSections({
  normalized, version, ts, modeNote, cls, resolved, areas, infraIds,
}) {
  const sections = [];

  sections.push(`# Aigis governance brief`);
  sections.push('');
  sections.push(`> Generated by \`aigis build "${normalized}"\``);
  sections.push(`> aigis ${version} — generated ${ts}`);
  if (modeNote) sections.push(`> ${modeNote}`);
  sections.push(`> Determinism note: same description + same trait decisions produces byte-identical brief (timestamp masked).`);
  sections.push('');

  sections.push(`## Input`);
  sections.push('');
  sections.push(`- Description: \`${normalized}\``);
  sections.push(`- Risk tier: **${cls.risk_tier}** _(${cls.reason})_`);
  sections.push(`- Confirmed traits (${resolved.confirmed_traits.length}): ${resolved.confirmed_traits.map((t) => `\`${t}\``).join(', ') || '(none)'}`);
  if (resolved.uncertain_traits.length > 0) {
    sections.push(`- Uncertain traits (${resolved.uncertain_traits.length}, marked ⚠ in this brief):`);
    for (const t of resolved.uncertain_traits) {
      sections.push(`  - ⚠ \`${t}\` — surfaced from a low-confidence trigger; treat as *possibly applicable*. Ask the user before assuming.`);
    }
  } else {
    sections.push(`- Uncertain traits (0)`);
  }
  sections.push('');

  sections.push(`## Instructions for the agent`);
  sections.push('');
  sections.push(`The following are governance areas Aigis identified based on the description above. **Treat them as a starting point, not a closed list.**`);
  sections.push('');
  sections.push(`1. Verify these match your understanding of *this* codebase before implementing. If any area clearly does not apply (e.g. \`pii-handling\` for a system that genuinely handles no user data), say so to the user and skip it with a written reason.`);
  sections.push(`2. If the codebase reveals concerns Aigis missed (a webhook surface, a privileged tool the LLM can call, a regulated jurisdiction), add the matching area. Run \`aigis search --list\` to see what's available.`);
  sections.push(`3. For each area below, follow the procedure step by step. Honor every **verification checkpoint** — those are not suggestions.`);
  sections.push(`4. Run \`aigis verify <area> --auto .\` after implementing each area. Fix any FAIL or OVERCLAIM before moving on.`);
  sections.push(`5. For uncertain traits (⚠ above), pause before implementing the dependent area and ask the user to confirm it applies.`);
  sections.push('');

  return sections;
}

function renderVerificationSection({ areas, resolved, cls }) {
  const sections = [];
  sections.push(`## Verification`);
  sections.push('');
  sections.push(`After implementing the areas above, the agent should confirm:`);
  sections.push('');
  sections.push(`- [ ] Every area's verification checkpoints pass.`);
  for (const area of areas) {
    sections.push(`- [ ] \`aigis verify ${area} --auto .\` returns no FAIL or OVERCLAIM.`);
  }
  sections.push(`- [ ] If any area was added or removed from the recommended set, document the reason in the PR description.`);
  if (resolved.uncertain_traits.length > 0) {
    sections.push(`- [ ] Uncertain trait${resolved.uncertain_traits.length === 1 ? '' : 's'} (${resolved.uncertain_traits.map((t) => `\`${t}\``).join(', ')}) confirmed or rejected with the user before relevant code paths shipped.`);
  }
  if (cls.templates.length > 0) {
    sections.push(`- [ ] Documentation templates generated:`);
    for (const t of cls.templates) {
      sections.push(`  - [ ] \`aigis template ${t}\``);
    }
  }
  sections.push('');
  sections.push(`---`);
  sections.push('');
  sections.push(`*Generated by aigis. This brief is content, not a scaffold — Aigis writes nothing into your project. The agent and the user remain responsible for what ships.*`);
  sections.push('');
  return sections;
}

/**
 * Compact mode — pointer-only brief. ~3-5k chars regardless of area count.
 * Used when --compact is passed, or as the auto-fallback when the full brief
 * would exceed AUTO_FULL_CAP.
 */
function buildCompact({
  description,
  decisions = {},
  timestamp = null,
  versionString = null,
  fellBackFromFull = false,    // if true, header notes the auto-fallback
} = {}) {
  const prep = prepareBriefInputs({ description, decisions });
  const { normalized, resolved, cls, areas, infraIds, lowConfWithSlugs } = prep;
  const ts = (timestamp || new Date()).toISOString();
  const version = versionString || readPackageVersion();

  const modeNote = fellBackFromFull
    ? `Compact mode (auto-fallback): full brief would exceed ${AUTO_FULL_CAP.toLocaleString()} chars. Run \`aigis build "${normalized}" --full\` to force inlined content; you may need to split into per-domain runs.`
    : `Compact mode: pointer-only. Run \`aigis build "${normalized}" --full\` to inline procedure content.`;

  const sections = renderCommonSections({ normalized, version, ts, modeNote, cls, resolved, areas, infraIds });

  // ─── Areas (pointers) ──────────────────────────────────────────────────
  sections.push(`## Areas (${areas.length})`);
  sections.push('');
  sections.push(`For each area below, run \`aigis get <area>\` to fetch the full procedure, then implement step by step. Run \`aigis verify <area> --auto .\` after.`);
  sections.push('');
  let i = 1;
  for (const area of areas) {
    const title = readTitle(path.join('skills', 'areas'), area);
    sections.push(`${i}. **${area}** — ${title}`);
    sections.push(`   - Fetch:  \`aigis get ${area}\``);
    sections.push(`   - Verify: \`aigis verify ${area} --auto .\``);
    i++;
  }
  sections.push('');

  // ─── Infrastructure (pointers) ─────────────────────────────────────────
  if (infraIds.length > 0) {
    sections.push(`## Infrastructure (${infraIds.length})`);
    sections.push('');
    sections.push(`The areas above reference these infrastructure files. Fetch as needed:`);
    sections.push('');
    for (const id of infraIds) {
      const title = readTitle(path.join('skills', 'infrastructure'), id);
      sections.push(`- \`aigis infra ${id}\` — ${title}`);
    }
    sections.push('');
  }

  sections.push(...renderVerificationSection({ areas, resolved, cls }));

  const brief = sections.join('\n');
  return {
    brief,
    meta: makeMeta({ prep, brief, mode: 'compact', cap: null, ts, version, fellBackFromFull }),
  };
}

/**
 * Shape B — full consolidated brief with inlined area + infra content.
 */
function buildFull({
  description,
  decisions = {},
  charCap = FULL_HARD_CAP,    // dispatcher overrides this to AUTO_FULL_CAP for auto mode
  timestamp = null,
  versionString = null,
} = {}) {
  const prep = prepareBriefInputs({ description, decisions });
  const { normalized, resolved, cls, areas, infraIds, lowConfWithSlugs } = prep;
  const ts = (timestamp || new Date()).toISOString();
  const version = versionString || readPackageVersion();

  const sections = renderCommonSections({ normalized, version, ts, modeNote: null, cls, resolved, areas, infraIds });

  // ─── Areas (inlined) ───────────────────────────────────────────────────
  sections.push(`## Areas`);
  sections.push('');
  let i = 1;
  for (const area of areas) {
    let raw;
    try {
      raw = fs.readFileSync(path.join(CONTENT_DIR, 'skills', 'areas', `${area}.md`), 'utf8');
    } catch (_) {
      continue;
    }
    const stripped = stripFrontmatterRaw(raw);
    sections.push(`### ${i}. ${area}`);
    sections.push('');
    sections.push(stripped);
    sections.push('');
    sections.push('---');
    sections.push('');
    i++;
  }

  // ─── Infrastructure (inlined) ──────────────────────────────────────────
  if (infraIds.length > 0) {
    sections.push(`## Infrastructure`);
    sections.push('');
    sections.push(`The areas above reference these infrastructure files. Apply whichever shape (from-scratch / existing) matches the project.`);
    sections.push('');
    for (const id of infraIds) {
      let raw;
      try {
        raw = getInfra(id);
      } catch (_) {
        continue;
      }
      const stripped = stripFrontmatterRaw(raw);
      sections.push(`### ${id}`);
      sections.push('');
      sections.push(stripped);
      sections.push('');
      sections.push('---');
      sections.push('');
    }
  }

  sections.push(...renderVerificationSection({ areas, resolved, cls }));

  const brief = sections.join('\n');

  if (brief.length > charCap) {
    throw new BriefTooLargeError(brief.length, charCap, areas);
  }

  return {
    brief,
    meta: makeMeta({ prep, brief, mode: 'full', cap: charCap, ts, version, fellBackFromFull: false }),
  };
}

/**
 * Dispatcher. mode = 'auto' (default) | 'full' | 'compact'.
 *
 *   auto:    try buildFull at AUTO_FULL_CAP; on overflow, fall back to compact
 *            with a stderr-bound warning (caller renders the warning).
 *   full:    buildFull at FULL_HARD_CAP. Throws BriefTooLargeError on overflow.
 *   compact: buildCompact (no cap concern).
 */
function buildBrief(opts = {}) {
  const mode = opts.mode || 'auto';
  if (mode === 'compact') {
    return { ...buildCompact(opts), mode: 'compact', auto_fallback: false };
  }
  if (mode === 'full') {
    return { ...buildFull({ ...opts, charCap: FULL_HARD_CAP }), mode: 'full', auto_fallback: false };
  }
  // auto
  try {
    const result = buildFull({ ...opts, charCap: AUTO_FULL_CAP });
    return { ...result, mode: 'full', auto_fallback: false };
  } catch (e) {
    if (!(e instanceof BriefTooLargeError)) throw e;
    const compact = buildCompact({ ...opts, fellBackFromFull: true });
    return {
      ...compact,
      mode: 'compact',
      auto_fallback: true,
      auto_fallback_full_chars: e.charCount,
      auto_fallback_full_cap: e.charCap,
    };
  }
}

/**
 * Shared input prep used by buildFull, buildCompact, and buildList. Centralizes
 * the normalize → detect → slug → resolve → classify pipeline so all three modes
 * see the same trait/area/infra outputs given the same input.
 */
function prepareBriefInputs({ description, decisions = {} }) {
  const normalized = normalizeDescription(description);
  if (!normalized) {
    throw new Error('Provide a description in quotes. Example: aigis build "customer chatbot with RAG"');
  }
  const detection = detectTraitsFromText(normalized);
  const lowConfWithSlugs = assignUniqueSlugs(detection.low_confidence_matches);
  const detectionWithSlugs = { ...detection, low_confidence_matches: lowConfWithSlugs };

  // Translate slug-keyed decisions back to numeric ids (CLI accepts both).
  const numericDecisions = {};
  for (const m of lowConfWithSlugs) {
    if (decisions[m.slug] != null) numericDecisions[m.id] = decisions[m.slug];
    else if (decisions[m.id] != null) numericDecisions[m.id] = decisions[m.id];
  }

  const resolved = resolveTraits(detectionWithSlugs, numericDecisions, { uncertainAsIncluded: true });
  if (resolved.all_traits.length === 0) {
    throw new Error('No traits resolved from description. Try a more specific description, or use `aigis classify --traits ...` directly.');
  }

  const cls = classify(resolved.all_traits);
  const areas = cls.implement_files;
  const infraIds = collectInfraReferences(areas);

  return { normalized, raw_input: description, detection, lowConfWithSlugs, resolved, cls, areas, infraIds };
}

function makeMeta({ prep, brief, mode, cap, ts, version, fellBackFromFull }) {
  const { normalized, raw_input, resolved, cls, areas, infraIds, lowConfWithSlugs } = prep;
  return {
    mode,
    auto_fallback: fellBackFromFull,
    normalized_description: normalized,
    input_was_normalized: normalized !== raw_input,
    raw_input,
    confirmed_traits: resolved.confirmed_traits,
    uncertain_traits: resolved.uncertain_traits,
    all_traits: resolved.all_traits,
    risk_tier: cls.risk_tier,
    areas,
    infra: infraIds,
    templates: cls.templates,
    char_count: brief.length,
    char_cap: cap,
    low_confidence_matches: lowConfWithSlugs.map((m) => ({
      slug: m.slug,
      phrase: m.phrase,
      traits: m.traits,
      confirmation_prompt: m.confirmation_prompt,
      notes: m.notes,
    })),
    user_decisions: resolved.user_decisions,
    generated_at: ts,
    version,
  };
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

module.exports = {
  buildBrief,
  buildFull,
  buildCompact,
  buildList,
  normalizeDescription,
  phraseToSlug,
  assignUniqueSlugs,
  resolveTraits,
  extractInfraReferences,
  collectInfraReferences,
  BriefTooLargeError,
  AUTO_FULL_CAP,
  FULL_HARD_CAP,
};
