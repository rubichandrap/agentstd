import path from 'node:path';
import fs from 'fs-extra';
import { copyDir, ensureDir, fileExists } from '../../core/fs';
import { claudeSkillsDir, homeRoot } from '../../core/paths';
import { listMergedSkills } from '../../core/skill';
import { resolveSkillSources } from '../../core/skill-resolve';
import type { FileOperation, SyncContext } from '../../core/types';

export async function syncClaudeSkills(
  ctx: SyncContext,
  existingOperations: FileOperation[],
): Promise<{ changed: string[]; operations: FileOperation[] }> {
  const changed: string[] = [];
  const outputRoot = ctx.outputRoot ?? ctx.projectRoot;
  const destSkills = claudeSkillsDir(outputRoot);

  const homeRootResolved = ctx.homeRoot ?? homeRoot();
  const sources = resolveSkillSources(
    ctx.projectRoot,
    ctx.config,
    homeRootResolved,
    ctx.scope ?? 'project',
    ctx.hasHomeConfig ?? true,
  );
  const skills = await listMergedSkills(sources);

  if (skills.length === 0) {
    return { changed, operations: existingOperations };
  }

  const destExists = await fileExists(destSkills);
  if (!destExists) {
    existingOperations.push({
      type: 'create-dir',
      dir: path.relative(outputRoot, destSkills) || destSkills,
    });
  }

  for (const skill of skills) {
    const src = path.join(skill.dir, skill.dirName);
    const dest = path.join(destSkills, skill.dirName);

    const destSkillExists = await fileExists(dest);

    if (destSkillExists) {
      const srcMd = path.join(src, 'SKILL.md');
      const destMd = path.join(dest, 'SKILL.md');
      const srcContent = await fs.readFile(srcMd, 'utf8').catch(() => null);
      const destContent = (await fileExists(destMd)) ? await fs.readFile(destMd, 'utf8') : null;

      if (srcContent === destContent) {
        existingOperations.push({
          type: 'skip',
          description: `skills/${skill.dirName}`,
          reason: `unchanged skill ${skill.dirName}`,
        });
        continue;
      }
    }

    const relDest = path.relative(outputRoot, destSkills) || destSkills;
    const fullDest = path.join(relDest, skill.dirName);
    const fromPath =
      skill.source === 'home'
        ? path.join(skill.dir, skill.dirName)
        : path.relative(ctx.projectRoot, src) || src;
    existingOperations.push({ type: 'copy-dir', from: fromPath, to: fullDest });

    if (!ctx.dryRun) {
      await ensureDir(destSkills);
      await copyDir(src, dest);
    }
    changed.push(`skills/${skill.dirName}`);
  }

  return { changed, operations: existingOperations };
}
