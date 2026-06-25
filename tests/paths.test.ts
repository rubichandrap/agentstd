import os from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  agentStdDir,
  claudeDir,
  claudeSettingsPath,
  claudeSkillsDir,
  configPath,
  getProjectRoot,
  homeAgentStdConfigPath,
  homeAgentsSkillsDir,
  homeInstructionsDir,
  homeHooksDir,
  homeRoot,
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
    expect(skillsDir(root)).toBe('/home/user/project/.agents/skills');
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

  describe('home paths', () => {
    const fakeHome = '/home/fake';

    it('homeRoot honors AGENTSTD_HOME override', () => {
      const prev = process.env.AGENTSTD_HOME;
      process.env.AGENTSTD_HOME = fakeHome;
      try {
        expect(homeRoot()).toBe(fakeHome);
      } finally {
        if (prev === undefined) delete process.env.AGENTSTD_HOME;
        else process.env.AGENTSTD_HOME = prev;
      }
    });

    it('homeRoot falls back to os.homedir when env unset', () => {
      const prev = process.env.AGENTSTD_HOME;
      delete process.env.AGENTSTD_HOME;
      try {
        expect(homeRoot()).toBe(os.homedir());
      } finally {
        if (prev === undefined) delete process.env.AGENTSTD_HOME;
        else process.env.AGENTSTD_HOME = prev;
      }
    });

    it('builds home path helpers from AGENTSTD_HOME', () => {
      const prev = process.env.AGENTSTD_HOME;
      process.env.AGENTSTD_HOME = fakeHome;
      try {
        expect(homeAgentStdConfigPath()).toBe('/home/fake/.agentstd.yaml');
        expect(homeHooksDir()).toBe('/home/fake/.agentstd/hooks');
        expect(homeInstructionsDir()).toBe('/home/fake/.agentstd/instructions');
        expect(homeAgentsSkillsDir()).toBe('/home/fake/.agents/skills');
      } finally {
        if (prev === undefined) delete process.env.AGENTSTD_HOME;
        else process.env.AGENTSTD_HOME = prev;
      }
    });
  });
});
