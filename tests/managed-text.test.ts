import { describe, expect, it } from 'vitest';
import { removeManagedBlock, upsertManagedBlock } from '../src/core/managed-text';

describe('removeManagedBlock', () => {
  it('returns changed=false when no block is present', () => {
    const current = '# Project\n\nSome notes.\n';
    const result = removeManagedBlock(current, 'instructions');
    expect(result.changed).toBe(false);
    expect(result.text).toBe(current);
  });

  it('removes a markdown-style block and its trailing newline', () => {
    const current =
      '# Header\n\n<!-- agentstd:start instructions -->\nUse pnpm.\n<!-- agentstd:end instructions -->\n\nMore.\n';
    const result = removeManagedBlock(current, 'instructions');
    expect(result.changed).toBe(true);
    expect(result.text).toBe('# Header\n\nMore.\n');
  });

  it('removes a hash-style block', () => {
    const current =
      '# top\n\n# agentstd:start codex-config\n[mcp_servers.foo]\ncommand = "foo"\n# agentstd:end codex-config\n\nafter\n';
    const result = removeManagedBlock(current, 'codex-config', { commentStyle: 'hash' });
    expect(result.changed).toBe(true);
    expect(result.text).toBe('# top\n\nafter\n');
  });

  it('deletes the whole file content when the block was the only content', () => {
    const current = '<!-- agentstd:start instructions -->\nUse pnpm.\n<!-- agentstd:end instructions -->\n';
    const result = removeManagedBlock(current, 'instructions');
    expect(result.changed).toBe(true);
    expect(result.text).toBe('');
  });

  it('collapses blank-line runs left behind by removal', () => {
    const current =
      'A\n\n<!-- agentstd:start instructions -->\nx\n<!-- agentstd:end instructions -->\n\n\n\nB\n';
    const result = removeManagedBlock(current, 'instructions');
    expect(result.text).toBe('A\n\nB\n');
  });

  it('is the inverse of upsertManagedBlock', () => {
    const original = '# Project notes\n';
    const upserted = upsertManagedBlock(original, 'instructions', 'Use pnpm.');
    expect(upserted.changed).toBe(true);
    const removed = removeManagedBlock(upserted.text, 'instructions');
    expect(removed.changed).toBe(true);
    expect(removed.text).toBe(original);
  });

  it('only removes the block matching the given id', () => {
    const current =
      '<!-- agentstd:start instructions -->\nA\n<!-- agentstd:end instructions -->\n\n<!-- agentstd:start other -->\nB\n<!-- agentstd:end other -->\n';
    const result = removeManagedBlock(current, 'instructions');
    expect(result.changed).toBe(true);
    expect(result.text).toBe('<!-- agentstd:start other -->\nB\n<!-- agentstd:end other -->\n');
  });
});
