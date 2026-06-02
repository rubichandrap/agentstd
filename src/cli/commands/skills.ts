import path from 'node:path';
import fs from 'fs-extra';
import matter from 'gray-matter';
import pc from 'picocolors';
import YAML from 'yaml';
import { agentStdConfigSchema } from '../../core/config';
import { fileExists } from '../../core/fs';
import { log } from '../../core/logger';
import { listSkills } from '../../core/skill';

async function getSkillsDir(): Promise<string | null> {
  const root = process.cwd();
  const configPath = path.join(root, '.agentstd.yaml');
  if (!(await fileExists(configPath))) return null;

  const raw = await fs.readFile(configPath, 'utf8');
  const parsed = YAML.parse(raw);
  const validation = agentStdConfigSchema.safeParse(parsed);
  if (!validation.success) return null;

  return path.resolve(root, validation.data.skills.dir);
}

export async function skillsListCmd(): Promise<void> {
  const skillsDir = await getSkillsDir();
  if (!skillsDir) {
    log.error('.agentstd.yaml not found or invalid. Run: agentstd init');
    process.exit(1);
  }

  if (!(await fileExists(skillsDir))) {
    log.warn('Skills directory not found.');
    return;
  }

  const skills = await listSkills(skillsDir);
  if (skills.length === 0) {
    log.dim('No skills found.');
    return;
  }

  log.info(pc.bold('Skills\n'));

  for (const skill of skills) {
    console.log(pc.cyan(skill.name));
    if (skill.description) {
      console.log(pc.dim(`  ${skill.description}`));
    }
    console.log();
  }
}

export async function skillsShowCmd(skillId: string): Promise<void> {
  const skillsDir = await getSkillsDir();
  if (!skillsDir) {
    log.error('.agentstd.yaml not found or invalid. Run: agentstd init');
    process.exit(1);
  }

  const skillDir = path.join(skillsDir, skillId);
  const mdPath = path.join(skillDir, 'SKILL.md');

  if (!(await fileExists(mdPath))) {
    log.error(`Skill "${skillId}" not found.`);
    process.exit(1);
  }

  const raw = await fs.readFile(mdPath, 'utf8');
  const { data, content } = matter(raw);

  console.log(pc.bold(pc.cyan(data.name || skillId)));
  console.log();

  if (data.description) {
    console.log(pc.bold('Description:'));
    console.log(data.description);
    console.log();
  }

  console.log(pc.bold('Content:'));
  console.log(content.trim());
}
