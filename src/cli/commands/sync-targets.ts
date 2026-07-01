import readline from 'node:readline/promises';
import type { AgentStdConfig } from '../../core/types';

export type SyncTargetChoice = string | 'all';

export interface ResolveSyncTargetsOptions {
  requestedTarget?: string;
  all?: boolean;
  check?: boolean;
  dryRun?: boolean;
  isInteractive?: boolean;
  promptTarget?: (targets: string[]) => Promise<SyncTargetChoice>;
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

  const choice = await (options.promptTarget ?? promptForTarget)(config.targets);
  return choice === 'all' ? config.targets : [choice];
}

async function promptForTarget(targets: string[]): Promise<SyncTargetChoice> {
  const choices = ['all', ...targets];
  console.log('Select target to sync:');
  choices.forEach((choice, index) => {
    console.log(`  ${index + 1}. ${choice === 'all' ? 'All targets' : choice}`);
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await rl.question('Target: ');
    const index = Number.parseInt(answer.trim(), 10);
    if (Number.isInteger(index) && index >= 1 && index <= choices.length) {
      return choices[index - 1];
    }
    if (choices.includes(answer.trim())) {
      return answer.trim();
    }
    return 'all';
  } finally {
    rl.close();
  }
}
