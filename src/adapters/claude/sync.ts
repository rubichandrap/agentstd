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

  const destSkills = claudeSkillsDir(ctx.projectRoot);

  if (!ctx.dryRun) {
    await ensureDir(destSkills);
  }

  const skillResult = await syncClaudeSkills(ctx, operations);

  for (const c of skillResult.changed) {
    changed.push(c);
  }

  changed.push(
    ...(await syncClaudeMcpServers(ctx.projectRoot, ctx.config, operations, ctx.dryRun)),
  );
  changed.push(...(await syncClaudeAgents(ctx.projectRoot, ctx.config, operations, ctx.dryRun)));

  const permissions = permissionsOf(ctx.config);
  const hasCommandPermissions = Object.values(permissions.commands).some(
    (entries) => entries.length > 0,
  );
  const hasFilePermissions =
    permissions.files.denyRead.length > 0 || permissions.files.denyWrite.length > 0;
  const hasSettingsConfig =
    !!ctx.config.hooks.preToolUse || hasCommandPermissions || hasFilePermissions;

  if (hasSettingsConfig) {
    const settingsPath = path.join(ctx.projectRoot, '.claude', 'settings.json');
    const settingsDir = path.join(ctx.projectRoot, '.claude');
    const settingsExists = await fileExists(settingsPath);

    if (!settingsExists) {
      operations.push({
        type: 'create-dir',
        dir: path.relative(ctx.projectRoot, settingsDir) || settingsDir,
      });
      operations.push({
        type: 'create-file',
        path: path.relative(ctx.projectRoot, settingsPath) || settingsPath,
      });
      if (!ctx.dryRun) {
        try {
          await upsertClaudeSettings(settingsPath, ctx.config);
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
            await upsertClaudeSettings(settingsPath, ctx.config);
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
