const MARKER_PREFIX = 'agentstd';

export function upsertManagedBlock(
  current: string,
  id: string,
  content: string,
  options: { commentStyle?: 'markdown' | 'hash' } = {},
): { text: string; changed: boolean } {
  const commentStyle = options.commentStyle ?? 'markdown';
  const start =
    commentStyle === 'hash'
      ? `# ${MARKER_PREFIX}:start ${id}`
      : `<!-- ${MARKER_PREFIX}:start ${id} -->`;
  const end =
    commentStyle === 'hash'
      ? `# ${MARKER_PREFIX}:end ${id}`
      : `<!-- ${MARKER_PREFIX}:end ${id} -->`;
  const block = `${start}\n${content.trim()}\n${end}`;

  const pattern = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`);
  if (pattern.test(current)) {
    const text = current.replace(pattern, block);
    return { text: ensureTrailingNewline(text), changed: text !== current };
  }

  const separator = current.trim().length > 0 ? '\n\n' : '';
  const text = `${current.trimEnd()}${separator}${block}\n`;
  return { text, changed: text !== current };
}

export function renderTomlValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => renderTomlValue(item)).join(', ')}]`;
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value);
  }
  throw new Error(`Unsupported TOML value: ${String(value)}`);
}

export function renderTomlTable(tableName: string, values: Record<string, unknown>): string {
  const lines = [`[${tableName}]`];
  for (const [key, value] of Object.entries(values)) {
    lines.push(`${key} = ${renderTomlValue(value)}`);
  }
  return lines.join('\n');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith('\n') ? value : `${value}\n`;
}
