import type { AgentStdConfig } from './config';

export function mcpServersOf(config: AgentStdConfig): AgentStdConfig['mcpServers'] {
  return config.mcpServers ?? {};
}

export function agentsOf(config: AgentStdConfig): AgentStdConfig['agents'] {
  return config.agents ?? {};
}

export function permissionsOf(config: AgentStdConfig): AgentStdConfig['permissions'] {
  return {
    commands: {
      allow: config.permissions?.commands?.allow ?? [],
      prompt: config.permissions?.commands?.prompt ?? [],
      deny: config.permissions?.commands?.deny ?? [],
    },
    files: {
      denyRead: config.permissions?.files?.denyRead ?? [],
      denyWrite: config.permissions?.files?.denyWrite ?? [],
    },
  };
}
