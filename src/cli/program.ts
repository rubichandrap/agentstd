import { Command } from 'commander';
import { packageVersion } from '../core/package-info';
import { doctorCmd } from './commands/doctor';
import { initCmd } from './commands/init';
import { skillsListCmd, skillsShowCmd } from './commands/skills';
import { statusCmd } from './commands/status';
import { syncCmd } from './commands/sync';
import { targetsListCmd } from './commands/targets';

export interface ProgramCommands {
  doctorCmd?: typeof doctorCmd;
  initCmd?: typeof initCmd;
  skillsListCmd?: typeof skillsListCmd;
  skillsShowCmd?: typeof skillsShowCmd;
  statusCmd?: typeof statusCmd;
  syncCmd?: typeof syncCmd;
  targetsListCmd?: typeof targetsListCmd;
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
    .action((options) => {
      handlers.initCmd(options);
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
