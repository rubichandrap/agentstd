import { describe, expect, it } from 'vitest';
import { resolveSyncTargets } from '../src/cli/commands/sync-targets';
import type { AgentStdConfig } from '../src/core/types';

const config: AgentStdConfig = {
  version: 1,
  targets: ['claude', 'codex'],
  hooks: {},
  skills: { dir: '.agents/skills', homeDir: '.agents/skills' },
  instructions: {},
};

describe('resolveSyncTargets', () => {
  it('uses the explicit target without prompting', async () => {
    const targets = await resolveSyncTargets(config, {
      requestedTarget: 'codex',
      isInteractive: true,
      promptTarget: async () => 'claude',
    });

    expect(targets).toEqual(['codex']);
  });

  it('syncs all configured targets when --all is passed', async () => {
    const targets = await resolveSyncTargets(config, {
      all: true,
      isInteractive: true,
      promptTarget: async () => 'claude',
    });

    expect(targets).toEqual(['claude', 'codex']);
  });

  it('does not prompt for one configured target', async () => {
    const targets = await resolveSyncTargets(
      { ...config, targets: ['claude'] },
      {
        isInteractive: true,
        promptTarget: async () => {
          throw new Error('prompt should not run');
        },
      },
    );

    expect(targets).toEqual(['claude']);
  });

  it('preserves sync-all behavior for non-interactive terminals', async () => {
    const targets = await resolveSyncTargets(config, {
      isInteractive: false,
      promptTarget: async () => 'claude',
    });

    expect(targets).toEqual(['claude', 'codex']);
  });

  it('uses the prompted target when multiple targets are interactive', async () => {
    const targets = await resolveSyncTargets(config, {
      isInteractive: true,
      promptTarget: async () => 'codex',
    });

    expect(targets).toEqual(['codex']);
  });

  it('syncs all targets when the prompt selects all', async () => {
    const targets = await resolveSyncTargets(config, {
      isInteractive: true,
      promptTarget: async () => 'all',
    });

    expect(targets).toEqual(['claude', 'codex']);
  });
});
