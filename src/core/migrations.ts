/**
 * Config version migrations.
 *
 * The on-disk `.agentstd.yaml` carries a `version` field. When a new agentstd
 * release adds or refactors config fields, bump {@link CURRENT_CONFIG_VERSION}
 * and append a migration step here that transforms the previous shape into the
 * new one. Additive-only fields are handled by Zod defaults at parse time, so a
 * step is only required when a field is renamed, moved, or removed.
 */

export const CURRENT_CONFIG_VERSION = 1;

export interface Migration {
  /** Version this step upgrades from. */
  from: number;
  /** Version this step upgrades to. */
  to: number;
  /** Pure transform of the raw config object. */
  migrate(obj: Record<string, unknown>): Record<string, unknown>;
}

/**
 * Ordered list of migration steps. Each step's `from` must equal the previous
 * step's `to`. Empty until the first breaking config refactor lands.
 *
 * Example (rename `targets` -> `agents` at v1 -> v2):
 *   {
 *     from: 1,
 *     to: 2,
 *     migrate: (obj) => {
 *       const { targets, ...rest } = obj;
 *       return { ...rest, agents: targets };
 *     },
 *   }
 */
export const migrations: Migration[] = [];

export interface MigrateResult {
  obj: Record<string, unknown>;
  fromVersion: number;
  toVersion: number;
  changed: boolean;
}

function readVersion(obj: Record<string, unknown>): number {
  const raw = obj.version;
  if (raw === undefined || raw === null) return CURRENT_CONFIG_VERSION;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    throw new Error(`Invalid config version: ${JSON.stringify(raw)}. Expected a positive integer.`);
  }
  return raw;
}

/**
 * Bring a raw config object up to {@link CURRENT_CONFIG_VERSION} by applying
 * each migration step in order. Throws when the file's version is newer than
 * this build understands.
 */
export function migrateConfig(input: Record<string, unknown>): MigrateResult {
  const fromVersion = readVersion(input);

  if (fromVersion > CURRENT_CONFIG_VERSION) {
    throw new Error(
      `Config version ${fromVersion} is newer than this agentstd build supports (max ${CURRENT_CONFIG_VERSION}). Upgrade agentstd.`,
    );
  }

  let current = { ...input, version: fromVersion };
  let version = fromVersion;

  for (const step of migrations) {
    if (step.from !== version) continue;
    current = { ...step.migrate(current), version: step.to };
    version = step.to;
  }

  if (version !== CURRENT_CONFIG_VERSION) {
    throw new Error(
      `No migration path from config version ${fromVersion} to ${CURRENT_CONFIG_VERSION}.`,
    );
  }

  return {
    obj: current,
    fromVersion,
    toVersion: version,
    changed: version !== fromVersion,
  };
}
