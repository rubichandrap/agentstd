import path from 'node:path';
import fs from 'fs-extra';
import YAML from 'yaml';
import { fileExists } from './fs';
import { agentStdConfigSchema, type AgentStdConfig } from './config';

export interface MergedConfigResult {
  config: AgentStdConfig;
  sources: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMerge(
  home: Record<string, unknown>,
  project: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...home };
  for (const [key, projectValue] of Object.entries(project)) {
    if (projectValue === undefined) continue;
    const homeValue = out[key];
    if (isPlainObject(homeValue) && isPlainObject(projectValue)) {
      out[key] = deepMerge(homeValue, projectValue);
    } else {
      out[key] = projectValue;
    }
  }
  return out;
}

async function readYamlObject(
  filePath: string,
): Promise<{ object: Record<string, unknown>; found: boolean }> {
  if (!(await fileExists(filePath))) return { object: {}, found: false };
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = YAML.parse(raw);
  if (parsed === null || parsed === undefined) return { object: {}, found: true };
  if (!isPlainObject(parsed)) {
    throw new Error(`Config at ${filePath} must be a YAML object.`);
  }
  return { object: parsed as Record<string, unknown>, found: true };
}

function checkVersionAgreement(
  home: Record<string, unknown>,
  project: Record<string, unknown>,
  homePath: string,
  projectPath: string,
): void {
  const homeVersion = home.version;
  const projectVersion = project.version;
  if (homeVersion !== undefined && projectVersion !== undefined && homeVersion !== projectVersion) {
    throw new Error(
      `Config version mismatch: ${homePath} has version ${homeVersion} but ${projectPath} has version ${projectVersion}. Versions must agree.`,
    );
  }
}

export async function loadMergedConfig(
  projectRoot: string,
  homeRoot: string,
  flagProjectOnly?: boolean,
): Promise<MergedConfigResult> {
  const projectPath = path.join(projectRoot, '.agentstd.yaml');
  if (!(await fileExists(projectPath))) {
    throw new Error(`.agentstd.yaml not found at ${projectPath}. Run: agentstd init`);
  }

  const projectRead = await readYamlObject(projectPath);

  const rawProjectOnly = isPlainObject(projectRead.object)
    ? projectRead.object.projectOnly
    : undefined;
  const effectiveProjectOnly =
    flagProjectOnly !== undefined ? flagProjectOnly : rawProjectOnly === true;

  if (effectiveProjectOnly) {
    const validation = agentStdConfigSchema.safeParse(projectRead.object);
    if (!validation.success) {
      throw new ConfigValidationError(projectPath, validation.error.issues);
    }
    const config = { ...validation.data, projectOnly: true };
    return { config, sources: [projectPath] };
  }

  const homePath = path.join(homeRoot, '.agentstd.yaml');
  const sources: string[] = [];

  const homeRead = await readYamlObject(homePath);
  if (homeRead.found) sources.push(homePath);
  sources.push(projectPath);

  if (!homeRead.found) {
    const validation = agentStdConfigSchema.safeParse(projectRead.object);
    if (!validation.success) {
      throw new ConfigValidationError(projectPath, validation.error.issues);
    }
    return { config: validation.data, sources };
  }

  checkVersionAgreement(homeRead.object, projectRead.object, homePath, projectPath);

  const merged = deepMerge(homeRead.object, projectRead.object);
  const validation = agentStdConfigSchema.safeParse(merged);
  if (!validation.success) {
    throw new ConfigValidationError(projectPath, validation.error.issues);
  }

  const config =
    flagProjectOnly === false ? { ...validation.data, projectOnly: false } : validation.data;
  return { config, sources };
}

export class ConfigValidationError extends Error {
  issues: Array<{ path: string; message: string }>;

  constructor(contextPath: string, issues: Array<{ path: (string | number)[]; message: string }>) {
    const formatted = issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    super(`Invalid config (${contextPath}):\n${formatted}`);
    this.name = 'ConfigValidationError';
    this.issues = issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  }
}
