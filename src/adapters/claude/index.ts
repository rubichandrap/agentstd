import { fileExists } from '../../core/fs';
import { claudeDir, claudeSettingsPath } from '../../core/paths';
import type { AgentAdapter } from '../../core/types';
import { doctor } from './doctor';
import { sync } from './sync';

export const claudeAdapter: AgentAdapter = {
  id: 'claude',
  name: 'Claude Code',
  capabilities: {
    preToolUse: 'native',
    skills: 'native',
    instructions: 'partial',
  },

  async detect(projectRoot: string): Promise<boolean> {
    return (
      (await fileExists(claudeDir(projectRoot))) ||
      (await fileExists(claudeSettingsPath(projectRoot)))
    );
  },

  sync,
  doctor,
};
