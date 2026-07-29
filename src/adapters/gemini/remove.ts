import path from 'node:path';
import fs from 'fs-extra';
import { fileExists, readJsonIfExists, writeJson } from '../../core/fs';
import { geminiSettingsPath } from '../../core/paths';
import type { FileOperation, RemoveContext, RemoveResult } from '../../core/types';

const AGENTSTD_MCP_SERVER_PREFIX = 'agentstd:';

export async function remove(ctx: RemoveContext): Promise<RemoveResult> {
  const removed: string[] = [];
  const warnings: string[] = [];
  const operations: FileOperation[] = [];
  const outputRoot = ctx.outputRoot ?? ctx.projectRoot;
  const filePath = geminiSettingsPath(outputRoot);

  if (!(await fileExists(filePath))) {
    return { target: 'gemini', removed, warnings, operations };
  }

  try {
    const current =
      (await readJsonIfExists<{ mcpServers?: Record<string, unknown>; [key: string]: unknown }>(
        filePath,
      )) ?? {};
    const currentServers = current.mcpServers ?? {};
    const nextServers: Record<string, unknown> = {};
    for (const [name, server] of Object.entries(currentServers)) {
      if (!name.startsWith(AGENTSTD_MCP_SERVER_PREFIX)) {
        nextServers[name] = server;
      }
    }
    const hasRemainingServers = Object.keys(nextServers).length > 0;
    const { mcpServers: _removed, ...rest } = current;
    const nextData = hasRemainingServers ? { ...rest, mcpServers: nextServers } : rest;
    const isEmpty = Object.keys(nextData).length === 0;

    operations.push({
      type: isEmpty ? 'remove-file' : 'update-file',
      path: path.relative(outputRoot, filePath) || filePath,
    });
    if (!ctx.dryRun) {
      if (isEmpty) await fs.remove(filePath);
      else await writeJson(filePath, nextData);
    }
    removed.push('.gemini/settings.json');
  } catch (err) {
    warnings.push(`Failed to clean .gemini/settings.json: ${(err as Error).message}`);
  }

  return { target: 'gemini', removed, warnings, operations };
}
