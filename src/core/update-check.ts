import fs from 'fs-extra';
import path from 'node:path';
import semver from 'semver';
import { packageVersion } from './package-info';
import { homeRoot } from './paths';

export interface UpdateCheckResult {
  current: string;
  latest: string;
  needsUpdate: boolean;
}

interface UpdateCache {
  lastChecked?: string;
  latest?: string;
}

const REGISTRY_URL = 'https://registry.npmjs.org/agentstd/latest';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 3000;
const ENV_DISABLE = 'AGENTSTD_NO_UPDATE_CHECK';

function cachePath(): string {
  return path.join(homeRoot(), '.agentstd', '.update-cache.json');
}

function shouldSkip(): boolean {
  if (process.env[ENV_DISABLE]) return true;
  if (process.env.NODE_ENV === 'test') return true;
  if (!process.stdout.isTTY) return true;
  return false;
}

async function readCache(): Promise<UpdateCache> {
  try {
    const raw = await fs.readFile(cachePath(), 'utf8');
    return JSON.parse(raw) as UpdateCache;
  } catch {
    return {};
  }
}

async function writeCache(cache: UpdateCache): Promise<void> {
  try {
    await fs.ensureDir(path.dirname(cachePath()));
    await fs.writeFile(cachePath(), JSON.stringify(cache, null, 2));
  } catch {
    // Cache write failures are non-fatal.
  }
}

async function fetchLatestVersion(): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(REGISTRY_URL, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    return typeof data.version === 'string' ? data.version : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Checks the npm registry for a newer published version of `agentstd`, gated
 * behind a 24h throttle cache so repeated CLI invocations do not hit the
 * network. Returns `null` when the check is disabled (non-TTY, test env, or
 * AGENTSTD_NO_UPDATE_CHECK set), when the network is unavailable, or when the
 * current install is already up to date.
 */
export async function checkForUpdate(): Promise<UpdateCheckResult | null> {
  if (shouldSkip()) return null;

  const current = packageVersion();
  const cache = await readCache();
  const now = Date.now();
  const lastChecked = cache.lastChecked ? Date.parse(cache.lastChecked) : NaN;

  let latest = cache.latest ?? null;
  if (!Number.isNaN(lastChecked) && now - lastChecked < CHECK_INTERVAL_MS && latest) {
    return buildResult(current, latest);
  }

  const fetched = await fetchLatestVersion();
  if (fetched) {
    latest = fetched;
    await writeCache({ lastChecked: new Date(now).toISOString(), latest: fetched });
  }

  if (!latest) return null;
  return buildResult(current, latest);
}

function buildResult(current: string, latest: string): UpdateCheckResult | null {
  if (!semver.valid(current) || !semver.valid(latest)) return null;
  const needsUpdate = semver.gt(latest, current);
  return needsUpdate ? { current, latest, needsUpdate } : null;
}

/**
 * Renders a non-blocking update hint to stderr. Safe to call fire-and-forget.
 */
export function renderUpdateHint(result: UpdateCheckResult): string {
  return `Update available: ${result.current} → ${result.latest}. Run: pnpm add -g agentstd`;
}
