import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import YAML from 'yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { doctorCmd } from '../src/cli/commands/doctor';

describe('doctor/check exit code', () => {
  let tmpDir: string;
  let homeDir: string;
  let originalCwd: string;
  let originalExit: typeof process.exit;
  let originalEnv: string | undefined;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentstd-doctor-exit-'));
    homeDir = path.join(tmpDir, 'home');
    await fs.ensureDir(homeDir);
    originalCwd = process.cwd();
    process.chdir(tmpDir);
    originalExit = process.exit;
    originalEnv = process.env.AGENTSTD_HOME;
    process.env.AGENTSTD_HOME = homeDir;
    process.exit = ((code?: number) => {
      throw new Error(`exit ${code ?? 0}`);
    }) as never;
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    process.exit = originalExit;
    if (originalEnv === undefined) delete process.env.AGENTSTD_HOME;
    else process.env.AGENTSTD_HOME = originalEnv;
    await fs.remove(tmpDir);
  });

  async function writeConfig(config: Record<string, unknown>): Promise<void> {
    await fs.writeFile(path.join(tmpDir, '.agentstd.yaml'), YAML.stringify(config));
  }

  function validConfig(): Record<string, unknown> {
    return {
      version: 1,
      targets: ['claude'],
      hooks: { preToolUse: { command: 'node .agentstd/hooks/pretooluse.js' } },
      skills: { dir: '.agents/skills', homeDir: '.agents/skills' },
      instructions: { shared: '.agentstd/instructions/shared.md' },
    };
  }

  it('exits 1 when .agentstd.yaml is missing', async () => {
    await expect(doctorCmd()).rejects.toThrow('exit 1');
  });

  it('exits 1 when config is invalid', async () => {
    await writeConfig({ version: 1, targets: 'not-an-array' });
    await expect(doctorCmd()).rejects.toThrow('exit 1');
  });

  it('exits 1 when adapter checks have failures', async () => {
    const config = validConfig();
    await writeConfig(config);
    // No .claude/ dir, no synced hooks/skills → adapter checks will warn/fail
    await expect(doctorCmd()).rejects.toThrow('exit 1');
  });

  it('exits 0 when everything is healthy', async () => {
    const config = validConfig();
    await writeConfig(config);

    // Create the hook file
    const hooksPath = path.join(tmpDir, '.agentstd', 'hooks');
    await fs.ensureDir(hooksPath);
    await fs.writeFile(path.join(hooksPath, 'pretooluse.js'), '// hook');

    // Create instructions
    const instrPath = path.join(tmpDir, '.agentstd', 'instructions');
    await fs.ensureDir(instrPath);
    await fs.writeFile(path.join(instrPath, 'shared.md'), '# Shared');

    // Create skills dir
    await fs.ensureDir(path.join(tmpDir, '.agents', 'skills'));

    // Run sync to make everything green
    const { syncCmd } = await import('../src/cli/commands/sync');
    await syncCmd(undefined, { all: true });

    // Now doctor should pass — no exit(1) should be thrown
    await expect(doctorCmd()).resolves.toBeUndefined();
  });
});
