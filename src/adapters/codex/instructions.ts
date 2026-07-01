import path from 'node:path';
import fs from 'fs-extra';
import type { AgentStdConfig } from '../../core/config';
import { fileExists } from '../../core/fs';
import { upsertManagedBlock } from '../../core/managed-text';
import { agentsMdPath } from '../../core/paths';

export async function syncCodexInstructions(
  projectRoot: string,
  config: AgentStdConfig,
  dryRun?: boolean,
): Promise<{ changed: boolean; path?: string; targetExists?: boolean }> {
  if (!config.instructions.shared) return { changed: false };

  const sourcePath = path.resolve(projectRoot, config.instructions.shared);
  const shared = await fs.readFile(sourcePath, 'utf8').catch(() => '');
  const targetPath = agentsMdPath(projectRoot);
  const targetExists = await fileExists(targetPath);
  const current = await fs.readFile(targetPath, 'utf8').catch(() => '');
  const { text, changed } = upsertManagedBlock(current, 'instructions', shared);

  if (!changed) return { changed: false };
  if (!dryRun) {
    await fs.writeFile(targetPath, text);
  }
  return {
    changed: true,
    path: path.relative(projectRoot, targetPath) || targetPath,
    targetExists,
  };
}

export async function hasCodexInstructionsSynced(
  projectRoot: string,
  config: AgentStdConfig,
): Promise<boolean> {
  if (!config.instructions.shared) return true;
  const sourcePath = path.resolve(projectRoot, config.instructions.shared);
  const shared = await fs.readFile(sourcePath, 'utf8').catch(() => '');
  const targetPath = agentsMdPath(projectRoot);
  if (!(await fileExists(targetPath))) return false;
  const current = await fs.readFile(targetPath, 'utf8');
  return !upsertManagedBlock(current, 'instructions', shared).changed;
}
