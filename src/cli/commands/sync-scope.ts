import path from 'node:path';
import fs from 'fs-extra';
import YAML from 'yaml';
import { agentStdConfigSchema } from '../../core/config';
import {
  type ConfigPathSources,
  ConfigValidationError,
  loadMergedConfig,
  type MergedConfigResult,
  pathSourcesFromSingle,
} from '../../core/config-merge';
import { fileExists } from '../../core/fs';
import { migrateConfig } from '../../core/migrations';
import type { AgentStdConfig } from '../../core/types';

export type SyncScope = 'project' | 'global';

export interface LoadedAgentStdContext {
  config: AgentStdConfig;
  outputRoot: string;
  scope: SyncScope;
  sources: string[];
  hasHomeConfig: boolean;
  pathSources: ConfigPathSources;
}

export async function loadAgentStdContext(
  root: string,
  resolvedHomeRoot: string,
  flagProjectOnly?: boolean,
): Promise<LoadedAgentStdContext> {
  const configPath = path.join(root, '.agentstd.yaml');

  if (!(await fileExists(configPath))) {
    throw new Error('.agentstd.yaml not found. Run: agentstd init');
  }

  if (path.resolve(root) === path.resolve(resolvedHomeRoot)) {
    const { config, raw } = await readStandaloneConfig(configPath);
    const obj = (raw ?? {}) as Record<string, unknown>;
    return {
      config,
      outputRoot: resolvedHomeRoot,
      scope: 'global',
      sources: [configPath],
      hasHomeConfig: true,
      pathSources: pathSourcesFromSingle(obj, 'home'),
    };
  }

  const merged: MergedConfigResult = await loadMergedConfig(
    root,
    resolvedHomeRoot,
    flagProjectOnly,
  );
  return {
    config: merged.config,
    outputRoot: root,
    scope: 'project',
    sources: merged.sources,
    hasHomeConfig: merged.hasHomeConfig,
    pathSources: merged.pathSources,
  };
}

async function readStandaloneConfig(
  configPath: string,
): Promise<{ config: AgentStdConfig; raw: unknown }> {
  const raw = YAML.parse(await fs.readFile(configPath, 'utf8'));
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`Config at ${configPath} must be a YAML object.`);
  }

  const migrated = migrateConfig(raw as Record<string, unknown>);
  const validation = agentStdConfigSchema.safeParse(migrated.obj);
  if (!validation.success) {
    throw new ConfigValidationError(configPath, validation.error.issues);
  }
  return { config: validation.data, raw };
}
