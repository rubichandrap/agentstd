import path from 'node:path';
import fs from 'fs-extra';
import type { AgentStdConfig } from '../../core/config';
import type { ConfigPathSources } from '../../core/config-merge';
import { sourceRoot } from '../../core/config-merge';
import { fileExists } from '../../core/fs';
import { removeManagedBlock, upsertManagedBlock } from '../../core/managed-text';
import { agentsMdPath, codexAgentsMdPath } from '../../core/paths';

async function readSharedInstructions(
  sharedPath: string,
  pathSources: ConfigPathSources | undefined,
  projectRoot: string,
  homeRoot: string,
): Promise<{ shared: string; sourcePath: string; missing: boolean }> {
  const layer = pathSources?.instructions?.shared;
  const base = sourceRoot(layer, projectRoot, homeRoot);
  const sourcePath = path.resolve(base, sharedPath);
  const missing = !(await fileExists(sourcePath));
  const shared = missing ? '' : await fs.readFile(sourcePath, 'utf8');
  return { shared, sourcePath, missing };
}

export async function syncCodexInstructions(
  projectRoot: string,
  outputRoot: string,
  config: AgentStdConfig,
  scope: 'project' | 'global' = 'project',
  dryRun?: boolean,
  homeRoot?: string,
  pathSources?: ConfigPathSources,
): Promise<{
  changed: boolean;
  path?: string;
  targetExists?: boolean;
  operationType?: 'create-file' | 'update-file' | 'remove-file';
  warnings: string[];
}> {
  const warnings: string[] = [];
  const sharedPath = config.instructions.shared;
  const targetPath = scope === 'global' ? codexAgentsMdPath(outputRoot) : agentsMdPath(outputRoot);
  const targetExists = await fileExists(targetPath);
  if (!sharedPath) {
    if (!targetExists) return { changed: false, warnings };
    const current = await fs.readFile(targetPath, 'utf8');
    const { text, changed } = removeManagedBlock(current, 'instructions');
    if (!changed) return { changed: false, warnings };
    if (!dryRun) {
      if (text.trim().length === 0) await fs.remove(targetPath);
      else await fs.writeFile(targetPath, text);
    }
    return {
      changed: true,
      path: path.relative(outputRoot, targetPath) || targetPath,
      targetExists,
      operationType: text.trim().length === 0 ? 'remove-file' : 'update-file',
      warnings,
    };
  }

  const resolvedHomeRoot = homeRoot ?? projectRoot;
  const { shared, sourcePath, missing } = await readSharedInstructions(
    sharedPath,
    pathSources,
    projectRoot,
    resolvedHomeRoot,
  );
  if (missing) {
    warnings.push(`instructions.shared file not found: ${sourcePath}`);
  }

  const current = await fs.readFile(targetPath, 'utf8').catch(() => '');
  const { text, changed } = upsertManagedBlock(current, 'instructions', shared);

  if (!changed) return { changed: false, warnings };
  if (!dryRun) {
    await fs.ensureDir(path.dirname(targetPath));
    await fs.writeFile(targetPath, text);
  }
  return {
    changed: true,
    path: path.relative(outputRoot, targetPath) || targetPath,
    targetExists,
    operationType: targetExists ? 'update-file' : 'create-file',
    warnings,
  };
}

export async function hasCodexInstructionsSynced(
  projectRoot: string,
  outputRoot: string,
  config: AgentStdConfig,
  scope: 'project' | 'global' = 'project',
  homeRoot?: string,
  pathSources?: ConfigPathSources,
): Promise<boolean> {
  const sharedPath = config.instructions.shared;
  if (!sharedPath) return true;
  const resolvedHomeRoot = homeRoot ?? projectRoot;
  const { shared } = await readSharedInstructions(
    sharedPath,
    pathSources,
    projectRoot,
    resolvedHomeRoot,
  );
  const targetPath = scope === 'global' ? codexAgentsMdPath(outputRoot) : agentsMdPath(outputRoot);
  if (!(await fileExists(targetPath))) return false;
  const current = await fs.readFile(targetPath, 'utf8');
  return !upsertManagedBlock(current, 'instructions', shared).changed;
}
