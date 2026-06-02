import { describe, expect, it } from 'vitest';
import { agentStdConfigSchema } from '../src/core/config';

describe('agentStdConfigSchema', () => {
  it('parses a minimal valid config with defaults', () => {
    const result = agentStdConfigSchema.safeParse({ version: 1 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.targets).toEqual(['claude']);
      expect(result.data.skills.dir).toBe('.agentstd/skills');
    }
  });

  it('rejects invalid version', () => {
    const result = agentStdConfigSchema.safeParse({ version: 2 });
    expect(result.success).toBe(false);
  });

  it('parses full config', () => {
    const result = agentStdConfigSchema.safeParse({
      version: 1,
      targets: ['claude'],
      hooks: {
        preToolUse: {
          command: 'node .agentstd/hooks/pretooluse.js',
        },
      },
      skills: {
        dir: '.agentstd/skills',
      },
      instructions: {
        shared: '.agentstd/instructions/shared.md',
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing version', () => {
    const result = agentStdConfigSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects non-array targets', () => {
    const result = agentStdConfigSchema.safeParse({
      version: 1,
      targets: 'claude',
    });
    expect(result.success).toBe(false);
  });
});
