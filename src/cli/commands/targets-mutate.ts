import path from 'node:path';
import fs from 'fs-extra';
import YAML from 'yaml';
import { listAdapters } from '../../adapters';
import { fileExists, writeConfigWithBackup } from '../../core/fs';
import { log } from '../../core/logger';
import { configPath, homeRoot } from '../../core/paths';

export interface TargetsAddOptions {
  global?: boolean;
}

export async function targetsAddCmd(
  id: string | undefined,
  options?: Record<string, unknown>,
): Promise<void> {
  const opts: TargetsAddOptions = {
    global: ((options ?? {}) as TargetsAddOptions).global === true,
  };
  const root = process.cwd();
  const configFile = opts.global ? path.join(homeRoot(), '.agentstd.yaml') : configPath(root);

  if (!(await fileExists(configFile))) {
    log.error(`${path.basename(configFile)} not found. Run: agentstd init${opts.global ? ' --global' : ''}`);
    process.exit(1);
  }

  const supportedIds = listAdapters().map((a) => a.id);

  let targetId = id;
  if (!targetId) {
    const current = readCurrentTargets(configFile);
    const available = supportedIds.filter((s) => !current.includes(s));
    if (available.length === 0) {
      log.info('All supported targets are already configured.');
      return;
    }
    targetId = await promptTarget(available);
    if (!targetId) return;
  }

  if (!supportedIds.includes(targetId)) {
    log.error(`Unknown target "${targetId}". Supported: ${supportedIds.join(', ')}`);
    process.exit(1);
  }

  const { targets, config } = await readConfig(configFile);
  if (targets.includes(targetId)) {
    log.info(`Target "${targetId}" is already configured in ${path.basename(configFile)}.`);
    return;
  }

  config.targets = [...targets, targetId];
  const bak = await writeConfigWithBackup(configFile, config);
  log.success(`Added target "${targetId}" to ${path.basename(configFile)}.`);
  if (bak) log.dim(`  backup: ${bak}`);
  log.dim(`  Run \`agentstd sync\` to apply.`);
}

export async function targetsRemoveCmd(
  id: string | undefined,
  options?: Record<string, unknown>,
): Promise<void> {
  const opts: TargetsAddOptions = {
    global: ((options ?? {}) as TargetsAddOptions).global === true,
  };
  const root = process.cwd();
  const configFile = opts.global ? path.join(homeRoot(), '.agentstd.yaml') : configPath(root);

  if (!(await fileExists(configFile))) {
    log.error(`${path.basename(configFile)} not found. Nothing to remove.`);
    process.exit(1);
  }

  let targetId = id;
  const { targets, config } = await readConfig(configFile);

  if (!targetId) {
    if (targets.length === 0) {
      log.info('No targets configured.');
      return;
    }
    targetId = await promptTarget(targets);
    if (!targetId) return;
  }

  if (!targets.includes(targetId)) {
    log.info(`Target "${targetId}" is not configured in ${path.basename(configFile)}.`);
    return;
  }

  if (targets.length === 1) {
    log.error(
      `Refusing to remove the last target "${targetId}". Set at least one target, or use \`agentstd uninstall\` to remove AgentStd entirely.`,
    );
    process.exit(1);
  }

  config.targets = targets.filter((t) => t !== targetId);
  const bak = await writeConfigWithBackup(configFile, config);
  log.success(`Removed target "${targetId}" from ${path.basename(configFile)}.`);
  if (bak) log.dim(`  backup: ${bak}`);
  log.dim(`  Run \`agentstd sync\` to apply, or \`agentstd uninstall ${targetId}\` to clean its files.`);
}

function readCurrentTargets(configFile: string): string[] {
  const raw = fs.readFileSync(configFile, 'utf8');
  const parsed = YAML.parse(raw) as { targets?: string[] } | null;
  return parsed?.targets ?? [];
}

async function readConfig(
  configFile: string,
): Promise<{ targets: string[]; config: Record<string, unknown> }> {
  const raw = await fs.readFile(configFile, 'utf8');
  const parsed = (YAML.parse(raw) ?? {}) as Record<string, unknown>;
  const targets = Array.isArray(parsed.targets) ? (parsed.targets as string[]) : [];
  return { targets, config: parsed };
}

async function promptTarget(options: string[]): Promise<string | undefined> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    log.error(`No target specified and terminal is non-interactive. Pass a target id: ${options.join(', ')}`);
    process.exit(1);
  }
  const { multiselect, isCancel, cancel } = await import('@clack/prompts');
  const selected = await multiselect({
    message: 'Select target(s)',
    options: options.map((t) => ({ value: t, label: t })),
    required: true,
  });
  if (isCancel(selected)) {
    cancel('Cancelled.');
    process.exit(0);
  }
  const picked = (selected as string[])[0];
  return picked;
}
