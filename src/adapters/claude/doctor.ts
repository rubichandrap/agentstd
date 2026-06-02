import path from 'node:path';
import { fileExists, readDir } from '../../core/fs';
import { claudeDir, claudeSettingsPath, claudeSkillsDir } from '../../core/paths';
import type { DoctorCheck, DoctorContext, DoctorResult } from '../../core/types';
import { hasPreToolUseHookSynced } from './settings';

export async function doctor(ctx: DoctorContext): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];
  const root = ctx.projectRoot;
  const config = ctx.config;

  // .claude directory
  const claudeDirExists = await fileExists(claudeDir(root));
  checks.push({
    label: '.claude directory found',
    status: claudeDirExists ? 'pass' : 'fail',
    message: claudeDirExists ? undefined : 'Run: agentstd sync',
  });

  // .claude/settings.json
  const settingsExists = await fileExists(claudeSettingsPath(root));
  checks.push({
    label: '.claude/settings.json found',
    status: settingsExists ? 'pass' : 'warn',
    message: settingsExists ? undefined : 'Run: agentstd sync',
  });

  // PreToolUse hook synced
  if (config.hooks.preToolUse) {
    const synced = await hasPreToolUseHookSynced(claudeSettingsPath(root), config);
    checks.push({
      label: 'PreToolUse hook synced',
      status: synced ? 'pass' : 'warn',
      message: synced ? undefined : 'Run: agentstd sync',
    });
  }

  // skills synced
  const srcDir = config.skills.dir;
  const srcSkillsPath = path.resolve(root, srcDir);
  const srcExists = await fileExists(srcSkillsPath);
  const destExists = await fileExists(claudeSkillsDir(root));

  // Check for invalid skill folders (missing SKILL.md)
  if (srcExists) {
    const skillFolders = await readDir(srcSkillsPath);
    for (const folder of skillFolders) {
      const mdPath = path.join(srcSkillsPath, folder, 'SKILL.md');
      if (!(await fileExists(mdPath))) {
        checks.push({
          label: `Invalid skill folder: ${folder}`,
          status: 'fail',
          message: `Missing ${path.join(srcDir, folder, 'SKILL.md')}. Add a SKILL.md file with frontmatter (name, description).`,
        });
      }
    }
  }

  if (srcExists && destExists) {
    const srcSkills = await readDir(srcSkillsPath);
    const destSkills = await readDir(claudeSkillsDir(root));
    const synced = srcSkills.every((s) => destSkills.includes(s)) && srcSkills.length > 0;
    checks.push({
      label: `${srcSkills.length} skill(s) synced`,
      status: synced ? 'pass' : 'warn',
      message: synced ? undefined : 'Run: agentstd sync',
    });
  } else if (!destExists) {
    checks.push({
      label: 'Skills synced',
      status: 'warn',
      message: '.claude/skills not found. Run: agentstd sync',
    });
  }

  return {
    target: 'claude',
    checks,
  };
}
