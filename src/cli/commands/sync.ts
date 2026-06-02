import path from 'node:path';
import fs from 'fs-extra';
import YAML from 'yaml';
import { claudeAdapter } from '../../adapters/claude/index';
import { agentStdConfigSchema } from '../../core/config';
import { fileExists } from '../../core/fs';
import { log } from '../../core/logger';
import type { AgentAdapter, AgentStdConfig } from '../../core/types';

const adapters: Record<string, AgentAdapter> = {
  claude: claudeAdapter,
};

export async function syncCmd(target?: string): Promise<void> {
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

    const result = await adapter.sync({ projectRoot: root, config });
    log.success(`Synced ${adapter.name}`);
    for (const c of result.changed) {
      log.dim(`  updated: ${c}`);
    }
    for (const w of result.warnings) {
      log.warn(`  ${w}`);
    }
  }
}
