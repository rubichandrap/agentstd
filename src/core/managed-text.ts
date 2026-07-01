const MARKER_PREFIX = 'agentstd';

type CommentStyle = 'markdown' | 'hash';

function markers(id: string, commentStyle: CommentStyle): { start: string; end: string } {
  if (commentStyle === 'hash') {
    return {
      start: `# ${MARKER_PREFIX}:start ${id}`,
      end: `# ${MARKER_PREFIX}:end ${id}`,
    };
  }
  return {
    start: `<!-- ${MARKER_PREFIX}:start ${id} -->`,
    end: `<!-- ${MARKER_PREFIX}:end ${id} -->`,
  };
}

export function upsertManagedBlock(
  current: string,
  id: string,
  content: string,
  options: { commentStyle?: CommentStyle } = {},
): { text: string; changed: boolean } {
  const commentStyle = options.commentStyle ?? 'markdown';
  const { start, end } = markers(id, commentStyle);
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

/**
 * Inverse of {@link upsertManagedBlock}: removes the managed block for `id`
 * (including its trailing newline) and collapses any run of blank lines the
 * removal leaves behind into a single blank line. Returns `changed: false`
 * when no matching block is present.
 */
export function removeManagedBlock(
  current: string,
  id: string,
  options: { commentStyle?: CommentStyle } = {},
): { text: string; changed: boolean } {
  const commentStyle = options.commentStyle ?? 'markdown';
  const { start, end } = markers(id, commentStyle);
  const pattern = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}\\n?`);
  const stripped = current.replace(pattern, '');
  if (stripped === current) return { text: current, changed: false };
  const collapsed = stripped.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '');
  const trimmed = collapsed.trimEnd();
  const text = trimmed.length === 0 ? '' : `${trimmed}\n`;
  return { text, changed: true };
}
