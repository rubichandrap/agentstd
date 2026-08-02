import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { claudeAdapter } from '../src/adapters/claude';
import { doctor as claudeDoctor } from '../src/adapters/claude/doctor';
import { agentStdConfigSchema } from '../src/core/config';
import { claudeDir, claudeMdPath } from '../src/core/paths';
import type { DoctorContext, RemoveContext, SyncContext } from '../src/core/types';

describe('Claude shared instructions', () => {
  let tmpDir: string;
  let homeDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentstd-claude-instr-'));
    homeDir = path.join(tmpDir, 'home');
    await fs.ensureDir(homeDir);
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  function makeCtx(overrides: Partial<SyncContext> = {}): SyncContext {
    return {
      projectRoot: tmpDir,
      homeRoot: homeDir,
      dryRun: false,
      config: agentStdConfigSchema.parse({
        version: 1,
        targets: ['claude'],
        hooks: {},
        skills: { dir: '.agents/skills', homeDir: '.agents/skills' },
        instructions: {
          shared: '.agentstd/instructions/shared.md',
        },
        mcpServers: {},
        permissions: {
          commands: { allow: [], prompt: [], deny: [] },
          files: { denyRead: [], denyWrite: [] },
        },
        agents: {},
      }),
      ...overrides,
    };
  }

  async function writeShared(content: string, root = tmpDir): Promise<void> {
    await fs.outputFile(path.join(root, '.agentstd', 'instructions', 'shared.md'), content);
  }

  it('writes a managed block into CLAUDE.md from instructions.shared, preserving user content', async () => {
    await fs.outputFile(path.join(tmpDir, 'CLAUDE.md'), '# Existing\n\nKeep this.');
    await writeShared('Use pnpm.');

    const result = await claudeAdapter.sync(makeCtx());
    const claudeMd = await fs.readFile(claudeMdPath(tmpDir), 'utf8');

    expect(result.changed).toContain('CLAUDE.md');
    expect(claudeMd).toContain('Keep this.');
    expect(claudeMd).toContain('<!-- agentstd:start instructions -->');
    expect(claudeMd).toContain('Use pnpm.');
    expect(claudeMd).toContain('<!-- agentstd:end instructions -->');
  });

  it('writes the managed block into .claude/CLAUDE.md in global scope', async () => {
    await writeShared('Global rules.', tmpDir);
    const ctx = makeCtx({ scope: 'global', outputRoot: homeDir });

    const result = await claudeAdapter.sync(ctx);
    const claudeMd = await fs.readFile(path.join(claudeDir(homeDir), 'CLAUDE.md'), 'utf8');

    expect(result.changed).toContain('.claude/CLAUDE.md');
    expect(await fs.pathExists(claudeMdPath(tmpDir))).toBe(false);
    expect(claudeMd).toContain('Global rules.');
  });

  it('is idempotent under dry-run after a synced block', async () => {
    await writeShared('Use pnpm.');
    await claudeAdapter.sync(makeCtx());

    const result = await claudeAdapter.sync(makeCtx({ dryRun: true }));
    const activeOps = result.operations.filter((op) => op.type !== 'skip');
    expect(activeOps).toHaveLength(0);
  });

  it('strips the managed block and removes CLAUDE.md when it becomes empty on unset', async () => {
    await writeShared('Use pnpm.');
    await claudeAdapter.sync(makeCtx());

    const ctx = makeCtx();
    ctx.config.instructions = {};
    await claudeAdapter.sync(ctx);

    expect(await fs.pathExists(claudeMdPath(tmpDir))).toBe(false);
  });

  it('strips the managed block while preserving user content on unset', async () => {
    await fs.outputFile(path.join(tmpDir, 'CLAUDE.md'), 'User content.\n');
    await writeShared('Use pnpm.');
    await claudeAdapter.sync(makeCtx());

    const ctx = makeCtx();
    ctx.config.instructions = {};
    await claudeAdapter.sync(ctx);

    const claudeMd = await fs.readFile(claudeMdPath(tmpDir), 'utf8');
    expect(claudeMd).toContain('User content.');
    expect(claudeMd).not.toContain('agentstd:start instructions');
  });

  it('reads a home-defined instructions.shared from the home layer', async () => {
    await writeShared('# Home Instructions', homeDir);
    const ctx = makeCtx({
      pathSources: { instructions: { shared: 'home' } },
    });

    await claudeAdapter.sync(ctx);
    const claudeMd = await fs.readFile(claudeMdPath(tmpDir), 'utf8');

    expect(claudeMd).toContain('# Home Instructions');
    expect(claudeMd).not.toMatch(
      /<!-- agentstd:start instructions -->\s*<!-- agentstd:end instructions -->/,
    );
  });

  it('warns and writes an empty managed block when the source file is missing', async () => {
    const result = await claudeAdapter.sync(makeCtx());
    const claudeMd = await fs.readFile(claudeMdPath(tmpDir), 'utf8');

    expect(result.warnings.some((w) => w.includes('instructions.shared file not found'))).toBe(
      true,
    );
    expect(claudeMd).toContain('<!-- agentstd:start instructions -->');
    expect(claudeMd).toContain('<!-- agentstd:end instructions -->');
  });

  it('doctor passes when the block matches and warns on drift', async () => {
    await writeShared('Use pnpm.');
    const ctx = makeCtx();
    await claudeAdapter.sync(ctx);

    const pass = await claudeDoctor(ctx as DoctorContext);
    const passCheck = pass.checks.find((c) => c.label === 'CLAUDE.md instructions synced');
    expect(passCheck?.status).toBe('pass');

    await writeShared('Changed content.');
    const drift = await claudeDoctor(ctx as DoctorContext);
    const driftCheck = drift.checks.find((c) => c.label === 'CLAUDE.md instructions synced');
    expect(driftCheck?.status).toBe('warn');
  });

  it('doctor passes for a synced block in global scope', async () => {
    await writeShared('Global rules.', tmpDir);
    const ctx = makeCtx({ scope: 'global', outputRoot: homeDir });
    await claudeAdapter.sync(ctx);

    const result = await claudeDoctor(ctx as DoctorContext);
    const check = result.checks.find((c) => c.label === 'CLAUDE.md instructions synced');
    expect(check?.status).toBe('pass');
  });

  it('remove strips the managed block while preserving user content', async () => {
    await fs.outputFile(path.join(tmpDir, 'CLAUDE.md'), 'My notes.\n');
    await writeShared('Use pnpm.');
    await claudeAdapter.sync(makeCtx());

    const result = await claudeAdapter.remove(makeRemoveCtx());
    expect(result.removed).toContain('CLAUDE.md');

    const claudeMd = await fs.readFile(claudeMdPath(tmpDir), 'utf8');
    expect(claudeMd).toContain('My notes.');
    expect(claudeMd).not.toContain('agentstd:start instructions');
  });

  it('remove deletes CLAUDE.md when it becomes empty', async () => {
    await writeShared('Use pnpm.');
    await claudeAdapter.sync(makeCtx());

    const result = await claudeAdapter.remove(makeRemoveCtx());
    expect(result.removed).toContain('CLAUDE.md');
    expect(await fs.pathExists(claudeMdPath(tmpDir))).toBe(false);
  });

  it('remove cleans .claude/CLAUDE.md in global scope', async () => {
    await writeShared('Global rules.', tmpDir);
    await claudeAdapter.sync(makeCtx({ scope: 'global', outputRoot: homeDir }));
    const globalMd = path.join(claudeDir(homeDir), 'CLAUDE.md');
    expect(await fs.pathExists(globalMd)).toBe(true);

    await claudeAdapter.remove({ ...makeRemoveCtx(), scope: 'global', outputRoot: homeDir });

    expect(await fs.pathExists(globalMd)).toBe(false);
  });

  it('declares the instructions capability as native', () => {
    expect(claudeAdapter.capabilities.instructions).toBe('native');
  });

  function makeRemoveCtx(): RemoveContext {
    return {
      projectRoot: tmpDir,
      homeRoot: homeDir,
      dryRun: false,
      config: makeCtx().config,
    };
  }
});
