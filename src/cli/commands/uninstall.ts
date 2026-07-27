import path from 'node:path';
import * as clack from '@clack/prompts';
import fs from 'fs-extra';
import pc from 'picocolors';
import { getAdapter } from '../../adapters';
import { ConfigValidationError } from '../../core/config-merge';
import { fileExists } from '../../core/fs';
import { log } from '../../core/logger';
import { agentStdDir, configPath, homeRoot, skillsDir } from '../../core/paths';
import type { AgentStdConfig, FileOperation, RemoveContext } from '../../core/types';
import { loadAgentStdContext, type SyncScope } from './sync-scope';

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
  const root = opts.global ? homeRoot() : process.cwd();
  const commandRoot = process.cwd();
  const configFilePath = configPath(root);

  if (!(await fileExists(configFilePath))) {
    log.error('.agentstd.yaml not found. Nothing to uninstall.');
    process.exit(1);
  }

  const flagProjectOnly = opts.projectOnly;
  let loaded: Awaited<ReturnType<typeof loadAgentStdContext>> | undefined;
  try {
    loaded = await loadAgentStdContext(root, homeRoot(), flagProjectOnly);
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
  if (!loaded) return;
  const { config, outputRoot, scope, hasHomeConfig } = loaded;

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
      outputRoot,
      scope,
      config,
      dryRun,
      homeRoot: homeRoot(),
      hasHomeConfig,
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
  // --purge-skills is passed. The purge only runs when every configured
  // target was uninstalled in this run — removing a subset should leave the
  // config in place so the remaining targets still sync on the next run.
  const configured = config.targets;
  const purgedTargets = targets.filter((t) => configured.includes(t));
  const shouldPurgeConfig = purgedTargets.length === configured.length;

  if (shouldPurgeConfig) {
    const purgeRoot = opts.global ? homeRoot() : root;
    const purgeConfigPath = configPath(purgeRoot);
    const purgeAgentStdDir = agentStdDir(purgeRoot);
    const purgeSkillDirs = skillPurgeDirs(purgeRoot, config, scope, homeRoot());

    if (!dryRun) {
      // .agentstd.yaml — back up then delete.
      if (await fileExists(purgeConfigPath)) {
        const bak = `${purgeConfigPath}.bak`;
        await fs.copy(purgeConfigPath, bak, { overwrite: true });
        await fs.remove(purgeConfigPath);
        log.success(
          `Removed ${path.relative(commandRoot, purgeConfigPath) || purgeConfigPath}`,
        );
        log.dim(`  backup: ${bak}`);
      }
      // .agentstd/ dir (hooks, instructions).
      if (await fileExists(purgeAgentStdDir)) {
        await fs.remove(purgeAgentStdDir);
        log.success(
          `Removed ${path.relative(commandRoot, purgeAgentStdDir) || purgeAgentStdDir}`,
        );
      }
      // Optional full skills nuke.
      if (opts.purgeSkills) {
        for (const skillsPath of purgeSkillDirs) {
          if (await fileExists(skillsPath)) {
            await fs.remove(skillsPath);
            log.success(`Removed ${path.relative(commandRoot, skillsPath) || skillsPath}`);
          }
        }
      }
    } else {
      if (await fileExists(purgeConfigPath)) {
        allOperations.push({
          type: 'remove-file',
          path: path.relative(commandRoot, purgeConfigPath) || purgeConfigPath,
        });
      }
      if (await fileExists(purgeAgentStdDir)) {
        allOperations.push({
          type: 'remove-dir',
          path: path.relative(commandRoot, purgeAgentStdDir) || purgeAgentStdDir,
        });
      }
      if (opts.purgeSkills) {
        for (const skillsPath of purgeSkillDirs) {
          if (await fileExists(skillsPath)) {
            allOperations.push({
              type: 'remove-dir',
              path: path.relative(commandRoot, skillsPath) || skillsPath,
            });
          }
        }
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
  console.log(pc.dim('  Provider artifacts cleaned.'));
  if (shouldPurgeConfig) {
    console.log(pc.dim('  Config removed.'));
    if (!opts.purgeSkills) {
      console.log(
        pc.dim('  .agents/skills/ left in place. Re-run with --purge-skills to remove.'),
      );
    }
  } else {
    console.log(
      pc.dim(
        '  Config kept (other configured targets remain). Re-run with --all to also purge the config.',
      ),
    );
  }
}

function skillPurgeDirs(
  purgeRoot: string,
  config: AgentStdConfig,
  scope: SyncScope,
  resolvedHomeRoot: string,
): string[] {
  const candidates =
    scope === 'global'
      ? [path.join(resolvedHomeRoot, config.skills.homeDir)]
      : [skillsDir(purgeRoot, config.skills.dir)];

  return Array.from(new Set(candidates.map((candidate) => path.resolve(candidate))));
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
  const removes = operations.filter((o) => o.type === 'remove-file' || o.type === 'remove-dir');
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
