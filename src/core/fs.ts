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

/**
 * Writes `obj` to `filePath` as YAML, backing up the previous content to
 * `${filePath}.bak` first. Returns the backup path (or null when the file did
 * not previously exist and no backup was written).
 */
export async function writeConfigWithBackup(
  filePath: string,
  obj: unknown,
): Promise<string | null> {
  const YAML = await import('yaml');
  if (await fileExists(filePath)) {
    const bak = `${filePath}.bak`;
    await fs.copy(filePath, bak, { overwrite: true });
    await fs.writeFile(filePath, YAML.stringify(obj));
    return bak;
  }
  await fs.writeFile(filePath, YAML.stringify(obj));
  return null;
}

/**
 * Ensures a `.gitkeep` file exists in `dir` so the directory can be committed
 * to git even though it is listed in `.gitignore`. The root `.gitignore`
 * already contains `!**\/.gitkeep` so this file will be tracked automatically.
 * When `dryRun` is true the file is not written but the parent directory is
 * still created (matching sync semantics for non-gitkeep files).
 */
export async function ensureGitKeep(dir: string, dryRun?: boolean): Promise<void> {
  await fs.ensureDir(dir);
  if (!dryRun) {
    const keepFile = path.join(dir, '.gitkeep');
    if (!(await fileExists(keepFile))) {
      await fs.writeFile(keepFile, '');
    }
  }
}
