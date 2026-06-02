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
  const creates = operations.filter((o) => o.type === 'create-file' || o.type === 'create-dir');
  const copies = operations.filter((o) => o.type === 'copy-dir');
  const updates = operations.filter((o) => o.type === 'update-file');
  const skips = operations.filter((o) => o.type === 'skip');

  if (creates.length > 0) {
    console.log('Would create:');
    for (const op of creates) {
      if (op.type === 'create-dir') {
        console.log(`- ${op.dir}`);
      } else {
        console.log(`- ${op.path}`);
      }
    }
    console.log();
  }

  if (copies.length > 0) {
    console.log('Would copy:');
    for (const op of copies) {
      console.log(`- ${op.from} to ${op.to}`);
    }
    console.log();
  }

  if (updates.length > 0) {
    console.log('Would update:');
    for (const op of updates) {
      console.log(`- ${op.path}`);
    }
    console.log();
  }

  if (skips.length > 0) {
    console.log('Would skip:');
    for (const op of skips) {
      console.log(`- ${op.reason}`);
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

  const adapterDryRun = dryRun || check;

  const allOperations: FileOperation[] = [];

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

    const result = await adapter.sync({ projectRoot: root, config, dryRun: adapterDryRun });
    allOperations.push(...result.operations);

    if (dryRun || check) {
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
    const activeOperations = allOperations.filter((op) => op.type !== 'skip');

    if (activeOperations.length === 0) {
      console.log(pc.bold(pc.blue('AgentStd Sync Check\n')));
      console.log(pc.green('Everything is already synced.\n'));
      process.exit(0);
    }

    console.log(pc.bold(pc.blue('AgentStd Sync Check\n')));
    console.log(pc.yellow('Project is not fully synced.\n'));
    console.log('Required changes:');
    for (const op of activeOperations) {
      switch (op.type) {
        case 'create-dir':
          console.log(`- create ${op.dir}`);
          break;
        case 'create-file':
          console.log(`- create ${op.path}`);
          break;
        case 'update-file':
          console.log(`- update ${op.path}`);
          break;
        case 'copy-dir':
          console.log(`- copy ${op.from} to ${op.to}`);
          break;
      }
    }
    console.log();
    console.log(pc.dim('Run `agentstd sync` to apply these changes.\n'));
    process.exit(1);
  }
}
