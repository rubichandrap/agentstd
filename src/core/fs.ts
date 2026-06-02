import path from 'node:path';
import fs from 'fs-extra';

export async function ensureDir(dir: string): Promise<void> {
  await fs.ensureDir(dir);
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  if (!(await fileExists(filePath))) return null;
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

export async function writeJson(filePath: string, data: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

export async function copyDir(src: string, dest: string): Promise<void> {
  await fs.copy(src, dest, { overwrite: true });
}

export async function readDir(dir: string): Promise<string[]> {
  if (!(await fileExists(dir))) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}
