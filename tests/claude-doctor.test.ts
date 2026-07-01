import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { doctor } from '../src/adapters/claude/doctor';
import { sync as claudeSync } from '../src/adapters/claude/sync';
import type { DoctorContext, SyncContext } from '../src/core/types';

describe('Claude doctor', () => {
  let tmpDir: string;
  let homeDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentstd-claude-doctor-'));
    homeDir = path.join(tmpDir, 'home');
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  function makeCtx(): SyncContext & DoctorContext {
    return {
      projectRoot: tmpDir,
      homeRoot: homeDir,
      config: {
        version: 1,
        targets: ['claude'],
        hooks: {},
        skills: { dir: '.agents/skills', homeDir: '.agents/skills' },
        instructions: {},
      },
    };
  }

  async function writeSkill(base: string, name: string, body: string): Promise<void> {
    const skillDir = path.join(base, name);
    await fs.ensureDir(skillDir);
    await fs.writeFile(
      path.join(skillDir, 'SKILL.md'),
      `---\nname: ${name}\ndescription: test\n---\n\n${body}`,
    );
  }

  it('checks home-only merged skills', async () => {
    await writeSkill(path.join(homeDir, '.agents', 'skills'), 'home-only', 'Home');
    const ctx = makeCtx();
    await claudeSync(ctx);

    const result = await doctor(ctx);

    expect(result.checks).toContainEqual(
      expect.objectContaining({
        label: '1 merged skill(s) synced',
        status: 'pass',
      }),
    );
  });

  it('warns when a synced skill is stale', async () => {
    await writeSkill(path.join(tmpDir, '.agents', 'skills'), 'project-skill', 'Old');
    const ctx = makeCtx();
    await claudeSync(ctx);
    await writeSkill(path.join(tmpDir, '.agents', 'skills'), 'project-skill', 'New');

    const result = await doctor(ctx);

    expect(result.checks).toContainEqual(
      expect.objectContaining({
        label: 'Skill project-skill is stale',
        status: 'warn',
      }),
    );
  });

  it('respects projectOnly by skipping home skills', async () => {
    await writeSkill(path.join(homeDir, '.agents', 'skills'), 'home-only', 'Home');
    const ctx = makeCtx();
    ctx.config.projectOnly = true;

    const result = await doctor(ctx);

    expect(result.checks).toContainEqual(
      expect.objectContaining({
        label: '0 merged skill(s) synced',
        status: 'pass',
      }),
    );
  });
});
