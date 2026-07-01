import { fileExists } from '../../core/fs';
import { agentsMdPath, codexConfigPath, codexHooksPath } from '../../core/paths';
import type { AgentAdapter } from '../../core/types';
import { doctor } from './doctor';
import { sync } from './sync';

export const codexAdapter: AgentAdapter = {
  id: 'codex',
  name: 'Codex',
  capabilities: {
    preToolUse: 'native',
    skills: 'native',
    instructions: 'native',
    mcpServers: 'native',
    permissions: 'partial',
    agents: 'native',
  },

  async detect(projectRoot: string): Promise<boolean> {
    return (
      (await fileExists(codexConfigPath(projectRoot))) ||
      (await fileExists(codexHooksPath(projectRoot))) ||
      (await fileExists(agentsMdPath(projectRoot)))
    );
  },

  sync,
  doctor,
};
