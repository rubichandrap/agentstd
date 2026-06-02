import path from 'node:path';
import fs from 'fs-extra';
import YAML from 'yaml';
import { ensureDir, fileExists } from '../../core/fs';
import { log } from '../../core/logger';

export async function initCmd(): Promise<void> {
  const root = process.cwd();
  const configFile = path.join(root, '.agentstd.yaml');
  const agentStdDir = path.join(root, '.agentstd');

  if (await fileExists(configFile)) {
    log.warn('.agentstd.yaml already exists. Aborting.');
    return;
  }

  await createDefaults(root, agentStdDir, configFile);

  log.success('AgentStd initialized successfully!');
  log.info('Next steps:');
  log.dim('  1. Edit .agentstd.yaml to configure targets');
  log.dim('  2. Add skills to .agentstd/skills/');
  log.dim('  3. Run: agentstd sync');
}

async function createDefaults(
  _root: string,
  agentStdDir: string,
  configFile: string,
): Promise<void> {
  // .agentstd.yaml
  const config = {
    version: 1,
    targets: ['claude'],
    hooks: {
      preToolUse: {
        command: 'node .agentstd/hooks/pretooluse.js',
      },
    },
    skills: {
      dir: '.agentstd/skills',
    },
    instructions: {
      shared: '.agentstd/instructions/shared.md',
    },
  };
  await fs.writeFile(configFile, YAML.stringify(config));

  // .agentstd/hooks/pretooluse.js
  const hooksDir = path.join(agentStdDir, 'hooks');
  await ensureDir(hooksDir);
  await fs.writeFile(path.join(hooksDir, 'pretooluse.js'), getDefaultHook());

  // .agentstd/skills/example-skill/SKILL.md
  const skillDir = path.join(agentStdDir, 'skills', 'example-skill');
  await ensureDir(skillDir);
  await fs.writeFile(path.join(skillDir, 'SKILL.md'), getDefaultSkillMD());

  // .agentstd/instructions/shared.md
  const instrDir = path.join(agentStdDir, 'instructions');
  await ensureDir(instrDir);
  await fs.writeFile(path.join(instrDir, 'shared.md'), getDefaultInstructions());
}

function getDefaultHook(): string {
  return `#!/usr/bin/env node

const input = [];

process.stdin.on("data", chunk => input.push(chunk));
process.stdin.on("end", () => {
  const raw = Buffer.concat(input).toString("utf8");

  let event = {};
  try {
    event = raw ? JSON.parse(raw) : {};
  } catch {
    event = {};
  }

  const toolName = event.tool_name || event.toolName || "";
  const command = event.tool_input?.command || event.toolInput?.command || "";
  const filePath = event.tool_input?.file_path || event.toolInput?.filePath || "";

  const dangerousCommands = [
    "rm -rf",
    "DROP DATABASE",
    "TRUNCATE TABLE",
    "mkfs",
    "shutdown",
    "reboot"
  ];

  const protectedFiles = [
    ".env",
    ".env.local",
    ".env.production"
  ];

  const isDangerousCommand =
    toolName.toLowerCase().includes("bash") &&
    dangerousCommands.some(pattern => command.includes(pattern));

  const isProtectedFileEdit =
    ["Edit", "Write", "MultiEdit"].includes(toolName) &&
    protectedFiles.some(file => filePath.endsWith(file));

  if (isDangerousCommand) {
    console.error("Blocked by AgentStd: dangerous command detected.");
    process.exit(2);
  }

  if (isProtectedFileEdit) {
    console.error("Blocked by AgentStd: protected environment file edit detected.");
    process.exit(2);
  }

  process.exit(0);
});
`;
}

function getDefaultSkillMD(): string {
  return `---
name: example-skill
description: Example shared AgentStd skill.
---

Use this skill as a template for shared AI coding agent behavior.

When using this skill:
- explain changes clearly
- prefer small commits
- avoid modifying environment files
- ask before running destructive commands
`;
}

function getDefaultInstructions(): string {
  return `# Shared Agent Instructions

Follow these rules in this repository:

- Prefer small, focused changes.
- Do not edit \`.env\` files directly.
- Ask before destructive commands.
- Explain risky changes before applying them.
- Preserve the existing code style.
`;
}
