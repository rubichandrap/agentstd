import path from 'node:path';
import pc from 'picocolors';
import { getAdapter } from '../../adapters';
import { ConfigValidationError } from '../../core/config-merge';
import { fileExists, readDir } from '../../core/fs';
import { log } from '../../core/logger';
import {
  homeAgentStdConfigPath,
  homeAgentsSkillsDir,
  homeHooksDir,
  homeRoot,
  hooksDir,
} from '../../core/paths';
import type { DoctorCheck, DoctorContext } from '../../core/types';
import { loadAgentStdContext } from './sync-scope';

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
  const resolvedHomeRoot = homeRoot();
  const configPath = path.join(root, '.agentstd.yaml');
  let healthy = true;

  log.info('AgentStd Doctor\n');

  // Core checks
  log.info(pc.bold('Core'));

  if (!(await fileExists(configPath))) {
    log.error('.agentstd.yaml not found');
    log.dim('  Run: agentstd init');
    process.exit(1);
    return;
  }
  log.success('.agentstd.yaml found');

  let configValid = false;
  let config = null;
  let isProjectOnly = false;
  let scope: 'project' | 'global' = 'project';
  let outputRoot = root;
  let hasHomeConfig = false;
  let pathSources: Awaited<ReturnType<typeof loadAgentStdContext>>['pathSources'] | undefined;
  try {
    const loaded = await loadAgentStdContext(root, resolvedHomeRoot, options?.projectOnly);
    config = loaded.config;
    scope = loaded.scope;
    outputRoot = loaded.outputRoot;
    hasHomeConfig = loaded.hasHomeConfig;
    pathSources = loaded.pathSources;
    configValid = true;
    isProjectOnly = config.projectOnly;
    if (scope === 'global') {
      log.success('config valid (global sync scope)');
    } else if (isProjectOnly) {
      log.success('config valid (project-only mode)');
    } else {
      log.success('config valid');
      if (loaded.sources.length > 1) {
        log.dim(
          `  merged from: ${loaded.sources.map((s) => s.replace(resolvedHomeRoot, '~')).join(', ')}`,
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
    !isProjectOnly &&
    hasHomeConfig &&
    (await fileExists(path.join(homeHooksDir(), 'pretooluse.js')));
  if (projectHookExists) {
    log.success(`preToolUse hook found (${scope === 'global' ? 'home' : 'project'})`);
  } else if (homeHookExists) {
    log.success('preToolUse hook found (home)');
  } else {
    log.warn('preToolUse hook missing');
    log.dim('  Run: agentstd init or agentstd init --global');
  }

  if (config) {
    const skDir =
      scope === 'global'
        ? path.join(resolvedHomeRoot, config.skills.homeDir)
        : path.join(root, config.skills.dir);
    if (await fileExists(skDir)) {
      log.success(`${scope === 'global' ? 'home' : 'project'} skills directory found`);
    } else if (!isProjectOnly && scope !== 'global') {
      log.warn('project skills directory not found');
      log.dim(
        hasHomeConfig
          ? '  Merged skills will pull from home only'
          : '  No home config — nothing to merge',
      );
    }
  }

  // Home checks — skipped in project-only mode or when no home config exists
  if (!isProjectOnly && scope !== 'global' && hasHomeConfig) {
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
    process.exit(1);
    return;
  }

  // Target checks
  log.info(`\n${pc.bold('Targets')}`);

  for (const target of config.targets) {
    const adapter = getAdapter(target);
    if (!adapter) {
      log.warn(`Unknown target: ${target}`);
      continue;
    }

    log.info(pc.bold(adapter.name));

    const ctx: DoctorContext = {
      projectRoot: root,
      outputRoot,
      scope,
      config,
      homeRoot: resolvedHomeRoot,
      hasHomeConfig,
      pathSources,
    };
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
      if (check.status === 'fail' || check.status === 'warn') {
        healthy = false;
      }
    }
  }

  // Summary
  log.info(`\n${pc.bold('Summary')}`);
  if (healthy) {
    log.success('Doctor check complete.');
  } else {
    log.warn('Some checks failed or have warnings.');
    log.info('Run: agentstd sync');
    process.exit(1);
  }
}
