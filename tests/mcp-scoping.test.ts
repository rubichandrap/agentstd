import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { sync as claudeSync } from '../src/adapters/claude/sync';
import { codexAdapter } from '../src/adapters/codex';
import { loadAgentStdContext } from '../src/cli/commands/sync-scope';
import { agentStdConfigSchema } from '../src/core/config';
import { mcpServersForTarget, mcpServersOf } from '../src/core/config-defaults';
import type { DoctorContext, RemoveContext, SyncContext } from '../src/core/types';

describe('MCP server target scoping', () => {
  let tmpDir: string;
  let homeDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentstd-scoping-'));
    homeDir = path.join(tmpDir, 'home');
    await fs.ensureDir(homeDir);
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  function makeCtx(target: 'claude' | 'codex'): SyncContext {
    return {
      projectRoot: tmpDir,
      homeRoot: homeDir,
      config: agentStdConfigSchema.parse({
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
            env: {},
          },
          slack: {
            transport: 'stdio',
            command: 'slack-mcp',
            args: [],
            env: {},
            targets: ['claude'],
          },
        },
        permissions: {
          commands: { allow: [], prompt: [], deny: [] },
          files: { denyRead: [], denyWrite: [] },
        },
        agents: {},
      }),
    };
  }

  describe('schema', () => {
    it('accepts an optional targets list on an MCP server entry', () => {
      const result = agentStdConfigSchema.safeParse({
        version: 1,
        mcpServers: {
          github: { command: 'npx', targets: ['claude'] },
        },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mcpServers.github.targets).toEqual(['claude']);
      }
    });

    it('defaults targets to undefined when absent', () => {
      const result = agentStdConfigSchema.safeParse({
        version: 1,
        mcpServers: {
          github: { command: 'npx' },
        },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mcpServers.github.targets).toBeUndefined();
      }
    });

    it('rejects a non-array targets field', () => {
      const result = agentStdConfigSchema.safeParse({
        version: 1,
        mcpServers: {
          github: { command: 'npx', targets: 'claude' },
        },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('mcpServersForTarget filter', () => {
    const config = agentStdConfigSchema.parse({
      version: 1,
      mcpServers: {
        both: { command: 'a' },
        claudeOnly: { command: 'b', targets: ['claude'] },
        codexOnly: { command: 'c', targets: ['codex'] },
      },
    });

    it('returns unscoped servers for every target', () => {
      expect(mcpServersForTarget(config, 'claude')).toHaveProperty('both');
      expect(mcpServersForTarget(config, 'codex')).toHaveProperty('both');
      expect(mcpServersForTarget(config, 'gemini')).toHaveProperty('both');
    });

    it('returns a server only for its scoped target', () => {
      expect(mcpServersForTarget(config, 'claude')).toHaveProperty('claudeOnly');
      expect(mcpServersForTarget(config, 'claude')).not.toHaveProperty('codexOnly');
      expect(mcpServersForTarget(config, 'codex')).not.toHaveProperty('claudeOnly');
      expect(mcpServersForTarget(config, 'codex')).toHaveProperty('codexOnly');
    });

    it('leaves mcpServersOf unchanged as the full set', () => {
      expect(Object.keys(mcpServersOf(config))).toEqual(['both', 'claudeOnly', 'codexOnly']);
    });
  });

  describe('adapter sync seam', () => {
    it('compiles a claude-scoped server into .mcp.json only', async () => {
      await claudeSync(makeCtx('claude'));
      const mcp = await fs.readJson(path.join(tmpDir, '.mcp.json'));
      expect(mcp.mcpServers['agentstd:github']).toBeDefined();
      expect(mcp.mcpServers['agentstd:slack']).toBeDefined();

      await codexAdapter.sync(makeCtx('codex'));
      const configToml = await fs.readFile(path.join(tmpDir, '.codex', 'config.toml'), 'utf8');
      expect(configToml).toContain('mcp_servers.github');
      expect(configToml).not.toContain('mcp_servers.slack');
    });

    it('does not write targets into the provider output', async () => {
      await claudeSync(makeCtx('claude'));
      const mcp = await fs.readJson(path.join(tmpDir, '.mcp.json'));
      expect(mcp.mcpServers['agentstd:slack']).not.toHaveProperty('targets');
    });

    it('cleans a server scoped out of a target on the next sync', async () => {
      await codexAdapter.sync(makeCtx('codex'));
      const configToml = await fs.readFile(path.join(tmpDir, '.codex', 'config.toml'), 'utf8');
      expect(configToml).toContain('mcp_servers.github');
      expect(configToml).not.toContain('mcp_servers.slack');

      const next = makeCtx('codex');
      next.config.mcpServers.github = {
        transport: 'stdio',
        command: 'npx',
        args: [],
        env: {},
        targets: ['claude'],
      };
      await codexAdapter.sync(next);
      const configPath = path.join(tmpDir, '.codex', 'config.toml');
      if (await fs.pathExists(configPath)) {
        const after = await fs.readFile(configPath, 'utf8');
        expect(after).not.toContain('mcp_servers.github');
      }
      // Re-scoping github out of codex leaves codex with no servers; the empty
      // managed block is removed (config.toml may vanish entirely).
      expect(
        (await fs.readFile(configPath, 'utf8').catch(() => '')).includes('mcp_servers.github'),
      ).toBe(false);
    });

    it('is idempotent under --check after a scoped sync', async () => {
      const ctx = makeCtx('codex');
      await codexAdapter.sync(ctx);
      const result = await codexAdapter.sync({ ...ctx, dryRun: true });
      const activeOps = result.operations.filter((op) => op.type !== 'skip');
      expect(activeOps).toHaveLength(0);
    });
  });

  describe('doctor seam', () => {
    it('does not require codex config.toml when every server is scoped to claude', async () => {
      const ctx = makeCtx('codex');
      ctx.config.mcpServers = {
        github: {
          transport: 'stdio',
          command: 'npx',
          args: [],
          env: {},
          targets: ['claude'],
        },
      };
      const result = await codexAdapter.doctor({ ...ctx, projectRoot: tmpDir } as DoctorContext);
      const mcpCheck = result.checks.find((c) => c.label === '.codex/config.toml found');
      expect(mcpCheck).toBeUndefined();
    });

    it('requires codex config.toml when a codex-scoped server exists', async () => {
      const ctx = makeCtx('codex');
      await codexAdapter.sync(ctx);
      const result = await codexAdapter.doctor({ ...ctx, projectRoot: tmpDir } as DoctorContext);
      const mcpCheck = result.checks.find((c) => c.label === '.codex/config.toml found');
      expect(mcpCheck?.status).toBe('pass');
    });
  });

  describe('remove seam', () => {
    it('cleans scoped servers from the provider that received them', async () => {
      await claudeSync(makeCtx('claude'));
      await codexAdapter.sync(makeCtx('codex'));

      const removeResult = await codexAdapter.remove({
        projectRoot: tmpDir,
        homeRoot: homeDir,
        config: makeCtx('codex').config,
        dryRun: false,
      } as RemoveContext);
      expect(removeResult.removed).toContain('.codex/config.toml');

      const codexPath = path.join(tmpDir, '.codex', 'config.toml');
      if (await fs.pathExists(codexPath)) {
        const after = await fs.readFile(codexPath, 'utf8');
        expect(after).not.toContain('mcp_servers');
      }
    });
  });

  describe('config-load validation seam', () => {
    it('rejects an unknown target id in MCP server scoping', async () => {
      await fs.writeFile(
        path.join(tmpDir, '.agentstd.yaml'),
        YAML.stringify({
          version: 1,
          targets: ['claude'],
          mcpServers: {
            github: { command: 'npx', targets: ['clode'] },
          },
        }),
      );
      await expect(loadAgentStdContext(tmpDir, homeDir)).rejects.toThrow(
        /Invalid config.*clode/s,
      );
    });

    it('accepts known target ids in MCP server scoping', async () => {
      await fs.writeFile(
        path.join(tmpDir, '.agentstd.yaml'),
        YAML.stringify({
          version: 1,
          targets: ['claude'],
          mcpServers: {
            github: { command: 'npx', targets: ['claude', 'codex'] },
          },
        }),
      );
      await expect(loadAgentStdContext(tmpDir, homeDir)).resolves.toBeTruthy();
    });
  });
});
