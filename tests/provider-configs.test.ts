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

    expect(mcp.mcpServers.github.command).toBe('npx');
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
});
