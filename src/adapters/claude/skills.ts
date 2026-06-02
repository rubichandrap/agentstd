import path from 'node:path';
import fs from 'fs-extra';
import { copyDir, ensureDir, fileExists, readDir } from '../../core/fs';
import { claudeSkillsDir } from '../../core/paths';
import type { FileOperation, SyncContext } from '../../core/types';

export async function syncClaudeSkills(
  ctx: SyncContext,
  existingOperations: FileOperation[],
): Promise<{ changed: string[]; operations: FileOperation[] }> {
  const changed: string[] = [];
  const srcSkills = path.resolve(ctx.projectRoot, ctx.config.skills.dir);
  const destSkills = claudeSkillsDir(ctx.projectRoot);

  const srcExists = await fileExists(srcSkills);
  if (!srcExists) {
    return { changed, operations: existingOperations };
  }

  const destExists = await fileExists(destSkills);
  if (!destExists) {
    existingOperations.push({ type: 'create-dir', dir: path.relative(ctx.projectRoot, destSkills) || destSkills });
  }

  const skillDirs = await readDir(srcSkills);
  for (const dirName of skillDirs) {
    const src = path.join(srcSkills, dirName);
    const dest = path.join(destSkills, dirName);

    const destSkillExists = await fileExists(dest);

    if (destSkillExists) {
      const srcMd = path.join(src, 'SKILL.md');
      const destMd = path.join(dest, 'SKILL.md');
      const srcContent = await fs.readFile(srcMd, 'utf8').catch(() => null);
      const destContent = (await fileExists(destMd)) ? await fs.readFile(destMd, 'utf8') : null;

      if (srcContent === destContent) {
        existingOperations.push({
          type: 'skip',
          description: `skills/${dirName}`,
          reason: `unchanged skill ${dirName}`,
        });
        continue;
      }
    }

    const relDest = path.relative(ctx.projectRoot, destSkills) || destSkills;
    const fullDest = path.join(relDest, dirName);
    existingOperations.push({ type: 'copy-dir', from: path.relative(ctx.projectRoot, src) || src, to: fullDest });

    if (!ctx.dryRun) {
      await ensureDir(destSkills);
      await copyDir(src, dest);
    }
    changed.push(`skills/${dirName}`);
  }

  return { changed, operations: existingOperations };
}
