/**
 * Special recognizers for overclaim patterns that can't be expressed as
 * "match-any-regex" rules. Called from auto-verify.js when a checklist has
 * an `overclaim` entry naming the recognizer.
 *
 * Each recognizer receives:
 *   - files: array of { path, content } pre-loaded by the scanner
 *   - ctx:   { rootDir, areaId, checkId }
 *
 * Each returns:
 *   { flagged: boolean, evidence: [ { file, line, snippet } ], notes: string }
 *
 * These are heuristics. Goal is to catch the common overclaim pattern, not
 * to be a full static analyzer. False negatives are acceptable; loud false
 * positives are not — when in doubt, return flagged=false with a note
 * explaining what was inconclusive.
 */

/**
 * kill_switch_restart_latched
 *
 * Baseline evidence: all three runs built env-var kill switches that meet
 * the literal "env variable" wording of V3 but are read only at module
 * load. Flipping them in production requires a restart, which defeats the
 * incident-response intent.
 *
 * Structural signals (any one = flag):
 *   (a) `@lru_cache` decorator on a function that returns Settings / settings
 *   (b) `settings = Settings()` or similar module-level instantiation AND
 *       the kill-switch flag is referenced as `settings.<flag>` in a
 *       handler (i.e. read from the cached object, not re-fetched per request)
 *   (c) A bare `KILL_SWITCH = os.getenv(...)` at module scope (value
 *       frozen at import)
 */
function killSwitchRestartLatched(files, ctx) {
  const evidence = [];
  const flagReasons = [];

  const killSwitchTokens = [
    /ai_system_enabled/i,
    /kill_switch/i,
    /KILL_SWITCH/,
    /feature_flag/i,
    /ai_enabled/i,
  ];

  // Signal (a): @lru_cache on a Settings-returning function
  for (const { path, content } of files) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (/@lru_cache\b/.test(lines[i])) {
        // Look at the next 5 lines for a function that returns Settings
        const follow = lines.slice(i + 1, i + 6).join('\n');
        if (/def\s+(get_)?settings\b|->\s*Settings\b|return\s+Settings\s*\(/.test(follow)) {
          evidence.push({
            file: path,
            line: i + 1,
            snippet: lines.slice(i, Math.min(i + 4, lines.length)).join('\n'),
          });
          flagReasons.push('@lru_cache on Settings retrieval (pydantic-settings cached at first call)');
        }
      }
    }
  }

  // Signal (b): module-level `settings = Settings()` AND a flag is read from it in a handler
  const moduleSettingsFiles = [];
  for (const { path, content } of files) {
    if (/^settings\s*=\s*Settings\s*\(\s*\)/m.test(content)) {
      moduleSettingsFiles.push(path);
    }
  }
  if (moduleSettingsFiles.length > 0) {
    // Check if any handler uses `settings.<kill_switch_flag>`
    for (const { path, content } of files) {
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/settings\.(ai_system_enabled|kill_switch|ai_enabled|feature_flag)/.test(line)
            && /^\s*if\s+not\s+settings\./.test(line) === false
            || /if\s+not\s+settings\.(ai_system_enabled|kill_switch|ai_enabled|feature_flag)/.test(line)) {
          evidence.push({
            file: path,
            line: i + 1,
            snippet: line.trim(),
          });
          flagReasons.push('Module-level `settings = Settings()` read inside handler (frozen at import)');
          break;
        }
      }
    }
  }

  // Signal (c): bare module-level os.getenv for a kill-switch variable
  for (const { path, content } of files) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Module-level (no leading indent) assignment from os.getenv for a kill-switch-named var
      if (/^(KILL_SWITCH|AI_ENABLED|AI_SYSTEM_ENABLED)\s*=\s*os\.getenv/.test(line)) {
        evidence.push({
          file: path,
          line: i + 1,
          snippet: line.trim(),
        });
        flagReasons.push('Module-level `<FLAG> = os.getenv(...)` (value frozen at import)');
      }
    }
  }

  // If the codebase has evidence of re-reading env per-request, partial exoneration
  let rereadsPerRequest = false;
  for (const { content } of files) {
    // Heuristic: os.getenv called inside a function whose body contains `async def` or a route decorator nearby
    // Keep simple: did we see any os.getenv inside a function body that looks like a handler?
    if (/@app\.(get|post|put|delete)|@router\.(get|post|put|delete)/.test(content)
        && /^(?!\s*#).*os\.getenv\s*\(\s*['"](?:AI_SYSTEM_ENABLED|KILL_SWITCH|AI_ENABLED)/m.test(content)) {
      rereadsPerRequest = true;
    }
  }

  const flagged = evidence.length > 0 && !rereadsPerRequest;
  return {
    flagged,
    evidence,
    notes: flagged
      ? `Kill switch appears restart-latched. Reasons: ${[...new Set(flagReasons)].join('; ')}. This meets Aigis V3 literal wording ("env variable") but cannot be toggled during a live incident without a process restart. Verify manually; if confirmed, mark PARTIAL rather than PASS.`
      : (evidence.length > 0
          ? 'Restart-latched signals present but counter-signals (per-request env reads) also found. Manual review recommended.'
          : 'No restart-latched signals detected (no @lru_cache on Settings, no bare module-level env reads of kill-switch var).'),
  };
}

/**
 * injection_log_only
 *
 * Baseline evidence: all three runs implemented an injection-pattern
 * detector whose callsite set a flag or logged, but continued execution
 * to the LLM call without blocking. That meets Aigis V5 literal wording
 * ("even if just logging") but is a logging feature, not a security
 * feature.
 *
 * Detection approach:
 *   1. Find the detector function name (regex for common names +
 *      SUSPICIOUS_PATTERNS module-level list).
 *   2. Find every callsite of that function.
 *   3. For each callsite, look at the next N lines up to a suitable
 *      boundary. If we see a control-flow break (raise, return,
 *      HTTPException, reject) that depends on the detector's return
 *      value BEFORE we see evidence of the LLM call continuing, the
 *      detector blocks — unflagged. Otherwise flag as log-only.
 */
function injectionLogOnly(files, ctx) {
  const evidence = [];
  const callsiteLog = [];

  // Matches common detector names: check_injection, detect_injection,
  // scan_injection, scan_prompt_injection, _scan_prompt_injection,
  // injection_check, injection_detect, run_injection_scan, etc.
  // Also matches direct uses of INJECTION_PATTERN.search / .match / .test / .exec.
  const detectorNameRegex = /\b_?(?:check|detect|scan|run|test|is)_?(?:prompt_?)?injection[a-z_]*\b|INJECTION_PATTERN\s*\.\s*(?:search|match|test|exec)/;

  for (const { path, content } of files) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip the definition of the detector itself
      if (/^\s*def\s+/.test(line) && detectorNameRegex.test(line)) continue;
      // Callsite: the detector is referenced (not as `def`)
      if (detectorNameRegex.test(line) && !/^\s*def\s+/.test(line) && !/^\s*from\s+|^\s*import\s+/.test(line)) {
        // This is a callsite. Inspect next 20 lines for block/continue pattern.
        const window = lines.slice(i, Math.min(i + 20, lines.length)).join('\n');
        // Strong signals the detector blocks on detection:
        //   - `raise HTTPException` / `raise ValueError` inside an `if ...flagged` / `if ...inj` block
        //   - `return <non-llm>` under `if ...flagged`
        //   - `reject`, `block` keywords
        const blockPatterns = [
          /if\s+(?:injection|inj|result|flagged|inject[a-z_]*)[\s\S]{0,120}?(?:raise|return|HTTPException|abort|reject|block)/i,
          /if\s+[^\n]*\[[\"']flagged[\"']\][\s\S]{0,120}?(?:raise|return|HTTPException|abort|reject|block)/i,
          /if\s+[^\n]*\.flagged[\s\S]{0,120}?(?:raise|return|HTTPException|abort)/i,
        ];
        let blocks = false;
        for (const pat of blockPatterns) {
          if (pat.test(window)) {
            blocks = true;
            break;
          }
        }

        callsiteLog.push({
          file: path,
          line: i + 1,
          snippet: line.trim(),
          blocks,
        });

        if (!blocks) {
          evidence.push({
            file: path,
            line: i + 1,
            snippet: line.trim() + `  // next 20 lines do not contain a control-flow break based on the detection result`,
          });
        }
      }
    }
  }

  const flagged = callsiteLog.length > 0 && callsiteLog.every((c) => !c.blocks);
  const partiallyFlagged = callsiteLog.some((c) => !c.blocks) && callsiteLog.some((c) => c.blocks);

  let notes;
  if (callsiteLog.length === 0) {
    notes = 'No injection detector callsites found (the detector may not be invoked, or the scanner could not identify it).';
  } else if (flagged) {
    notes = `${callsiteLog.length} callsite(s) of the injection detector found; none branch on the result. Meets Aigis V5 literal wording ("even if just logging") but the LLM call still runs on flagged inputs. Verify manually; if confirmed, mark PARTIAL rather than PASS.`;
  } else if (partiallyFlagged) {
    notes = `Some callsites block on detection, others do not. Review the non-blocking ones.`;
  } else {
    notes = 'All callsites of the injection detector branch on the result (raise/return/reject). No log-only pattern detected.';
  }

  return {
    flagged: flagged || partiallyFlagged,
    evidence,
    notes,
  };
}

const REGISTRY = {
  kill_switch_restart_latched: killSwitchRestartLatched,
  injection_log_only: injectionLogOnly,
};

module.exports = { REGISTRY };
