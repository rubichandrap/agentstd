import { describe, expect, it, vi } from 'vitest';
import { createProgram } from '../src/cli/program';

describe('CLI program wiring', () => {
  it('runs check as the doctor alias', async () => {
    const doctorCmd = vi.fn();
    const program = createProgram({ doctorCmd });

    await program.parseAsync(['node', 'agentstd', 'check'], { from: 'node' });

    expect(doctorCmd).toHaveBeenCalledTimes(1);
  });

  it('lists skills when skills parent command has no subcommand', async () => {
    const skillsListCmd = vi.fn();
    const program = createProgram({ skillsListCmd });

    await program.parseAsync(['node', 'agentstd', 'skills'], { from: 'node' });

    expect(skillsListCmd).toHaveBeenCalledTimes(1);
  });

  it('lists targets when targets parent command has no subcommand', async () => {
    const targetsListCmd = vi.fn();
    const program = createProgram({ targetsListCmd });

    await program.parseAsync(['node', 'agentstd', 'targets'], { from: 'node' });

    expect(targetsListCmd).toHaveBeenCalledTimes(1);
  });

  it('runs status command', async () => {
    const statusCmd = vi.fn();
    const program = createProgram({ statusCmd });

    await program.parseAsync(['node', 'agentstd', 'status'], { from: 'node' });

    expect(statusCmd).toHaveBeenCalledTimes(1);
  });
});
