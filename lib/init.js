const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { getCore } = require('./fetch');

// Single source of truth: content/skills/core.md.
// All four IDE destinations get the same content.
function coreContent() {
  return getCore();
}

const HEADER = `# Aigis core skill — installed by \`aigis init\`
# Re-run \`aigis init <ide>\` to refresh this file when Aigis updates.
# Area + workflow skills load on demand via the aigis CLI; they are NOT in this file.

`;

const IDE_DESTINATIONS = {
  cursor: {
    file: '.cursorrules',
    description: 'Cursor rules file',
    instruction: 'Cursor will read these instructions on every interaction in this project.',
  },
  windsurf: {
    file: '.windsurfrules',
    description: 'Windsurf rules file',
    instruction: 'Windsurf will read these instructions on every interaction in this project.',
  },
  copilot: {
    file: '.github/copilot-instructions.md',
    description: 'GitHub Copilot instructions',
    instruction: 'Copilot will read these instructions for this repository.',
  },
  'claude-code': {
    file: null, // Special: writes to ~/.claude/skills/aigis/SKILL.md
    description: 'Claude Code skill file',
    instruction: 'Claude Code will read this skill file. Restart Claude Code for it to take effect.',
  },
};

function init(ide) {
  const ideLower = ide.toLowerCase();
  const dest = IDE_DESTINATIONS[ideLower];

  if (!dest) {
    console.error(chalk.red(`Unknown IDE: ${ide}`));
    console.log(chalk.dim('Available: cursor, claude-code, windsurf, copilot\n'));
    process.exit(1);
  }

  const content = HEADER + coreContent();

  // Claude Code: dedicated skill directory under ~/.claude/skills/aigis/
  if (ideLower === 'claude-code') {
    const skillDir = path.join(require('os').homedir(), '.claude', 'skills', 'aigis');
    const skillFile = path.join(skillDir, 'SKILL.md');
    if (!fs.existsSync(skillDir)) fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(skillFile, content);
    console.log(chalk.green(`\n✓ Created ${skillFile}\n`));
    console.log(chalk.dim(dest.instruction + '\n'));
    return;
  }

  // Other IDEs: write to a path inside the current project
  const targetFile = path.resolve(dest.file);
  const targetDir = path.dirname(targetFile);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  if (fs.existsSync(targetFile)) {
    const existing = fs.readFileSync(targetFile, 'utf8');
    if (existing.includes('aigis-core')) {
      console.log(chalk.yellow(`\n⚠ ${dest.file} already contains aigis core skill.`));
      console.log(chalk.dim('No changes made. Remove the existing aigis section first to refresh it.\n'));
      return;
    }
    fs.appendFileSync(targetFile, '\n\n' + content);
    console.log(chalk.green(`\n✓ Appended aigis core skill to ${dest.file}\n`));
    console.log(chalk.dim('Your existing rules are preserved.\n'));
  } else {
    fs.writeFileSync(targetFile, content);
    console.log(chalk.green(`\n✓ Created ${dest.file}\n`));
  }
  console.log(chalk.dim(dest.instruction + '\n'));
}

module.exports = { init };
