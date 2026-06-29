import path from 'node:path';
import pc from 'picocolors';
import { claudeAdapter } from '../../adapters/claude/index';
import { ConfigValidationError, loadMergedConfig } from '../../core/config-merge';
import { fileExists, readDir } from '../../core/fs';
import { log } from '../../core/logger';
import {
  homeAgentStdConfigPath,
  homeAgentsSkillsDir,
  homeHooksDir,
  homeRoot,
  hooksDir,
} from '../../core/paths';
import type { AgentAdapter, DoctorCheck, DoctorContext } from '../../core/types';

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

export async function doctorCmd(options?: { projectOnly?: boolean }): Promise<void> {
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

  let configValid = false;
  let config = null;
  let isProjectOnly = false;
  try {
    const merged = await loadMergedConfig(root, homeRoot(), options?.projectOnly);
    config = merged.config;
    configValid = true;
    isProjectOnly = config.projectOnly;
    if (isProjectOnly) {
      log.success('config valid (project-only mode)');
    } else {
      log.success('config valid');
      if (merged.sources.length > 1) {
        log.dim(
          `  merged from: ${merged.sources.map((s) => s.replace(homeRoot(), '~')).join(', ')}`,
        );
      }
    }
  } catch (err) {
    if (err instanceof ConfigValidationError) {
      log.error('config invalid');
      for (const issue of err.issues) {
        log.dim(`  - ${issue.path}: ${issue.message}`);
      }
    } else {
      log.error(`${(err as Error).message}`);
    }
  }

  const projectHookExists = await fileExists(path.join(hooksDir(root), 'pretooluse.js'));
  const homeHookExists =
    !isProjectOnly && (await fileExists(path.join(homeHooksDir(), 'pretooluse.js')));
  if (projectHookExists) {
    log.success('preToolUse hook found (project)');
  } else if (homeHookExists) {
    log.success('preToolUse hook found (home)');
  } else {
    log.warn('preToolUse hook missing');
    log.dim('  Run: agentstd init or agentstd init --global');
  }

  if (config) {
    const skDir = path.resolve(root, config.skills.dir);
    if (await fileExists(skDir)) {
      log.success('project skills directory found');
    } else if (!isProjectOnly) {
      log.warn('project skills directory not found');
      log.dim('  Merged skills will pull from home only');
    }
  }

  // Home checks — skipped in project-only mode
  if (!isProjectOnly) {
    log.info(`\n${pc.bold('Home')}`);
    const homeConfigExists = await fileExists(homeAgentStdConfigPath());
    if (homeConfigExists) {
      log.success('home .agentstd.yaml found');
    } else {
      log.dim('home config not found (project-only mode will apply automatically)');
    }
    const homeSkills = await readDir(homeAgentsSkillsDir());
    if (homeSkills.length > 0) {
      log.success(`${homeSkills.length} home skill(s) available`);
    } else {
      log.dim('no home skills found at ~/.agents/skills');
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

    const ctx: DoctorContext = { projectRoot: root, config, homeRoot: homeRoot() };
    const result = await adapter.doctor(ctx);
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
