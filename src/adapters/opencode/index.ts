import { fileExists } from '../../core/fs';
import { openCodeMcpPath } from '../../core/paths';
import type { AgentAdapter } from '../../core/types';
import { doctor } from './doctor';
import { remove } from './remove';
import { sync } from './sync';

export const openCodeAdapter: AgentAdapter = {
  id: 'opencode',
  name: 'OpenCode',
  capabilities: {
    preToolUse: 'none',
    skills: 'none',
    instructions: 'none',
    mcpServers: 'native',
    permissions: 'none',
    agents: 'none',
  },

  async detect(projectRoot: string): Promise<boolean> {
    return fileExists(openCodeMcpPath(projectRoot));
  },

  sync,
  doctor,
  remove,
};
