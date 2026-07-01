import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import YAML from 'yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { statusCmd } from '../src/cli/commands/status';

describe('status command', () => {
  let tmpBase: string;
  let projectDir: string;
  let homeDir: string;
  let originalCwd: string;
  let originalHome: string | undefined;
  let output: string[];

  beforeEach(async () => {
    tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), 'agentstd-status-'));
    projectDir = path.join(tmpBase, 'project');
    homeDir = path.join(tmpBase, 'home');
    await fs.ensureDir(projectDir);
    await fs.ensureDir(homeDir);
    originalCwd = process.cwd();
    originalHome = process.env.AGENTSTD_HOME;
    process.env.AGENTSTD_HOME = homeDir;
    process.chdir(projectDir);
    output = [];
    vi.spyOn(console, 'log').mockImplementation((...messages: unknown[]) => {
      output.push(messages.map((message) => String(message ?? '')).join(' '));
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    if (originalHome === undefined) delete process.env.AGENTSTD_HOME;
    else process.env.AGENTSTD_HOME = originalHome;
    await fs.remove(tmpBase);
  });

  async function writeProjectConfig(config: Record<string, unknown>): Promise<void> {
    await fs.writeFile(path.join(projectDir, '.agentstd.yaml'), YAML.stringify(config));
  }

  async function writeHomeConfig(config: Record<string, unknown>): Promise<void> {
    await fs.writeFile(path.join(homeDir, '.agentstd.yaml'), YAML.stringify(config));
  }

  async function writeSkill(root: string, name: string): Promise<void> {
    await fs.outputFile(
      path.join(root, '.agents', 'skills', name, 'SKILL.md'),
      `---\nname: ${name}\ndescription: test\n---\n\nContent`,
    );
  }

  it('prints init guidance when config is missing', async () => {
    await statusCmd();

    expect(output.join('\n')).toContain('.agentstd.yaml not found');
    expect(output.join('\n')).toContain('Run: agentstd init');
  });

  it('prints merged project status and configured groups', async () => {
    await writeHomeConfig({ version: 1, targets: ['claude', 'codex'] });
    await writeProjectConfig({
      version: 1,
      targets: ['claude', 'codex'],
      hooks: { preToolUse: { command: 'node .agentstd/hooks/pretooluse.js' } },
      instructions: { shared: '.agentstd/instructions/shared.md' },
      mcpServers: { github: { command: 'npx' } },
      permissions: { commands: { allow: [['pnpm', 'test']] } },
      agents: {
        reviewer: {
          description: 'Review code.',
          instructions: '.agentstd/agents/reviewer.md',
        },
      },
    });
    await writeSkill(projectDir, 'project-skill');
    await writeSkill(homeDir, 'home-skill');

    await statusCmd();
    const text = output.join('\n');

    expect(text).toContain('AgentStd Status');
    expect(text).toContain('mode: merged home + project');
    expect(text).toContain('targets: claude, codex');
    expect(text).toContain('skills: 2 total (1 project, 1 home)');
    expect(text).toContain('hooks: preToolUse');
    expect(text).toContain('instructions: shared');
    expect(text).toContain('mcpServers: github');
    expect(text).toContain('permissions: commands');
    expect(text).toContain('agents: reviewer');
  });

  it('hides home source and skills in project-only mode', async () => {
    await writeHomeConfig({ version: 1, targets: ['codex'] });
    await writeProjectConfig({ version: 1, projectOnly: true, targets: ['claude'] });
    await writeSkill(homeDir, 'home-skill');

    await statusCmd();
    const text = output.join('\n');

    expect(text).toContain('mode: project-only');
    expect(text).toContain('targets: claude');
    expect(text).toContain('skills: 0 total (0 project, 0 home)');
    expect(text).not.toContain('home:');
  });
});
