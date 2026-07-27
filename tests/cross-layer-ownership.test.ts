import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import YAML from 'yaml';
import { skillsListCmd } from '../src/cli/commands/skills';
import { syncCmd } from '../src/cli/commands/sync';
import { loadMergedConfig } from '../src/core/config-merge';
import { resolveSkillSources } from '../src/core/skill-resolve';

interface Env {
  tmpBase: string;
  homeDir: string;
  projectDir: string;
  originalCwd: string;
  originalAgentStdHome: string | undefined;
  output: string[];
}

async function setup(): Promise<Env> {
  const tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), 'agentstd-cross-'));
  const homeDir = path.join(tmpBase, 'home');
  const projectDir = path.join(tmpBase, 'project');
  await fs.ensureDir(homeDir);
  await fs.ensureDir(projectDir);
  const originalCwd = process.cwd();
  const originalAgentStdHome = process.env.AGENTSTD_HOME;
  process.env.AGENTSTD_HOME = homeDir;
  const output: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((...messages: unknown[]) => {
    output.push(messages.map((m) => String(m ?? '')).join(' '));
  });
  return { tmpBase, homeDir, projectDir, originalCwd, originalAgentStdHome, output };
}

async function teardown(env: Env): Promise<void> {
  vi.restoreAllMocks();
  process.chdir(env.originalCwd);
  if (env.originalAgentStdHome === undefined) delete process.env.AGENTSTD_HOME;
  else process.env.AGENTSTD_HOME = env.originalAgentStdHome;
  await fs.remove(env.tmpBase);
}

async function writeConfig(dir: string, obj: Record<string, unknown>): Promise<void> {
  await fs.writeFile(path.join(dir, '.agentstd.yaml'), YAML.stringify(obj));
}

describe('cross-layer ownership (Bug 1)', () => {
  let env: Env;

  beforeEach(async () => {
    env = await setup();
  });
  afterEach(async () => {
    await teardown(env);
  });

  it('project sync reads instructions.shared from home when project does not define it', async () => {
    await writeConfig(env.homeDir, {
      version: 1,
      targets: ['codex'],
      skills: { dir: '.agents/skills', homeDir: '.agents/skills' },
      instructions: { shared: '.agentstd/instructions/shared.md' },
    });
    await fs.outputFile(
      path.join(env.homeDir, '.agentstd', 'instructions', 'shared.md'),
      '# Home Instructions\n',
    );
    await writeConfig(env.projectDir, {
      version: 1,
      targets: ['codex'],
      skills: { dir: '.agents/skills', homeDir: '.agents/skills' },
    });
    process.chdir(env.projectDir);

    await syncCmd('codex', {});

    const agentsMd = await fs.readFile(path.join(env.projectDir, 'AGENTS.md'), 'utf8');
    expect(agentsMd).toContain('# Home Instructions');
    expect(agentsMd).toContain('<!-- agentstd:start instructions -->');
    expect(agentsMd).toContain('<!-- agentstd:end instructions -->');
    expect(agentsMd).not.toMatch(
      /<!-- agentstd:start instructions -->\s*<!-- agentstd:end instructions -->/,
    );
  });

  it('project sync reads home-defined agents for Claude and Codex', async () => {
    await writeConfig(env.homeDir, {
      version: 1,
      targets: ['claude', 'codex'],
      skills: { dir: '.agents/skills', homeDir: '.agents/skills' },
      agents: {
        reviewer: {
          description: 'Review code.',
          instructions: '.agentstd/agents/reviewer.md',
          tools: [],
        },
      },
    });
    await fs.outputFile(
      path.join(env.homeDir, '.agentstd', 'agents', 'reviewer.md'),
      'Review from home\n',
    );
    await writeConfig(env.projectDir, {
      version: 1,
      targets: ['claude', 'codex'],
      skills: { dir: '.agents/skills', homeDir: '.agents/skills' },
    });
    process.chdir(env.projectDir);

    await syncCmd('claude', {});
    await syncCmd('codex', {});

    const claudeAgent = await fs.readFile(
      path.join(env.projectDir, '.claude', 'agents', 'reviewer.md'),
      'utf8',
    );
    expect(claudeAgent).toContain('Review from home');

    const codexAgent = await fs.readFile(
      path.join(env.projectDir, '.codex', 'agents', 'reviewer.toml'),
      'utf8',
    );
    expect(codexAgent).toContain('Review from home');
  });

  it('project-defined agent with same id overrides home agent', async () => {
    await writeConfig(env.homeDir, {
      version: 1,
      targets: ['claude'],
      skills: { dir: '.agents/skills', homeDir: '.agents/skills' },
      agents: {
        reviewer: {
          description: 'Home reviewer.',
          instructions: '.agentstd/agents/reviewer.md',
          tools: [],
        },
      },
    });
    await fs.outputFile(
      path.join(env.homeDir, '.agentstd', 'agents', 'reviewer.md'),
      'Home reviewer\n',
    );
    await writeConfig(env.projectDir, {
      version: 1,
      targets: ['claude'],
      skills: { dir: '.agents/skills', homeDir: '.agents/skills' },
      agents: {
        reviewer: {
          description: 'Project reviewer.',
          instructions: '.agentstd/agents/reviewer.md',
          tools: [],
        },
      },
    });
    await fs.outputFile(
      path.join(env.projectDir, '.agentstd', 'agents', 'reviewer.md'),
      'Project reviewer\n',
    );
    process.chdir(env.projectDir);

    await syncCmd('claude', {});

    const agent = await fs.readFile(
      path.join(env.projectDir, '.claude', 'agents', 'reviewer.md'),
      'utf8',
    );
    expect(agent).toContain('Project reviewer');
    expect(agent).not.toContain('Home reviewer');
  });

  it('project-only ignores home instructions and home agents', async () => {
    await writeConfig(env.homeDir, {
      version: 1,
      targets: ['codex'],
      skills: { dir: '.agents/skills', homeDir: '.agents/skills' },
      instructions: { shared: '.agentstd/instructions/shared.md' },
      agents: {
        reviewer: {
          description: 'Home reviewer.',
          instructions: '.agentstd/agents/reviewer.md',
          tools: [],
        },
      },
    });
    await fs.outputFile(
      path.join(env.homeDir, '.agentstd', 'instructions', 'shared.md'),
      '# Home Instructions\n',
    );
    await fs.outputFile(
      path.join(env.homeDir, '.agentstd', 'agents', 'reviewer.md'),
      'Home reviewer\n',
    );
    await writeConfig(env.projectDir, {
      version: 1,
      projectOnly: true,
      targets: ['codex'],
      skills: { dir: '.agents/skills', homeDir: '.agents/skills' },
      instructions: { shared: '.agentstd/instructions/shared.md' },
    });
    await fs.outputFile(
      path.join(env.projectDir, '.agentstd', 'instructions', 'shared.md'),
      '# Project Instructions\n',
    );
    process.chdir(env.projectDir);

    await syncCmd('codex', { projectOnly: true });

    const agentsMd = await fs.readFile(path.join(env.projectDir, 'AGENTS.md'), 'utf8');
    expect(agentsMd).toContain('# Project Instructions');
    expect(agentsMd).not.toContain('# Home Instructions');
    expect(
      await fs.pathExists(path.join(env.projectDir, '.codex', 'agents', 'reviewer.toml')),
    ).toBe(false);
  });

  it('warns when a configured instructions.shared source file is missing', async () => {
    await writeConfig(env.homeDir, {
      version: 1,
      targets: ['codex'],
      skills: { dir: '.agents/skills', homeDir: '.agents/skills' },
      instructions: { shared: '.agentstd/instructions/missing.md' },
    });
    await writeConfig(env.projectDir, {
      version: 1,
      targets: ['codex'],
      skills: { dir: '.agents/skills', homeDir: '.agents/skills' },
    });
    process.chdir(env.projectDir);

    const result = await syncCmd('codex', {});
    void result;
    expect(env.output.some((line) => line.includes('instructions.shared file not found'))).toBe(
      true,
    );
  });
});

describe('no home config means no home skills (Bug 2)', () => {
  let env: Env;

  beforeEach(async () => {
    env = await setup();
  });
  afterEach(async () => {
    await teardown(env);
  });

  it('does not plan or copy home skills when ~/.agentstd.yaml is absent', async () => {
    await fs.outputFile(
      path.join(env.homeDir, '.agents', 'skills', 'home-skill', 'SKILL.md'),
      '---\nname: home-skill\ndescription: Home\n---\n\nHome content',
    );
    await writeConfig(env.projectDir, {
      version: 1,
      targets: ['claude'],
      skills: { dir: '.agents/skills', homeDir: '.agents/skills' },
    });
    await fs.outputFile(
      path.join(env.projectDir, '.agents', 'skills', 'project-skill', 'SKILL.md'),
      '---\nname: project-skill\ndescription: Project\n---\n\nProject content',
    );
    process.chdir(env.projectDir);

    await syncCmd('claude', { dryRun: true });

    const text = env.output.join('\n');
    expect(text).not.toContain('home-skill');
    expect(text).toContain('project-skill');
  });

  it('loadMergedConfig reports hasHomeConfig=false and resolveSkillSources excludes home', async () => {
    await writeConfig(env.projectDir, {
      version: 1,
      targets: ['claude'],
      skills: { dir: '.agents/skills', homeDir: '.agents/skills' },
    });
    const merged = await loadMergedConfig(env.projectDir, env.homeDir);
    expect(merged.hasHomeConfig).toBe(false);
    const sources = resolveSkillSources(
      env.projectDir,
      merged.config,
      env.homeDir,
      'project',
      merged.hasHomeConfig,
    );
    expect(sources).toHaveLength(1);
    expect(sources[0].label).toBe('project');
  });
});

describe('skills list/show scope model (Bug 3)', () => {
  let env: Env;

  beforeEach(async () => {
    env = await setup();
    await fs.outputFile(
      path.join(env.homeDir, '.agents', 'skills', 'home-skill', 'SKILL.md'),
      '---\nname: home-skill\ndescription: Home skill\n---\n\nHome content',
    );
  });
  afterEach(async () => {
    await teardown(env);
  });

  it('global scope (rooted at home) lists home skills only', async () => {
    await writeConfig(env.homeDir, {
      version: 1,
      targets: ['claude'],
      skills: { dir: '.agents/skills', homeDir: '.agents/skills' },
    });
    process.chdir(env.homeDir);

    await skillsListCmd();

    const text = env.output.join('\n');
    expect(text).toContain('home-skill');
    expect(text).toContain('[home]');
  });

  it('project with no home config does not list home skills', async () => {
    await writeConfig(env.projectDir, {
      version: 1,
      targets: ['claude'],
      skills: { dir: '.agents/skills', homeDir: '.agents/skills' },
    });
    await fs.outputFile(
      path.join(env.projectDir, '.agents', 'skills', 'project-skill', 'SKILL.md'),
      '---\nname: project-skill\ndescription: Project skill\n---\n\nProject content',
    );
    process.chdir(env.projectDir);

    await skillsListCmd();

    const text = env.output.join('\n');
    expect(text).not.toContain('home-skill');
    expect(text).toContain('project-skill');
    expect(text).toContain('[project]');
  });

  it('project with home config lists home + project, project shadows by dirName', async () => {
    await writeConfig(env.homeDir, {
      version: 1,
      targets: ['claude'],
      skills: { dir: '.agents/skills', homeDir: '.agents/skills' },
    });
    await writeConfig(env.projectDir, {
      version: 1,
      targets: ['claude'],
      skills: { dir: '.agents/skills', homeDir: '.agents/skills' },
    });
    await fs.outputFile(
      path.join(env.projectDir, '.agents', 'skills', 'project-skill', 'SKILL.md'),
      '---\nname: project-skill\ndescription: Project\n---\n\nP',
    );
    await fs.outputFile(
      path.join(env.projectDir, '.agents', 'skills', 'home-skill', 'SKILL.md'),
      '---\nname: home-skill\ndescription: Project shadow\n---\n\nP wins',
    );
    process.chdir(env.projectDir);

    await skillsListCmd();

    const text = env.output.join('\n');
    expect(text).toContain('home-skill');
    expect(text).toContain('project-skill');
    expect(text).toContain('Project shadow');
  });

  it('--project-only lists project skills only', async () => {
    await writeConfig(env.homeDir, {
      version: 1,
      targets: ['claude'],
      skills: { dir: '.agents/skills', homeDir: '.agents/skills' },
    });
    await writeConfig(env.projectDir, {
      version: 1,
      targets: ['claude'],
      skills: { dir: '.agents/skills', homeDir: '.agents/skills' },
    });
    await fs.outputFile(
      path.join(env.projectDir, '.agents', 'skills', 'project-skill', 'SKILL.md'),
      '---\nname: project-skill\ndescription: Project\n---\n\nP',
    );
    process.chdir(env.projectDir);

    await skillsListCmd({ projectOnly: true });

    const text = env.output.join('\n');
    expect(text).not.toContain('home-skill');
    expect(text).toContain('project-skill');
    expect(text).toContain('[project]');
  });
});
