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

program.command('init').description('Initialize AgentStd in the current directory').action(initCmd);

program
  .command('sync [target]')
  .description('Sync AgentStd configuration to target agent folders. Specify a target (e.g. claude) to sync only that agent.')
  .action(syncCmd);

program.command('doctor').description('Check project state and report issues').action(doctorCmd);

const skillsCmd = program.command('skills').description('Manage skills');

skillsCmd.command('list').description('List all skills').action(skillsListCmd);

skillsCmd
  .command('show')
  .argument('<skillId>', 'Skill identifier to show')
  .description("Show a skill's metadata and content")
  .action(skillsShowCmd);

const targetsCmd = program.command('targets').description('Manage targets');

targetsCmd
  .command('list')
  .description('List supported targets and their capabilities')
  .action(targetsListCmd);

program.parse();
