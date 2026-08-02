import path from 'node:path';
import fs from 'fs-extra';
import type { AgentStdConfig } from '../../core/config';
import { mcpServersForTarget } from '../../core/config-defaults';
import { ensureGitKeep, fileExists } from '../../core/fs';
import { removeManagedBlock, renderTomlTable, upsertManagedBlock } from '../../core/managed-text';
import { codexConfigPath } from '../../core/paths';
import type { FileOperation } from '../../core/types';

export async function syncCodexConfigToml(
  outputRoot: string,
  config: AgentStdConfig,
  operations: FileOperation[],
  dryRun?: boolean,
): Promise<string[]> {
  const blocks: string[] = [];
  for (const [name, server] of Object.entries(mcpServersForTarget(config, 'codex'))) {
    blocks.push(
      renderTomlTable(
        `mcp_servers.${name}`,
        removeEmptyValues({
          command: server.command,
          args: server.args,
          url: server.url,
        }),
      ),
    );
  }

  const filePath = codexConfigPath(outputRoot);
  const current = (await fs.readFile(filePath, 'utf8').catch(() => '')) as string;
  if (blocks.length === 0) {
    const { text, changed } = removeManagedBlock(current, 'codex-config', {
      commentStyle: 'hash',
    });
    if (!changed) return [];
    operations.push({
      type: text.trim().length === 0 ? 'remove-file' : 'update-file',
      path: path.relative(outputRoot, filePath) || filePath,
    });
    if (!dryRun) {
      if (text.trim().length === 0) await fs.remove(filePath);
      else await fs.writeFile(filePath, text);
    }
    return ['.codex/config.toml'];
  }

  const { text, changed } = upsertManagedBlock(current, 'codex-config', blocks.join('\n\n'), {
    commentStyle: 'hash',
  });
  if (!changed) {
    operations.push({
      type: 'skip',
      description: '.codex/config.toml',
      reason: 'Codex config already synced',
    });
    return [];
  }

  operations.push({
    type: (await fileExists(filePath)) ? 'update-file' : 'create-file',
    path: path.relative(outputRoot, filePath) || filePath,
  });
  if (!dryRun) {
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, text);
    await ensureGitKeep(path.dirname(filePath));
  }
  return ['.codex/config.toml'];
}

function removeEmptyValues<T extends Record<string, unknown>>(value: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, entry] of Object.entries(value)) {
    const isEmptyArray = Array.isArray(entry) && entry.length === 0;
    const isEmptyObject =
      typeof entry === 'object' &&
      entry !== null &&
      !Array.isArray(entry) &&
      Object.keys(entry).length === 0;
    if (entry !== undefined && !isEmptyArray && !isEmptyObject) {
      out[key as keyof T] = entry as T[keyof T];
    }
  }
  return out;
}
