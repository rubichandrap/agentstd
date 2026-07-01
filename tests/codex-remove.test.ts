import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { codexAdapter } from '../src/adapters/codex';
import type { RemoveContext, SyncContext } from '../src/core/types';

describe('Codex adapter remove', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentstd-codex-rm-'));
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  function makeCtx(): SyncContext {
    return {
      projectRoot: tmpDir,
      homeRoot: path.join(tmpDir, 'home'),
      dryRun: false,
      config: {
        version: 1,
        targets: ['codex'],
        hooks: {
          preToolUse: {
            command: 'node .agentstd/hooks/pretooluse.js',
          },
        },
        skills: { dir: '.agents/skills', homeDir: '.agents/skills' },
        instructions: { shared: '.agentstd/instructions/shared.md' },
        mcpServers: {
          'agentstd:foo': { command: 'foo' },
        },
        permissions: {
          commands: { allow: [['pnpm', 'test']], prompt: [], deny: [] },
          files: { denyRead: [], denyWrite: [] },
        },
        agents: {
          reviewer: {
            description: 'Reviewer',
            instructions: '.agentstd/instructions/reviewer.md',
            tools: ['Read'],
          },
        },
      },
    };
  }

  async function seedProject(): Promise<void> {
    await fs.outputFile(
      path.join(tmpDir, '.agentstd', 'instructions', 'shared.md'),
      '# Shared\n',
    );
    await fs.outputFile(
      path.join(tmpDir, '.agentstd', 'instructions', 'reviewer.md'),
      'You are a reviewer.',
    );
  }

  function removeCtx(): RemoveContext {
    return {
      projectRoot: tmpDir,
      homeRoot: path.join(tmpDir, 'home'),
      dryRun: false,
      config: makeCtx().config,
    };
  }

  it('removes managed blocks, hooks, rules, and agents while preserving user content', async () => {
    await seedProject();
    await codexAdapter.sync(makeCtx());

    // Add user content to hooks that must survive (AGENTS.md user-content
    // preservation is covered by the dedicated test below).
    const hooksPath = path.join(tmpDir, '.codex', 'hooks.json');
    const hooks = await fs.readJson(hooksPath);
    hooks.hooks.PreToolUse.push({
      matcher: 'Bash',
      hooks: [{ type: 'command', command: 'echo user-hook' }],
    });
    await fs.writeJson(hooksPath, hooks);

    const result = await codexAdapter.remove(removeCtx());

    expect(result.removed).toContain('AGENTS.md');
    expect(result.removed).toContain('.codex/hooks.json');
    expect(result.removed).toContain('.codex/config.toml');
    expect(result.removed).toContain('.codex/rules/agentstd.rules');
    expect(result.removed).toContain('.codex/agents/reviewer.toml');

    // AGENTS.md: managed block gone, user content preserved. Empty file removed.
    expect(await fs.pathExists(path.join(tmpDir, 'AGENTS.md'))).toBe(false);

    // Hooks: user hook preserved, agentstd hook gone.
    const finalHooks = await fs.readJson(hooksPath);
    const pre = finalHooks.hooks?.PreToolUse ?? [];
    expect(pre).toHaveLength(1);
    expect(pre[0].hooks[0].command).toBe('echo user-hook');

    // Config.toml gone (only agentstd block existed).
    expect(await fs.pathExists(path.join(tmpDir, '.codex', 'config.toml'))).toBe(false);
    // Rules file gone.
    expect(await fs.pathExists(path.join(tmpDir, '.codex', 'rules', 'agentstd.rules'))).toBe(false);
    // Agent file gone.
    expect(await fs.pathExists(path.join(tmpDir, '.codex', 'agents', 'reviewer.toml'))).toBe(false);
  });

  it('keeps AGENTS.md when user content remains after block removal', async () => {
    await seedProject();
    await codexAdapter.sync(makeCtx());
    // Overwrite AGENTS.md so user content comes before the managed block.
    await fs.writeFile(
      path.join(tmpDir, 'AGENTS.md'),
      '# Project\n\nMy rules.\n\n<!-- agentstd:start instructions -->\n# Shared\n<!-- agentstd:end instructions -->\n',
    );

    await codexAdapter.remove(removeCtx());

    const remaining = await fs.readFile(path.join(tmpDir, 'AGENTS.md'), 'utf8');
    expect(remaining).toBe('# Project\n\nMy rules.\n');
  });

  it('is a no-op when nothing was synced', async () => {
    await seedProject();
    const result = await codexAdapter.remove(removeCtx());
    expect(result.removed).toEqual([]);
  });

  it('respects dryRun and writes nothing', async () => {
    await seedProject();
    await codexAdapter.sync(makeCtx());

    const ctx = removeCtx();
    ctx.dryRun = true;
    const result = await codexAdapter.remove(ctx);

    expect(result.removed).toContain('.codex/rules/agentstd.rules');
    expect(await fs.pathExists(path.join(tmpDir, '.codex', 'rules', 'agentstd.rules'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '.codex', 'agents', 'reviewer.toml'))).toBe(true);
  });
});
