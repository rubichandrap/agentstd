#!/usr/bin/env node
import { Command } from 'commander';
import { doctorCmd } from './commands/doctor';
import { initCmd } from './commands/init';
import { skillsListCmd, skillsShowCmd } from './commands/skills';
import { syncCmd } from './commands/sync';
import { targetsListCmd } from './commands/targets';

const program = new Command();

program
  .name('agentstd')
  .description('Standardize hooks, skills, and shared instructions across AI coding agents.')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize AgentStd in the current directory')
  .option(
    '--global',
    'Initialize home-level AgentStd config (~/.agentstd.yaml + ~/.agents/skills/)',
  )
  .action((options) => {
    initCmd(options);
  });

program
  .command('sync [target]')
  .description(
    'Sync AgentStd configuration to target agent folders. Specify a target (e.g. claude) to sync only that agent.',
  )
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
    syncCmd(target, options);
  });

program
  .command('doctor')
  .description('Check project state and report issues')
  .option('--project-only', 'Skip the home layer (~/.agentstd.yaml + ~/.agents/skills/)')
  .option(
    '--no-project-only',
    'Force merge with the home layer (overrides config projectOnly: true)',
  )
  .action((options) => {
    doctorCmd(options);
  });

const skillsCmd = program.command('skills').description('Manage skills');

skillsCmd
  .command('list')
  .description('List all skills')
  .option('--project-only', 'Skip the home layer (~/.agentstd.yaml + ~/.agents/skills/)')
  .option(
    '--no-project-only',
    'Force merge with the home layer (overrides config projectOnly: true)',
  )
  .action((options) => {
    skillsListCmd(options);
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
    skillsShowCmd(skillId, options);
  });

const targetsCmd = program.command('targets').description('Manage targets');

targetsCmd
  .command('list')
  .description('List supported targets and their capabilities')
  .action(targetsListCmd);

program.parse();
