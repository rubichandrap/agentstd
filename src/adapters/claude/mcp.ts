import path from 'node:path';
import fs from 'fs-extra';
import type { AgentStdConfig } from '../../core/config';
import { mcpServersForTarget } from '../../core/config-defaults';
import { ensureGitKeep, fileExists, readJsonIfExists, writeJson } from '../../core/fs';
import { mcpConfigPath } from '../../core/paths';
import type { FileOperation } from '../../core/types';

const AGENTSTD_MCP_SERVER_PREFIX = 'agentstd:';

interface MpcJson {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
}

export async function syncClaudeMcpServers(
  outputRoot: string,
  config: AgentStdConfig,
  operations: FileOperation[],
  dryRun?: boolean,
): Promise<string[]> {
  const serverEntries = Object.entries(mcpServersForTarget(config, 'claude'));
  const filePath = mcpConfigPath(outputRoot);
  const exists = await fileExists(filePath);
  if (!exists && serverEntries.length === 0) return [];

  // Read before pushing the op so --check sees no drift on a clean sync.
  const current = exists ? ((await readJsonIfExists<MpcJson>(filePath)) ?? {}) : {};
  const currentServers = current.mcpServers ?? {};
  const nextServers: Record<string, unknown> = {};

  for (const [name, server] of Object.entries(currentServers)) {
    if (!name.startsWith(AGENTSTD_MCP_SERVER_PREFIX)) {
      nextServers[name] = server;
    }
  }

  for (const [name, server] of serverEntries) {
    nextServers[agentStdMcpServerName(name)] = removeEmptyValues({
      command: server.command,
      args: server.args,
      url: server.url,
      env: server.env,
    });
  }

  if (mcpServersEqual(currentServers, nextServers)) {
    operations.push({
      type: 'skip',
      description: '.mcp.json',
      reason: 'MCP servers already synced',
    });
    return [];
  }

  const nextMcpJson = buildNextMcpJson(current, nextServers);
  operations.push({
    type: nextMcpJson.removeFile ? 'remove-file' : exists ? 'update-file' : 'create-file',
    path: path.relative(outputRoot, filePath) || filePath,
  });

  if (dryRun) return ['.mcp.json'];

  if (nextMcpJson.removeFile) await fs.remove(filePath);
  else {
    await writeJson(filePath, nextMcpJson.data);
    await ensureGitKeep(path.dirname(filePath));
  }
  return ['.mcp.json'];
}

function buildNextMcpJson(
  current: MpcJson,
  nextServers: Record<string, unknown>,
): { data: MpcJson; removeFile: false } | { removeFile: true } {
  if (Object.keys(nextServers).length > 0) {
    return { data: { ...current, mcpServers: nextServers }, removeFile: false };
  }
  const { mcpServers: _mcpServers, ...rest } = current;
  if (Object.keys(rest).length === 0) return { removeFile: true };
  return { data: rest, removeFile: false };
}

function mcpServersEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.hasOwn(b, key)) return false;
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) return false;
  }
  return true;
}

function agentStdMcpServerName(name: string): string {
  return name.startsWith(AGENTSTD_MCP_SERVER_PREFIX)
    ? name
    : `${AGENTSTD_MCP_SERVER_PREFIX}${name}`;
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
