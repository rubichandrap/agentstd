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
      config: {
        version: 1,
        targets: ['claude'],
        hooks: {},
        skills: { dir: '.agentstd/skills' },
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
      config: {
        ...ctx.config,
        skills: { dir: 'missing' },
      },
      dryRun: false,
    };
    const result = await syncClaudeSkills(badCtx, []);
    expect(result.changed).toHaveLength(0);
  });
});
