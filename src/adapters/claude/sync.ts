import path from 'node:path';
import { ensureDir } from '../../core/fs';
import { claudeSkillsDir as _claudeSkillsDir } from '../../core/paths';
import type { SyncContext, SyncResult } from '../../core/types';
import { upsertPreToolUseHook } from './settings';
import { syncClaudeSkills } from './skills';

export async function sync(ctx: SyncContext): Promise<SyncResult> {
  const changed: string[] = [];
  const warnings: string[] = [];

  const destSkills = _claudeSkillsDir(ctx.projectRoot);
  await ensureDir(destSkills);

  const skillChanges = await syncClaudeSkills(ctx);
  changed.push(...skillChanges);

  if (ctx.config.hooks.preToolUse) {
    const settingsPath = path.join(ctx.projectRoot, '.claude', 'settings.json');
    try {
      await upsertPreToolUseHook(settingsPath, ctx.config);
      changed.push('.claude/settings.json');
    } catch (err) {
      warnings.push(`Failed to update Claude settings: ${err}`);
    }
  }

  return {
    target: 'claude',
    changed,
    warnings,
  };
}
