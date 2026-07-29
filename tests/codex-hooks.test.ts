import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { codexAdapter } from '../src/adapters/codex';
import {
  hasCodexPreToolUseHookSynced,
  upsertCodexPreToolUseHook,
} from '../src/adapters/codex/hooks';
import { agentStdConfigSchema } from '../src/core/config';
import type { AgentStdConfig, RemoveContext, SyncContext } from '../src/core/types';

function baseConfig(command?: string): AgentStdConfig {
  return agentStdConfigSchema.parse({
    version: 1,
    targets: ['codex'],
    hooks: command ? { preToolUse: { command } } : {},
    skills: { dir: '.agents/skills', homeDir: '.agents/skills' },
    instructions: {},
  });
}

describe('Codex hook ownership (bug 1 regression)', () => {
  let tmpDir: string;
  let hooksPath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentstd-codex-hook-'));
    hooksPath = path.join(tmpDir, '.codex', 'hooks.json');
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  it('does not duplicate a custom PreToolUse command on repeated sync', async () => {
    const config = baseConfig('/usr/local/bin/custom-hook');
    await upsertCodexPreToolUseHook(hooksPath, config);
    await upsertCodexPreToolUseHook(hooksPath, config);
    await upsertCodexPreToolUseHook(hooksPath, config);
    const hooks = (await fs.readJson(hooksPath)).hooks.PreToolUse;
    expect(hooks).toHaveLength(1);
    expect(hooks[0].hooks[0].command).toBe('/usr/local/bin/custom-hook');
  });

  it('preserves _agentstd marker on persisted hooks (for clean uninstall)', async () => {
    await upsertCodexPreToolUseHook(hooksPath, baseConfig('node .agentstd/hooks/pretooluse.js'));
    const hooks = (await fs.readJson(hooksPath)).hooks.PreToolUse;
    expect(hooks[0]._agentstd).toBe('agentstd-pretooluse');
  });

  it('updating the custom command replaces, not duplicates, the hook', async () => {
    await upsertCodexPreToolUseHook(hooksPath, baseConfig('/usr/local/bin/custom-hook'));
    await upsertCodexPreToolUseHook(hooksPath, baseConfig('/usr/local/bin/custom-hook-v2'));
    const hooks = (await fs.readJson(hooksPath)).hooks.PreToolUse;
    expect(hooks).toHaveLength(1);
    expect(hooks[0].hooks[0].command).toBe('/usr/local/bin/custom-hook-v2');
  });

  it('hasCodexPreToolUseHookSynced returns true after first sync', async () => {
    const config = baseConfig('node .agentstd/hooks/pretooluse.js');
    await upsertCodexPreToolUseHook(hooksPath, config);
    expect(await hasCodexPreToolUseHookSynced(hooksPath, config)).toBe(true);
  });

  it('end-to-end: full adapter.sync + adapter.remove cleans a custom hook', async () => {
    const config = baseConfig('/usr/local/bin/custom-hook');
    const syncCtx: SyncContext = {
      projectRoot: tmpDir,
      homeRoot: path.join(tmpDir, 'home'),
      config,
      dryRun: false,
    };
    await fs.ensureDir(path.join(tmpDir, '.codex'));
    await codexAdapter.sync(syncCtx);
    await codexAdapter.sync(syncCtx); // second sync must not duplicate
    const hooksBefore = (await fs.readJson(hooksPath)).hooks.PreToolUse;
    expect(hooksBefore).toHaveLength(1);

    const removeCtx: RemoveContext = {
      projectRoot: tmpDir,
      homeRoot: path.join(tmpDir, 'home'),
      config,
      scope: 'project',
      outputRoot: tmpDir,
      dryRun: false,
    };
    await codexAdapter.remove(removeCtx);
    const hooksAfter = await fs.readJson(hooksPath).catch(() => null);
    if (hooksAfter?.hooks?.PreToolUse) {
      expect(hooksAfter.hooks.PreToolUse).toHaveLength(0);
    } else {
      expect(hooksAfter?.hooks?.PreToolUse ?? []).toHaveLength(0);
    }
  });
});
