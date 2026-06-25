import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initCmd } from '../src/cli/commands/init';

describe('init --global', () => {
  let tmpBase: string;
  let projectDir: string;
  let homeDir: string;
  let prevCwd: string;
  let prevHome: string | undefined;

  beforeEach(async () => {
    tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), 'agentstd-initg-'));
    projectDir = path.join(tmpBase, 'project');
    homeDir = path.join(tmpBase, 'home');
    await fs.ensureDir(projectDir);
    await fs.ensureDir(homeDir);
    prevCwd = process.cwd();
    prevHome = process.env.AGENTSTD_HOME;
    process.env.AGENTSTD_HOME = homeDir;
    process.chdir(projectDir);
  });

  afterEach(async () => {
    process.chdir(prevCwd);
    if (prevHome === undefined) delete process.env.AGENTSTD_HOME;
    else process.env.AGENTSTD_HOME = prevHome;
    await fs.remove(tmpBase);
  });

  it('writes home .agentstd.yaml, hook, and ensures ~/.agents/skills/', async () => {
    await initCmd({ global: true });

    expect(await fs.pathExists(path.join(homeDir, '.agentstd.yaml'))).toBe(true);
    expect(await fs.pathExists(path.join(homeDir, '.agentstd', 'hooks', 'pretooluse.js'))).toBe(
      true,
    );
    expect(await fs.pathExists(path.join(homeDir, '.agents', 'skills'))).toBe(true);
  });

  it('does not write any project files', async () => {
    await initCmd({ global: true });
    expect(await fs.pathExists(path.join(projectDir, '.agentstd.yaml'))).toBe(false);
    expect(await fs.pathExists(path.join(projectDir, '.agentstd'))).toBe(false);
    expect(await fs.pathExists(path.join(projectDir, '.agents'))).toBe(false);
  });

  it('home config uses absolute hook path', async () => {
    await initCmd({ global: true });
    const raw = await fs.readFile(path.join(homeDir, '.agentstd.yaml'), 'utf8');
    expect(raw).toContain(homeDir);
    expect(raw).not.toContain('~');
  });

  it('refuses to overwrite an existing home config', async () => {
    await initCmd({ global: true });
    const first = await fs.readFile(path.join(homeDir, '.agentstd.yaml'), 'utf8');
    await initCmd({ global: true });
    const second = await fs.readFile(path.join(homeDir, '.agentstd.yaml'), 'utf8');
    expect(second).toBe(first);
  });
});
