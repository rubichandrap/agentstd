import path from 'node:path';
import fs from 'fs-extra';
import { fileExists, readDir } from '../../core/fs';
import { claudeDir, claudeSettingsPath, claudeSkillsDir, homeRoot } from '../../core/paths';
import { listMergedSkills } from '../../core/skill';
import { resolveSkillSources } from '../../core/skill-resolve';
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

  const destExists = await fileExists(claudeSkillsDir(root));
  const sources = resolveSkillSources(root, config, ctx.homeRoot ?? homeRoot());
  const skills = await listMergedSkills(sources);

  // Check for invalid skill folders (missing SKILL.md)
  for (const source of sources) {
    if (!(await fileExists(source.dir))) continue;
    const skillFolders = await readDir(source.dir);
    for (const folder of skillFolders) {
      const mdPath = path.join(source.dir, folder, 'SKILL.md');
      if (!(await fileExists(mdPath))) {
        checks.push({
          label: `Invalid skill folder: ${folder}`,
          status: 'fail',
          message: `Missing ${path.join(source.dir, folder, 'SKILL.md')}. Add a SKILL.md file with frontmatter (name, description).`,
        });
      }
    }
  }

  if (!destExists && skills.length > 0) {
    checks.push({
      label: 'Skills synced',
      status: 'warn',
      message: '.claude/skills not found. Run: agentstd sync',
    });
  } else {
    let synced = true;
    for (const skill of skills) {
      const sourcePath = path.join(skill.dir, skill.dirName, 'SKILL.md');
      const destPath = path.join(claudeSkillsDir(root), skill.dirName, 'SKILL.md');
      const sourceContent = await fs.readFile(sourcePath, 'utf8').catch(() => null);
      const destContent = await fs.readFile(destPath, 'utf8').catch(() => null);
      if (sourceContent !== destContent) {
        synced = false;
        checks.push({
          label: `Skill ${skill.dirName} is stale`,
          status: 'warn',
          message: 'Run: agentstd sync',
        });
      }
    }

    checks.push({
      label: `${skills.length} merged skill(s) synced`,
      status: synced ? 'pass' : 'warn',
      message: synced ? undefined : 'Run: agentstd sync',
    });
  }

  return {
    target: 'claude',
    checks,
  };
}
