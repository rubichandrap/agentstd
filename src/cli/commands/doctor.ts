import path from 'node:path';
import fs from 'fs-extra';
import pc from 'picocolors';
import YAML from 'yaml';
import { claudeAdapter } from '../../adapters/claude/index';
import { type AgentStdConfig, agentStdConfigSchema } from '../../core/config';
import { fileExists } from '../../core/fs';
import { log } from '../../core/logger';
import { hooksDir } from '../../core/paths';
import type { AgentAdapter, DoctorCheck } from '../../core/types';

const adapters: Record<string, AgentAdapter> = {
  claude: claudeAdapter,
};

function statusIcon(status: DoctorCheck['status']): string {
  switch (status) {
    case 'pass':
      return pc.green('✓');
    case 'warn':
      return pc.yellow('⚠');
    case 'fail':
      return pc.red('✗');
  }
}

export async function doctorCmd(): Promise<void> {
  const root = process.cwd();
  const configPath = path.join(root, '.agentstd.yaml');

  log.info('AgentStd Doctor\n');

  // Core checks
  log.info(pc.bold('Core'));

  if (!(await fileExists(configPath))) {
    log.error('.agentstd.yaml not found');
    log.dim('  Run: agentstd init');
    return;
  }
  log.success('.agentstd.yaml found');

  const raw = await fs.readFile(configPath, 'utf8');
  let parsed: unknown;
  let configValid = false;
  let config: AgentStdConfig | null = null;
  try {
    parsed = YAML.parse(raw);
  } catch {
    // handled below
  }
  const validation = agentStdConfigSchema.safeParse(parsed);
  if (validation.success) {
    configValid = true;
    config = validation.data;
    log.success('config valid');
  } else {
    log.error('config invalid');
    for (const issue of validation.error.issues) {
      log.dim(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
  }

  const hookExists = await fileExists(path.join(hooksDir(root), 'pretooluse.js'));
  if (hookExists) {
    log.success('preToolUse hook found');
  } else {
    log.warn('preToolUse hook missing');
    log.dim('  Run: agentstd init');
  }

  if (config) {
    const skDir = path.resolve(root, config.skills.dir);
    if (await fileExists(skDir)) {
      log.success('skills directory found');
    } else {
      log.error('skills directory not found');
      log.dim('  Run: agentstd init');
    }
  }

  if (!configValid || !config) {
    log.info('\nFix config issues, then run: agentstd sync');
    return;
  }

  // Target checks
  log.info(`\n${pc.bold('Targets')}`);

  for (const target of config.targets) {
    const adapter = adapters[target];
    if (!adapter) {
      log.warn(`Unknown target: ${target}`);
      continue;
    }

    log.info(pc.bold(adapter.name));

    const result = await adapter.doctor({ projectRoot: root, config });
    for (const check of result.checks) {
      const icon = statusIcon(check.status);
      if (check.status === 'pass') {
        console.log(`${icon} ${check.label}`);
      } else {
        console.log(`${icon} ${check.label}`);
        if (check.message) {
          log.dim(`  ${check.message}`);
        }
      }
    }
  }

  // Summary
  log.info(`\n${pc.bold('Summary')}`);
  log.success('Doctor check complete.');
  log.info('If any checks failed, run: agentstd sync');
}
