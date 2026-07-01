import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { codexAdapter } from '../src/adapters/codex';
import type { SyncContext } from '../src/core/types';

describe('Codex adapter', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentstd-codex-'));
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  function makeCtx(dryRun = false): SyncContext {
    return {
      projectRoot: tmpDir,
      homeRoot: path.join(tmpDir, 'home'),
      dryRun,
      config: {
        version: 1,
        targets: ['codex'],
        hooks: {
          preToolUse: {
            command: 'node .agentstd/hooks/pretooluse.js',
          },
        },
        skills: { dir: '.agents/skills', homeDir: '.agents/skills' },
        instructions: {
          shared: '.agentstd/instructions/shared.md',
        },
      },
    };
  }

  it('upserts managed instructions into AGENTS.md without overwriting user content', async () => {
    await fs.outputFile(path.join(tmpDir, 'AGENTS.md'), '# Existing\n\nKeep this.');
    await fs.outputFile(path.join(tmpDir, '.agentstd', 'instructions', 'shared.md'), 'Use pnpm.');

    const result = await codexAdapter.sync(makeCtx());
    const agents = await fs.readFile(path.join(tmpDir, 'AGENTS.md'), 'utf8');

    expect(result.changed).toContain('AGENTS.md');
    expect(agents).toContain('Keep this.');
    expect(agents).toContain('<!-- agentstd:start instructions -->');
    expect(agents).toContain('Use pnpm.');
    expect(agents).toContain('<!-- agentstd:end instructions -->');
  });

  it('upserts PreToolUse into .codex/hooks.json idempotently', async () => {
    await codexAdapter.sync(makeCtx());
    await codexAdapter.sync(makeCtx());

    const hooks = await fs.readJson(path.join(tmpDir, '.codex', 'hooks.json'));
    expect(hooks.hooks.PreToolUse).toHaveLength(1);
    expect(hooks.hooks.PreToolUse[0].matcher).toBe('Bash|apply_patch|Edit|Write');
    expect(hooks.hooks.PreToolUse[0].hooks[0].command).toBe('node .agentstd/hooks/pretooluse.js');
  });

  it('fails invalid hooks JSON without overwriting it', async () => {
    const hooksPath = path.join(tmpDir, '.codex', 'hooks.json');
    await fs.outputFile(hooksPath, '{ broken json');

    const result = await codexAdapter.sync(makeCtx());
    const raw = await fs.readFile(hooksPath, 'utf8');

    expect(result.warnings.some((warning) => warning.includes('Invalid JSON'))).toBe(true);
    expect(raw).toBe('{ broken json');
  });

  it('does not copy default .agents skills because Codex reads them natively', async () => {
    await fs.outputFile(
      path.join(tmpDir, '.agents', 'skills', 'native-skill', 'SKILL.md'),
      '---\nname: native-skill\ndescription: native\n---\n\nNative',
    );

    const result = await codexAdapter.sync(makeCtx());

    expect(result.changed).not.toContain('skills/native-skill');
    expect(await fs.pathExists(path.join(tmpDir, '.codex', 'skills'))).toBe(false);
  });

  it('warns when Codex has a custom project skills directory', async () => {
    const ctx = makeCtx();
    ctx.config.skills.dir = '.agentstd/skills';

    const result = await codexAdapter.sync(ctx);

    expect(result.warnings).toContain(
      'Codex reads .agents/skills natively; custom skills.dir ".agentstd/skills" is not synced for Codex.',
    );
  });
});
