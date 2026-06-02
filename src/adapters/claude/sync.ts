import path from 'node:path';
import { ensureDir, fileExists } from '../../core/fs';
import { claudeDir, claudeSkillsDir } from '../../core/paths';
import type { FileOperation, SyncContext, SyncResult } from '../../core/types';
import { needsSettingsUpdate, upsertPreToolUseHook } from './settings';
import { syncClaudeSkills } from './skills';

export async function sync(ctx: SyncContext): Promise<SyncResult> {
  const changed: string[] = [];
  const warnings: string[] = [];
  const operations: FileOperation[] = [];

  const destSkills = claudeSkillsDir(ctx.projectRoot);

  if (!ctx.dryRun) {
    await ensureDir(destSkills);
  }

  const skillResult = await syncClaudeSkills(ctx, operations);

  for (const c of skillResult.changed) {
    changed.push(c);
  }

  if (ctx.config.hooks.preToolUse) {
    const settingsPath = path.join(ctx.projectRoot, '.claude', 'settings.json');
    const settingsDir = path.join(ctx.projectRoot, '.claude');
    const settingsExists = await fileExists(settingsPath);

    if (!settingsExists) {
      operations.push({
        type: 'create-file',
        path: path.relative(ctx.projectRoot, settingsPath) || settingsPath,
      });
      if (!ctx.dryRun) {
        try {
          await upsertPreToolUseHook(settingsPath, ctx.config);
        } catch (err) {
          warnings.push(`Failed to create Claude settings: ${err}`);
        }
      }
      changed.push('.claude/settings.json');
    } else {
      const needsUpdate = await needsSettingsUpdate(settingsPath, ctx.config);
      if (!needsUpdate) {
        operations.push({
          type: 'skip',
          description: '.claude/settings.json',
          reason: 'settings already synced',
        });
      } else {
        operations.push({
          type: 'update-file',
          path: path.relative(ctx.projectRoot, settingsPath) || settingsPath,
        });
        if (!ctx.dryRun) {
          try {
            await upsertPreToolUseHook(settingsPath, ctx.config);
          } catch (err) {
            warnings.push(`Failed to update Claude settings: ${err}`);
          }
        }
        changed.push('.claude/settings.json');
      }
    }
  }

  return {
    target: 'claude',
    changed,
    warnings,
    operations,
  };
}
