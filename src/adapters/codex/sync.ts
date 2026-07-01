import path from 'node:path';
import { fileExists } from '../../core/fs';
import { codexHooksPath } from '../../core/paths';
import { syncCodexAgents, syncCodexConfigToml, syncCodexRules } from '../../core/provider-config';
import type { FileOperation, SyncContext, SyncResult } from '../../core/types';
import { needsCodexHookUpdate, upsertCodexPreToolUseHook } from './hooks';
import { syncCodexInstructions } from './instructions';

export async function sync(ctx: SyncContext): Promise<SyncResult> {
  const changed: string[] = [];
  const warnings: string[] = [];
  const operations: FileOperation[] = [];

  if (ctx.config.skills.dir !== '.agents/skills') {
    warnings.push(
      `Codex reads .agents/skills natively; custom skills.dir "${ctx.config.skills.dir}" is not synced for Codex.`,
    );
  }

  const instructions = await syncCodexInstructions(ctx.projectRoot, ctx.config, ctx.dryRun);
  if (instructions.changed && instructions.path) {
    operations.push({
      type: instructions.targetExists ? 'update-file' : 'create-file',
      path: instructions.path,
    });
    changed.push(instructions.path);
  }

  if (ctx.config.hooks.preToolUse) {
    const hooksPath = codexHooksPath(ctx.projectRoot);
    const exists = await fileExists(hooksPath);
    try {
      const needsUpdate = !exists || (await needsCodexHookUpdate(hooksPath, ctx.config));
      if (needsUpdate) {
        operations.push({
          type: exists ? 'update-file' : 'create-file',
          path: path.relative(ctx.projectRoot, hooksPath) || hooksPath,
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
  }

  changed.push(...(await syncCodexConfigToml(ctx.projectRoot, ctx.config, operations, ctx.dryRun)));
  changed.push(...(await syncCodexRules(ctx.projectRoot, ctx.config, operations, ctx.dryRun)));
  changed.push(...(await syncCodexAgents(ctx.projectRoot, ctx.config, operations, ctx.dryRun)));

  return {
    target: 'codex',
    changed,
    warnings,
    operations,
  };
}
