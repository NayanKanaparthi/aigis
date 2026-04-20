#!/usr/bin/env node
/**
 * Populates step-6-resolvers/{baseline,step-6}/run-{1,2}/D{1..10}/ with:
 *   - description.txt    (the per-description prompt content)
 *   - prompt.txt         (the instruction to paste into Cursor)
 *   - .cursorrules       (condition-appropriate: baseline copies v1.0.3 rules
 *                         from a snapshot; step-6 runs `aigis init cursor`)
 *
 * Run this AFTER `aigis init` would produce the v2-step-6 .cursorrules content
 * (i.e., when `aigis` resolves to the v2-step-6 branch via npm link). The
 * baseline rules are read from a snapshot file in this repo so we can populate
 * baseline directories regardless of which version is currently linked.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const BENCH = '/Users/nayankanaparthi/Desktop/aigis-benchmarks/step-6-resolvers';
const DESCRIPTIONS_PATH = path.join(BENCH, 'descriptions.json');
const BASELINE_RULES_SNAPSHOT = path.join(__dirname, 'baseline-cursorrules.snapshot.txt');

const PROMPT_TEXT = `Read the description in description.txt. Use Aigis to figure out which traits apply to this system, then run \`aigis classify --traits <comma-separated> --json\` to get the recommended files. Save the trait list (one per line) to traits.txt and the classify JSON to classify.json. Do NOT implement any code. Just produce the trait list.\n`;

function generateStepSixCursorRules() {
  // Use the in-repo init logic to render the same content `aigis init cursor` would write.
  const { buildFullContent } = require(path.join(REPO_ROOT, 'lib', 'init'));
  const HEADER = `# Aigis core skill — installed by \`aigis init\`\n# Re-run \`aigis init <ide>\` to refresh this file when Aigis updates.\n# Area + workflow skills load on demand via the aigis CLI; they are NOT in this file.\n\n`;
  const { content } = buildFullContent();
  // buildFullContent already includes HEADER; just return content.
  return content;
}

function getBaselineCursorRules() {
  if (!fs.existsSync(BASELINE_RULES_SNAPSHOT)) {
    throw new Error(
      `Baseline rules snapshot missing at ${BASELINE_RULES_SNAPSHOT}.\n` +
      `Capture it once with: \n` +
      `  npm install -g @aigis-ai/cli@1.0.3\n` +
      `  TMPDIR=$(mktemp -d) && (cd $TMPDIR && aigis init cursor && cp .cursorrules ${BASELINE_RULES_SNAPSHOT})\n`
    );
  }
  return fs.readFileSync(BASELINE_RULES_SNAPSHOT, 'utf8');
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function populate(dir, descText, rulesContent) {
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, 'description.txt'), descText + '\n');
  fs.writeFileSync(path.join(dir, 'prompt.txt'), PROMPT_TEXT);
  fs.writeFileSync(path.join(dir, '.cursorrules'), rulesContent);
}

function main() {
  if (!fs.existsSync(DESCRIPTIONS_PATH)) {
    console.error(`descriptions.json missing at ${DESCRIPTIONS_PATH}`);
    process.exit(1);
  }
  const { descriptions } = JSON.parse(fs.readFileSync(DESCRIPTIONS_PATH, 'utf8'));
  if (!Array.isArray(descriptions) || descriptions.length !== 10) {
    console.error(`Expected exactly 10 descriptions; got ${descriptions ? descriptions.length : 0}`);
    process.exit(1);
  }

  const baselineRules = getBaselineCursorRules();
  const stepSixRules = generateStepSixCursorRules();

  let count = 0;
  for (const condition of ['baseline', 'step-6']) {
    const rules = condition === 'baseline' ? baselineRules : stepSixRules;
    for (const run of ['run-1', 'run-2']) {
      for (const desc of descriptions) {
        const dir = path.join(BENCH, condition, run, desc.id);
        populate(dir, desc.text, rules);
        count++;
      }
    }
  }
  console.log(`✓ Populated ${count} per-description directories under ${BENCH}/`);
}

if (require.main === module) main();
