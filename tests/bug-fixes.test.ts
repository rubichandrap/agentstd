import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { sync as claudeSync } from '../src/adapters/claude/sync';
import {
  hasPreToolUseHookSynced,
  readSettings,
  upsertClaudeSettings,
} from '../src/adapters/claude/settings';
import { agentStdConfigSchema } from '../src/core/config';
import { syncClaudeAgents } from '../src/core/provider-config';
import { resolveSkillSources } from '../src/core/skill-resolve';
import type { FileOperation, SyncContext } from '../src/core/types';

describe('Regression Bug Fixes', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentstd-bugfix-test-'));
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  it('Bug 1: renderClaudeAgent produces valid YAML frontmatter when description has colons', async () => {
    const config = agentStdConfigSchema.parse({
      version: 1,
      targets: ['claude'],
      agents: {
        reviewer: {
          description: 'Code Reviewer: checks pull requests for bugs',
          instructions: 'instructions.md',
          tools: ['Read', 'Write'],
        },
      },
    });

    const instrFile = path.join(tmpDir, 'instructions.md');
    await fs.writeFile(instrFile, 'Review instructions here');

    const ops: FileOperation[] = [];
    await syncClaudeAgents(tmpDir, tmpDir, config, ops, false);

    const agentFile = path.join(tmpDir, '.claude', 'agents', 'reviewer.md');
    const content = await fs.readFile(agentFile, 'utf8');

    // Verify YAML frontmatter parses cleanly
    const match = content.match(/^---\n([\s\S]+?)\n---/);
    expect(match).not.toBeNull();
    const parsedYaml = YAML.parse(match![1]);
    expect(parsedYaml.description).toBe('Code Reviewer: checks pull requests for bugs');
    expect(parsedYaml['agentstd-managed']).toBe(true);
  });

  it('Bug 2: computeFinalSettings omits empty PreToolUse array when zero hooks configured', async () => {
    const config = agentStdConfigSchema.parse({
      version: 1,
      targets: ['claude'],
      hooks: {},
    });

    const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
    await upsertClaudeSettings(settingsPath, config);

    const settings = await readSettings(settingsPath);
    expect(settings.hooks).toBeUndefined();
  });

  it('Bug 3: resolveSkillSources handles absolute homeDir paths correctly', () => {
    const absoluteHomeDir = path.resolve('/custom/global/skills');
    const config = agentStdConfigSchema.parse({
      version: 1,
      targets: ['claude'],
      skills: { dir: '.agents/skills', homeDir: absoluteHomeDir },
    });

    const sources = resolveSkillSources(tmpDir, config, '/home/user', 'global', true);
    expect(sources[0].dir).toBe(absoluteHomeDir);
  });

  it('Bug 4: globalDefaultConfig quotes homeHookPath to support home paths with spaces', async () => {
    const { initCmd } = await import('../src/cli/commands/init');
    const spaceHome = path.join(tmpDir, 'User Name Home');
    await fs.ensureDir(spaceHome);

    // Call initGlobal logic internally by calling initCmd with global option
    const origHome = process.env.AGENTSTD_HOME;
    process.env.AGENTSTD_HOME = spaceHome;
    try {
      await initCmd({ global: true, noInteractive: true } as never);
      const configPath = path.join(spaceHome, '.agentstd.yaml');
      const raw = await fs.readFile(configPath, 'utf8');
      const parsed = YAML.parse(raw);
      expect(parsed.hooks.preToolUse.command).toContain(
        `node "${path.join(spaceHome, '.agentstd', 'hooks', 'pretooluse.js')}"`,
      );
    } finally {
      process.env.AGENTSTD_HOME = origHome;
    }
  });

  it('Bug 5: claude sync does not create empty .claude/skills folder when 0 skills exist', async () => {
    const config = agentStdConfigSchema.parse({
      version: 1,
      targets: ['claude'],
      hooks: {},
      skills: { dir: '.agents/skills', homeDir: '.agents/skills' },
    });

    const ctx: SyncContext = {
      projectRoot: tmpDir,
      outputRoot: tmpDir,
      scope: 'project',
      config,
      dryRun: false,
      homeRoot: path.join(tmpDir, 'nonexistent-home'),
      hasHomeConfig: false,
    };

    await claudeSync(ctx);

    const skillsDir = path.join(tmpDir, '.claude', 'skills');
    const exists = await fs.pathExists(skillsDir);
    expect(exists).toBe(false);
  });

  it('syncClaudeMcpServers serializes MCP servers with agentstd: prefix', async () => {
    const { syncClaudeMcpServers } = await import('../src/core/provider-config');
    const config = agentStdConfigSchema.parse({
      version: 1,
      targets: ['claude'],
      mcpServers: {
        github: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
        },
      },
    });

    const ops: FileOperation[] = [];
    const changed = await syncClaudeMcpServers(tmpDir, config, ops, false);
    expect(changed).toContain('.mcp.json');

    const mcpContent = await fs.readJson(path.join(tmpDir, '.mcp.json'));
    expect(mcpContent.mcpServers['agentstd:github']).toBeDefined();
    expect(mcpContent.mcpServers['agentstd:github'].command).toBe('npx');
  });

  it('syncCodexConfigToml serializes MCP servers into .codex/config.toml managed block', async () => {
    const { syncCodexConfigToml } = await import('../src/core/provider-config');
    const config = agentStdConfigSchema.parse({
      version: 1,
      targets: ['codex'],
      mcpServers: {
        github: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
        },
      },
    });

    const ops: FileOperation[] = [];
    const changed = await syncCodexConfigToml(tmpDir, config, ops, false);
    expect(changed).toContain('.codex/config.toml');

    const tomlContent = await fs.readFile(path.join(tmpDir, '.codex', 'config.toml'), 'utf8');
    expect(tomlContent).toContain('# agentstd:start codex-config');
    expect(tomlContent).toContain('[mcp_servers.github]');
    expect(tomlContent).toContain('command = "npx"');
  });

  it('upsertCodexPreToolUseHook omits PreToolUse when zero hooks remain', async () => {
    const { readCodexHooks, upsertCodexPreToolUseHook } = await import(
      '../src/adapters/codex/hooks'
    );
    const config = agentStdConfigSchema.parse({
      version: 1,
      targets: ['codex'],
      hooks: {},
    });

    const hooksPath = path.join(tmpDir, '.codex', 'hooks.json');
    await upsertCodexPreToolUseHook(hooksPath, config);

    const hooksConfig = await readCodexHooks(hooksPath);
    expect(hooksConfig.hooks).toBeUndefined();
  });
});
