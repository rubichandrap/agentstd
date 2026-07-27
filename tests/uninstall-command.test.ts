import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { claudeAdapter } from '../src/adapters/claude';
import { codexAdapter } from '../src/adapters/codex';
import { uninstallCmd } from '../src/cli/commands/uninstall';

describe('uninstall command', () => {
  let tmpBase: string;
  let projectDir: string;
  let homeDir: string;
  let prevCwd: string;
  let prevHome: string | undefined;

  beforeEach(async () => {
    tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), 'agentstd-uninstall-'));
    projectDir = path.join(tmpBase, 'project');
    homeDir = path.join(tmpBase, 'home');
    await fs.ensureDir(projectDir);
    await fs.ensureDir(homeDir);
    prevCwd = process.cwd();
    prevHome = process.env.AGENTSTD_HOME;
    process.env.AGENTSTD_HOME = homeDir;
    process.chdir(projectDir);
  });

  afterEach(async () => {
    process.chdir(prevCwd);
    if (prevHome === undefined) delete process.env.AGENTSTD_HOME;
    else process.env.AGENTSTD_HOME = prevHome;
    await fs.remove(tmpBase);
  });

  async function seedProjectConfig(
    targets: string[],
    overrides: Record<string, unknown> = {},
  ): Promise<void> {
    const config = {
      version: 1,
      projectOnly: true,
      targets,
      hooks: { preToolUse: { command: 'node .agentstd/hooks/pretooluse.js' } },
      skills: { dir: '.agents/skills', homeDir: '.agents/skills' },
      instructions: { shared: '.agentstd/instructions/shared.md' },
      mcpServers: {},
      permissions: {
        commands: { allow: [], prompt: [], deny: [] },
        files: { denyRead: [], denyWrite: [] },
      },
      agents: {},
      ...overrides,
    };
    await fs.writeFile(path.join(projectDir, '.agentstd.yaml'), YAML.stringify(config));
    await fs.outputFile(
      path.join(projectDir, '.agentstd', 'instructions', 'shared.md'),
      '# Shared\n',
    );
    await fs.outputFile(path.join(projectDir, '.agentstd', 'hooks', 'pretooluse.js'), '# hook');
    await fs.outputFile(
      path.join(projectDir, '.agents', 'skills', 'example-skill', 'SKILL.md'),
      '---\nname: example-skill\ndescription: ex\n---\n\nbody',
    );
  }

  it('removes provider artifacts, .agentstd.yaml, and .agentstd/ dir but leaves .agents/skills/', async () => {
    await seedProjectConfig(['claude', 'codex']);
    const ctx = {
      projectRoot: projectDir,
      homeRoot: homeDir,
      dryRun: false,
      config: {
        version: 1,
        projectOnly: true,
        targets: ['claude', 'codex'],
        hooks: { preToolUse: { command: 'node .agentstd/hooks/pretooluse.js' } },
        skills: { dir: '.agents/skills', homeDir: '.agents/skills' },
        instructions: { shared: '.agentstd/instructions/shared.md' },
        mcpServers: {},
        permissions: {
          commands: { allow: [], prompt: [], deny: [] },
          files: { denyRead: [], denyWrite: [] },
        },
        agents: {},
      },
    };
    await claudeAdapter.sync(ctx);
    await codexAdapter.sync(ctx);

    await uninstallCmd(undefined, { all: true });

    // Provider artifacts gone.
    expect(await fs.pathExists(path.join(projectDir, '.claude', 'settings.json'))).toBe(false);
    expect(await fs.pathExists(path.join(projectDir, '.codex', 'hooks.json'))).toBe(false);
    expect(await fs.pathExists(path.join(projectDir, 'AGENTS.md'))).toBe(false);
    // Config + .agentstd/ gone.
    expect(await fs.pathExists(path.join(projectDir, '.agentstd.yaml'))).toBe(false);
    expect(await fs.pathExists(path.join(projectDir, '.agentstd'))).toBe(false);
    // Backup written.
    expect(await fs.pathExists(path.join(projectDir, '.agentstd.yaml.bak'))).toBe(true);
    // Skills library left in place.
    expect(
      await fs.pathExists(path.join(projectDir, '.agents', 'skills', 'example-skill', 'SKILL.md')),
    ).toBe(true);
  });

  it('--purge-skills removes the .agents/skills/ directory too', async () => {
    await seedProjectConfig(['claude']);
    const ctx = {
      projectRoot: projectDir,
      homeRoot: homeDir,
      dryRun: false,
      config: {
        version: 1,
        projectOnly: true,
        targets: ['claude'],
        hooks: { preToolUse: { command: 'node .agentstd/hooks/pretooluse.js' } },
        skills: { dir: '.agents/skills', homeDir: '.agents/skills' },
        instructions: { shared: '.agentstd/instructions/shared.md' },
        mcpServers: {},
        permissions: {
          commands: { allow: [], prompt: [], deny: [] },
          files: { denyRead: [], denyWrite: [] },
        },
        agents: {},
      },
    };
    await claudeAdapter.sync(ctx);

    await uninstallCmd(undefined, { all: true, purgeSkills: true });

    expect(await fs.pathExists(path.join(projectDir, '.agents', 'skills'))).toBe(false);
  });

  it('--purge-skills in project scope leaves the home skills directory intact', async () => {
    await fs.writeFile(
      path.join(homeDir, '.agentstd.yaml'),
      YAML.stringify({
        version: 1,
        projectOnly: false,
        targets: ['claude'],
        skills: { dir: '.agents/skills', homeDir: '.home-skills' },
      }),
    );
    await fs.outputFile(
      path.join(homeDir, '.home-skills', 'home-skill', 'SKILL.md'),
      '---\nname: home-skill\ndescription: home\n---\n\nhome',
    );
    await seedProjectConfig(['claude'], {
      projectOnly: false,
      skills: { dir: '.project-skills', homeDir: '.home-skills' },
    });
    await fs.outputFile(
      path.join(projectDir, '.project-skills', 'project-skill', 'SKILL.md'),
      '---\nname: project-skill\ndescription: project\n---\n\nproject',
    );

    await uninstallCmd(undefined, { all: true, purgeSkills: true });

    expect(await fs.pathExists(path.join(projectDir, '.project-skills'))).toBe(false);
    expect(await fs.pathExists(path.join(homeDir, '.home-skills'))).toBe(true);
  });

  it('--dry-run removes nothing', async () => {
    await seedProjectConfig(['claude']);
    const ctx = {
      projectRoot: projectDir,
      homeRoot: homeDir,
      dryRun: false,
      config: {
        version: 1,
        projectOnly: true,
        targets: ['claude'],
        hooks: { preToolUse: { command: 'node .agentstd/hooks/pretooluse.js' } },
        skills: { dir: '.agents/skills', homeDir: '.agents/skills' },
        instructions: { shared: '.agentstd/instructions/shared.md' },
        mcpServers: {},
        permissions: {
          commands: { allow: [], prompt: [], deny: [] },
          files: { denyRead: [], denyWrite: [] },
        },
        agents: {},
      },
    };
    await claudeAdapter.sync(ctx);

    await uninstallCmd(undefined, { all: true, dryRun: true });

    expect(await fs.pathExists(path.join(projectDir, '.agentstd.yaml'))).toBe(true);
    expect(await fs.pathExists(path.join(projectDir, '.agentstd'))).toBe(true);
    expect(await fs.pathExists(path.join(projectDir, '.claude', 'settings.json'))).toBe(true);
  });

  it('uninstalls a single target via the target arg', async () => {
    await seedProjectConfig(['claude', 'codex']);
    const ctx = {
      projectRoot: projectDir,
      homeRoot: homeDir,
      dryRun: false,
      config: {
        version: 1,
        projectOnly: true,
        targets: ['claude', 'codex'],
        hooks: { preToolUse: { command: 'node .agentstd/hooks/pretooluse.js' } },
        skills: { dir: '.agents/skills', homeDir: '.agents/skills' },
        instructions: { shared: '.agentstd/instructions/shared.md' },
        mcpServers: {},
        permissions: {
          commands: { allow: [], prompt: [], deny: [] },
          files: { denyRead: [], denyWrite: [] },
        },
        agents: {},
      },
    };
    await claudeAdapter.sync(ctx);
    await codexAdapter.sync(ctx);

    await uninstallCmd('claude', {});

    // Claude gone, codex untouched.
    expect(await fs.pathExists(path.join(projectDir, '.claude', 'settings.json'))).toBe(false);
    expect(await fs.pathExists(path.join(projectDir, '.codex', 'hooks.json'))).toBe(true);
    // Config + .agentstd/ kept when other targets remain — so the next
    // uninstall/sync for codex still has a valid config to load.
    expect(await fs.pathExists(path.join(projectDir, '.agentstd.yaml'))).toBe(true);
    expect(await fs.pathExists(path.join(projectDir, '.agentstd'))).toBe(true);
    expect(await fs.pathExists(path.join(projectDir, '.agentstd.yaml.bak'))).toBe(false);
  });

  it('uninstalls the last configured target and purges config', async () => {
    await seedProjectConfig(['claude']);
    const ctx = {
      projectRoot: projectDir,
      homeRoot: homeDir,
      dryRun: false,
      config: {
        version: 1,
        projectOnly: true,
        targets: ['claude'],
        hooks: { preToolUse: { command: 'node .agentstd/hooks/pretooluse.js' } },
        skills: { dir: '.agents/skills', homeDir: '.agents/skills' },
        instructions: { shared: '.agentstd/instructions/shared.md' },
        mcpServers: {},
        permissions: {
          commands: { allow: [], prompt: [], deny: [] },
          files: { denyRead: [], denyWrite: [] },
        },
        agents: {},
      },
    };
    await claudeAdapter.sync(ctx);

    await uninstallCmd('claude', {});

    expect(await fs.pathExists(path.join(projectDir, '.claude', 'settings.json'))).toBe(false);
    expect(await fs.pathExists(path.join(projectDir, '.agentstd.yaml'))).toBe(false);
    expect(await fs.pathExists(path.join(projectDir, '.agentstd'))).toBe(false);
    expect(await fs.pathExists(path.join(projectDir, '.agentstd.yaml.bak'))).toBe(true);
  });
});
