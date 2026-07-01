import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkForUpdate, renderUpdateHint } from '../src/core/update-check';

describe('checkForUpdate', () => {
  let tmpHome: string;
  let prevHome: string | undefined;
  let prevTTY: boolean | undefined;
  let prevNodeEnv: string | undefined;

  beforeEach(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'agentstd-update-'));
    prevHome = process.env.AGENTSTD_HOME;
    prevTTY = process.stdout.isTTY;
    prevNodeEnv = process.env.NODE_ENV;
    process.env.AGENTSTD_HOME = tmpHome;
    process.env.NODE_ENV = 'development';
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
  });

  afterEach(async () => {
    if (prevHome === undefined) delete process.env.AGENTSTD_HOME;
    else process.env.AGENTSTD_HOME = prevHome;
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    Object.defineProperty(process.stdout, 'isTTY', { value: prevTTY, configurable: true });
    vi.restoreAllMocks();
    await fs.remove(tmpHome);
  });

  function mockFetch(version: string): void {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ version }),
    } as Response);
  }

  it('returns null when an update is available but current is latest', async () => {
    mockFetch('0.0.1');
    const result = await checkForUpdate();
    expect(result).toBeNull();
  });

  it('reports an available update with current and latest versions', async () => {
    mockFetch('99.0.0');
    const result = await checkForUpdate();
    expect(result).not.toBeNull();
    expect(result?.needsUpdate).toBe(true);
    expect(result?.latest).toBe('99.0.0');
    expect(typeof result?.current).toBe('string');
  });

  it('caches the latest version and skips the network on the next call within 24h', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, json: async () => ({ version: '99.0.0' }) } as Response);

    await checkForUpdate();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fetchSpy.mockClear();
    const result = await checkForUpdate();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result?.latest).toBe('99.0.0');
  });

  it('returns null when the registry is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const result = await checkForUpdate();
    expect(result).toBeNull();
  });

  it('returns null when AGENTSTD_NO_UPDATE_CHECK is set', async () => {
    process.env.AGENTSTD_NO_UPDATE_CHECK = '1';
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await checkForUpdate();
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    delete process.env.AGENTSTD_NO_UPDATE_CHECK;
  });

  it('returns null in a non-TTY environment', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await checkForUpdate();
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('renderUpdateHint formats the upgrade hint', () => {
    const hint = renderUpdateHint({ current: '0.3.0', latest: '0.4.0', needsUpdate: true });
    expect(hint).toContain('0.3.0');
    expect(hint).toContain('0.4.0');
    expect(hint).toContain('pnpm add -g agentstd');
  });
});
