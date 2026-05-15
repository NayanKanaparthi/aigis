/**
 * v2.1 — Jurisdiction filtering for areas and brief content.
 *
 * The classify layer (lib/classify.js) is jurisdiction-blind: it produces
 * the universe of conceptually-relevant areas given a trait set. The
 * jurisdiction filter is applied at the consumer layer (CLI commands +
 * brief assembly) to enforce: "show EU AI Act content only to EU users."
 *
 * Three pure functions:
 *   - getUserJurisdictions(traits)
 *       → Set of jurisdiction codes derived from `jurisdiction-*` traits
 *
 *   - filterAreasByJurisdiction(areas, userJurisdictions)
 *       → Drops areas whose frontmatter declares a `jurisdiction:` list
 *         that does not intersect with userJurisdictions. Areas without
 *         a jurisdiction field are universal — kept regardless.
 *
 *   - stripJurisdictionGatedSections(content, userJurisdictions)
 *       → Removes `## EU AI Act extensions` heading sections from area
 *         content when user is not in EU jurisdiction. Convention: that
 *         specific heading is the marker for jurisdiction-gated content
 *         inside otherwise-universal areas.
 *
 * No I/O. No global state. Same inputs → same outputs.
 */

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const AREAS_DIR = path.join(__dirname, '..', 'content', 'skills', 'areas');

// Map from trait id → jurisdiction code stored in frontmatter `jurisdiction:`.
// The trait `jurisdiction-eu` corresponds to the area frontmatter value `eu`.
// Add new mappings here as new jurisdictions are introduced.
const TRAIT_TO_JURISDICTION = {
  'jurisdiction-eu': 'eu',
  'jurisdiction-us-regulated': 'us-regulated',
  // 'jurisdiction-global' deliberately omitted: it is a meta-trait declaring
  // worldwide scope and does not gate any specific jurisdiction-tagged area.
};

/**
 * Derive the user's jurisdiction set from their resolved trait set.
 * Returns a Set<string> of jurisdiction codes (matching what frontmatter
 * `jurisdiction:` arrays use).
 */
function getUserJurisdictions(traits) {
  const out = new Set();
  for (const t of traits || []) {
    const j = TRAIT_TO_JURISDICTION[t];
    if (j) out.add(j);
  }
  return out;
}

/**
 * Read an area's frontmatter `jurisdiction:` field. Returns:
 *   - null  if the area has no jurisdiction field (universal)
 *   - Array<string>  if it has one (gated)
 *   - null  on missing file or parse failure (fail-open: don't drop areas
 *           because of an I/O quirk; classify already pulled them)
 */
function readAreaJurisdictions(areaId) {
  try {
    const filepath = path.join(AREAS_DIR, `${areaId}.md`);
    if (!fs.existsSync(filepath)) return null;
    const fm = matter(fs.readFileSync(filepath, 'utf8')).data;
    if (!fm.jurisdiction) return null;
    return Array.isArray(fm.jurisdiction) ? fm.jurisdiction : null;
  } catch (_) {
    return null;
  }
}

/**
 * Filter an array of area ids by the user's jurisdiction set.
 * - Areas with no `jurisdiction:` frontmatter field are kept (universal).
 * - Areas with `jurisdiction:` are kept only if at least one of their
 *   declared jurisdictions is in userJurisdictions.
 *
 * Returns a new array preserving original order.
 */
function filterAreasByJurisdiction(areas, userJurisdictions) {
  const userJ = userJurisdictions instanceof Set
    ? userJurisdictions
    : new Set(userJurisdictions || []);
  return areas.filter((area) => {
    const declared = readAreaJurisdictions(area);
    if (!declared) return true; // universal area
    return declared.some((j) => userJ.has(j));
  });
}

/**
 * Convention-based filter: removes the `## EU AI Act extensions` heading
 * section (and everything beneath it until the next `## ` heading or EOF)
 * from area content when the user is not in EU jurisdiction.
 *
 * If user IS in EU jurisdiction, content is returned unchanged.
 *
 * Used by brief assembly when inlining existing-area content for
 * non-EU users — strips the EU-specific extension while preserving the
 * universal procedure.
 */
function stripJurisdictionGatedSections(content, userJurisdictions) {
  const userJ = userJurisdictions instanceof Set
    ? userJurisdictions
    : new Set(userJurisdictions || []);
  if (userJ.has('eu')) return content; // EU user — keep the section
  // Line-by-line walker: enter "skip mode" on `## EU AI Act extensions`,
  // exit when the next `## ` heading appears (any other H2). Handles both
  // mid-document and EOF cases without relying on `\Z` (Python-only).
  const lines = content.split('\n');
  const out = [];
  let inEuSection = false;
  for (const line of lines) {
    if (/^## EU AI Act extensions\s*$/.test(line)) {
      inEuSection = true;
      continue;
    }
    if (inEuSection && /^## /.test(line)) {
      inEuSection = false;
    }
    if (!inEuSection) out.push(line);
  }
  // Collapse 3+ consecutive newlines down to 2 (cleanup after removal).
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

module.exports = {
  TRAIT_TO_JURISDICTION,
  getUserJurisdictions,
  readAreaJurisdictions,
  filterAreasByJurisdiction,
  stripJurisdictionGatedSections,
};
