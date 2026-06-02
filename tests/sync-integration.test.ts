import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sync as claudeSync } from '../src/adapters/claude/sync';
import { initCmd } from '../src/cli/commands/init';
import type { SyncContext } from '../src/core/types';

describe('Sync integration', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentstd-test-'));
    process.chdir(tmpDir);
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  async function setupInit(): Promise<void> {
    const originalCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const configFile = path.join(tmpDir, '.agentstd.yaml');
      if (!(await fs.pathExists(configFile))) {
        await initCmd();
      }
    } finally {
      process.chdir(originalCwd);
    }
  }

  function makeCtx(dryRun = false): SyncContext {
    return {
      projectRoot: tmpDir,
      config: {
        version: 1,
        targets: ['claude'],
        hooks: {
          preToolUse: {
            command: 'node .agentstd/hooks/pretooluse.js',
          },
        },
        skills: { dir: '.agentstd/skills' },
        instructions: {},
      },
      dryRun,
    };
  }

  describe('init', () => {
    it('creates .agentstd.yaml', async () => {
      const configFile = path.join(tmpDir, '.agentstd.yaml');
      expect(await fs.pathExists(configFile)).toBe(false);
      await initCmd();
      expect(await fs.pathExists(configFile)).toBe(true);
    });

    it('creates .agentstd/hooks/pretooluse.js', async () => {
      await initCmd();
      expect(await fs.pathExists(path.join(tmpDir, '.agentstd', 'hooks', 'pretooluse.js'))).toBe(true);
    });

    it('creates .agentstd/skills/example-skill/SKILL.md', async () => {
      await initCmd();
      expect(await fs.pathExists(path.join(tmpDir, '.agentstd', 'skills', 'example-skill', 'SKILL.md'))).toBe(true);
    });

    it('running init twice does not destroy existing files', async () => {
      await initCmd();
      const configPath = path.join(tmpDir, '.agentstd.yaml');
      const before = await fs.readFile(configPath, 'utf8');
      await initCmd();
      const after = await fs.readFile(configPath, 'utf8');
      expect(after).toBe(before);
    });
  });

  describe('real sync', () => {
    it('creates .claude/settings.json', async () => {
      await setupInit();
      const result = await claudeSync(makeCtx(false));
      expect(result.changed).toContain('.claude/settings.json');
      expect(await fs.pathExists(path.join(tmpDir, '.claude', 'settings.json'))).toBe(true);
    });

    it('copies skills into .claude/skills', async () => {
      await setupInit();
      await claudeSync(makeCtx(false));
      expect(await fs.pathExists(path.join(tmpDir, '.claude', 'skills', 'example-skill', 'SKILL.md'))).toBe(true);
    });

    it('is idempotent', async () => {
      await setupInit();
      await claudeSync(makeCtx(false));
      const second = await claudeSync(makeCtx(false));
      expect(second.changed).toHaveLength(0);
      expect(second.operations.every((op) => op.type === 'skip')).toBe(true);
    });
  });

  describe('dry-run', () => {
    it('does not create .claude directory', async () => {
      await setupInit();
      await claudeSync(makeCtx(true));
      const claudeDir = path.join(tmpDir, '.claude');
      const exists = await fs.pathExists(claudeDir);
      expect(exists).toBe(false);
    });

    it('does not create .claude/settings.json', async () => {
      await setupInit();
      await claudeSync(makeCtx(true));
      expect(await fs.pathExists(path.join(tmpDir, '.claude', 'settings.json'))).toBe(false);
    });

    it('does not copy skill files', async () => {
      await setupInit();
      await claudeSync(makeCtx(true));
      expect(await fs.pathExists(path.join(tmpDir, '.claude', 'skills'))).toBe(false);
    });

    it('reports planned operations', async () => {
      await setupInit();
      const result = await claudeSync(makeCtx(true));
      expect(result.operations.length).toBeGreaterThan(0);
      const types = result.operations.map((op) => op.type);
      expect(types).toContain('create-dir');
      expect(types).toContain('create-file');
      expect(types).toContain('copy-dir');
    });
  });
});
