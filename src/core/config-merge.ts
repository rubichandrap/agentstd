import path from 'node:path';
import fs from 'fs-extra';
import YAML from 'yaml';
import { type AgentStdConfig, agentStdConfigSchema } from './config';
import { fileExists } from './fs';
import { migrateConfig } from './migrations';

export type ConfigLayer = 'home' | 'project';

export interface ConfigPathSources {
  instructions?: { shared?: ConfigLayer };
  agents?: Record<string, ConfigLayer>;
}

export interface MergedConfigResult {
  config: AgentStdConfig;
  sources: string[];
  hasHomeConfig: boolean;
  pathSources: ConfigPathSources;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rawInstructionsShared(obj: Record<string, unknown>): string | undefined {
  const instructions = obj.instructions;
  if (isPlainObject(instructions) && typeof instructions.shared === 'string') {
    return instructions.shared;
  }
  return undefined;
}

function rawAgentIds(obj: Record<string, unknown>): Set<string> {
  const agents = obj.agents;
  if (!isPlainObject(agents)) return new Set();
  return new Set(Object.keys(agents).filter((id) => isPlainObject(agents[id])));
}

function buildPathSources(
  home: Record<string, unknown> | undefined,
  project: Record<string, unknown>,
  hasHomeConfig: boolean,
): ConfigPathSources {
  if (!hasHomeConfig) {
    const projectSources: ConfigPathSources = {};
    if (rawInstructionsShared(project) !== undefined) {
      projectSources.instructions = { shared: 'project' };
    }
    const projectAgentIds = rawAgentIds(project);
    if (projectAgentIds.size > 0) {
      projectSources.agents = {};
      for (const id of projectAgentIds) projectSources.agents[id] = 'project';
    }
    return projectSources;
  }

  const homeShared = rawInstructionsShared(home ?? {});
  const projectShared = rawInstructionsShared(project);
  const homeAgentIds = rawAgentIds(home ?? {});
  const projectAgentIds = rawAgentIds(project);

  const sources: ConfigPathSources = {};
  if (projectShared !== undefined || homeShared !== undefined) {
    sources.instructions = { shared: projectShared !== undefined ? 'project' : 'home' };
  }
  if (homeAgentIds.size > 0 || projectAgentIds.size > 0) {
    sources.agents = {};
    for (const id of homeAgentIds) {
      if (!projectAgentIds.has(id)) sources.agents[id] = 'home';
    }
    for (const id of projectAgentIds) sources.agents[id] = 'project';
  }
  return sources;
}

export function sourceRoot(
  source: ConfigLayer | undefined,
  projectRoot: string,
  homeRoot: string,
): string {
  return source === 'home' ? homeRoot : projectRoot;
}

export function pathSourcesFromSingle(
  obj: Record<string, unknown>,
  layer: ConfigLayer,
): ConfigPathSources {
  const sources: ConfigPathSources = {};
  if (rawInstructionsShared(obj) !== undefined) {
    sources.instructions = { shared: layer };
  }
  const ids = rawAgentIds(obj);
  if (ids.size > 0) {
    sources.agents = {};
    for (const id of ids) sources.agents[id] = layer;
  }
  return sources;
}

function deepMerge(
  home: Record<string, unknown>,
  project: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...home };
  for (const [key, projectValue] of Object.entries(project)) {
    if (projectValue === undefined) continue;
    const homeValue = out[key];
    if (key === 'agents' && isPlainObject(homeValue) && isPlainObject(projectValue)) {
      // A project-defined agent id wins entirely (description, tools,
      // instructions all come from project). Home-only ids are preserved.
      out[key] = { ...homeValue, ...projectValue };
    } else if (isPlainObject(homeValue) && isPlainObject(projectValue)) {
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
  // Migrate stale on-disk configs up to the current version in-memory so
  // sync/status/doctor stay resilient without rewriting the user's file.
  const migrated = migrateConfig(parsed as Record<string, unknown>);
  return { object: migrated.obj, found: true };
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
    const pathSources = buildPathSources(undefined, projectRead.object, false);
    return { config, sources: [projectPath], hasHomeConfig: false, pathSources };
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
    const pathSources = buildPathSources(undefined, projectRead.object, false);
    return { config: validation.data, sources, hasHomeConfig: false, pathSources };
  }

  // Both objects are migrated to the current version by readYamlObject (or the
  // read throws for a newer-than-supported version), so no cross-layer version
  // reconciliation is needed here.
  const merged = deepMerge(homeRead.object, projectRead.object);
  const validation = agentStdConfigSchema.safeParse(merged);
  if (!validation.success) {
    throw new ConfigValidationError(projectPath, validation.error.issues);
  }

  const config =
    flagProjectOnly === false ? { ...validation.data, projectOnly: false } : validation.data;
  const pathSources = buildPathSources(homeRead.object, projectRead.object, true);
  return { config, sources, hasHomeConfig: true, pathSources };
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
