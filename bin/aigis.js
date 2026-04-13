#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const { classify } = require('../lib/classify');
const { get, getTemplate, getAuditScan } = require('../lib/fetch');
const { verify } = require('../lib/fetch');
const { search, listAll } = require('../lib/search');
const { annotate, listAnnotations, clearAnnotation } = require('../lib/annotate');
const { init } = require('../lib/init');
const { detectTraitsFromText } = require('../lib/keywords');

const program = new Command();

program
  .name('aigis')
  .description('AI governance guardrails for coding agents')
  .version('1.0.3');

// ============================================================
// aigis classify
// ============================================================
program
  .command('classify')
  .description('Classify an AI system and get recommended governance files')
  .option('--traits <traits>', 'Comma-separated trait IDs')
  .option('--interactive', 'Confirm detected traits before classifying')
  .option('--json', 'Output as JSON')
  .argument('[description]', 'Natural language description (keyword matching)')
  .action((description, opts) => {
    let traits;

    if (opts.traits) {
      traits = opts.traits.split(',').map(t => t.trim());
    } else if (description) {
      const detected = detectTraitsFromText(description);
      if (opts.interactive) {
        console.log(chalk.bold('\nDetected traits from description:\n'));
        for (const { trait, keyword, confidence } of detected) {
          const icon = confidence === 'high' ? chalk.green('✓') : chalk.yellow('?');
          console.log(`  ${icon} ${chalk.cyan(trait)}  (matched: "${keyword}")`);
        }
        console.log(chalk.dim('\nTo classify with these traits, run:'));
        console.log(chalk.green(`  aigis classify --traits ${detected.map(d => d.trait).join(',')}\n`));
        console.log(chalk.dim('Add or remove traits as needed before running.\n'));
        return;
      }
      traits = detected.map(d => d.trait);
      if (traits.length === 0) {
        console.error(chalk.red('No traits detected from description.'));
        console.log(chalk.dim('Run "aigis traits" to see available traits, or use --traits flag.\n'));
        process.exit(1);
      }
      console.log(chalk.dim(`Detected traits: ${traits.join(', ')}\n`));
    } else {
      console.error(chalk.red('Provide --traits or a quoted description.'));
      console.log(chalk.dim('Example: aigis classify --traits uses-llm,processes-pii'));
      console.log(chalk.dim('Example: aigis classify "customer chatbot with RAG"\n'));
      process.exit(1);
    }

    let result;
    try {
      result = classify(traits);
    } catch (e) {
      console.error(chalk.red(e.message));
      process.exit(1);
    }

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    // Formatted output
    const tierColor = result.risk_tier === 'HIGH' ? chalk.red : result.risk_tier === 'MEDIUM' ? chalk.yellow : chalk.green;
    console.log(`${chalk.bold('Risk tier:')} ${tierColor.bold(result.risk_tier)}`);
    console.log(`${chalk.bold('Reason:')} ${result.reason}\n`);

    if (result.warnings.length > 0) {
      for (const w of result.warnings) {
        console.log(chalk.yellow(`⚠ ${w}`));
      }
      console.log('');
    }

    console.log(chalk.bold(`Implement files (${result.implement_files.length}):`));
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
  });

// ============================================================
// aigis get
// ============================================================
program
  .command('get')
  .description('Fetch implementation pattern files')
  .option('--all', 'Fetch all implement files')
  .option('--lang <language>', 'Filter code to py or js only')
  .option('--no-frontmatter', 'Strip YAML frontmatter')
  .argument('[files...]', 'File IDs to fetch')
  .action((files, opts) => {
    const content = get(files, opts);
    console.log(content);
  });

// ============================================================
// aigis verify
// ============================================================
program
  .command('verify')
  .description('Fetch verification checklists')
  .argument('<files...>', 'File IDs to verify')
  .action((files) => {
    const content = verify(files);
    console.log(content);
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
// aigis audit
// ============================================================
program
  .command('audit')
  .description('Audit an existing codebase for governance gaps')
  .option('--scan', 'Get structured scan prompt for the agent')
  .option('--traits <traits>', 'Run audit with detected traits (bundles classify + all checklists)')
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

      if (opts.json) {
        const checklists = {};
        for (const f of classification.implement_files) {
          checklists[f] = verify([f]);
        }
        console.log(JSON.stringify({ classification, checklists }, null, 2));
        return;
      }

      // Formatted audit output
      const tierColor = classification.risk_tier === 'HIGH' ? chalk.red : classification.risk_tier === 'MEDIUM' ? chalk.yellow : chalk.green;
      console.log(chalk.bold('═══ AIGIS GOVERNANCE AUDIT ═══\n'));
      console.log(`${chalk.bold('Risk tier:')} ${tierColor.bold(classification.risk_tier)}`);
      console.log(`${chalk.bold('Controls to assess:')} ${classification.implement_files.length} areas\n`);

      console.log(chalk.bold('Instructions for agent:'));
      console.log(chalk.dim('Evaluate the existing codebase against each check below.'));
      console.log(chalk.dim('Mark PASS / FAIL / PARTIAL with evidence (file:line or "not found").\n'));

      for (const f of classification.implement_files) {
        const checklist = verify([f]);
        console.log(checklist);
        console.log('');
      }

      if (classification.templates.length > 0) {
        console.log(chalk.bold('Required documentation:'));
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
  .description('Set up aigis for your IDE')
  .argument('<ide>', 'IDE to configure: cursor, claude-code, windsurf, copilot')
  .action((ide) => {
    init(ide);
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

program.parse();
