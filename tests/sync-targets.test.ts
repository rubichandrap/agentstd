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
      promptTargets: async () => ['claude'],
    });

    expect(targets).toEqual(['codex']);
  });

  it('syncs all configured targets when --all is passed', async () => {
    const targets = await resolveSyncTargets(config, {
      all: true,
      isInteractive: true,
      promptTargets: async () => ['claude'],
    });

    expect(targets).toEqual(['claude', 'codex']);
  });

  it('does not prompt for one configured target', async () => {
    const targets = await resolveSyncTargets(
      { ...config, targets: ['claude'] },
      {
        isInteractive: true,
        promptTargets: async () => {
          throw new Error('prompt should not run');
        },
      },
    );

    expect(targets).toEqual(['claude']);
  });

  it('preserves sync-all behavior for non-interactive terminals', async () => {
    const targets = await resolveSyncTargets(config, {
      isInteractive: false,
      promptTargets: async () => ['claude'],
    });

    expect(targets).toEqual(['claude', 'codex']);
  });

  it('syncs only the targets selected in the interactive prompt', async () => {
    const targets = await resolveSyncTargets(config, {
      isInteractive: true,
      promptTargets: async () => ['codex'],
    });

    expect(targets).toEqual(['codex']);
  });

  it('syncs every selected target when the prompt picks all', async () => {
    const targets = await resolveSyncTargets(config, {
      isInteractive: true,
      promptTargets: async () => ['claude', 'codex'],
    });

    expect(targets).toEqual(['claude', 'codex']);
  });

  it('skips prompting in check/dry-run modes', async () => {
    const targets = await resolveSyncTargets(config, {
      check: true,
      isInteractive: true,
      promptTargets: async () => {
        throw new Error('prompt should not run');
      },
    });

    expect(targets).toEqual(['claude', 'codex']);
  });
});
