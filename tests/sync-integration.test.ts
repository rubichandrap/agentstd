import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sync as claudeSync } from '../src/adapters/claude/sync';
import { initCmd } from '../src/cli/commands/init';
import { agentStdConfigSchema } from '../src/core/config';
import type { SyncContext } from '../src/core/types';

describe('Sync integration', () => {
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

  async function setupInit(): Promise<void> {
    const configFile = path.join(tmpDir, '.agentstd.yaml');
    if (await fs.pathExists(configFile)) {
      return;
    }
    process.chdir(tmpDir);
    try {
      await initCmd();
    } finally {
      process.chdir(originalCwd);
    }
  }

  function makeCtx(dryRun = false): SyncContext {
    return {
      projectRoot: tmpDir,
      homeRoot: path.join(tmpDir, 'home'),
      config: agentStdConfigSchema.parse({
        version: 1,
        targets: ['claude'],
        hooks: {
          preToolUse: {
            command: 'node .agentstd/hooks/pretooluse.js',
          },
        },
        skills: { dir: '.agents/skills', homeDir: '.agents/skills' },
        instructions: {},
      }),
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
      expect(await fs.pathExists(path.join(tmpDir, '.agentstd', 'hooks', 'pretooluse.js'))).toBe(
        true,
      );
    });

    it('default pretooluse hook exits 0 for safe input and 2 for blocked input', async () => {
      await initCmd();
      const hookPath = path.join(tmpDir, '.agentstd', 'hooks', 'pretooluse.js');

      const safe = await runHook(hookPath, {
        tool_name: 'Bash',
        tool_input: { command: 'pnpm test' },
      });
      const blocked = await runHook(hookPath, {
        tool_name: 'Bash',
        tool_input: { command: 'rm -rf dist' },
      });
      const hook = await fs.readFile(hookPath, 'utf8');

      expect(safe.code).toBe(0);
      expect(blocked.code).toBe(2);
      expect(hook).toContain('dangerous command detected');
    });

    it('creates .agents/skills/example-skill/SKILL.md', async () => {
      await initCmd();
      expect(
        await fs.pathExists(path.join(tmpDir, '.agents', 'skills', 'example-skill', 'SKILL.md')),
      ).toBe(true);
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
      expect(
        await fs.pathExists(path.join(tmpDir, '.claude', 'skills', 'example-skill', 'SKILL.md')),
      ).toBe(true);
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

function runHook(
  hookPath: string,
  input: unknown,
): Promise<{ code: number | null; stderr: string }> {
  const inputPath = path.join(path.dirname(hookPath), `.hook-input-${Date.now()}.json`);
  return new Promise((resolve, reject) => {
    fs.writeFileSync(inputPath, JSON.stringify(input));
    const inputFd = fs.openSync(inputPath, 'r');
    const child = spawn(process.execPath, [hookPath], {
      stdio: [inputFd, 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => {
      fs.closeSync(inputFd);
      fs.removeSync(inputPath);
      reject(error);
    });
    child.on('close', (code) => {
      fs.closeSync(inputFd);
      fs.removeSync(inputPath);
      resolve({ code, stderr });
    });
  });
}
