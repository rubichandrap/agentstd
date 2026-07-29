import path from 'node:path';
import { permissionsOf } from '../../core/config-defaults';
import { ensureDir, fileExists } from '../../core/fs';
import { claudeSkillsDir } from '../../core/paths';
import { syncClaudeAgents, syncClaudeMcpServers } from '../../core/provider-config';
import type { FileOperation, SyncContext, SyncResult } from '../../core/types';
import { needsSettingsUpdate, upsertClaudeSettings } from './settings';
import { syncClaudeSkills } from './skills';

export async function sync(ctx: SyncContext): Promise<SyncResult> {
  const changed: string[] = [];
  const warnings: string[] = [];
  const operations: FileOperation[] = [];
  const outputRoot = ctx.outputRoot ?? ctx.projectRoot;

  const skillResult = await syncClaudeSkills(ctx, operations);

  for (const c of skillResult.changed) {
    changed.push(c);
  }

  changed.push(...(await syncClaudeMcpServers(outputRoot, ctx.config, operations, ctx.dryRun)));
  const claudeAgents = await syncClaudeAgents(
    ctx.projectRoot,
    outputRoot,
    ctx.config,
    operations,
    ctx.dryRun,
    ctx.homeRoot,
    ctx.pathSources,
  );
  for (const c of claudeAgents.changed) changed.push(c);
  for (const w of claudeAgents.warnings) warnings.push(w);

  const permissions = permissionsOf(ctx.config);
  const hasCommandPermissions = Object.values(permissions.commands).some(
    (entries) => entries.length > 0,
  );
  const hasFilePermissions =
    permissions.files.denyRead.length > 0 || permissions.files.denyWrite.length > 0;
  const hasSettingsConfig =
    !!ctx.config.hooks.preToolUse || hasCommandPermissions || hasFilePermissions;

  const settingsPath = path.join(outputRoot, '.claude', 'settings.json');
  const settingsDir = path.join(outputRoot, '.claude');
  const settingsExists = await fileExists(settingsPath);

  if (hasSettingsConfig || settingsExists) {
    if (!settingsExists) {
      operations.push({
        type: 'create-dir',
        dir: path.relative(outputRoot, settingsDir) || settingsDir,
      });
      operations.push({
        type: 'create-file',
        path: path.relative(outputRoot, settingsPath) || settingsPath,
      });
      if (!ctx.dryRun) {
        try {
          await upsertClaudeSettings(settingsPath, ctx.config);
        } catch (err) {
          warnings.push(`Failed to create Claude settings: ${err}`);
        }
      }
      changed.push('.claude/settings.json');
    } else if (await needsSettingsUpdate(settingsPath, ctx.config)) {
      operations.push({
        type: 'update-file',
        path: path.relative(outputRoot, settingsPath) || settingsPath,
      });
      if (!ctx.dryRun) {
        try {
          await upsertClaudeSettings(settingsPath, ctx.config);
        } catch (err) {
          warnings.push(`Failed to update Claude settings: ${err}`);
        }
      }
      changed.push('.claude/settings.json');
    } else {
      operations.push({
        type: 'skip',
        description: '.claude/settings.json',
        reason: 'settings already synced',
      });
    }
  }

  return {
    target: 'claude',
    changed,
    warnings,
    operations,
  };
}
