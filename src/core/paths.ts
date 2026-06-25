import os from 'node:os';
import path from 'node:path';

export function getProjectRoot(): string {
  return process.cwd();
}

export function homeRoot(): string {
  return process.env.AGENTSTD_HOME ?? os.homedir();
}

export function agentStdDir(root: string): string {
  return path.join(root, '.agentstd');
}

export function configPath(root: string): string {
  return path.join(root, '.agentstd.yaml');
}

export function hooksDir(root: string): string {
  return path.join(agentStdDir(root), 'hooks');
}

export function skillsDir(root: string, relative?: string): string {
  return path.join(root, relative ?? '.agents/skills');
}

export function instructionsDir(root: string): string {
  return path.join(agentStdDir(root), 'instructions');
}

export function homeAgentStdDir(): string {
  return path.join(homeRoot(), '.agentstd');
}

export function homeAgentStdConfigPath(): string {
  return path.join(homeRoot(), '.agentstd.yaml');
}

export function homeHooksDir(): string {
  return path.join(homeAgentStdDir(), 'hooks');
}

export function homeInstructionsDir(): string {
  return path.join(homeAgentStdDir(), 'instructions');
}

export function homeAgentsSkillsDir(): string {
  return path.join(homeRoot(), '.agents', 'skills');
}

export function claudeDir(root: string): string {
  return path.join(root, '.claude');
}

export function claudeSettingsPath(root: string): string {
  return path.join(claudeDir(root), 'settings.json');
}

export function claudeSkillsDir(root: string): string {
  return path.join(claudeDir(root), 'skills');
}
