import path from 'node:path';

export function getProjectRoot(): string {
  return process.cwd();
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
  return path.join(root, relative ?? '.agentstd/skills');
}

export function instructionsDir(root: string): string {
  return path.join(agentStdDir(root), 'instructions');
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
