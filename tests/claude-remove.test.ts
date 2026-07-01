import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { claudeAdapter } from '../src/adapters/claude';
import type { RemoveContext, SyncContext } from '../src/core/types';

describe('Claude adapter remove', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentstd-claude-rm-'));
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
        targets: ['claude'],
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
          files: { denyRead: ['.env'], denyWrite: [] },
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
    await fs.outputFile(
      path.join(tmpDir, '.agents', 'skills', 'example-skill', 'SKILL.md'),
      '---\nname: example-skill\ndescription: ex\n---\n\nBody',
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

  it('removes agentstd hooks, mcp servers, permissions, agents, and skills while preserving user content', async () => {
    await seedProject();
    await claudeAdapter.sync(makeCtx());

    // Inject a user-authored hook and a user MCP server that must survive.
    const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
    const settings = await fs.readJson(settingsPath);
    settings.hooks.PreToolUse.push({
      matcher: 'Bash',
      hooks: [{ type: 'command', command: 'echo user-hook' }],
    });
    await fs.writeJson(settingsPath, settings);

    const mcpPath = path.join(tmpDir, '.mcp.json');
    const mcp = await fs.readJson(mcpPath);
    mcp.mcpServers['user-server'] = { command: 'user' };
    await fs.writeJson(mcpPath, mcp);

    const result = await claudeAdapter.remove(removeCtx());

    expect(result.removed).toContain('.claude/settings.json');
    expect(result.removed).toContain('.mcp.json');
    expect(result.removed).toContain('.claude/agents/reviewer.md');
    expect(result.removed).toContain('.claude/skills/example-skill');

    // User hook preserved.
    const finalSettings = await fs.readJson(settingsPath);
    const hooks = finalSettings.hooks?.PreToolUse ?? [];
    expect(hooks).toHaveLength(1);
    expect(hooks[0].hooks[0].command).toBe('echo user-hook');
    // Permissions key gone entirely (only agentstd entries existed).
    expect(finalSettings.permissions).toBeUndefined();

    // User MCP server preserved, agentstd:foo gone.
    const finalMcp = await fs.readJson(mcpPath);
    expect(Object.keys(finalMcp.mcpServers)).toEqual(['user-server']);

    // Agent file and skill dir gone.
    expect(await fs.pathExists(path.join(tmpDir, '.claude', 'agents', 'reviewer.md'))).toBe(false);
    expect(await fs.pathExists(path.join(tmpDir, '.claude', 'skills', 'example-skill'))).toBe(false);
  });

  it('is a no-op when nothing was synced', async () => {
    await seedProject();
    const result = await claudeAdapter.remove(removeCtx());
    expect(result.removed).toEqual([]);
    expect(result.operations.filter((o) => o.type !== 'skip')).toEqual([]);
  });

  it('respects dryRun and writes nothing', async () => {
    await seedProject();
    await claudeAdapter.sync(makeCtx());

    const ctx = removeCtx();
    ctx.dryRun = true;
    const result = await claudeAdapter.remove(ctx);

    expect(result.removed).toContain('.claude/settings.json');
    expect(await fs.pathExists(path.join(tmpDir, '.claude', 'agents', 'reviewer.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '.claude', 'skills', 'example-skill'))).toBe(true);
  });
});
