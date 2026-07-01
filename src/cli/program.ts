import { Command } from 'commander';
import { packageVersion } from '../core/package-info';
import { doctorCmd } from './commands/doctor';
import { initCmd } from './commands/init';
import { skillsListCmd, skillsShowCmd } from './commands/skills';
import { statusCmd } from './commands/status';
import { syncCmd } from './commands/sync';
import { targetsListCmd } from './commands/targets';
import { targetsAddCmd, targetsRemoveCmd } from './commands/targets-mutate';
import { uninstallCmd } from './commands/uninstall';

export interface ProgramCommands {
  doctorCmd?: typeof doctorCmd;
  initCmd?: typeof initCmd;
  skillsListCmd?: typeof skillsListCmd;
  skillsShowCmd?: typeof skillsShowCmd;
  statusCmd?: typeof statusCmd;
  syncCmd?: typeof syncCmd;
  targetsListCmd?: typeof targetsListCmd;
  targetsAddCmd?: typeof targetsAddCmd;
  targetsRemoveCmd?: typeof targetsRemoveCmd;
  uninstallCmd?: typeof uninstallCmd;
}

export function createProgram(commands: ProgramCommands = {}): Command {
  const handlers = {
    doctorCmd,
    initCmd,
    skillsListCmd,
    skillsShowCmd,
    statusCmd,
    syncCmd,
    targetsListCmd,
    targetsAddCmd,
    targetsRemoveCmd,
    uninstallCmd,
    ...commands,
  };

  const program = new Command();

  program
    .name('agentstd')
    .description(
      'Standardize hooks, skills, instructions, MCP servers, permissions, and agents across AI coding agents.',
    )
    .version(packageVersion());

  program
    .command('init')
    .description('Initialize AgentStd in the current directory')
    .option(
      '--global',
      'Initialize home-level AgentStd config (~/.agentstd.yaml + ~/.agents/skills/)',
    )
    .option('--force', 'Reset an existing .agentstd.yaml to defaults (writes a .bak backup)')
    .option('--dry-run', 'Show what an upgrade of an existing .agentstd.yaml would change')
    .option('--no-interactive', 'Skip the target-selection prompt and use defaults')
    .option(
      '-t, --target <id>',
      'Pre-select a target (repeatable). Skips the prompt when at least one is given.',
      collectRepeatable,
      [] as string[],
    )
    .action((options) => {
      handlers.initCmd({
        ...options,
        targets: options.target,
      });
    });

  program
    .command('sync [target]')
    .description(
      'Sync AgentStd configuration to target agent folders. Specify a target (e.g. claude) to sync only that agent.',
    )
    .option('--all', 'Sync all configured targets without prompting')
    .option('--dry-run', 'Show what would be changed without making changes')
    .option('--check', 'Check if project is fully synced (exit code 1 if changes needed)')
    .option('--project-only', 'Skip the home layer (~/.agentstd.yaml + ~/.agents/skills/)')
    .option(
      '--no-project-only',
      'Force merge with the home layer (overrides config projectOnly: true)',
    )
    .action((target, options) => {
      if (options.dryRun && options.check) {
        console.error('Cannot use --dry-run and --check together.');
        process.exit(2);
      }
      handlers.syncCmd(target, options);
    });

  addCheckCommand(program, 'doctor', 'Check project state and report issues', handlers.doctorCmd);
  addCheckCommand(program, 'check', 'Verify project state and report issues', handlers.doctorCmd);

  program
    .command('uninstall [target]')
    .description('Remove AgentStd provider artifacts and config from the current project')
    .option('--all', 'Uninstall every configured target')
    .option('--dry-run', 'Show what would be removed without making changes')
    .option('--purge-skills', 'Also remove .agents/skills/ (left in place by default)')
    .option('--project-only', 'Only purge the project layer, not the home layer')
    .option('--no-project-only', 'Force include the home layer')
    .option('--global', 'Purge the home config (~/.agentstd.yaml) instead of the project config')
    .action((target, options) => {
      handlers.uninstallCmd(target, options);
    });

  program
    .command('status')
    .description('Show what AgentStd sees in the current project')
    .option('--project-only', 'Skip the home layer (~/.agentstd.yaml + ~/.agents/skills/)')
    .option(
      '--no-project-only',
      'Force merge with the home layer (overrides config projectOnly: true)',
    )
    .action((options) => {
      handlers.statusCmd(options);
    });

  const skillsCmd = program
    .command('skills')
    .description('List or inspect skills')
    .option('--project-only', 'Skip the home layer (~/.agentstd.yaml + ~/.agents/skills/)')
    .option(
      '--no-project-only',
      'Force merge with the home layer (overrides config projectOnly: true)',
    )
    .action((options) => {
      handlers.skillsListCmd(options);
    });

  skillsCmd
    .command('list')
    .description('List all skills')
    .option('--project-only', 'Skip the home layer (~/.agentstd.yaml + ~/.agents/skills/)')
    .option(
      '--no-project-only',
      'Force merge with the home layer (overrides config projectOnly: true)',
    )
    .action((options) => {
      handlers.skillsListCmd(options);
    });

  skillsCmd
    .command('show')
    .argument('<skillId>', 'Skill identifier to show')
    .description("Show a skill's metadata and content")
    .option('--project-only', 'Skip the home layer (~/.agentstd.yaml + ~/.agents/skills/)')
    .option(
      '--no-project-only',
      'Force merge with the home layer (overrides config projectOnly: true)',
    )
    .action((skillId, options) => {
      handlers.skillsShowCmd(skillId, options);
    });

  const targetsCmd = program
    .command('targets')
    .description('List supported targets and capabilities')
    .action(() => {
      handlers.targetsListCmd();
    });

  targetsCmd
    .command('list')
    .description('List supported targets and their capabilities')
    .action(() => {
      handlers.targetsListCmd();
    });

  targetsCmd
    .command('add [id]')
    .description('Add a target to .agentstd.yaml (prompts when [id] is omitted in a TTY)')
    .option('--global', 'Modify the home config (~/.agentstd.yaml) instead of the project config')
    .action((id, options) => {
      handlers.targetsAddCmd(id, options);
    });

  targetsCmd
    .command('remove [id]')
    .description('Remove a target from .agentstd.yaml (prompts when [id] is omitted in a TTY)')
    .option('--global', 'Modify the home config (~/.agentstd.yaml) instead of the project config')
    .action((id, options) => {
      handlers.targetsRemoveCmd(id, options);
    });

  return program;
}

function addCheckCommand(
  program: Command,
  name: string,
  description: string,
  handler: typeof doctorCmd,
): void {
  program
    .command(name)
    .description(description)
    .option('--project-only', 'Skip the home layer (~/.agentstd.yaml + ~/.agents/skills/)')
    .option(
      '--no-project-only',
      'Force merge with the home layer (overrides config projectOnly: true)',
    )
    .action((options) => {
      handler(options);
    });
}

function collectRepeatable(value: string, previous: string[]): string[] {
  return [...previous, value];
}
