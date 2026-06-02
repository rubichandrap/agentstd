import path from 'node:path';
import { copyDir, ensureDir, fileExists, readDir } from '../../core/fs';
import { claudeSkillsDir } from '../../core/paths';
import type { SyncContext } from '../../core/types';

export async function syncClaudeSkills(ctx: SyncContext): Promise<string[]> {
  const changed: string[] = [];
  const srcSkills = path.resolve(ctx.projectRoot, ctx.config.skills.dir);
  const destSkills = claudeSkillsDir(ctx.projectRoot);

  const srcExists = await fileExists(srcSkills);
  if (!srcExists) return changed;

  await ensureDir(destSkills);

  const skillDirs = await readDir(srcSkills);
  for (const dirName of skillDirs) {
    const src = path.join(srcSkills, dirName);
    const dest = path.join(destSkills, dirName);
    await copyDir(src, dest);
    changed.push(`skills/${dirName}`);
  }

  return changed;
}
