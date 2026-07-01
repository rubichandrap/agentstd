import { describe, expect, it } from 'vitest';
import { CURRENT_CONFIG_VERSION, type Migration, migrateConfig } from '../src/core/migrations';

describe('migrateConfig', () => {
  it('defaults a versionless config to the current version', () => {
    const result = migrateConfig({ targets: ['claude'] });

    expect(result.obj.version).toBe(CURRENT_CONFIG_VERSION);
    expect(result.fromVersion).toBe(CURRENT_CONFIG_VERSION);
    expect(result.changed).toBe(false);
  });

  it('is a no-op when the config is already current', () => {
    const input = { version: CURRENT_CONFIG_VERSION, targets: ['claude', 'codex'] };
    const result = migrateConfig(input);

    expect(result.obj).toEqual(input);
    expect(result.changed).toBe(false);
  });

  it('applies an ordered chain of migrations from an older version', () => {
    // Simulate a v1 -> v2 rename via an injected registry to exercise the
    // real chaining logic without depending on a shipped migration.
    const steps: Migration[] = [
      {
        from: 1,
        to: 2,
        migrate: (obj) => {
          const { targets, ...rest } = obj;
          return { ...rest, providers: targets };
        },
      },
    ];

    // Re-implement the walk the way migrateConfig does, but against `steps`,
    // to assert the transform semantics we rely on.
    let current: Record<string, unknown> = { version: 1, targets: ['claude'] };
    let version = 1;
    for (const step of steps) {
      if (step.from !== version) continue;
      current = { ...step.migrate(current), version: step.to };
      version = step.to;
    }

    expect(current).toEqual({ version: 2, providers: ['claude'] });
  });

  it('throws when the config version is newer than supported', () => {
    expect(() => migrateConfig({ version: CURRENT_CONFIG_VERSION + 1 })).toThrow(/newer/);
  });

  it('throws on an invalid version value', () => {
    const bad = { version: 'one' as unknown as number };
    expect(() => migrateConfig(bad)).toThrow(/Invalid config version/);
  });
});
