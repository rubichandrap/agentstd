import path from 'node:path';
import type { AgentStdConfig } from './config';
import type { SkillSource } from './skill';

function homeSource(homeRoot: string, config: AgentStdConfig): SkillSource {
  return {
    root: homeRoot,
    dir: path.resolve(homeRoot, config.skills.homeDir),
    label: 'home',
  };
}

function projectSource(projectRoot: string, config: AgentStdConfig): SkillSource {
  return {
    root: projectRoot,
    dir: path.resolve(projectRoot, config.skills.dir),
    label: 'project',
  };
}

export function resolveSkillSources(
  projectRoot: string,
  config: AgentStdConfig,
  homeRoot: string,
  scope: 'project' | 'global' = 'project',
  hasHomeConfig = true,
): SkillSource[] {
  if (scope === 'global') {
    return [homeSource(homeRoot, config)];
  }

  if (config.projectOnly || !hasHomeConfig) {
    return [projectSource(projectRoot, config)];
  }

  return [homeSource(homeRoot, config), projectSource(projectRoot, config)];
}
