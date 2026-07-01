import path from 'node:path';
import pc from 'picocolors';
import {
  ConfigValidationError,
  loadMergedConfig,
  type MergedConfigResult,
} from '../../core/config-merge';
import { fileExists } from '../../core/fs';
import { log } from '../../core/logger';
import { homeRoot } from '../../core/paths';
import { listMergedSkills } from '../../core/skill';
import { resolveSkillSources } from '../../core/skill-resolve';
import type { AgentStdConfig } from '../../core/types';

export interface StatusOptions {
  projectOnly?: boolean;
}

export async function statusCmd(options?: StatusOptions): Promise<void> {
  const root = process.cwd();
  const configPath = path.join(root, '.agentstd.yaml');

  log.info(pc.bold('AgentStd Status\n'));

  if (!(await fileExists(configPath))) {
    log.error('.agentstd.yaml not found');
    log.dim('  Run: agentstd init');
    return;
  }

  let merged: MergedConfigResult;
  try {
    merged = await loadMergedConfig(root, homeRoot(), options?.projectOnly);
  } catch (err) {
    if (err instanceof ConfigValidationError) {
      log.error('config invalid');
      for (const issue of err.issues) {
        log.dim(`  - ${issue.path}: ${issue.message}`);
      }
    } else {
      log.error(`${(err as Error).message}`);
    }
    return;
  }

  const { config, sources } = merged;
  const skillSources = resolveSkillSources(root, config, homeRoot());
  const skills = await listMergedSkills(skillSources);
  const projectSkillCount = skills.filter((skill) => skill.source === 'project').length;
  const homeSkillCount = skills.filter((skill) => skill.source === 'home').length;

  log.info(pc.bold('Project'));
  log.success('.agentstd.yaml found');
  log.success('config valid');
  log.dim(`mode: ${config.projectOnly ? 'project-only' : 'merged home + project'}`);
  log.dim(`targets: ${config.targets.join(', ')}`);

  log.info(`\n${pc.bold('Sources')}`);
  log.dim(`project: ${path.relative(root, sources[sources.length - 1]) || '.agentstd.yaml'}`);
  if (!config.projectOnly) {
    const homeSource = sources.find((source) => source.startsWith(homeRoot()));
    if (homeSource) {
      log.dim(`home: ${homeSource.replace(homeRoot(), '~')}`);
    } else {
      log.dim('home: not found');
    }
  }

  log.info(`\n${pc.bold('Configured')}`);
  log.dim(`skills: ${skills.length} total (${projectSkillCount} project, ${homeSkillCount} home)`);
  log.dim(`hooks: ${configuredHooks(config).join(', ') || 'none'}`);
  log.dim(`instructions: ${configuredInstructions(config).join(', ') || 'none'}`);
  log.dim(`mcpServers: ${Object.keys(config.mcpServers ?? {}).join(', ') || 'none'}`);
  log.dim(`permissions: ${configuredPermissions(config).join(', ') || 'none'}`);
  log.dim(`agents: ${Object.keys(config.agents ?? {}).join(', ') || 'none'}`);

  log.info(`\n${pc.bold('Next')}`);
  log.dim('Run: agentstd sync');
  log.dim('Run: agentstd check');
}

function configuredHooks(config: AgentStdConfig): string[] {
  return config.hooks.preToolUse ? ['preToolUse'] : [];
}

function configuredInstructions(config: AgentStdConfig): string[] {
  return config.instructions.shared ? ['shared'] : [];
}

function configuredPermissions(config: AgentStdConfig): string[] {
  const entries: string[] = [];
  const commandPermissions = config.permissions?.commands;
  const filePermissions = config.permissions?.files;
  const hasCommandPermissions = Object.values(commandPermissions ?? {}).some(
    (items) => items.length > 0,
  );
  const hasFilePermissions =
    (filePermissions?.denyRead ?? []).length > 0 || (filePermissions?.denyWrite ?? []).length > 0;

  if (hasCommandPermissions) entries.push('commands');
  if (hasFilePermissions) entries.push('files');
  return entries;
}
