import { fileExists } from '../../core/fs';
import { geminiSettingsPath } from '../../core/paths';
import type { AgentAdapter } from '../../core/types';
import { doctor } from './doctor';
import { remove } from './remove';
import { sync } from './sync';

export const geminiAdapter: AgentAdapter = {
  id: 'gemini',
  name: 'Gemini CLI',
  capabilities: {
    preToolUse: 'none',
    skills: 'none',
    instructions: 'none',
    mcpServers: 'native',
    permissions: 'none',
    agents: 'none',
  },

  async detect(projectRoot: string): Promise<boolean> {
    return fileExists(geminiSettingsPath(projectRoot));
  },

  sync,
  doctor,
  remove,
};
