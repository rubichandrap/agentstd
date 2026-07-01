import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'fs-extra';

interface PackageJson {
  version?: string;
}

export function packageVersion(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const packagePath = findPackageJson(moduleDir) ?? findPackageJson(process.cwd());
  if (!packagePath) return '0.0.0';
  try {
    const pkg = fs.readJsonSync(packagePath) as PackageJson;
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function findPackageJson(startDir: string): string | null {
  let current = startDir;
  while (true) {
    const candidate = path.join(current, 'package.json');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}
