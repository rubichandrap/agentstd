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
}

export interface AgentStdConfig {
  version: 1;
  targets: string[];
  hooks: {
    preToolUse?: {
      command: string;
    };
  };
  skills: {
    dir: string;
  };
  instructions: {
    shared?: string;
  };
}

export interface SyncContext {
  projectRoot: string;
  config: AgentStdConfig;
}

export interface DoctorContext {
  projectRoot: string;
  config: AgentStdConfig;
}

export interface SyncResult {
  target: string;
  changed: string[];
  warnings: string[];
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

export interface AgentAdapter {
  id: string;
  name: string;
  capabilities: AgentCapabilities;

  detect(projectRoot: string): Promise<boolean>;
  sync(ctx: SyncContext): Promise<SyncResult>;
  doctor(ctx: DoctorContext): Promise<DoctorResult>;
}
