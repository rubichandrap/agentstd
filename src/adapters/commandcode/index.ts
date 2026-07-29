import { fileExists } from '../../core/fs';
import { commandCodeMcpPath } from '../../core/paths';
import type { AgentAdapter } from '../../core/types';
import { doctor } from './doctor';
import { remove } from './remove';
import { sync } from './sync';

export const commandCodeAdapter: AgentAdapter = {
  id: 'commandcode',
  name: 'CommandCode',
  capabilities: {
    preToolUse: 'none',
    skills: 'none',
    instructions: 'none',
    mcpServers: 'native',
    permissions: 'none',
    agents: 'none',
  },

  async detect(projectRoot: string): Promise<boolean> {
    return fileExists(commandCodeMcpPath(projectRoot));
  },

  sync,
  doctor,
  remove,
};
