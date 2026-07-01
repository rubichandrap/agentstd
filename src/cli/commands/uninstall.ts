import path from 'node:path';
import fs from 'fs-extra';
import pc from 'picocolors';
import { getAdapter } from '../../adapters';
import {
  ConfigValidationError,
  loadMergedConfig,
  type MergedConfigResult,
} from '../../core/config-merge';
import { fileExists } from '../../core/fs';
import { log } from '../../core/logger';
import {
  agentStdDir,
  configPath,
  homeRoot,
  skillsDir,
} from '../../core/paths';
import type { FileOperation, RemoveContext } from '../../core/types';
import * as clack from '@clack/prompts';

export interface UninstallOptions {
  target?: string;
  all?: boolean;
  dryRun?: boolean;
  purgeSkills?: boolean;
  projectOnly?: boolean;
  global?: boolean;
}

export async function uninstallCmd(
  target?: string,
  options?: Record<string, unknown>,
): Promise<void> {
  const opts = normalizeOptions(target, options);
  const root = process.cwd();
  const configFilePath = configPath(root);

  if (!(await fileExists(configFilePath))) {
    log.error('.agentstd.yaml not found. Nothing to uninstall.');
    process.exit(1);
  }

  const flagProjectOnly = opts.projectOnly;
  let merged: MergedConfigResult | undefined;
  try {
    merged = await loadMergedConfig(root, homeRoot(), flagProjectOnly);
  } catch (err) {
    if (err instanceof ConfigValidationError) {
      log.error('Invalid config:');
      for (const issue of err.issues) {
        log.dim(`  - ${issue.path}: ${issue.message}`);
      }
    } else {
      log.error(`${(err as Error).message}`);
    }
    process.exit(1);
  }
  if (!merged) return;
  const { config } = merged;

  const targets = await resolveUninstallTargets(config.targets, opts);
  if (targets.length === 0) {
    log.warn('No targets selected. Nothing to uninstall.');
    return;
  }

  const dryRun = !!opts.dryRun;
  const allOperations: FileOperation[] = [];
  const allRemoved: string[] = [];
  const allWarnings: string[] = [];

  for (const t of targets) {
    if (!config.targets.includes(t)) {
      log.warn(`Target "${t}" is not configured in .agentstd.yaml. Skipping.`);
      continue;
    }
    const adapter = getAdapter(t);
    if (!adapter) {
      log.warn(`Unknown target "${t}". Skipping.`);
      continue;
    }

    const ctx: RemoveContext = {
      projectRoot: root,
      config,
      dryRun,
      homeRoot: homeRoot(),
    };
    const result = await adapter.remove(ctx);
    allOperations.push(...result.operations);
    allRemoved.push(...result.removed);
    allWarnings.push(...result.warnings);

    if (dryRun) continue;

    log.success(`Removed ${adapter.name} artifacts`);
    for (const r of result.removed) {
      log.dim(`  cleaned: ${r}`);
    }
    for (const w of result.warnings) {
      log.warn(`  ${w}`);
    }
  }

  // Purge agentstd-owned config + .agentstd/ dir (project layer by default;
  // home layer only when --global). .agents/skills/ is left alone unless
  // --purge-skills is passed.
  const purgeRoot = opts.global ? homeRoot() : root;
  const purgeConfigPath = configPath(purgeRoot);
  const purgeAgentStdDir = agentStdDir(purgeRoot);

  if (!dryRun) {
    // .agentstd.yaml — back up then delete.
    if (await fileExists(purgeConfigPath)) {
      const bak = `${purgeConfigPath}.bak`;
      await fs.copy(purgeConfigPath, bak, { overwrite: true });
      await fs.remove(purgeConfigPath);
      log.success(`Removed ${path.relative(root, purgeConfigPath) || purgeConfigPath}`);
      log.dim(`  backup: ${bak}`);
    }
    // .agentstd/ dir (hooks, instructions).
    if (await fileExists(purgeAgentStdDir)) {
      await fs.remove(purgeAgentStdDir);
      log.success(`Removed ${path.relative(root, purgeAgentStdDir) || purgeAgentStdDir}`);
    }
    // Optional full skills nuke.
    if (opts.purgeSkills) {
      const skillsPath = skillsDir(purgeRoot, config.skills.dir);
      if (await fileExists(skillsPath)) {
        await fs.remove(skillsPath);
        log.success(`Removed ${path.relative(root, skillsPath) || skillsPath}`);
      }
      if (!opts.projectOnly) {
        const homeSkillsPath = path.join(homeRoot(), config.skills.homeDir);
        if (await fileExists(homeSkillsPath)) {
          await fs.remove(homeSkillsPath);
          log.success(`Removed ${path.relative(root, homeSkillsPath) || homeSkillsPath}`);
        }
      }
    }
  } else {
    if (await fileExists(purgeConfigPath)) {
      allOperations.push({ type: 'remove-file', path: path.relative(root, purgeConfigPath) || purgeConfigPath });
    }
    if (await fileExists(purgeAgentStdDir)) {
      allOperations.push({ type: 'remove-dir', path: path.relative(root, purgeAgentStdDir) || purgeAgentStdDir });
    }
    if (opts.purgeSkills) {
      const skillsPath = skillsDir(purgeRoot, config.skills.dir);
      if (await fileExists(skillsPath)) {
        allOperations.push({ type: 'remove-dir', path: path.relative(root, skillsPath) || skillsPath });
      }
    }
  }

  if (dryRun) {
    console.log(pc.bold(pc.blue('AgentStd Uninstall (dry run)\n')));
    console.log(pc.dim('No files were changed.\n'));
    if (allOperations.length === 0 && allRemoved.length === 0) {
      console.log(pc.green('Nothing to remove — project is already clean.\n'));
    } else {
      printOperations(allOperations);
    }
    return;
  }

  console.log(pc.bold(pc.blue('\nAgentStd uninstalled.')));
  console.log(pc.dim('  Provider artifacts cleaned, config removed.'));
  if (!opts.purgeSkills) {
    console.log(pc.dim('  .agents/skills/ left in place. Re-run with --purge-skills to remove.'));
  }
}

interface NormalizedOptions {
  target?: string;
  all?: boolean;
  dryRun?: boolean;
  purgeSkills?: boolean;
  projectOnly?: boolean;
  global?: boolean;
}

function normalizeOptions(
  target: string | undefined,
  options?: Record<string, unknown>,
): NormalizedOptions {
  const opts = (options ?? {}) as UninstallOptions;
  return {
    target: target ?? opts.target,
    all: opts.all,
    dryRun: opts.dryRun,
    purgeSkills: opts.purgeSkills,
    projectOnly: opts.projectOnly,
    global: opts.global,
  };
}

async function resolveUninstallTargets(
  configuredTargets: string[],
  opts: NormalizedOptions,
): Promise<string[]> {
  if (opts.target) return [opts.target];
  if (opts.all) return configuredTargets;
  if (configuredTargets.length <= 1) return configuredTargets;

  const isInteractive = process.stdin.isTTY && process.stdout.isTTY;
  if (!isInteractive) return configuredTargets;

  return promptUninstallTargets(configuredTargets);
}

async function promptUninstallTargets(targets: string[]): Promise<string[]> {
  const selected = await clack.multiselect({
    message: 'Select targets to uninstall',
    options: targets.map((t) => ({ value: t, label: t })),
    initialValues: [...targets],
    required: true,
  });

  if (clack.isCancel(selected)) {
    clack.cancel('Uninstall cancelled.');
    process.exit(0);
  }

  const picked = selected as string[];
  if (picked.length === 0) {
    clack.cancel('Uninstall cancelled.');
    process.exit(0);
  }

  return picked;
}

function printOperations(operations: FileOperation[]): void {
  const removes = operations.filter(
    (o) => o.type === 'remove-file' || o.type === 'remove-dir',
  );
  const updates = operations.filter((o) => o.type === 'update-file');

  if (updates.length > 0) {
    console.log('Would clean (strip agentstd entries):');
    for (const op of updates) {
      if (op.type === 'update-file') console.log(`- ${op.path}`);
    }
    console.log();
  }

  if (removes.length > 0) {
    console.log('Would remove:');
    for (const op of removes) {
      if (op.type === 'remove-file' || op.type === 'remove-dir') console.log(`- ${op.path}`);
    }
    console.log();
  }
}
