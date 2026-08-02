import { afterEach, describe, expect, it, vi } from 'vitest';
import { targetsListCmd } from '../src/cli/commands/targets';

describe('targets list capability messaging', () => {
  let output: string[];

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function parseTargetsTable(): Promise<Array<Record<string, string>>> {
    output = [];
    vi.spyOn(console, 'log').mockImplementation((...messages: unknown[]) => {
      output.push(messages.map((message) => String(message ?? '')).join(' '));
    });
    await targetsListCmd();

    const rows: Array<Record<string, string>> = [];
    let headers: string[] = [];
    for (const line of output) {
      const cells = line.trim().split(/\s{2,}/);
      if (line.startsWith('Target')) {
        headers = cells;
        continue;
      }
      if (cells.length !== headers.length) continue;
      const row: Record<string, string> = {};
      for (let i = 0; i < headers.length; i++) row[headers[i]] = cells[i];
      rows.push(row);
    }
    return rows;
  }

  it('reports Claude instructions as native CLAUDE.md', async () => {
    const rows = await parseTargetsTable();
    const claude = rows.find((r) => r.Target === 'claude');
    expect(claude?.Instructions).toBe('native');
  });

  it('lists Claude and Codex with an Instructions capability', async () => {
    const rows = await parseTargetsTable();
    const claude = rows.find((r) => r.Target === 'claude');
    const codex = rows.find((r) => r.Target === 'codex');
    expect(claude?.Instructions).toBeDefined();
    expect(codex?.Instructions).toBe('native');
  });
});
