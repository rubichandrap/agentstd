import path from 'node:path';
import { fileExists } from '../../core/fs';
import { codexHooksPath } from '../../core/paths';
import { syncCodexAgents } from './agents';
import { syncCodexConfigToml } from './config';
import { syncCodexRules } from './rules';
import type { FileOperation, SyncContext, SyncResult } from '../../core/types';
import {
  needsCodexHookUpdate,
  removeCodexPreToolUseHook,
  upsertCodexPreToolUseHook,
} from './hooks';
import { syncCodexInstructions } from './instructions';

export async function sync(ctx: SyncContext): Promise<SyncResult> {
  const changed: string[] = [];
  const warnings: string[] = [];
  const operations: FileOperation[] = [];
  const outputRoot = ctx.outputRoot ?? ctx.projectRoot;
  const scope = ctx.scope ?? 'project';

  if (ctx.config.skills.dir !== '.agents/skills') {
    warnings.push(
      `Codex reads .agents/skills natively; custom skills.dir "${ctx.config.skills.dir}" is not synced for Codex.`,
    );
  }

  const hasFilePermissions =
    (ctx.config.permissions?.files?.denyRead?.length ?? 0) > 0 ||
    (ctx.config.permissions?.files?.denyWrite?.length ?? 0) > 0;
  if (hasFilePermissions) {
    warnings.push(
      'Codex rules do not support file permissions (denyRead/denyWrite); file restrictions are skipped for codex target.',
    );
  }

  const instructions = await syncCodexInstructions(
    ctx.projectRoot,
    outputRoot,
    ctx.config,
    scope,
    ctx.dryRun,
    ctx.homeRoot,
    ctx.pathSources,
  );
  for (const w of instructions.warnings) warnings.push(w);
  if (instructions.changed && instructions.path) {
    const operationType =
      instructions.operationType ?? (instructions.targetExists ? 'update-file' : 'create-file');
    operations.push({
      type: operationType,
      path: instructions.path,
    });
    changed.push(instructions.path);
  }

  const hooksPath = codexHooksPath(outputRoot);
  const hooksExists = await fileExists(hooksPath);
  if (ctx.config.hooks.preToolUse) {
    const exists = await fileExists(hooksPath);
    try {
      const needsUpdate = !exists || (await needsCodexHookUpdate(hooksPath, ctx.config));
      if (needsUpdate) {
        operations.push({
          type: exists ? 'update-file' : 'create-file',
          path: path.relative(outputRoot, hooksPath) || hooksPath,
        });
        if (!ctx.dryRun) await upsertCodexPreToolUseHook(hooksPath, ctx.config);
        changed.push('.codex/hooks.json');
      } else {
        operations.push({
          type: 'skip',
          description: '.codex/hooks.json',
          reason: 'Codex hook already synced',
        });
      }
    } catch (err) {
      warnings.push((err as Error).message);
    }
  } else if (hooksExists) {
    try {
      const result = await removeCodexPreToolUseHook(hooksPath, ctx.dryRun);
      if (result.changed) {
        operations.push({
          type: result.removeFile ? 'remove-file' : 'update-file',
          path: path.relative(outputRoot, hooksPath) || hooksPath,
        });
        changed.push('.codex/hooks.json');
      }
    } catch (err) {
      warnings.push((err as Error).message);
    }
  }

  changed.push(...(await syncCodexConfigToml(outputRoot, ctx.config, operations, ctx.dryRun)));
  changed.push(...(await syncCodexRules(outputRoot, ctx.config, operations, ctx.dryRun)));
  const codexAgents = await syncCodexAgents(
    ctx.projectRoot,
    outputRoot,
    ctx.config,
    operations,
    ctx.dryRun,
    ctx.homeRoot,
    ctx.pathSources,
  );
  for (const c of codexAgents.changed) changed.push(c);
  for (const w of codexAgents.warnings) warnings.push(w);

  return {
    target: 'codex',
    changed,
    warnings,
    operations,
  };
}
