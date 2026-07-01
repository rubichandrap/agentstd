import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import YAML from 'yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initCmd } from '../src/cli/commands/init';

describe('init interactive target selection', () => {
  let tmpBase: string;
  let projectDir: string;
  let homeDir: string;
  let prevCwd: string;
  let prevHome: string | undefined;

  beforeEach(async () => {
    tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), 'agentstd-initint-'));
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

  async function loadConfig(): Promise<{ targets: string[] }> {
    const raw = await fs.readFile(path.join(projectDir, '.agentstd.yaml'), 'utf8');
    return YAML.parse(raw) as { targets: string[] };
  }

  it('uses --target flags without prompting', async () => {
    let called = false;
    await initCmd({
      interactive: true,
      targets: ['codex'],
      promptTargets: async () => {
        called = true;
        return [];
      },
    });
    const config = await loadConfig();
    expect(config.targets).toEqual(['codex']);
    expect(called).toBe(false);
  });

  it('accepts multiple --target flags', async () => {
    await initCmd({ interactive: false, targets: ['claude', 'codex'] });
    const config = await loadConfig();
    expect(config.targets).toEqual(['claude', 'codex']);
  });

  it('prompts via the injected seam when interactive and no targets given', async () => {
    await initCmd({
      interactive: true,
      promptTargets: async () => ['claude', 'codex'],
    });
    const config = await loadConfig();
    expect(config.targets).toEqual(['claude', 'codex']);
  });

  it('non-interactive without targets uses the default (claude)', async () => {
    let called = false;
    await initCmd({
      interactive: false,
      promptTargets: async () => {
        called = true;
        return [];
      },
    });
    const config = await loadConfig();
    expect(config.targets).toEqual(['claude']);
    expect(called).toBe(false);
  });

  it('global init honors the injected targets too', async () => {
    await initCmd({
      global: true,
      interactive: true,
      promptTargets: async () => ['codex'],
    });
    const raw = await fs.readFile(path.join(homeDir, '.agentstd.yaml'), 'utf8');
    const config = YAML.parse(raw) as { targets: string[] };
    expect(config.targets).toEqual(['codex']);
  });
});
