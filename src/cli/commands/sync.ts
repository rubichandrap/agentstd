import path from 'node:path';
import fs from 'fs-extra';
import YAML from 'yaml';
import pc from 'picocolors';
import { claudeAdapter } from '../../adapters/claude/index';
import { agentStdConfigSchema } from '../../core/config';
import { fileExists } from '../../core/fs';
import { log } from '../../core/logger';
import type { AgentAdapter, AgentStdConfig, FileOperation } from '../../core/types';

const adapters: Record<string, AgentAdapter> = {
  claude: claudeAdapter,
};

export interface SyncOptions {
  target?: string;
  dryRun?: boolean;
  check?: boolean;
}

function printOperations(operations: FileOperation[]): void {
  const sections = {
    createDir: operations.filter((o) => o.type === 'create-dir'),
    createFile: operations.filter((o) => o.type === 'create-file'),
    updateFile: operations.filter((o) => o.type === 'update-file'),
    copyDir: operations.filter((o) => o.type === 'copy-dir'),
    skip: operations.filter((o) => o.type === 'skip'),
  };

  if (sections.createDir.length > 0) {
    log.info('Would create directories:');
    for (const op of sections.createDir) {
      log.dim(`  ${pc.green('+')} ${(op as Extract<FileOperation, { type: 'create-dir' }>).dir}`);
    }
    console.log();
  }

  if (sections.createFile.length > 0) {
    log.info('Would create:');
    for (const op of sections.createFile) {
      log.dim(`  ${pc.green('+')} ${(op as Extract<FileOperation, { type: 'create-file' }>).path}`);
    }
    console.log();
  }

  if (sections.copyDir.length > 0) {
    log.info('Would copy:');
    for (const op of sections.copyDir) {
      log.dim(`  ${pc.cyan('→')} ${(op as Extract<FileOperation, { type: 'copy-dir' }>).from} ${pc.dim('to')} ${(op as Extract<FileOperation, { type: 'copy-dir' }>).to}`);
    }
    console.log();
  }

  if (sections.updateFile.length > 0) {
    log.info('Would update:');
    for (const op of sections.updateFile) {
      log.dim(`  ${pc.yellow('~')} ${(op as Extract<FileOperation, { type: 'update-file' }>).path}`);
    }
    console.log();
  }

  if (sections.skip.length > 0) {
    log.info('Would skip:');
    for (const op of sections.skip) {
      log.dim(`  ${pc.dim('-')} ${(op as Extract<FileOperation, { type: 'skip' }>).reason}`);
    }
    console.log();
  }
}

export async function syncCmd(target?: string, options?: Record<string, unknown>): Promise<void> {
  const root = process.cwd();
  const configPath = path.join(root, '.agentstd.yaml');

  if (!(await fileExists(configPath))) {
    log.error('.agentstd.yaml not found. Run: agentstd init');
    process.exit(1);
  }

  const raw = await fs.readFile(configPath, 'utf8');
  let parsed: unknown;
  try {
    parsed = YAML.parse(raw);
  } catch (err) {
    log.error(`Invalid YAML in .agentstd.yaml: ${err}`);
    process.exit(1);
  }

  const validation = agentStdConfigSchema.safeParse(parsed);
  if (!validation.success) {
    log.error('Invalid config:');
    for (const issue of validation.error.issues) {
      log.dim(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  const config: AgentStdConfig = validation.data;

  const targets = target
    ? [target]
    : config.targets;

  const dryRun = !!(options as SyncOptions)?.dryRun;
  const check = !!(options as SyncOptions)?.check;

  let allOperations: FileOperation[] = [];
  let hasChanges = false;

  for (const t of targets) {
    if (target && !config.targets.includes(t)) {
      log.warn(`Target "${t}" is not configured in .agentstd.yaml. Use "agentstd sync" to see available targets.`);
      continue;
    }

    const adapter = adapters[t];
    if (!adapter) {
      log.warn(`Unknown target "${t}". Skipping.`);
      continue;
    }

    const result = await adapter.sync({ projectRoot: root, config, dryRun });
    allOperations.push(...result.operations);

    if (dryRun || check) {
      if (result.changed.length > 0) {
        hasChanges = true;
      }
      continue;
    }

    log.success(`Synced ${adapter.name}`);
    for (const c of result.changed) {
      log.dim(`  updated: ${c}`);
    }
    for (const w of result.warnings) {
      log.warn(`  ${w}`);
    }
  }

  if (dryRun) {
    console.log(pc.bold(pc.blue('AgentStd Sync\n')));
    console.log(pc.dim('Dry run mode enabled. No files were changed.\n'));

    if (allOperations.length === 0) {
      console.log(pc.green('Everything is already synced.\n'));
    } else {
      printOperations(allOperations);
    }
    return;
  }

  if (check) {
    if (!hasChanges) {
      console.log(pc.bold(pc.blue('AgentStd Sync Check\n')));
      console.log(pc.green('Everything is already synced.\n'));
      process.exit(0);
    }

    console.log(pc.bold(pc.blue('AgentStd Sync Check\n')));
    console.log(pc.yellow('Project is not fully synced.\n'));
    console.log('Required changes:');
    for (const op of allOperations) {
      switch (op.type) {
        case 'create-dir':
          log.dim(`  create directory ${op.dir}`);
          break;
        case 'create-file':
          log.dim(`  create ${op.path}`);
          break;
        case 'update-file':
          log.dim(`  update ${op.path}`);
          break;
        case 'copy-dir':
          log.dim(`  copy ${op.from} to ${op.to}`);
          break;
      }
    }
    console.log();
    console.log(pc.dim('Run `agentstd sync` to apply these changes.\n'));
    process.exit(1);
  }
}
