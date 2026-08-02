import type { AgentStdConfig } from './config';

export function mcpServersOf(config: AgentStdConfig): AgentStdConfig['mcpServers'] {
  return config.mcpServers ?? {};
}

export function mcpServersForTarget(
  config: AgentStdConfig,
  targetId: string,
): AgentStdConfig['mcpServers'] {
  const servers = mcpServersOf(config);
  const scoped: AgentStdConfig['mcpServers'] = {};
  for (const [name, server] of Object.entries(servers)) {
    const targets = server.targets;
    const appliesToTarget = !targets || targets.length === 0 || targets.includes(targetId);
    if (appliesToTarget) {
      scoped[name] = server;
    }
  }
  return scoped;
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
