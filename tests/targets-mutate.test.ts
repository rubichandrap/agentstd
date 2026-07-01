import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import YAML from 'yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { targetsAddCmd, targetsRemoveCmd } from '../src/cli/commands/targets-mutate';

describe('targets add/remove', () => {
  let tmpBase: string;
  let projectDir: string;
  let homeDir: string;
  let prevCwd: string;
  let prevHome: string | undefined;
  let configFile: string;

  beforeEach(async () => {
    tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), 'agentstd-targets-mut-'));
    projectDir = path.join(tmpBase, 'project');
    homeDir = path.join(tmpBase, 'home');
    await fs.ensureDir(projectDir);
    await fs.ensureDir(homeDir);
    prevCwd = process.cwd();
    prevHome = process.env.AGENTSTD_HOME;
    process.env.AGENTSTD_HOME = homeDir;
    process.chdir(projectDir);
    configFile = path.join(projectDir, '.agentstd.yaml');
  });

  afterEach(async () => {
    process.chdir(prevCwd);
    if (prevHome === undefined) delete process.env.AGENTSTD_HOME;
    else process.env.AGENTSTD_HOME = prevHome;
    await fs.remove(tmpBase);
  });

  async function seedConfig(targets: string[]): Promise<void> {
    await fs.writeFile(
      configFile,
      YAML.stringify({ version: 1, projectOnly: true, targets }),
    );
  }

  it('adds a target to the project config and writes a .bak backup', async () => {
    await seedConfig(['claude']);
    await targetsAddCmd('codex', {});
    const parsed = YAML.parse(await fs.readFile(configFile, 'utf8'));
    expect(parsed.targets).toEqual(['claude', 'codex']);
    expect(await fs.pathExists(`${configFile}.bak`)).toBe(true);
  });

  it('is a no-op when the target is already configured', async () => {
    await seedConfig(['claude', 'codex']);
    await targetsAddCmd('codex', {});
    const parsed = YAML.parse(await fs.readFile(configFile, 'utf8'));
    expect(parsed.targets).toEqual(['claude', 'codex']);
    expect(await fs.pathExists(`${configFile}.bak`)).toBe(false);
  });

  it('rejects an unknown target id', async () => {
    await seedConfig(['claude']);
    const exit = process.exit;
    process.exit = ((code?: number) => {
      throw new Error(`exit ${code ?? 0}`);
    }) as never;
    await expect(targetsAddCmd('nonsense', {})).rejects.toThrow('exit 1');
    process.exit = exit;
    const parsed = YAML.parse(await fs.readFile(configFile, 'utf8'));
    expect(parsed.targets).toEqual(['claude']);
  });

  it('removes a target from the project config', async () => {
    await seedConfig(['claude', 'codex']);
    await targetsRemoveCmd('codex', {});
    const parsed = YAML.parse(await fs.readFile(configFile, 'utf8'));
    expect(parsed.targets).toEqual(['claude']);
  });

  it('refuses to remove the last configured target', async () => {
    await seedConfig(['claude']);
    const exit = process.exit;
    process.exit = ((code?: number) => {
      throw new Error(`exit ${code ?? 0}`);
    }) as never;
    await expect(targetsRemoveCmd('claude', {})).rejects.toThrow('exit 1');
    process.exit = exit;
    const parsed = YAML.parse(await fs.readFile(configFile, 'utf8'));
    expect(parsed.targets).toEqual(['claude']);
  });

  it('errors when config is missing', async () => {
    const exit = process.exit;
    process.exit = ((code?: number) => {
      throw new Error(`exit ${code ?? 0}`);
    }) as never;
    await expect(targetsAddCmd('codex', {})).rejects.toThrow('exit 1');
    process.exit = exit;
  });

  it('persists other config keys when mutating targets', async () => {
    await fs.writeFile(
      configFile,
      YAML.stringify({
        version: 1,
        projectOnly: true,
        targets: ['claude'],
        hooks: { preToolUse: { command: 'node .agentstd/hooks/pretooluse.js' } },
        skills: { dir: '.agents/skills', homeDir: '.agents/skills' },
      }),
    );
    await targetsAddCmd('codex', {});
    const parsed = YAML.parse(await fs.readFile(configFile, 'utf8'));
    expect(parsed.targets).toEqual(['claude', 'codex']);
    expect(parsed.hooks.preToolUse.command).toBe('node .agentstd/hooks/pretooluse.js');
    expect(parsed.skills.dir).toBe('.agents/skills');
    expect(parsed.projectOnly).toBe(true);
  });
});
