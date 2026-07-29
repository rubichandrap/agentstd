import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sync as claudeSync } from '../src/adapters/claude/sync';
import { codexAdapter } from '../src/adapters/codex';
import type { SyncContext } from '../src/core/types';

describe('provider umbrella config compilers', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentstd-provider-configs-'));
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  function makeCtx(target: 'claude' | 'codex'): SyncContext {
    return {
      projectRoot: tmpDir,
      homeRoot: path.join(tmpDir, 'home'),
      config: {
        version: 1,
        targets: [target],
        hooks: {},
        skills: { dir: '.agents/skills', homeDir: '.agents/skills' },
        instructions: {},
        mcpServers: {
          github: {
            transport: 'stdio',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github'],
            env: { GITHUB_TOKEN: 'GITHUB_TOKEN' },
          },
        },
        permissions: {
          commands: {
            allow: [['pnpm', 'test']],
            prompt: [['git', 'push']],
            deny: [['rm', '-rf']],
          },
          files: {
            denyRead: ['.env'],
            denyWrite: ['.env'],
          },
        },
        agents: {
          'code-reviewer': {
            description: 'Review code changes.',
            instructions: '.agentstd/agents/code-reviewer.md',
            tools: ['read', 'bash'],
          },
        },
      },
    };
  }

  it('compiles MCP servers and permissions for Claude', async () => {
    await fs.outputFile(
      path.join(tmpDir, '.agentstd', 'agents', 'code-reviewer.md'),
      'Review well.',
    );
    await claudeSync(makeCtx('claude'));

    const mcp = await fs.readJson(path.join(tmpDir, '.mcp.json'));
    const settings = await fs.readJson(path.join(tmpDir, '.claude', 'settings.json'));
    const agent = await fs.readFile(
      path.join(tmpDir, '.claude', 'agents', 'code-reviewer.md'),
      'utf8',
    );

    expect(mcp.mcpServers['agentstd:github'].command).toBe('npx');
    expect(mcp.mcpServers.github).toBeUndefined();
    expect(settings.permissions.allow).toContain('Bash(pnpm test)');
    expect(settings.permissions.ask).toContain('Bash(git push)');
    expect(settings.permissions.deny).toContain('Bash(rm -rf)');
    expect(settings.permissions.deny).toContain('Read(.env)');
    expect(settings.permissions.deny).toContain('Write(.env)');
    expect(agent).toContain('description: Review code changes.');
    expect(agent).toContain('Review well.');
  });

  it('compiles MCP servers, permissions, and agents for Codex', async () => {
    await fs.outputFile(
      path.join(tmpDir, '.agentstd', 'agents', 'code-reviewer.md'),
      'Review well.',
    );
    await codexAdapter.sync(makeCtx('codex'));

    const configToml = await fs.readFile(path.join(tmpDir, '.codex', 'config.toml'), 'utf8');
    const rules = await fs.readFile(path.join(tmpDir, '.codex', 'rules', 'agentstd.rules'), 'utf8');
    const agent = await fs.readFile(
      path.join(tmpDir, '.codex', 'agents', 'code-reviewer.toml'),
      'utf8',
    );

    expect(configToml).toContain('[mcp_servers.github]');
    expect(configToml).toContain('# agentstd:start codex-config');
    expect(configToml).toContain('command = "npx"');
    expect(configToml).toContain('args = ["-y", "@modelcontextprotocol/server-github"]');
    expect(rules).toContain('pattern = ["pnpm", "test"]');
    expect(rules).toContain('decision = "allow"');
    expect(rules).toContain('decision = "prompt"');
    expect(rules).toContain('decision = "forbidden"');
    expect(agent).toContain('description = "Review code changes."');
    expect(agent).toContain('Review well.');
  });

  it('MCP sync is idempotent: a clean re-sync reports no change (bug 3 regression)', async () => {
    await claudeSync(makeCtx('claude'));
    const mcpPath = path.join(tmpDir, '.mcp.json');
    const before = await fs.readFile(mcpPath, 'utf8');
    const beforeStat = await fs.stat(mcpPath);

    const result = await claudeSync(makeCtx('claude'));
    const after = await fs.readFile(mcpPath, 'utf8');
    const afterStat = await fs.stat(mcpPath);

    expect(after).toBe(before);
    expect(afterStat.mtimeMs).toBe(beforeStat.mtimeMs);
    expect(result.changed).not.toContain('.mcp.json');
    expect(result.operations.every((op) => op.type === 'skip' || op.path !== '.mcp.json')).toBe(
      true,
    );
  });

  it('MCP sync --check exits 0 on a clean sync (bug 3 regression)', async () => {
    await claudeSync(makeCtx('claude'));
    const result = await claudeSync({ ...makeCtx('claude'), dryRun: true });
    const activeOps = result.operations.filter((op) => op.type !== 'skip');
    expect(activeOps).toHaveLength(0);
  });

  it('MCP sync still updates the file when config changes (bug 3 regression)', async () => {
    await claudeSync(makeCtx('claude'));
    const mcpPath = path.join(tmpDir, '.mcp.json');
    const before = await fs.readFile(mcpPath, 'utf8');

    const ctx = makeCtx('claude');
    ctx.config.mcpServers = {
      ...ctx.config.mcpServers,
      slack: { transport: 'stdio', command: 'slack-mcp', args: [], env: {} },
    };
    await claudeSync(ctx);
    const after = await fs.readFile(mcpPath, 'utf8');
    expect(after).not.toBe(before);
    const mcp = await fs.readJson(mcpPath);
    expect(mcp.mcpServers['agentstd:slack']).toBeDefined();
  });

  it('does not double-prefix Claude MCP server ids that already use agentstd:', async () => {
    const ctx = makeCtx('claude');
    ctx.config.mcpServers = {
      'agentstd:foo': {
        transport: 'stdio',
        command: 'foo',
        args: [],
        env: {},
      },
    };

    await claudeSync(ctx);

    const mcp = await fs.readJson(path.join(tmpDir, '.mcp.json'));
    expect(Object.keys(mcp.mcpServers)).toEqual(['agentstd:foo']);
  });

  it('removes stale Claude artifacts when AgentStd config groups are removed', async () => {
    await fs.outputFile(
      path.join(tmpDir, '.agentstd', 'agents', 'code-reviewer.md'),
      'Review well.',
    );
    const initial = makeCtx('claude');
    initial.config.hooks = {
      preToolUse: { command: 'node .agentstd/hooks/pretooluse.js' },
    };
    await claudeSync(initial);

    const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
    const settings = await fs.readJson(settingsPath);
    settings.hooks.PreToolUse.push({
      matcher: 'Bash',
      hooks: [{ type: 'command', command: 'echo user-hook' }],
    });
    settings.permissions.allow.push('Bash(git status)');
    await fs.writeJson(settingsPath, settings);

    const mcpPath = path.join(tmpDir, '.mcp.json');
    const mcp = await fs.readJson(mcpPath);
    mcp.mcpServers['user-server'] = { command: 'user' };
    await fs.writeJson(mcpPath, mcp);

    const next = makeCtx('claude');
    next.config.hooks = {};
    next.config.mcpServers = {};
    next.config.permissions = {
      commands: { allow: [], prompt: [], deny: [] },
      files: { denyRead: [], denyWrite: [] },
    };
    next.config.agents = {};
    const result = await claudeSync(next);

    const finalSettings = await fs.readJson(settingsPath);
    expect(finalSettings.hooks.PreToolUse).toHaveLength(1);
    expect(finalSettings.hooks.PreToolUse[0].hooks[0].command).toBe('echo user-hook');
    expect(finalSettings.permissions.allow).toEqual(['Bash(git status)']);
    expect(finalSettings.permissions.ask).toBeUndefined();
    expect(finalSettings.permissions.deny).toBeUndefined();
    expect(finalSettings._agentstd).toBeUndefined();

    const finalMcp = await fs.readJson(mcpPath);
    expect(finalMcp.mcpServers).toEqual({ 'user-server': { command: 'user' } });
    expect(await fs.pathExists(path.join(tmpDir, '.claude', 'agents', 'code-reviewer.md'))).toBe(
      false,
    );
    expect(
      result.operations.some((op) => op.type === 'update-file' && op.path === '.mcp.json'),
    ).toBe(true);
    expect(
      result.operations.some(
        (op) => op.type === 'remove-file' && op.path === '.claude/agents/code-reviewer.md',
      ),
    ).toBe(true);
  });

  it('removes stale Codex artifacts when AgentStd config groups are removed', async () => {
    await fs.outputFile(
      path.join(tmpDir, '.agentstd', 'agents', 'code-reviewer.md'),
      'Review well.',
    );
    await fs.outputFile(path.join(tmpDir, '.agentstd', 'instructions', 'shared.md'), 'Use pnpm.');
    const initial = makeCtx('codex');
    initial.config.hooks = {
      preToolUse: { command: 'node .agentstd/hooks/pretooluse.js' },
    };
    initial.config.instructions = {
      shared: '.agentstd/instructions/shared.md',
    };
    await codexAdapter.sync(initial);

    const agentsPath = path.join(tmpDir, 'AGENTS.md');
    const agents = await fs.readFile(agentsPath, 'utf8');
    await fs.writeFile(agentsPath, `# Project\n\n${agents}`);

    const hooksPath = path.join(tmpDir, '.codex', 'hooks.json');
    const hooks = await fs.readJson(hooksPath);
    hooks.hooks.PreToolUse.push({
      matcher: 'Bash',
      hooks: [{ type: 'command', command: 'echo user-hook' }],
    });
    await fs.writeJson(hooksPath, hooks);

    const configPath = path.join(tmpDir, '.codex', 'config.toml');
    const codexConfig = await fs.readFile(configPath, 'utf8');
    await fs.writeFile(configPath, `model = "gpt-5"\n\n${codexConfig}`);

    const next = makeCtx('codex');
    next.config.hooks = {};
    next.config.instructions = {};
    next.config.mcpServers = {};
    next.config.permissions = {
      commands: { allow: [], prompt: [], deny: [] },
      files: { denyRead: [], denyWrite: [] },
    };
    next.config.agents = {};
    const result = await codexAdapter.sync(next);

    const finalAgents = await fs.readFile(agentsPath, 'utf8');
    expect(finalAgents).toBe('# Project\n');

    const finalHooks = await fs.readJson(hooksPath);
    expect(finalHooks.hooks.PreToolUse).toHaveLength(1);
    expect(finalHooks.hooks.PreToolUse[0].hooks[0].command).toBe('echo user-hook');

    const finalConfig = await fs.readFile(configPath, 'utf8');
    expect(finalConfig).toBe('model = "gpt-5"\n');
    expect(await fs.pathExists(path.join(tmpDir, '.codex', 'rules', 'agentstd.rules'))).toBe(false);
    expect(await fs.pathExists(path.join(tmpDir, '.codex', 'agents', 'code-reviewer.toml'))).toBe(
      false,
    );
    expect(
      result.operations.some(
        (op) => op.type === 'remove-file' && op.path === '.codex/rules/agentstd.rules',
      ),
    ).toBe(true);
    expect(
      result.operations.some(
        (op) => op.type === 'remove-file' && op.path === '.codex/agents/code-reviewer.toml',
      ),
    ).toBe(true);
  });
});
