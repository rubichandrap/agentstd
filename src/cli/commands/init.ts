import path from 'node:path';
import fs from 'fs-extra';
import YAML from 'yaml';
import { ensureDir, fileExists } from '../../core/fs';
import { log } from '../../core/logger';
import { homeRoot } from '../../core/paths';

export interface InitOptions {
  global?: boolean;
}

export async function initCmd(options?: InitOptions): Promise<void> {
  if (options?.global) {
    await initGlobal();
    return;
  }
  await initProject();
}

async function initProject(): Promise<void> {
  const root = process.cwd();
  const configFile = path.join(root, '.agentstd.yaml');
  const agentStdDir = path.join(root, '.agentstd');

  if (await fileExists(configFile)) {
    log.warn('.agentstd.yaml already exists. Aborting.');
    return;
  }

  await createProjectDefaults(root, agentStdDir, configFile);

  log.success('AgentStd initialized successfully!');
  log.info('Next steps:');
  log.dim('  1. Edit .agentstd.yaml to configure targets');
  log.dim(
    '  2. Add skills to .agents/skills/ (or run `agentstd init --global` to seed a home skill library)',
  );
  log.dim('  3. Run: agentstd sync');
}

async function initGlobal(): Promise<void> {
  const home = homeRoot();
  const configFile = path.join(home, '.agentstd.yaml');
  const agentStdDir = path.join(home, '.agentstd');

  if (await fileExists(configFile)) {
    log.warn('Home .agentstd.yaml already exists. Aborting.');
    return;
  }

  await createGlobalDefaults(home, agentStdDir, configFile);

  log.success('AgentStd home config initialized!');
  log.info(`  Created: ${path.join(home, '.agentstd.yaml')}`);
  log.info(`  Created: ${path.join(home, '.agentstd/hooks/pretooluse.js')}`);
  log.info(`  Ensured: ${path.join(home, '.agents/skills/')}`);
  log.dim(
    '  Drop shared skills (like caveman) into ~/.agents/skills/ and they sync to every project.',
  );
}

async function createProjectDefaults(
  _root: string,
  agentStdDir: string,
  configFile: string,
): Promise<void> {
  // .agentstd.yaml
  const config = {
    version: 1,
    projectOnly: false,
    targets: ['claude'],
    hooks: {
      preToolUse: {
        command: 'node .agentstd/hooks/pretooluse.js',
      },
    },
    skills: {
      dir: '.agents/skills',
      homeDir: '.agents/skills',
    },
    instructions: {
      shared: '.agentstd/instructions/shared.md',
    },
    mcpServers: {},
    permissions: {
      commands: {
        allow: [],
        prompt: [],
        deny: [],
      },
      files: {
        denyRead: [],
        denyWrite: [],
      },
    },
    agents: {},
  };
  await fs.writeFile(configFile, YAML.stringify(config));

  // .agentstd/hooks/pretooluse.js
  const hooksDir = path.join(agentStdDir, 'hooks');
  await ensureDir(hooksDir);
  await fs.writeFile(path.join(hooksDir, 'pretooluse.js'), getDefaultHook());

  // .agents/skills/example-skill/SKILL.md
  const skillsBase = path.join(_root, '.agents', 'skills');
  const skillDir = path.join(skillsBase, 'example-skill');
  await ensureDir(skillDir);
  await fs.writeFile(path.join(skillDir, 'SKILL.md'), getDefaultSkillMD());

  // .agentstd/instructions/shared.md
  const instrDir = path.join(agentStdDir, 'instructions');
  await ensureDir(instrDir);
  await fs.writeFile(path.join(instrDir, 'shared.md'), getDefaultInstructions());
}

async function createGlobalDefaults(
  home: string,
  agentStdDir: string,
  configFile: string,
): Promise<void> {
  const homeHookPath = path.join(home, '.agentstd', 'hooks', 'pretooluse.js');

  // ~/.agentstd.yaml
  const config = {
    version: 1,
    targets: ['claude'],
    hooks: {
      preToolUse: {
        command: `node ${homeHookPath}`,
      },
    },
    skills: {
      dir: '.agents/skills',
      homeDir: '.agents/skills',
    },
    instructions: {
      shared: '.agentstd/instructions/shared.md',
    },
    mcpServers: {},
    permissions: {
      commands: {
        allow: [],
        prompt: [],
        deny: [],
      },
      files: {
        denyRead: [],
        denyWrite: [],
      },
    },
    agents: {},
  };
  await fs.writeFile(configFile, YAML.stringify(config));

  // ~/.agentstd/hooks/pretooluse.js
  const hooksDir = path.join(agentStdDir, 'hooks');
  await ensureDir(hooksDir);
  await fs.writeFile(path.join(hooksDir, 'pretooluse.js'), getDefaultHook());

  // ~/.agents/skills/ (ensure exists, no seeded content)
  const skillsBase = path.join(home, '.agents', 'skills');
  await ensureDir(skillsBase);
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
  const toolInput = event.tool_input || event.toolInput || {};
  const command = toolInput.command || toolInput.patch || "";
  const filePath = toolInput.file_path || toolInput.filePath || toolInput.path || "";

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
    (toolName.toLowerCase().includes("bash") || toolName === "apply_patch") &&
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
