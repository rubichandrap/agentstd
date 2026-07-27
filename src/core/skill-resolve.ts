import path from 'node:path';
import type { AgentStdConfig } from './config';
import type { SkillSource } from './skill';

export function resolveSkillSources(
  projectRoot: string,
  config: AgentStdConfig,
  homeRoot: string,
  scope: 'project' | 'global' = 'project',
  hasHomeConfig = true,
): SkillSource[] {
  if (scope === 'global') {
    return [
      {
        root: homeRoot,
        dir: path.join(homeRoot, config.skills.homeDir),
        label: 'home',
      },
    ];
  }

  if (config.projectOnly || !hasHomeConfig) {
    return [
      {
        root: projectRoot,
        dir: path.resolve(projectRoot, config.skills.dir),
        label: 'project',
      },
    ];
  }

  return [
    {
      root: homeRoot,
      dir: path.join(homeRoot, config.skills.homeDir),
      label: 'home',
    },
    {
      root: projectRoot,
      dir: path.resolve(projectRoot, config.skills.dir),
      label: 'project',
    },
  ];
}
