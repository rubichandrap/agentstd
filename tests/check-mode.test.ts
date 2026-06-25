import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sync as claudeSync } from '../src/adapters/claude/sync';
import { initCmd } from '../src/cli/commands/init';
import type { SyncContext } from '../src/core/types';

describe('Check mode', () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentstd-test-'));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.remove(tmpDir);
  });

  function makeCtx(dryRun = false): SyncContext {
    return {
      projectRoot: tmpDir,
      homeRoot: path.join(tmpDir, 'home'),
      config: {
        version: 1,
        targets: ['claude'],
        hooks: {
          preToolUse: {
            command: 'node .agentstd/hooks/pretooluse.js',
          },
        },
        skills: { dir: '.agents/skills', homeDir: '.agents/skills' },
        instructions: {},
      },
      dryRun,
    };
  }

  async function setupInit(): Promise<void> {
    const configFile = path.join(tmpDir, '.agentstd.yaml');
    if (!(await fs.pathExists(configFile))) {
      await initCmd();
    }
  }

  it('reports changes needed when not synced', async () => {
    await setupInit();
    const ctx = makeCtx(true);
    const result = await claudeSync(ctx);
    expect(result.changed.length).toBeGreaterThan(0);
    expect(result.operations.length).toBeGreaterThan(0);
  });

  it('reports no changes when already synced', async () => {
    await setupInit();
    await claudeSync(makeCtx(false));

    const ctx = makeCtx(true);
    const result = await claudeSync(ctx);
    expect(result.changed).toHaveLength(0);
    expect(result.operations.every((op) => op.type === 'skip')).toBe(true);
  });

  it('does not modify files in check mode', async () => {
    await setupInit();
    const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
    expect(await fs.pathExists(settingsPath)).toBe(false);

    const ctx = makeCtx(true);
    await claudeSync(ctx);
    expect(await fs.pathExists(settingsPath)).toBe(false);
  });
});
