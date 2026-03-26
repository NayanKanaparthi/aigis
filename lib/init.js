const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const CURSOR_RULES = `# Aigis AI Governance
# Added by: aigis init cursor
# Docs: https://github.com/aigis-ai/aigis

When building any AI or LLM feature, use the aigis CLI for governance patterns:

1. Before writing LLM code, classify the system:
   Run: aigis classify --traits <relevant-traits> --json
   
2. Fetch implementation patterns for each recommended file:
   Run: aigis get <file-id> [file-id...]

3. Apply the patterns when writing code.

4. After writing code, verify:
   Run: aigis verify <file-id> [file-id...]

5. For HIGH/MEDIUM risk systems, generate compliance docs:
   Run: aigis template <template-id>

6. To audit an existing project:
   Run: aigis audit --scan

Available traits: uses-llm, uses-rag, uses-finetuned, uses-thirdparty-api, is-agentic, is-multimodal, processes-pii, handles-financial, handles-health, handles-proprietary, handles-minors, influences-decisions, accepts-user-input, is-external, is-internal, is-high-volume, generates-code, generates-content, multi-model-pipeline, jurisdiction-eu, jurisdiction-us-regulated, jurisdiction-global

Run "aigis search --list" to see all available governance patterns.
Run "aigis traits" to see trait descriptions.
`;

const WINDSURF_RULES = CURSOR_RULES;

const COPILOT_INSTRUCTIONS = CURSOR_RULES;

const CLAUDE_CODE_SKILL = fs.readFileSync(
  path.join(__dirname, '..', 'SKILL.md'),
  'utf8'
);

const IDE_CONFIG = {
  cursor: {
    file: '.cursorrules',
    content: CURSOR_RULES,
    description: 'Cursor rules file',
    instruction: 'Cursor will read these instructions on every interaction in this project.',
  },
  windsurf: {
    file: '.windsurfrules',
    content: WINDSURF_RULES,
    description: 'Windsurf rules file',
    instruction: 'Windsurf will read these instructions on every interaction in this project.',
  },
  copilot: {
    file: '.github/copilot-instructions.md',
    content: COPILOT_INSTRUCTIONS,
    description: 'GitHub Copilot instructions',
    instruction: 'Copilot will read these instructions for this repository.',
  },
  'claude-code': {
    file: null, // Special handling
    content: CLAUDE_CODE_SKILL,
    description: 'Claude Code skill file',
    instruction: null,
  },
};

function init(ide) {
  const ideLower = ide.toLowerCase();
  const config = IDE_CONFIG[ideLower];

  if (!config) {
    console.error(chalk.red(`Unknown IDE: ${ide}`));
    console.log(chalk.dim('Available: cursor, claude-code, windsurf, copilot\n'));
    process.exit(1);
  }

  // Claude Code has a special setup path
  if (ideLower === 'claude-code') {
    const skillDir = path.join(require('os').homedir(), '.claude', 'skills', 'aigis');
    const skillFile = path.join(skillDir, 'SKILL.md');

    if (!fs.existsSync(skillDir)) {
      fs.mkdirSync(skillDir, { recursive: true });
    }

    fs.writeFileSync(skillFile, config.content);
    console.log(chalk.green(`\n✓ Created ${skillFile}\n`));
    console.log(chalk.dim('Claude Code will automatically read this skill file.'));
    console.log(chalk.dim('Restart Claude Code for the skill to take effect.\n'));
    return;
  }

  // For Copilot, ensure .github directory exists
  const targetFile = path.resolve(config.file);
  const targetDir = path.dirname(targetFile);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Append or create
  if (fs.existsSync(targetFile)) {
    const existing = fs.readFileSync(targetFile, 'utf8');
    if (existing.includes('aigis')) {
      console.log(chalk.yellow(`\n⚠ ${config.file} already contains aigis configuration.\n`));
      console.log(chalk.dim('No changes made. Remove the existing aigis section first if you want to update.\n'));
      return;
    }
    fs.appendFileSync(targetFile, '\n\n' + config.content);
    console.log(chalk.green(`\n✓ Appended aigis configuration to ${config.file}\n`));
    console.log(chalk.dim('Your existing rules are preserved.\n'));
  } else {
    fs.writeFileSync(targetFile, config.content);
    console.log(chalk.green(`\n✓ Created ${config.file}\n`));
  }

  console.log(chalk.dim(config.instruction + '\n'));
}

module.exports = { init };
