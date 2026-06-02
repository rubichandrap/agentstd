import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  hasPreToolUseHookSynced,
  readSettings,
  upsertPreToolUseHook,
} from '../src/adapters/claude/settings';

describe('Claude settings', () => {
  let tmpDir: string;
  let settingsPath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentstd-test-'));
    settingsPath = path.join(tmpDir, 'settings.json');
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  const config = {
    version: 1 as const,
    targets: ['claude'],
    hooks: {
      preToolUse: {
        command: 'node .agentstd/hooks/pretooluse.js',
      },
    },
    skills: { dir: '.agentstd/skills' },
    instructions: {},
  };

  it('creates settings.json with AgentStd hook when file does not exist', async () => {
    await upsertPreToolUseHook(settingsPath, config);
    const settings = await readSettings(settingsPath);
    expect(settings.hooks).toBeDefined();
    expect(settings.hooks?.PreToolUse).toHaveLength(1);
    expect(settings.hooks?.PreToolUse[0].matcher).toBe('Bash|Edit|Write|MultiEdit');
  });

  it('idempotent: running twice does not duplicate', async () => {
    await upsertPreToolUseHook(settingsPath, config);
    await upsertPreToolUseHook(settingsPath, config);
    const settings = await readSettings(settingsPath);
    expect(settings.hooks?.PreToolUse).toHaveLength(1);
  });

  it('preserves existing non-AgentStd hooks', async () => {
    await fs.writeFile(
      settingsPath,
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: '',
              hooks: [{ type: 'command', command: '/usr/bin/some-hook' }],
            },
          ],
        },
      }),
    );
    await upsertPreToolUseHook(settingsPath, config);
    const settings = await readSettings(settingsPath);
    expect(settings.hooks?.PreToolUse).toHaveLength(2);
  });

  it('preserves unknown settings keys', async () => {
    await fs.writeFile(
      settingsPath,
      JSON.stringify({
        permissions: { allow: ['Bash(git:*'] },
      }),
    );
    await upsertPreToolUseHook(settingsPath, config);
    const settings = await readSettings(settingsPath);
    expect(settings.permissions).toBeDefined();
    expect(settings.hooks).toBeDefined();
  });

  it('detects synced hook', async () => {
    await upsertPreToolUseHook(settingsPath, config);
    const synced = await hasPreToolUseHookSynced(settingsPath, config);
    expect(synced).toBe(true);
  });

  it('detects missing hook', async () => {
    const synced = await hasPreToolUseHookSynced(settingsPath, config);
    expect(synced).toBe(false);
  });

  it('no hook when preToolUse is not configured', async () => {
    const noHookConfig = { ...config, hooks: {} };
    await upsertPreToolUseHook(settingsPath, noHookConfig);
    const settings = await readSettings(settingsPath);
    expect(settings.hooks?.PreToolUse).toHaveLength(0);
  });

  it('preserves unknown top-level fields', async () => {
    await fs.writeFile(
      settingsPath,
      JSON.stringify({
        permissions: { allow: ['Bash(git:*)'] },
        hooks: {
          Notification: [
            { matcher: '', hooks: [{ type: 'command', command: 'notify.sh' }] },
          ],
        },
      }),
    );
    await upsertPreToolUseHook(settingsPath, config);
    const settings = await readSettings(settingsPath);
    expect(settings.permissions).toBeDefined();
    expect(settings.hooks?.Notification).toHaveLength(1);
    expect(settings.hooks?.PreToolUse).toHaveLength(1);
  });

  it('preserves unrelated PreToolUse hooks', async () => {
    await fs.writeFile(
      settingsPath,
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: 'Read',
              hooks: [{ type: 'command', command: '/usr/bin/audit-read' }],
            },
          ],
        },
      }),
    );
    await upsertPreToolUseHook(settingsPath, config);
    const settings = await readSettings(settingsPath);
    expect(settings.hooks?.PreToolUse).toHaveLength(2);
    const auditHook = settings.hooks?.PreToolUse.find((h) => h.hooks[0].command === '/usr/bin/audit-read');
    expect(auditHook).toBeDefined();
  });

  it('updates existing AgentStd hook if command changes', async () => {
    await upsertPreToolUseHook(settingsPath, config);
    const updatedConfig = {
      ...config,
      hooks: { preToolUse: { command: 'node .agentstd/hooks/pretooluse-v2.js' } },
    };
    await upsertPreToolUseHook(settingsPath, updatedConfig);
    const settings = await readSettings(settingsPath);
    expect(settings.hooks?.PreToolUse).toHaveLength(1);
    expect(settings.hooks?.PreToolUse[0].hooks[0].command).toBe(
      'node .agentstd/hooks/pretooluse-v2.js',
    );
  });

  it('handles missing hooks section', async () => {
    await fs.writeFile(settingsPath, JSON.stringify({ permissions: {} }));
    await upsertPreToolUseHook(settingsPath, config);
    const settings = await readSettings(settingsPath);
    expect(settings.hooks).toBeDefined();
    expect(settings.hooks?.PreToolUse).toHaveLength(1);
  });

  it('handles missing hooks.PreToolUse', async () => {
    await fs.writeFile(
      settingsPath,
      JSON.stringify({ hooks: { Notification: [] } }),
    );
    await upsertPreToolUseHook(settingsPath, config);
    const settings = await readSettings(settingsPath);
    expect(settings.hooks?.PreToolUse).toHaveLength(1);
    expect(settings.hooks?.Notification).toBeDefined();
  });

  it('fails clearly on invalid JSON without overwriting', async () => {
    await fs.writeFile(settingsPath, '{ broken json!!!!');
    await expect(upsertPreToolUseHook(settingsPath, config)).rejects.toThrow('Invalid JSON');
    const raw = await fs.readFile(settingsPath, 'utf8');
    expect(raw).toBe('{ broken json!!!!');
  });

  it('does not duplicate AgentStd hook on repeated sync', async () => {
    await upsertPreToolUseHook(settingsPath, config);
    await upsertPreToolUseHook(settingsPath, config);
    await upsertPreToolUseHook(settingsPath, config);
    const settings = await readSettings(settingsPath);
    expect(settings.hooks?.PreToolUse).toHaveLength(1);
  });

  it('preserves unrelated hook categories', async () => {
    await fs.writeFile(
      settingsPath,
      JSON.stringify({
        hooks: {
          PostToolUse: [
            { matcher: '', hooks: [{ type: 'command', command: 'log.sh' }] },
          ],
        },
      }),
    );
    await upsertPreToolUseHook(settingsPath, config);
    const settings = await readSettings(settingsPath);
    expect(settings.hooks?.PostToolUse).toHaveLength(1);
    expect(settings.hooks?.PreToolUse).toHaveLength(1);
  });
});
