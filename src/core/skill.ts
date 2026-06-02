import path from 'node:path';
import fs from 'fs-extra';
import matter from 'gray-matter';

export interface SkillMeta {
  name: string;
  description: string;
  dirName: string;
  content: string;
}

export async function parseSkill(skillDir: string, dirName: string): Promise<SkillMeta | null> {
  const mdPath = path.join(skillDir, dirName, 'SKILL.md');
  try {
    const raw = await fs.readFile(mdPath, 'utf8');
    const { data, content } = matter(raw);
    return {
      name: data.name || dirName,
      description: data.description || '',
      dirName,
      content: content.trim(),
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
