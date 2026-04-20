/**
 * Resolver: maps natural-language descriptions to traits via the trigger map
 * defined in content/resolvers/triggers.json.
 *
 * Two tiers (per the locked tier rule in triggers.json):
 *   high_confidence: phrase implies traits unconditionally → auto-apply.
 *   low_confidence:  phrase implies traits only sometimes → return as a
 *                    suggestion with a confirmation_prompt; the caller decides
 *                    whether to add the trait based on user input.
 *
 * Matching: case-insensitive substring match against the input text. Multi-word
 * phrases match contiguously. The same source file is read by the CLI here AND
 * embedded into IDE rules files by `aigis init` (see lib/init.js), so agents
 * and the CLI use the exact same map.
 */

const fs = require('fs');
const path = require('path');

const TRIGGERS_PATH = path.join(__dirname, '..', 'content', 'resolvers', 'triggers.json');

let _cache = null;
function loadTriggers() {
  if (!_cache) _cache = JSON.parse(fs.readFileSync(TRIGGERS_PATH, 'utf8'));
  return _cache;
}

/**
 * Scan `text` against the high-confidence trigger map. Returns:
 *   {
 *     high_confidence_matches: [
 *       { phrase: 'chatbot', traits: ['uses-llm', 'accepts-user-input'] },
 *       ...
 *     ],
 *     low_confidence_matches: [
 *       { id: '1', phrase: 'personalization', traits: ['processes-pii'],
 *         confirmation_prompt: '...', notes: '...' },
 *       ...
 *     ],
 *     traits_auto_applied: ['uses-llm', 'accepts-user-input', ...]    // unique union
 *   }
 *
 * The caller is responsible for handling the low_confidence_matches array
 * (interactive prompt, --confirm/--reject flags, default-reject in non-TTY).
 */
function detectTraitsFromText(text) {
  const triggers = loadTriggers();
  const textLower = text.toLowerCase();

  const highMatches = [];
  const autoTraits = new Set();
  for (const [phrase, entry] of Object.entries(triggers.high_confidence)) {
    if (textLower.includes(phrase.toLowerCase())) {
      highMatches.push({ phrase, traits: entry.traits.slice() });
      for (const t of entry.traits) autoTraits.add(t);
    }
  }

  const lowMatches = [];
  let nextId = 1;
  for (const [phrase, entry] of Object.entries(triggers.low_confidence)) {
    if (textLower.includes(phrase.toLowerCase())) {
      lowMatches.push({
        id: String(nextId++),
        phrase,
        traits: entry.traits.slice(),
        confirmation_prompt: entry.confirmation_prompt,
        notes: entry.notes,
      });
    }
  }

  return {
    high_confidence_matches: highMatches,
    low_confidence_matches: lowMatches,
    traits_auto_applied: [...autoTraits],
  };
}

/**
 * Resolve a list of low-confidence suggestions against user decisions.
 * decisions = { '1': 'yes' | 'no' | 'unsure', ... }  (id-keyed)
 * Returns the union of high-confidence + confirmed low-confidence traits.
 */
function applyConfirmations(detection, decisions = {}) {
  const final = new Set(detection.traits_auto_applied);
  const userDecisions = [];
  for (const sug of detection.low_confidence_matches) {
    const decision = (decisions[sug.id] || 'no').toLowerCase();
    userDecisions.push({ ...sug, user_decision: decision });
    if (decision === 'yes' || decision === 'y') {
      for (const t of sug.traits) final.add(t);
    }
  }
  return {
    final_traits: [...final].sort(),
    low_confidence_decisions: userDecisions,
  };
}

module.exports = { detectTraitsFromText, applyConfirmations, loadTriggers, TRIGGERS_PATH };
