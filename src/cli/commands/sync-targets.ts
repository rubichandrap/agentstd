import * as clack from '@clack/prompts';
import type { AgentStdConfig } from '../../core/types';

export interface ResolveSyncTargetsOptions {
  requestedTarget?: string;
  all?: boolean;
  check?: boolean;
  dryRun?: boolean;
  isInteractive?: boolean;
  promptTargets?: (targets: string[]) => Promise<string[]>;
}

export async function resolveSyncTargets(
  config: AgentStdConfig,
  options: ResolveSyncTargetsOptions = {},
): Promise<string[]> {
  if (options.requestedTarget) return [options.requestedTarget];
  if (options.all) return config.targets;
  if (options.check || options.dryRun) return config.targets;
  if (config.targets.length <= 1) return config.targets;
  if (!options.isInteractive) return config.targets;

  return (options.promptTargets ?? promptForTargets)(config.targets);
}

async function promptForTargets(targets: string[]): Promise<string[]> {
  const selected = await clack.multiselect({
    message: 'Select targets to sync',
    options: targets.map((target) => ({ value: target, label: target })),
    initialValues: [...targets],
    required: true,
  });

  if (clack.isCancel(selected) || selected.length === 0) {
    clack.cancel('Sync cancelled.');
    process.exit(0);
  }

  return selected;
}
