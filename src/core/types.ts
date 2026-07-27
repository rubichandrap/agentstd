import type { AgentStdConfig } from './config';
import type { ConfigLayer, ConfigPathSources } from './config-merge';

export type { AgentStdConfig, ConfigLayer, ConfigPathSources };

export type Capability =
  | 'native'
  | 'plugin'
  | 'instruction'
  | 'partial'
  | 'none'
  | 'unknown'
  | 'planned';

export interface AgentCapabilities {
  preToolUse: Capability;
  skills: Capability;
  instructions: Capability;
  mcpServers: Capability;
  permissions: Capability;
  agents: Capability;
}

export interface SyncContext {
  projectRoot: string;
  outputRoot?: string;
  scope?: 'project' | 'global';
  config: AgentStdConfig;
  dryRun?: boolean;
  homeRoot?: string;
  hasHomeConfig?: boolean;
  pathSources?: ConfigPathSources;
}

export interface DoctorContext {
  projectRoot: string;
  outputRoot?: string;
  scope?: 'project' | 'global';
  config: AgentStdConfig;
  homeRoot?: string;
  hasHomeConfig?: boolean;
  pathSources?: ConfigPathSources;
}

export interface RemoveContext {
  projectRoot: string;
  outputRoot?: string;
  scope?: 'project' | 'global';
  config: AgentStdConfig;
  dryRun?: boolean;
  homeRoot?: string;
  hasHomeConfig?: boolean;
}

export type FileOperation =
  | { type: 'create-dir'; dir: string }
  | { type: 'create-file'; path: string }
  | { type: 'update-file'; path: string }
  | { type: 'remove-file'; path: string }
  | { type: 'remove-dir'; path: string }
  | { type: 'copy-dir'; from: string; to: string }
  | { type: 'skip'; description: string; reason: string };

export interface SyncResult {
  target: string;
  changed: string[];
  warnings: string[];
  operations: FileOperation[];
}

export interface DoctorCheck {
  label: string;
  status: 'pass' | 'warn' | 'fail';
  message?: string;
}

export interface DoctorResult {
  target: string;
  checks: DoctorCheck[];
}

export interface RemoveResult {
  target: string;
  removed: string[];
  warnings: string[];
  operations: FileOperation[];
}

export interface AgentAdapter {
  id: string;
  name: string;
  capabilities: AgentCapabilities;

  detect(projectRoot: string): Promise<boolean>;
  sync(ctx: SyncContext): Promise<SyncResult>;
  doctor(ctx: DoctorContext): Promise<DoctorResult>;
  remove(ctx: RemoveContext): Promise<RemoveResult>;
}
