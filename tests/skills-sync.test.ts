import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { syncClaudeSkills } from '../src/adapters/claude/skills';
import type { SyncContext } from '../src/core/types';

describe('Claude skills sync', () => {
  let tmpDir: string;
  let ctx: { projectRoot: string; config: { skills: { dir: string } } };

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentstd-test-'));
    ctx = {
      projectRoot: tmpDir,
      config: {
        skills: { dir: '.agentstd/skills' },
      },
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
    const changed = await syncClaudeSkills(ctx as SyncContext);
    expect(changed).toContain('skills/my-skill');

    const dest = path.join(tmpDir, '.claude', 'skills', 'my-skill', 'SKILL.md');
    const exists = await fs.pathExists(dest);
    expect(exists).toBe(true);
  });

  it('returns empty when source skills dir missing', async () => {
    const badCtx = {
      projectRoot: tmpDir,
      config: { skills: { dir: 'missing' } },
    };
    const changed = await syncClaudeSkills(badCtx as SyncContext);
    expect(changed).toHaveLength(0);
  });
});
