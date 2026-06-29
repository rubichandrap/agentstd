import path from 'node:path';
import fs from 'fs-extra';
import matter from 'gray-matter';
import pc from 'picocolors';
import { ConfigValidationError, loadMergedConfig } from '../../core/config-merge';
import { fileExists } from '../../core/fs';
import { log } from '../../core/logger';
import { homeRoot } from '../../core/paths';
import { listMergedSkills } from '../../core/skill';
import { resolveSkillSources } from '../../core/skill-resolve';

export interface SkillsOptions {
  projectOnly?: boolean;
}

async function loadSkillSets(options?: SkillsOptions) {
  const root = process.cwd();
  const configPath = path.join(root, '.agentstd.yaml');
  if (!(await fileExists(configPath))) {
    log.error('.agentstd.yaml not found. Run: agentstd init');
    process.exit(1);
  }
  try {
    const { config } = await loadMergedConfig(root, homeRoot(), options?.projectOnly);
    const sources = resolveSkillSources(root, config, homeRoot());
    const skills = await listMergedSkills(sources);
    return { config, sources, skills };
  } catch (err) {
    if (err instanceof ConfigValidationError) {
      log.error('Invalid config:');
      for (const issue of err.issues) {
        log.dim(`  - ${issue.path}: ${issue.message}`);
      }
    } else {
      log.error(`${(err as Error).message}`);
    }
    process.exit(1);
  }
}

export async function skillsListCmd(options?: SkillsOptions): Promise<void> {
  const { skills } = await loadSkillSets(options);

  if (skills.length === 0) {
    log.dim('No skills found.');
    return;
  }

  log.info(pc.bold('Skills\n'));

  for (const skill of skills) {
    const tag = pc.dim(` [${skill.source}]`);
    console.log(`${pc.cyan(skill.name)}${tag}`);
    if (skill.description) {
      console.log(pc.dim(`  ${skill.description}`));
    }
    console.log();
  }
}

export async function skillsShowCmd(skillId: string, options?: SkillsOptions): Promise<void> {
  const { skills } = await loadSkillSets(options);

  const skill = skills.find((s) => s.dirName === skillId);
  if (!skill) {
    log.error(`Skill "${skillId}" not found.`);
    process.exit(1);
  }

  const mdPath = path.join(skill.dir, skill.dirName, 'SKILL.md');
  if (!(await fileExists(mdPath))) {
    log.error(`Skill "${skillId}" not found.`);
    process.exit(1);
  }

  const raw = await fs.readFile(mdPath, 'utf8');
  const { data, content } = matter(raw);

  console.log(pc.bold(pc.cyan(data.name || skillId)));
  console.log(pc.dim(`source: ${skill.source}`));
  console.log();

  if (data.description) {
    console.log(pc.bold('Description:'));
    console.log(data.description);
    console.log();
  }

  console.log(pc.bold('Content:'));
  console.log(content.trim());
}
