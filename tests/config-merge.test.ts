import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import YAML from 'yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadMergedConfig } from '../src/core/config-merge';

describe('loadMergedConfig', () => {
  let projectDir: string;
  let homeDir: string;
  let tmpBase: string;
  let prevHome: string | undefined;

  beforeEach(async () => {
    tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), 'agentstd-merge-'));
    projectDir = path.join(tmpBase, 'project');
    homeDir = path.join(tmpBase, 'home');
    await fs.ensureDir(projectDir);
    await fs.ensureDir(homeDir);
    prevHome = process.env.AGENTSTD_HOME;
    process.env.AGENTSTD_HOME = homeDir;
  });

  afterEach(async () => {
    if (prevHome === undefined) delete process.env.AGENTSTD_HOME;
    else process.env.AGENTSTD_HOME = prevHome;
    await fs.remove(tmpBase);
  });

  async function writeProjectConfig(obj: Record<string, unknown>): Promise<void> {
    await fs.writeFile(path.join(projectDir, '.agentstd.yaml'), YAML.stringify(obj));
  }

  async function writeHomeConfig(obj: Record<string, unknown>): Promise<void> {
    await fs.writeFile(path.join(homeDir, '.agentstd.yaml'), YAML.stringify(obj));
  }

  it('project-only when home config missing', async () => {
    await writeProjectConfig({ version: 1, targets: ['claude'] });
    const { config, sources } = await loadMergedConfig(projectDir, homeDir);
    expect(config.targets).toEqual(['claude']);
    expect(config.skills.dir).toBe('.agents/skills');
    expect(sources).toHaveLength(1);
    expect(sources[0]).toBe(path.join(projectDir, '.agentstd.yaml'));
  });

  it('deep-merges: home provides base, project overrides scalars', async () => {
    await writeHomeConfig({
      version: 1,
      targets: ['claude', 'opencode'],
      hooks: { preToolUse: { command: 'node ~/.agentstd/hooks/pretooluse.js' } },
      skills: { dir: '.agentstd/skills', homeDir: '.agentstd/skills' },
    });
    await writeProjectConfig({
      version: 1,
      hooks: { preToolUse: { command: 'node .agentstd/hooks/pretooluse.js' } },
    });
    const { config, sources } = await loadMergedConfig(projectDir, homeDir);
    expect(sources).toHaveLength(2);
    expect(config.hooks.preToolUse?.command).toBe('node .agentstd/hooks/pretooluse.js');
    expect(config.skills.dir).toBe('.agentstd/skills');
    expect(config.targets).toEqual(['claude', 'opencode']);
  });

  it('targets array is replaced, not concatenated', async () => {
    await writeHomeConfig({ version: 1, targets: ['claude', 'opencode', 'pi'] });
    await writeProjectConfig({ version: 1, targets: ['claude'] });
    const { config } = await loadMergedConfig(projectDir, homeDir);
    expect(config.targets).toEqual(['claude']);
  });

  it('throws on version mismatch between home and project', async () => {
    await writeHomeConfig({ version: 2 });
    await writeProjectConfig({ version: 1 });
    await expect(loadMergedConfig(projectDir, homeDir)).rejects.toThrow(/version mismatch/i);
  });

  it('throws when project .agentstd.yaml missing', async () => {
    await expect(loadMergedConfig(projectDir, homeDir)).rejects.toThrow(/not found/i);
  });

  it('rejects invalid merged config with ConfigValidationError', async () => {
    await writeHomeConfig({ version: 1 });
    await writeProjectConfig({ version: 1, targets: 'not-an-array' });
    await expect(loadMergedConfig(projectDir, homeDir)).rejects.toThrow(/Invalid config/);
  });

  it('project skills.dir overrides home skills.dir', async () => {
    await writeHomeConfig({
      version: 1,
      skills: { dir: '.agentstd/skills', homeDir: '.agentstd/skills' },
    });
    await writeProjectConfig({
      version: 1,
      skills: { dir: '.agents/skills', homeDir: '.agents/skills' },
    });
    const { config } = await loadMergedConfig(projectDir, homeDir);
    expect(config.skills.dir).toBe('.agents/skills');
    expect(config.skills.homeDir).toBe('.agents/skills');
  });

  describe('projectOnly', () => {
    it('project config projectOnly: true skips home even when home exists', async () => {
      await writeHomeConfig({
        version: 1,
        targets: ['claude', 'opencode'],
        hooks: { preToolUse: { command: 'node ~/.agentstd/hooks/pretooluse.js' } },
      });
      await writeProjectConfig({
        version: 1,
        projectOnly: true,
        targets: ['claude'],
      });
      const { config, sources } = await loadMergedConfig(projectDir, homeDir);
      expect(config.projectOnly).toBe(true);
      expect(config.targets).toEqual(['claude']);
      expect(sources).toHaveLength(1);
      expect(sources[0]).toBe(path.join(projectDir, '.agentstd.yaml'));
    });

    it('flag projectOnly=true overrides config projectOnly: false', async () => {
      await writeHomeConfig({ version: 1, targets: ['claude', 'opencode'] });
      await writeProjectConfig({ version: 1, projectOnly: false, targets: ['claude'] });
      const { config, sources } = await loadMergedConfig(projectDir, homeDir, true);
      expect(config.projectOnly).toBe(true);
      expect(sources).toHaveLength(1);
    });

    it('flag projectOnly=false overrides config projectOnly: true (forces home merge)', async () => {
      await writeHomeConfig({ version: 1, targets: ['claude', 'opencode'] });
      await writeProjectConfig({ version: 1, projectOnly: true, targets: ['claude'] });
      const { config, sources } = await loadMergedConfig(projectDir, homeDir, false);
      expect(config.projectOnly).toBe(false);
      expect(config.targets).toEqual(['claude']);
      expect(sources).toHaveLength(2);
    });

    it('projectOnly: true in project avoids version-mismatch check against home', async () => {
      await writeHomeConfig({ version: 2 });
      await writeProjectConfig({ version: 1, projectOnly: true });
      const { config } = await loadMergedConfig(projectDir, homeDir);
      expect(config.version).toBe(1);
    });
  });
});
