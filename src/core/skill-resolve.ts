import path from 'node:path';
import type { AgentStdConfig } from './config';
import type { SkillSource } from './skill';

export function resolveSkillSources(
  projectRoot: string,
  config: AgentStdConfig,
  homeRoot: string,
): SkillSource[] {
  const projectSource: SkillSource = {
    root: projectRoot,
    dir: path.resolve(projectRoot, config.skills.dir),
    label: 'project',
  };

  if (config.projectOnly) {
    return [projectSource];
  }

  return [
    {
      root: homeRoot,
      dir: path.join(homeRoot, config.skills.homeDir),
      label: 'home',
    },
    projectSource,
  ];
}
