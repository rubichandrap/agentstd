import path from 'node:path';
import fs from 'fs-extra';
import YAML from 'yaml';
import { listAdapters } from '../../adapters';
import { agentStdConfigSchema } from '../../core/config';
import { ensureDir, fileExists, writeConfigWithBackup } from '../../core/fs';
import { log } from '../../core/logger';
import { migrateConfig } from '../../core/migrations';
import { homeRoot } from '../../core/paths';

export interface InitOptions {
  global?: boolean;
  force?: boolean;
  dryRun?: boolean;
  interactive?: boolean;
  targets?: string[];
  /** Test seam: override the interactive target prompt. */
  promptTargets?: () => Promise<string[]>;
}

export async function initCmd(options?: InitOptions): Promise<void> {
  if (options?.global) {
    await initGlobal(options);
    return;
  }
  await initProject(options);
}

async function initProject(options?: InitOptions): Promise<void> {
  const root = process.cwd();
  const configFile = path.join(root, '.agentstd.yaml');
  const agentStdDir = path.join(root, '.agentstd');

  if (await fileExists(configFile)) {
    if (options?.force) {
      await resetConfig(configFile, projectDefaultConfig(options?.targets ?? DEFAULT_TARGETS));
      return;
    }
    // Upgrade path is silent: preserve existing targets, do not prompt.
    await upgradeConfig(configFile, { dryRun: options?.dryRun });
    return;
  }

  const targets = await resolveInitTargets(options);
  await createProjectDefaults(root, agentStdDir, configFile, targets);

  log.success('AgentStd initialized successfully!');
  log.info(`  Targets: ${targets.join(', ')}`);
  log.info('Next steps:');
  log.dim('  1. Add skills to .agents/skills/ (or run `agentstd init --global` to seed a home skill library)');
  log.dim('  2. Run: agentstd sync');
}

async function initGlobal(options?: InitOptions): Promise<void> {
  const home = homeRoot();
  const configFile = path.join(home, '.agentstd.yaml');
  const agentStdDir = path.join(home, '.agentstd');

  if (await fileExists(configFile)) {
    if (options?.force) {
      await resetConfig(configFile, globalDefaultConfig(home, options?.targets ?? DEFAULT_TARGETS));
      return;
    }
    await upgradeConfig(configFile, { dryRun: options?.dryRun });
    return;
  }

  const targets = await resolveInitTargets(options);
  await createGlobalDefaults(home, agentStdDir, configFile, targets);

  log.success('AgentStd home config initialized!');
  log.info(`  Created: ${path.join(home, '.agentstd.yaml')}`);
  log.info(`  Created: ${path.join(home, '.agentstd/hooks/pretooluse.js')}`);
  log.info(`  Ensured: ${path.join(home, '.agents/skills/')}`);
  log.info(`  Targets: ${targets.join(', ')}`);
  log.dim(
    '  Drop shared skills (like caveman) into ~/.agents/skills/ and they sync to every project.',
  );
}

const DEFAULT_TARGETS = ['claude'];

async function resolveInitTargets(options?: InitOptions): Promise<string[]> {
  if (options?.targets && options.targets.length > 0) {
    return options.targets;
  }
  const interactive = options?.interactive ?? (process.stdin.isTTY && process.stdout.isTTY);
  if (!interactive) return [...DEFAULT_TARGETS];
  return (options?.promptTargets ?? promptInitTargets)();
}

async function promptInitTargets(): Promise<string[]> {
  const { multiselect, isCancel, cancel } = await import('@clack/prompts');
  const adapterIds = listAdapters().map((a) => a.id);
  const selected = await multiselect({
    message: 'Select agent targets to configure',
    options: adapterIds.map((id) => ({ value: id, label: id })),
    initialValues: DEFAULT_TARGETS.filter((id) => adapterIds.includes(id)),
    required: true,
  });
  if (isCancel(selected)) {
    cancel('Init cancelled.');
    process.exit(0);
  }
  const picked = (selected as string[]).filter((id) => adapterIds.includes(id));
  return picked.length > 0 ? picked : [...DEFAULT_TARGETS];
}

/**
 * Non-destructively bring an existing config up to date: run version
 * migrations, then backfill any newly-added default keys via the schema.
 * Writes a `.bak` backup before touching the file. Comments are not preserved
 * (YAML.stringify limitation) — the backup mitigates this.
 */
async function upgradeConfig(configFile: string, opts: { dryRun?: boolean }): Promise<void> {
  const label = path.basename(configFile);
  const raw = await fs.readFile(configFile, 'utf8');

  let parsed: unknown;
  try {
    parsed = YAML.parse(raw);
  } catch (err) {
    log.error(`Could not parse ${label}: ${(err as Error).message}`);
    return;
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    log.error(`${label} is not a valid config object. Aborting.`);
    return;
  }

  let migrated: ReturnType<typeof migrateConfig>;
  try {
    migrated = migrateConfig(parsed as Record<string, unknown>);
  } catch (err) {
    log.error((err as Error).message);
    return;
  }

  const validation = agentStdConfigSchema.safeParse(migrated.obj);
  if (!validation.success) {
    log.error(`Cannot upgrade ${label}: config is invalid.`);
    for (const issue of validation.error.issues) {
      log.dim(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    return;
  }

  const upgraded = YAML.stringify(validation.data);
  const versionNote = migrated.changed
    ? ` (v${migrated.fromVersion} -> v${migrated.toVersion})`
    : '';

  if (upgraded === raw) {
    log.info(`${label} is already up to date.`);
    return;
  }

  if (opts.dryRun) {
    log.info(`${label} would be upgraded${versionNote}.`);
    log.dim('  New default keys would be added. Run `agentstd init` (no --dry-run) to apply.');
    log.dim('  A .bak backup will be written; comments are not preserved.');
    return;
  }

  const bak = await writeConfigWithBackup(configFile, validation.data);
  log.success(`Upgraded ${label}${versionNote}.`);
  if (bak) log.info(`  Backup: ${bak}`);
  log.dim('  Missing default keys were added. Note: comments are not preserved.');
}

async function resetConfig(configFile: string, config: unknown): Promise<void> {
  const label = path.basename(configFile);
  const bak = await writeConfigWithBackup(configFile, config);
  log.success(`Reset ${label} to defaults (--force).`);
  if (bak) log.info(`  Backup: ${bak}`);
}

function projectDefaultConfig(targets: string[] = DEFAULT_TARGETS): Record<string, unknown> {
  return {
    version: 1,
    projectOnly: false,
    targets,
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
}

function globalDefaultConfig(home: string, targets: string[] = DEFAULT_TARGETS): Record<string, unknown> {
  const homeHookPath = path.join(home, '.agentstd', 'hooks', 'pretooluse.js');
  return {
    version: 1,
    projectOnly: false,
    targets,
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
}

async function createProjectDefaults(
  root: string,
  agentStdDir: string,
  configFile: string,
  targets: string[] = DEFAULT_TARGETS,
): Promise<void> {
  // .agentstd.yaml
  await fs.writeFile(configFile, YAML.stringify(projectDefaultConfig(targets)));

  // .agentstd/hooks/pretooluse.js
  const hooksDir = path.join(agentStdDir, 'hooks');
  await ensureDir(hooksDir);
  await fs.writeFile(path.join(hooksDir, 'pretooluse.js'), getDefaultHook());

  // .agents/skills/example-skill/SKILL.md
  const skillsBase = path.join(root, '.agents', 'skills');
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
  targets: string[] = DEFAULT_TARGETS,
): Promise<void> {
  // ~/.agentstd.yaml
  await fs.writeFile(configFile, YAML.stringify(globalDefaultConfig(home, targets)));

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
