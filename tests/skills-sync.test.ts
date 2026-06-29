import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { syncClaudeSkills } from '../src/adapters/claude/skills';
import type { SyncContext } from '../src/core/types';

describe('Claude skills sync', () => {
  let tmpDir: string;
  let ctx: SyncContext;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentstd-test-'));
    ctx = {
      projectRoot: tmpDir,
      homeRoot: path.join(tmpDir, 'home'),
      config: {
        version: 1,
        targets: ['claude'],
        hooks: {},
        skills: { dir: '.agentstd/skills', homeDir: '.agents/skills' },
        instructions: {},
      },
      dryRun: false,
    };
    const skillDir = path.join(tmpDir, '.agentstd', 'skills', 'my-skill');
    await fs.ensureDir(skillDir);
    await fs.writeFile(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: my-skill\ndescription: Test\n---\n\nContent',
    );
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  it('syncs skills to .claude/skills', async () => {
    const result = await syncClaudeSkills(ctx, []);
    expect(result.changed).toContain('skills/my-skill');

    const dest = path.join(tmpDir, '.claude', 'skills', 'my-skill', 'SKILL.md');
    const exists = await fs.pathExists(dest);
    expect(exists).toBe(true);
  });

  it('returns empty when source skills dir missing', async () => {
    const badCtx: SyncContext = {
      projectRoot: tmpDir,
      homeRoot: path.join(tmpDir, 'home'),
      config: {
        ...ctx.config,
        skills: { dir: 'missing', homeDir: 'nope' },
      },
      dryRun: false,
    };
    const result = await syncClaudeSkills(badCtx, []);
    expect(result.changed).toHaveLength(0);
  });

  it('pulls a home-only skill into .claude/skills', async () => {
    const homeSkills = path.join(tmpDir, 'home', '.agents', 'skills', 'home-skill');
    await fs.ensureDir(homeSkills);
    await fs.writeFile(
      path.join(homeSkills, 'SKILL.md'),
      '---\nname: home-skill\ndescription: from home\n---\n\nHome content',
    );
    const result = await syncClaudeSkills(ctx, []);
    expect(result.changed).toContain('skills/home-skill');
    const dest = path.join(tmpDir, '.claude', 'skills', 'home-skill', 'SKILL.md');
    expect(await fs.pathExists(dest)).toBe(true);
    expect(await fs.readFile(dest, 'utf8')).toContain('Home content');
  });

  it('project skill shadows home skill with same dirName', async () => {
    const homeSkills = path.join(tmpDir, 'home', '.agents', 'skills', 'shared-skill');
    await fs.ensureDir(homeSkills);
    await fs.writeFile(
      path.join(homeSkills, 'SKILL.md'),
      '---\nname: shared-skill\ndescription: from home\n---\n\nHome wins? no',
    );
    const projectSkills = path.join(tmpDir, '.agentstd', 'skills', 'shared-skill');
    await fs.ensureDir(projectSkills);
    await fs.writeFile(
      path.join(projectSkills, 'SKILL.md'),
      '---\nname: shared-skill\ndescription: from project\n---\n\nProject wins',
    );
    const result = await syncClaudeSkills(ctx, []);
    expect(result.changed).toContain('skills/shared-skill');
    const dest = path.join(tmpDir, '.claude', 'skills', 'shared-skill', 'SKILL.md');
    expect(await fs.readFile(dest, 'utf8')).toContain('Project wins');
  });

  it('syncs both home and project skills when names differ', async () => {
    const homeSkills = path.join(tmpDir, 'home', '.agents', 'skills', 'home-only');
    await fs.ensureDir(homeSkills);
    await fs.writeFile(
      path.join(homeSkills, 'SKILL.md'),
      '---\nname: home-only\ndescription: h\n---\n\nH',
    );
    const result = await syncClaudeSkills(ctx, []);
    expect(result.changed).toContain('skills/my-skill');
    expect(result.changed).toContain('skills/home-only');
  });

  it('projectOnly: true prevents home skills from syncing', async () => {
    const homeSkills = path.join(tmpDir, 'home', '.agents', 'skills', 'home-skill');
    await fs.ensureDir(homeSkills);
    await fs.writeFile(
      path.join(homeSkills, 'SKILL.md'),
      '---\nname: home-skill\ndescription: from home\n---\n\nShould NOT sync',
    );
    const projectOnlyCtx: SyncContext = {
      ...ctx,
      config: { ...ctx.config, projectOnly: true },
    };
    const result = await syncClaudeSkills(projectOnlyCtx, []);
    expect(result.changed).toContain('skills/my-skill');
    expect(result.changed).not.toContain('skills/home-skill');
    const dest = path.join(tmpDir, '.claude', 'skills', 'home-skill', 'SKILL.md');
    expect(await fs.pathExists(dest)).toBe(false);
  });
});
