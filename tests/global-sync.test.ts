import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import YAML from 'yaml';
import { doctorCmd } from '../src/cli/commands/doctor';
import { statusCmd } from '../src/cli/commands/status';
import { syncCmd } from '../src/cli/commands/sync';
import { uninstallCmd } from '../src/cli/commands/uninstall';

describe('global sync scope', () => {
  let tmpDir: string;
  let homeDir: string;
  let originalCwd: string;
  let originalAgentStdHome: string | undefined;
  let output: string[];

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentstd-global-sync-'));
    homeDir = path.join(tmpDir, 'home');
    await fs.ensureDir(homeDir);
    originalCwd = process.cwd();
    originalAgentStdHome = process.env.AGENTSTD_HOME;
    process.env.AGENTSTD_HOME = homeDir;
    process.chdir(homeDir);
    output = [];
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    if (originalAgentStdHome === undefined) delete process.env.AGENTSTD_HOME;
    else process.env.AGENTSTD_HOME = originalAgentStdHome;
    await fs.remove(tmpDir);
  });

  async function seedHomeConfig(
    targets: string[],
    options?: { skills?: { dir: string; homeDir: string } },
  ): Promise<void> {
    await fs.writeFile(
      path.join(homeDir, '.agentstd.yaml'),
      YAML.stringify({
        version: 1,
        projectOnly: false,
        targets,
        hooks: {},
        skills: options?.skills ?? {
          dir: '.agents/skills',
          homeDir: '.agents/skills',
        },
        instructions: {
          shared: '.agentstd/instructions/shared.md',
        },
        mcpServers: {},
        permissions: {
          commands: {
            allow: [],
            prompt: [],
            deny: [],
          },
          files: {
            denyRead: [],
            denyWrite: [],
          },
        },
        agents: {},
      }),
    );
    await fs.outputFile(
      path.join(homeDir, '.agentstd', 'instructions', 'shared.md'),
      '# Shared Home Instructions\n',
    );
  }

  it('syncs Codex global instructions to ~/.codex/AGENTS.md, not ~/AGENTS.md', async () => {
    await seedHomeConfig(['codex']);

    await syncCmd('codex', {});

    expect(await fs.pathExists(path.join(homeDir, 'AGENTS.md'))).toBe(false);
    const codexAgents = await fs.readFile(path.join(homeDir, '.codex', 'AGENTS.md'), 'utf8');
    expect(codexAgents).toContain('<!-- agentstd:start instructions -->');
    expect(codexAgents).toContain('# Shared Home Instructions');
  });

  it('copies home skills to ~/.claude/skills during Claude global sync', async () => {
    await seedHomeConfig(['claude']);
    await fs.outputFile(
      path.join(homeDir, '.agents', 'skills', 'home-skill', 'SKILL.md'),
      '---\nname: home-skill\ndescription: Home\n---\n\nHome content',
    );

    await syncCmd('claude', {});

    const copied = await fs.readFile(
      path.join(homeDir, '.claude', 'skills', 'home-skill', 'SKILL.md'),
      'utf8',
    );
    expect(copied).toContain('Home content');
  });

  it('reports global Codex instruction path in dry-run output', async () => {
    vi.spyOn(console, 'log').mockImplementation((...messages: unknown[]) => {
      output.push(messages.join(' '));
    });
    await seedHomeConfig(['codex']);

    await syncCmd('codex', { dryRun: true });

    expect(output.join('\n')).toContain('.codex/AGENTS.md');
    expect(await fs.pathExists(path.join(homeDir, '.codex', 'AGENTS.md'))).toBe(false);
    expect(await fs.pathExists(path.join(homeDir, 'AGENTS.md'))).toBe(false);
  });

  it('reports global status mode from home root', async () => {
    vi.spyOn(console, 'log').mockImplementation((...messages: unknown[]) => {
      output.push(messages.map((message) => String(message ?? '')).join(' '));
    });
    await seedHomeConfig(['codex']);

    await statusCmd();

    const text = output.join('\n');
    expect(text).toContain('Global');
    expect(text).toContain('mode: global home sync');
    expect(text).toContain('home: ~/.agentstd.yaml');
  });

  it('checks Codex global instructions under ~/.codex/AGENTS.md', async () => {
    vi.spyOn(console, 'log').mockImplementation((...messages: unknown[]) => {
      output.push(messages.map((message) => String(message ?? '')).join(' '));
    });
    await seedHomeConfig(['codex']);
    await syncCmd('codex', {});

    await doctorCmd();

    const text = output.join('\n');
    expect(text).toContain('config valid (global sync scope)');
    expect(text).toContain('.codex/AGENTS.md instructions synced');
    expect(text).not.toContain(path.join(homeDir, 'AGENTS.md'));
  });

  it('uninstalls Codex global instructions from ~/.codex/AGENTS.md', async () => {
    await seedHomeConfig(['codex']);
    await syncCmd('codex', {});

    await uninstallCmd('codex', { global: true });

    expect(await fs.pathExists(path.join(homeDir, '.codex', 'AGENTS.md'))).toBe(false);
    expect(await fs.pathExists(path.join(homeDir, 'AGENTS.md'))).toBe(false);
    expect(await fs.pathExists(path.join(homeDir, '.agentstd.yaml'))).toBe(false);
    expect(await fs.pathExists(path.join(homeDir, '.agentstd.yaml.bak'))).toBe(true);
  });

  it('purges the configured global skills homeDir only', async () => {
    await seedHomeConfig(['claude'], {
      skills: { dir: '.project-skills', homeDir: '.home-skills' },
    });
    await fs.outputFile(
      path.join(homeDir, '.home-skills', 'home-skill', 'SKILL.md'),
      '---\nname: home-skill\ndescription: Home\n---\n\nHome content',
    );
    await fs.outputFile(
      path.join(homeDir, '.project-skills', 'project-skill', 'SKILL.md'),
      '---\nname: project-skill\ndescription: Project\n---\n\nProject content',
    );

    await uninstallCmd('claude', { global: true, purgeSkills: true });

    expect(await fs.pathExists(path.join(homeDir, '.home-skills'))).toBe(false);
    expect(await fs.pathExists(path.join(homeDir, '.project-skills'))).toBe(true);
  });
});
