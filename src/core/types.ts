import type { AgentStdConfig } from './config';

export type { AgentStdConfig };

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
  config: AgentStdConfig;
  dryRun?: boolean;
  homeRoot?: string;
}

export interface DoctorContext {
  projectRoot: string;
  config: AgentStdConfig;
  homeRoot?: string;
}

export interface RemoveContext {
  projectRoot: string;
  config: AgentStdConfig;
  dryRun?: boolean;
  homeRoot?: string;
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
