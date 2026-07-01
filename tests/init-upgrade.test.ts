import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import YAML from 'yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initCmd } from '../src/cli/commands/init';

describe('init upgrade (existing project config)', () => {
  let tmpBase: string;
  let projectDir: string;
  let homeDir: string;
  let prevCwd: string;
  let prevHome: string | undefined;
  let configFile: string;

  beforeEach(async () => {
    tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), 'agentstd-initup-'));
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

  it('backfills missing default keys and writes a .bak backup', async () => {
    // A stale, minimal config missing most keys.
    await fs.writeFile(configFile, YAML.stringify({ version: 1, targets: ['claude', 'codex'] }));
    const original = await fs.readFile(configFile, 'utf8');

    await initCmd({});

    const upgraded = YAML.parse(await fs.readFile(configFile, 'utf8'));
    // User values preserved.
    expect(upgraded.targets).toEqual(['claude', 'codex']);
    // New default keys added.
    expect(upgraded.permissions).toBeDefined();
    expect(upgraded.mcpServers).toEqual({});
    expect(upgraded.agents).toEqual({});
    expect(upgraded.projectOnly).toBe(false);

    // Backup holds the original content.
    const bak = await fs.readFile(`${configFile}.bak`, 'utf8');
    expect(bak).toBe(original);
  });

  it('is idempotent: a second init reports up to date and writes no new backup', async () => {
    await fs.writeFile(configFile, YAML.stringify({ version: 1, targets: ['claude'] }));
    await initCmd({}); // first upgrade normalizes the file
    const normalized = await fs.readFile(configFile, 'utf8');
    await fs.remove(`${configFile}.bak`);

    await initCmd({}); // second run should be a no-op

    expect(await fs.readFile(configFile, 'utf8')).toBe(normalized);
    expect(await fs.pathExists(`${configFile}.bak`)).toBe(false);
  });

  it('--dry-run does not modify the file or create a backup', async () => {
    await fs.writeFile(configFile, YAML.stringify({ version: 1, targets: ['claude'] }));
    const original = await fs.readFile(configFile, 'utf8');

    await initCmd({ dryRun: true });

    expect(await fs.readFile(configFile, 'utf8')).toBe(original);
    expect(await fs.pathExists(`${configFile}.bak`)).toBe(false);
  });

  it('--force resets the config to defaults and backs up the old one', async () => {
    await fs.writeFile(
      configFile,
      YAML.stringify({ version: 1, targets: ['codex'], mcpServers: { custom: {} } }),
    );
    const original = await fs.readFile(configFile, 'utf8');

    await initCmd({ force: true });

    const reset = YAML.parse(await fs.readFile(configFile, 'utf8'));
    expect(reset.targets).toEqual(['claude']);
    expect(reset.mcpServers).toEqual({});
    expect(await fs.readFile(`${configFile}.bak`, 'utf8')).toBe(original);
  });
});
