import path from 'node:path';
import fs from 'fs-extra';
import matter from 'gray-matter';

export type SkillSourceLabel = 'home' | 'project';

export interface SkillSource {
  root: string;
  dir: string;
  label: SkillSourceLabel;
}

export interface SkillMeta {
  name: string;
  description: string;
  dirName: string;
  content: string;
  source: SkillSourceLabel;
  dir: string;
}

export async function parseSkill(
  skillDir: string,
  dirName: string,
  source: SkillSourceLabel = 'project',
): Promise<SkillMeta | null> {
  const mdPath = path.join(skillDir, dirName, 'SKILL.md');
  try {
    const raw = await fs.readFile(mdPath, 'utf8');
    const { data, content } = matter(raw);
    return {
      name: data.name || dirName,
      description: data.description || '',
      dirName,
      content: content.trim(),
      source,
      dir: skillDir,
    };
  } catch {
    return null;
  }
}

export async function listSkills(skillsBaseDir: string): Promise<SkillMeta[]> {
  const entries = await fs.readdir(skillsBaseDir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  const results: SkillMeta[] = [];
  for (const dir of dirs) {
    const skill = await parseSkill(skillsBaseDir, dir);
    if (skill) results.push(skill);
  }
  return results;
}

export async function listMergedSkills(sources: SkillSource[]): Promise<SkillMeta[]> {
  const byName = new Map<string, SkillMeta>();
  for (const src of sources) {
    const base = src.dir;
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(base, { withFileTypes: true });
    } catch {
      continue;
    }
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    for (const dirName of dirs) {
      const skill = await parseSkill(base, dirName, src.label);
      if (skill) {
        byName.set(dirName, skill);
      }
    }
  }
  return Array.from(byName.values());
}
