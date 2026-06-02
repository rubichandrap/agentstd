import { describe, expect, it } from 'vitest';
import {
  agentStdDir,
  claudeDir,
  claudeSettingsPath,
  claudeSkillsDir,
  configPath,
  getProjectRoot,
  hooksDir,
  instructionsDir,
  skillsDir,
} from '../src/core/paths';

describe('paths', () => {
  const root = '/home/user/project';

  it('returns cwd for getProjectRoot', () => {
    expect(getProjectRoot()).toBe(process.cwd());
  });

  it('builds agentStdDir', () => {
    expect(agentStdDir(root)).toBe('/home/user/project/.agentstd');
  });

  it('builds configPath', () => {
    expect(configPath(root)).toBe('/home/user/project/.agentstd.yaml');
  });

  it('builds hooksDir', () => {
    expect(hooksDir(root)).toBe('/home/user/project/.agentstd/hooks');
  });

  it('builds skillsDir with default', () => {
    expect(skillsDir(root)).toBe('/home/user/project/.agentstd/skills');
  });

  it('builds skillsDir with explicit relative', () => {
    expect(skillsDir(root, 'custom/skills')).toBe('/home/user/project/custom/skills');
  });

  it('builds instructionsDir', () => {
    expect(instructionsDir(root)).toBe('/home/user/project/.agentstd/instructions');
  });

  it('builds claudeDir', () => {
    expect(claudeDir(root)).toBe('/home/user/project/.claude');
  });

  it('builds claudeSettingsPath', () => {
    expect(claudeSettingsPath(root)).toBe('/home/user/project/.claude/settings.json');
  });

  it('builds claudeSkillsDir', () => {
    expect(claudeSkillsDir(root)).toBe('/home/user/project/.claude/skills');
  });
});
