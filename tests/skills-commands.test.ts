import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listSkills, parseSkill } from '../src/core/skill';

describe('Skills commands', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentstd-test-'));
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  it('listSkills reads name and description from frontmatter', async () => {
    const skillDir = path.join(tmpDir, 'my-skill');
    await fs.ensureDir(skillDir);
    await fs.writeFile(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: My Skill\ndescription: Does cool things\n---\n\nContent here.',
    );
    const skills = await listSkills(tmpDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('My Skill');
    expect(skills[0].description).toBe('Does cool things');
    expect(skills[0].content).toBe('Content here.');
  });

  it('parseSkill returns null for dir without SKILL.md', async () => {
    const emptyDir = path.join(tmpDir, 'empty-skill');
    await fs.ensureDir(emptyDir);
    const result = await parseSkill(tmpDir, 'empty-skill');
    expect(result).toBeNull();
  });

  it('listSkills uses dirName as fallback name', async () => {
    const skillDir = path.join(tmpDir, 'unnamed-skill');
    await fs.ensureDir(skillDir);
    await fs.writeFile(
      path.join(skillDir, 'SKILL.md'),
      '---\ndescription: No name field\n---\n\nContent.',
    );
    const skills = await listSkills(tmpDir);
    expect(skills[0].name).toBe('unnamed-skill');
  });

  it('listSkills skips invalid skill folders', async () => {
    const validDir = path.join(tmpDir, 'valid-skill');
    const invalidDir = path.join(tmpDir, 'invalid-skill');
    await fs.ensureDir(validDir);
    await fs.ensureDir(invalidDir);
    await fs.writeFile(path.join(validDir, 'SKILL.md'), '---\nname: Valid\n---\n\nContent.');
    const skills = await listSkills(tmpDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('Valid');
  });
});
