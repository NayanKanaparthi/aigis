#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const { classify } = require('../lib/classify');
const { get, getTemplate, getAuditScan, getWorkflow, listWorkflows, getInfra, listInfras } = require('../lib/fetch');
const { buildBrief, buildList, BriefTooLargeError } = require('../lib/build');
const { verify } = require('../lib/fetch');
const { search, listAll } = require('../lib/search');
const { annotate, listAnnotations, clearAnnotation } = require('../lib/annotate');
const { init } = require('../lib/init');
const { detectTraitsFromText, applyConfirmations } = require('../lib/keywords');
const readline = require('readline');

const program = new Command();

program
  .name('aigis')
  .description('AI governance guardrails for coding agents')
  .version('2.0.0');

// ============================================================
// aigis classify
// ============================================================
program
  .command('classify')
  .description('Classify an AI system and get recommended governance files')
  .option('--traits <traits>', 'Comma-separated trait IDs (additive: combines with --description triggers if both passed)')
  .option('--json', 'Output as JSON (also enabled automatically when stdout is not a TTY)')
  .option('--confirm <ids>', 'Comma-separated low-confidence suggestion IDs to confirm (no interactive prompt)')
  .option('--reject <ids>', 'Comma-separated low-confidence suggestion IDs to reject (no interactive prompt)')
  .argument('[description]', 'Natural language description (resolved via content/resolvers/triggers.json)')
  .action(async (description, opts) => {
    // Three modes: --traits only, description only, both (additive).
    if (!opts.traits && !description) {
      console.error(chalk.red('Provide --traits, a quoted description, or both.'));
      console.log(chalk.dim('Example: aigis classify --traits uses-llm,processes-pii'));
      console.log(chalk.dim('Example: aigis classify "customer chatbot with RAG"'));
      console.log(chalk.dim('Example: aigis classify "chatbot" --traits handles-financial   (additive)\n'));
      process.exit(1);
    }

    // Auto-enable JSON when stdout is not a TTY (CI, piped, &c.)
    const jsonMode = !!opts.json || !process.stdout.isTTY;
    const traitsFromFlag = opts.traits ? opts.traits.split(',').map(t => t.trim()).filter(Boolean) : [];
    const confirmIds = opts.confirm ? new Set(opts.confirm.split(',').map(s => s.trim()).filter(Boolean)) : null;
    const rejectIds = opts.reject ? new Set(opts.reject.split(',').map(s => s.trim()).filter(Boolean)) : null;

    let detection = { high_confidence_matches: [], low_confidence_matches: [], traits_auto_applied: [] };
    if (description) {
      detection = detectTraitsFromText(description);
    }

    // Decide what to do with low-confidence suggestions.
    //   Priority: --confirm/--reject flags > interactive prompt (TTY only) > default reject.
    let decisions = {};
    let usedFlags = !!(confirmIds || rejectIds);

    if (description && detection.low_confidence_matches.length > 0) {
      if (usedFlags) {
        for (const sug of detection.low_confidence_matches) {
          if (confirmIds && confirmIds.has(sug.id)) decisions[sug.id] = 'yes';
          else if (rejectIds && rejectIds.has(sug.id)) decisions[sug.id] = 'no';
          else decisions[sug.id] = 'no';
        }
      } else if (jsonMode) {
        for (const sug of detection.low_confidence_matches) decisions[sug.id] = 'no';
      } else {
        // Interactive prompt
        decisions = await promptLowConfidence(detection);
      }
    }

    const resolved = applyConfirmations(detection, decisions);
    // Merge with --traits
    const finalTraits = [...new Set([...resolved.final_traits, ...traitsFromFlag])].sort();

    // Build a resolver report for transparency (in both JSON and text modes when description was given)
    const resolverReport = description ? {
      input: description,
      high_confidence_matches: detection.high_confidence_matches,
      low_confidence_suggestions: resolved.low_confidence_decisions,
      traits_from_description: resolved.final_traits,
      traits_from_flag: traitsFromFlag,
      final_traits: finalTraits,
    } : null;

    if (finalTraits.length === 0) {
      const msg = 'No traits resolved from description or --traits flag.';
      if (jsonMode) {
        console.log(JSON.stringify({ error: msg, resolver: resolverReport }, null, 2));
      } else {
        console.error(chalk.red(msg));
        console.log(chalk.dim('Run "aigis traits" to see available traits.\n'));
      }
      process.exit(1);
    }

    let result;
    try {
      result = classify(finalTraits);
    } catch (e) {
      console.error(chalk.red(e.message));
      process.exit(1);
    }
    if (resolverReport) result.resolver = resolverReport;

    if (jsonMode) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    // Formatted output. Show resolver section first if it was used.
    if (resolverReport) {
      console.log(chalk.bold('═══ AIGIS RESOLVER ═══'));
      if (detection.high_confidence_matches.length > 0) {
        console.log(chalk.bold('\nHigh-confidence triggers (auto-applied):'));
        for (const m of detection.high_confidence_matches) {
          console.log(`  ${chalk.green('✓')} "${m.phrase}" → ${m.traits.join(', ')}`);
        }
      }
      if (resolved.low_confidence_decisions.length > 0) {
        console.log(chalk.bold('\nLow-confidence decisions:'));
        for (const d of resolved.low_confidence_decisions) {
          const icon = d.user_decision === 'yes' ? chalk.green('✓') : d.user_decision === 'unsure' ? chalk.yellow('?') : chalk.dim('✗');
          console.log(`  ${icon} [${d.id}] "${d.phrase}" → ${d.traits.join(', ')}  (decision: ${d.user_decision})`);
        }
      }
      if (traitsFromFlag.length > 0) {
        console.log(chalk.bold(`\nAdded via --traits flag: ${traitsFromFlag.join(', ')}`));
      }
      console.log(chalk.bold(`\nFinal trait set (${finalTraits.length}): ${finalTraits.join(', ')}\n`));
      console.log(chalk.dim('═══════════════════════\n'));
    }

    const tierColor = result.risk_tier === 'HIGH' ? chalk.red : result.risk_tier === 'MEDIUM' ? chalk.yellow : chalk.green;
    console.log(`${chalk.bold('Risk tier:')} ${tierColor.bold(result.risk_tier)}`);
    console.log(`${chalk.bold('Reason:')} ${result.reason}\n`);

    if (result.warnings.length > 0) {
      for (const w of result.warnings) {
        console.log(chalk.yellow(`⚠ ${w}`));
      }
      console.log('');
    }

    console.log(chalk.bold(`Recommended areas (${result.implement_files.length}):`));
    for (const f of result.implement_files) {
      console.log(chalk.green(`  aigis get ${f}`));
    }

    if (result.templates.length > 0) {
      console.log(chalk.bold(`\nTemplates (${result.templates.length}):`));
      for (const t of result.templates) {
        console.log(chalk.yellow(`  aigis template ${t}`));
      }
    }

    if (result.guardrails_fired.length > 0) {
      console.log(chalk.bold('\nGuardrails fired:'));
      for (const g of result.guardrails_fired) {
        console.log(chalk.yellow(`  ${g.id}: ${g.action} — ${g.rationale}`));
      }
    }

    console.log(chalk.bold('\nVerify after implementation:'));
    for (const f of result.implement_files) {
      console.log(chalk.green(`  aigis verify ${f}`));
    }

    console.log(chalk.dim(`\nControls: ${result.controls.owasp.length} OWASP, ${result.controls.nist.length} NIST, ${result.controls.iso.length} ISO`));

    // Workflow suggestion. Step 5 ships only fastapi-llm; future workflows will
    // be matched heuristically against the trait set.
    console.log(chalk.bold('\nSuggested workflow:'));
    console.log(chalk.green('  aigis workflow fastapi-llm'));
    console.log(chalk.dim('  (canonical file layout + wiring contracts; see `aigis workflow --list` for others)'));
  });

// ============================================================
// aigis get
// ============================================================
program
  .command('get')
  .description('Fetch implementation pattern files')
  .option('--all', 'Fetch all implement files')
  .option('--lang <language>', 'Filter code blocks to one language. Accepts py, python, js, javascript, ts, typescript, go, rust.')
  .option('--context <context>', 'Filter patterns by system context. Accepts web, agentic, rag, batch. Patterns not listed for that context in content/index/context-rules.json are removed.')
  .option('--no-frontmatter', 'Strip YAML frontmatter')
  .argument('[files...]', 'File IDs to fetch')
  .action((files, opts) => {
    try {
      const content = get(files, opts);
      console.log(content);
    } catch (err) {
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  });

// ============================================================
// aigis verify
// ============================================================
program
  .command('verify')
  .description('Fetch verification checklists, or run deterministic auto-verify with --auto')
  .argument('<files...>', 'File IDs to verify')
  .option('--auto <path>', 'Run deterministic scanner against the project at <path> instead of returning the blank checklist')
  .option('--json', 'Output auto-verify results as JSON (only with --auto)')
  .action((files, opts) => {
    if (!opts.auto) {
      // Backward-compatible behavior: fetch the blank checklist markdown
      const content = verify(files);
      console.log(content);
      return;
    }

    // Auto-verify path
    const { autoVerifyArea, formatTextReport } = require('../lib/auto-verify');
    const projectDir = require('path').resolve(opts.auto);
    if (!require('fs').existsSync(projectDir)) {
      console.error(chalk.red(`Project path does not exist: ${projectDir}`));
      process.exit(1);
    }

    const results = [];
    for (const area of files) {
      try {
        const r = autoVerifyArea(area, projectDir);
        results.push(r);
      } catch (e) {
        console.error(chalk.red(`Error verifying "${area}": ${e.message}`));
        process.exit(1);
      }
    }

    if (opts.json) {
      console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
      return;
    }

    for (const r of results) {
      console.log(formatTextReport(r));
      if (results.length > 1) console.log('\n' + '─'.repeat(60) + '\n');
    }
  });

// ============================================================
// aigis template
// ============================================================
program
  .command('template')
  .description('Fetch compliance documentation templates')
  .argument('<templates...>', 'Template IDs')
  .action((templates) => {
    const content = getTemplate(templates);
    console.log(content);
  });

// ============================================================
// aigis workflow
// ============================================================
program
  .command('workflow')
  .description('Fetch the canonical file layout + wiring contracts for a project type')
  .argument('[type]', 'Workflow type (e.g. fastapi-llm). Omit + use --list to see available.')
  .option('--list', 'List available workflows')
  .action((type, opts) => {
    if (opts.list) {
      const workflows = listWorkflows();
      if (workflows.length === 0) {
        console.log(chalk.dim('No workflow skills found.'));
        return;
      }
      console.log(chalk.bold('Available workflows:\n'));
      for (const w of workflows) console.log(`  ${w}`);
      console.log(chalk.dim('\nFetch one with: aigis workflow <type>'));
      return;
    }
    if (!type) {
      console.error(chalk.red('Provide a workflow type or pass --list.'));
      console.log(chalk.dim('  aigis workflow fastapi-llm'));
      console.log(chalk.dim('  aigis workflow --list\n'));
      process.exit(1);
    }
    try {
      console.log(getWorkflow(type));
    } catch (err) {
      console.error(chalk.red(err.message));
      const workflows = listWorkflows();
      if (workflows.length > 0) {
        console.log(chalk.dim('\nAvailable workflows: ' + workflows.join(', ')));
      }
      process.exit(1);
    }
  });

// ============================================================
// aigis build
// ============================================================
program
  .command('build')
  .description('Compose a consolidated governance brief for a feature description')
  .argument('<description>', 'Plain-English description of what you are building (in quotes)')
  .option('--full', 'Force full inlined brief (hard cap at 200k chars)')
  .option('--compact', 'Force compact pointer-only brief (no auto-fallback, no size concern)')
  .option('--list', 'Shape A: print area names + traits + pre-built --confirm/--reject flags only')
  .option('--confirm <ids>', 'Comma-separated low-confidence trigger ids/slugs to confirm (no interactive prompt)')
  .option('--reject <ids>', 'Comma-separated low-confidence trigger ids/slugs to reject (no interactive prompt)')
  .option('--json', 'Output JSON (brief + meta) instead of plain markdown to stdout')
  .action(async (description, opts) => {
    if (opts.full && opts.compact) {
      console.error(chalk.red('Pass --full or --compact, not both.'));
      process.exit(1);
    }
    if (opts.list && (opts.full || opts.compact)) {
      console.error(chalk.red('--list is independent of --full/--compact; pass only one.'));
      process.exit(1);
    }

    // --list short-circuit (Shape A)
    if (opts.list) {
      try {
        process.stdout.write(buildList({ description }));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
      return;
    }

    // Decision pipeline matches `aigis classify`: --confirm/--reject flags > interactive (TTY) > non-TTY default-uncertain.
    const confirmIds = opts.confirm ? new Set(opts.confirm.split(',').map((s) => s.trim()).filter(Boolean)) : null;
    const rejectIds = opts.reject ? new Set(opts.reject.split(',').map((s) => s.trim()).filter(Boolean)) : null;

    if (confirmIds && rejectIds) {
      const overlap = [...confirmIds].filter((x) => rejectIds.has(x));
      if (overlap.length > 0) {
        console.error(chalk.red(`Trigger ${overlap.join(', ')} appears in both --confirm and --reject. Pick one.`));
        process.exit(1);
      }
    }

    // First pass: detect low-conf triggers so we know what to prompt for.
    let firstPass;
    try {
      firstPass = buildList({ description });    // cheap; runs the same pipeline
    } catch (err) {
      console.error(chalk.red(err.message));
      process.exit(1);
    }

    // Re-run prep to grab the slugs (buildList prints them but we need structured access).
    const { normalizeDescription } = require('../lib/build');
    const { detectTraitsFromText } = require('../lib/keywords');
    const { assignUniqueSlugs } = require('../lib/build');
    const normalized = normalizeDescription(description);
    const det = detectTraitsFromText(normalized);
    const lowConf = assignUniqueSlugs(det.low_confidence_matches);

    let decisions = {};
    const isTTY = !!process.stdout.isTTY && !!process.stdin.isTTY;
    const usedFlags = !!(confirmIds || rejectIds);

    if (lowConf.length > 0) {
      if (usedFlags) {
        for (const m of lowConf) {
          if (confirmIds && (confirmIds.has(m.slug) || confirmIds.has(m.id))) decisions[m.slug] = 'yes';
          else if (rejectIds && (rejectIds.has(m.slug) || rejectIds.has(m.id))) decisions[m.slug] = 'no';
          else decisions[m.slug] = 'unsure';   // default-include with uncertainty flag
        }
      } else if (isTTY) {
        decisions = await promptBuildLowConfidence(lowConf);
      } else {
        for (const m of lowConf) decisions[m.slug] = 'unsure';
      }
    }

    // Pick mode
    let mode = 'auto';
    if (opts.full) mode = 'full';
    else if (opts.compact) mode = 'compact';

    let result;
    try {
      result = buildBrief({ description, decisions, mode });
    } catch (err) {
      if (err instanceof BriefTooLargeError) {
        console.error(chalk.red(err.message));
        process.exit(2);
      }
      console.error(chalk.red(err.message));
      process.exit(1);
    }

    if (result.auto_fallback) {
      console.error(chalk.yellow(
        `Brief exceeded ${result.auto_fallback_full_cap.toLocaleString()} chars with full content inlined ` +
        `(${result.auto_fallback_full_chars.toLocaleString()} chars). Falling back to compact mode (pointers only). ` +
        `Run \`aigis build "${result.meta.normalized_description}" --full\` to force full content — you may need to ` +
        `split the build into per-domain runs if the brief is still too large.`
      ));
    }

    if (opts.json) {
      console.log(JSON.stringify({ brief: result.brief, meta: result.meta, mode: result.mode, auto_fallback: result.auto_fallback }, null, 2));
      return;
    }

    process.stdout.write(result.brief);
  });

// ============================================================
// aigis infra
// ============================================================
program
  .command('infra')
  .description('Fetch infrastructure setup content (rate-limiting, secrets, logging)')
  .argument('[area]', 'Infrastructure area (e.g. rate-limiting). Omit + use --list to see available.')
  .option('--list', 'List available infrastructure areas')
  .action((area, opts) => {
    if (opts.list) {
      const infras = listInfras();
      if (infras.length === 0) {
        console.log(chalk.dim('No infrastructure areas found.'));
        return;
      }
      console.log(chalk.bold('Available infrastructure areas:\n'));
      for (const i of infras) console.log(`  ${i}`);
      console.log(chalk.dim('\nFetch one with: aigis infra <area>'));
      return;
    }
    if (!area) {
      console.error(chalk.red('Provide an infrastructure area or pass --list.'));
      console.log(chalk.dim('  aigis infra rate-limiting'));
      console.log(chalk.dim('  aigis infra --list\n'));
      process.exit(1);
    }
    try {
      console.log(getInfra(area));
    } catch (err) {
      console.error(chalk.red(err.message));
      const infras = listInfras();
      if (infras.length > 0) {
        console.log(chalk.dim('\nAvailable areas: ' + infras.join(', ')));
      }
      process.exit(1);
    }
  });

// ============================================================
// aigis audit
// ============================================================
program
  .command('audit')
  .description('Audit an existing codebase for governance gaps')
  .option('--scan', 'Get structured discovery prompt (Phases 1-3: inventory, trait detection, classify handoff)')
  .option('--traits <traits>', 'Run scoped audit: classify + checklists only for recommended areas. Prints deterministic denominator.')
  .option('--json', 'Output as JSON')
  .action((opts) => {
    if (opts.scan) {
      const content = getAuditScan();
      console.log(content);
      return;
    }

    if (opts.traits) {
      const traits = opts.traits.split(',').map(t => t.trim());
      const classification = classify(traits);

      // Count checks per scoped area by parsing checklist rows (format: "| V<n> | ...").
      // This gives the deterministic denominator the agent must score against.
      const checklistsByArea = {};
      const perAreaCounts = {};
      let totalChecks = 0;
      for (const f of classification.implement_files) {
        const checklist = verify([f]);
        checklistsByArea[f] = checklist;
        const rowMatches = checklist.match(/^\| V\d+\b/gm) || [];
        perAreaCounts[f] = rowMatches.length;
        totalChecks += rowMatches.length;
      }
      const areasCsv = classification.implement_files.join(', ');
      const scoreLineTemplate = `Score: <P> / ${totalChecks} total checks across ${classification.implement_files.length} recommended areas (areas: ${areasCsv})`;

      if (opts.json) {
        console.log(JSON.stringify({
          classification,
          checklists: checklistsByArea,
          score_template: {
            total_checks: totalChecks,
            recommended_areas_count: classification.implement_files.length,
            recommended_areas: classification.implement_files,
            per_area_check_count: perAreaCounts,
            score_line_template: scoreLineTemplate,
          },
        }, null, 2));
        return;
      }

      // Formatted audit output
      const tierColor = classification.risk_tier === 'HIGH' ? chalk.red : classification.risk_tier === 'MEDIUM' ? chalk.yellow : chalk.green;
      console.log(chalk.bold('═══ AIGIS GOVERNANCE AUDIT (SCOPED) ═══\n'));
      console.log(`${chalk.bold('Risk tier:')} ${tierColor.bold(classification.risk_tier)}`);
      console.log(`${chalk.bold('Recommended areas:')} ${classification.implement_files.length}`);
      console.log(`${chalk.bold('Areas:')} ${areasCsv}`);
      console.log(`${chalk.bold('Total checks (deterministic denominator):')} ${totalChecks}\n`);

      console.log(chalk.bold('Instructions for agent:'));
      console.log(chalk.dim('Evaluate the existing codebase against each check below.'));
      console.log(chalk.dim('Mark PASS / FAIL / PARTIAL with evidence (file:line or "not found").'));
      console.log(chalk.dim('At the end of your report, emit this exact line (replace <P> with the PASS count):'));
      console.log(chalk.dim(`  ${scoreLineTemplate}\n`));

      for (const f of classification.implement_files) {
        console.log(checklistsByArea[f]);
        console.log('');
      }

      console.log(chalk.bold('═══ SCORING ═══'));
      console.log(`Denominator: ${totalChecks} total checks across ${classification.implement_files.length} recommended areas.`);
      console.log(`Areas: ${areasCsv}`);
      console.log(`Emit at end of report: ${chalk.bold(scoreLineTemplate)}`);

      if (classification.templates.length > 0) {
        console.log('\n' + chalk.bold('Required documentation:'));
        for (const t of classification.templates) {
          console.log(chalk.yellow(`  aigis template ${t}`));
        }
      }
      return;
    }

    console.error(chalk.red('Provide --scan or --traits.'));
    console.log(chalk.dim('  aigis audit --scan                    # get scan prompt'));
    console.log(chalk.dim('  aigis audit --traits uses-llm,...      # run audit\n'));
    process.exit(1);
  });

// ============================================================
// aigis search
// ============================================================
program
  .command('search')
  .description('Search across all content')
  .option('--list', 'List all available files')
  .argument('[query]', 'Search term')
  .action((query, opts) => {
    if (opts.list) {
      const results = listAll();
      console.log(chalk.bold('Available content:\n'));
      console.log(chalk.bold('Implement files (governance patterns):'));
      for (const r of results.implement) {
        console.log(`  ${chalk.cyan(r.id.padEnd(25))} ${r.title}`);
      }
      console.log(chalk.bold('\nTemplates (compliance documentation):'));
      for (const r of results.templates) {
        console.log(`  ${chalk.yellow(r.id.padEnd(25))} ${r.title}`);
      }
      console.log(chalk.bold('\nVerify checklists:'));
      console.log(chalk.dim('  (one per implement file, auto-fetched via aigis verify <id>)'));
      return;
    }

    if (!query) {
      console.error(chalk.red('Provide a search query or use --list.'));
      process.exit(1);
    }

    const results = search(query);
    if (results.length === 0) {
      console.log(chalk.dim('No results found for "' + query + '"'));
      return;
    }
    console.log(chalk.bold(`Results for "${query}":\n`));
    for (const r of results) {
      console.log(`  ${chalk.cyan(r.id.padEnd(25))} ${r.title}`);
      if (r.matched_controls.length > 0) {
        console.log(chalk.dim(`  ${''.padEnd(25)} controls: ${r.matched_controls.join(', ')}`));
      }
    }
  });

// ============================================================
// aigis annotate
// ============================================================
program
  .command('annotate')
  .description('Attach or manage local notes on content files')
  .option('--list', 'List all annotations')
  .option('--clear', 'Clear annotations for a file')
  .argument('[fileId]', 'File ID to annotate')
  .argument('[note]', 'Annotation text')
  .action((fileId, note, opts) => {
    if (opts.list) {
      const all = listAnnotations();
      if (Object.keys(all).length === 0) {
        console.log(chalk.dim('No annotations yet.'));
        return;
      }
      console.log(chalk.bold('Annotations:\n'));
      for (const [id, notes] of Object.entries(all)) {
        console.log(chalk.cyan(`  ${id}:`));
        for (const n of notes) {
          console.log(chalk.dim(`    "${n.note}" (${n.date})`));
        }
      }
      return;
    }

    if (!fileId) {
      console.error(chalk.red('Provide a file ID. Use --list to see annotations.'));
      process.exit(1);
    }

    if (opts.clear) {
      clearAnnotation(fileId);
      console.log(chalk.green(`Cleared annotations for ${fileId}`));
      return;
    }

    if (!note) {
      console.error(chalk.red('Provide a note in quotes.'));
      console.log(chalk.dim('Example: aigis annotate input-validation "Needs raw body for webhooks"'));
      process.exit(1);
    }

    annotate(fileId, note);
    console.log(chalk.green(`Annotation added to ${fileId}`));
  });

// ============================================================
// aigis init
// ============================================================
program
  .command('init')
  .description('Set up aigis for your IDE (writes core skill + resolver block)')
  .argument('<ide>', 'IDE to configure: cursor, claude-code, windsurf, copilot')
  .option('--refresh', 'Overwrite existing aigis content (destructive — use after Aigis updates or to fix a stale resolver block checksum)')
  .action((ide, opts) => {
    init(ide, { refresh: !!opts.refresh });
  });

// ============================================================
// aigis traits (convenience)
// ============================================================
program
  .command('traits')
  .description('List all available classification traits')
  .action(() => {
    console.log(chalk.bold('Available traits (22):\n'));
    const groups = {
      'AI architecture': ['uses-llm', 'uses-rag', 'uses-finetuned', 'uses-thirdparty-api', 'is-agentic', 'is-multimodal'],
      'Data sensitivity': ['processes-pii', 'handles-financial', 'handles-health', 'handles-proprietary', 'handles-minors'],
      'Impact scope': ['influences-decisions', 'accepts-user-input', 'is-external', 'is-internal', 'is-high-volume'],
      'Output type': ['generates-code', 'generates-content', 'multi-model-pipeline'],
      'Jurisdiction': ['jurisdiction-eu', 'jurisdiction-us-regulated', 'jurisdiction-global'],
    };
    for (const [group, traits] of Object.entries(groups)) {
      console.log(chalk.dim(`  ${group}:`));
      console.log(`  ${traits.map(t => chalk.cyan(t)).join(', ')}\n`);
    }
  });

// ── helper: interactive prompt for low-confidence triggers in `aigis build` ──
// Mirrors promptLowConfidence's vocabulary (y/n/u) but defaults to 'u' (unsure → include with ⚠ flag in brief), per Step 8 design.
async function promptBuildLowConfidence(lowConf) {
  const decisions = {};
  console.log(chalk.bold('\n═══ AIGIS BUILD — low-confidence triggers ═══'));
  console.log(chalk.dim(`Default for each is "unsure" → trait is included in the brief with a ⚠ flag for the agent to surface to you.\n`));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((res) => rl.question(q, res));

  for (const m of lowConf) {
    console.log(chalk.bold(`  [${m.slug}] "${m.phrase}"`));
    console.log(chalk.dim(`      Suggested traits: ${m.traits.join(', ')}`));
    console.log(`      ${m.confirmation_prompt}`);
    const ans = (await ask('      (y)es / (n)o / (u)nsure [u]: ')).trim().toLowerCase();
    let decision;
    if (ans === '' || ans === 'u' || ans === 'unsure') decision = 'unsure';
    else if (ans === 'y' || ans === 'yes') decision = 'yes';
    else if (ans === 'n' || ans === 'no') decision = 'no';
    else { console.log(chalk.dim(`      (unrecognized — defaulting to 'unsure')`)); decision = 'unsure'; }
    decisions[m.slug] = decision;
    console.log('');
  }
  rl.close();
  return decisions;
}

// ── helper: interactive prompt for low-confidence resolver suggestions ──
async function promptLowConfidence(detection) {
  const decisions = {};
  console.log(chalk.bold('\n═══ AIGIS RESOLVER ═══'));
  if (detection.high_confidence_matches.length > 0) {
    console.log(chalk.bold('\nHigh-confidence triggers (auto-applied):'));
    for (const m of detection.high_confidence_matches) {
      console.log(`  ${chalk.green('✓')} "${m.phrase}" → ${m.traits.join(', ')}`);
    }
  }
  console.log(chalk.bold(`\nLow-confidence triggers (need your input — ${detection.low_confidence_matches.length}):`));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((res) => rl.question(q, res));

  for (const sug of detection.low_confidence_matches) {
    console.log(chalk.bold(`\n  [${sug.id}] "${sug.phrase}"`));
    console.log(chalk.dim(`      Suggested traits: ${sug.traits.join(', ')}`));
    console.log(`      ${sug.confirmation_prompt}`);
    const ans = (await ask('      (y)es / (n)o / (u)nsure [n]: ')).trim().toLowerCase();
    let decision;
    if (ans === '' || ans === 'n' || ans === 'no') decision = 'no';
    else if (ans === 'y' || ans === 'yes') decision = 'yes';
    else if (ans === 'u' || ans === 'unsure') decision = 'unsure';
    else { console.log(chalk.dim(`      (unrecognized — defaulting to 'no')`)); decision = 'no'; }
    decisions[sug.id] = decision;
  }
  rl.close();
  console.log('');
  return decisions;
}

program.parse();
