import { describe, expect, it } from 'vitest';
import { agentStdConfigSchema } from '../src/core/config';

describe('agentStdConfigSchema', () => {
  it('parses a minimal valid config with defaults', () => {
    const result = agentStdConfigSchema.safeParse({ version: 1 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.targets).toEqual(['claude']);
      expect(result.data.skills.dir).toBe('.agents/skills');
      expect(result.data.skills.homeDir).toBe('.agents/skills');
    }
  });

  it('rejects invalid version', () => {
    const result = agentStdConfigSchema.safeParse({ version: 2 });
    expect(result.success).toBe(false);
  });

  it('parses full config', () => {
    const result = agentStdConfigSchema.safeParse({
      version: 1,
      targets: ['claude', 'codex'],
      hooks: {
        preToolUse: {
          command: 'node .agentstd/hooks/pretooluse.js',
        },
      },
      skills: {
        dir: '.agentstd/skills',
        homeDir: '.agents/skills',
      },
      instructions: {
        shared: '.agentstd/instructions/shared.md',
      },
      mcpServers: {
        github: {
          transport: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
          env: { GITHUB_TOKEN: 'GITHUB_TOKEN' },
        },
      },
      permissions: {
        commands: {
          allow: [['pnpm', 'test']],
          prompt: [['git', 'push']],
          deny: [['rm', '-rf']],
        },
        files: {
          denyRead: ['.env'],
          denyWrite: ['.env'],
        },
      },
      agents: {
        'code-reviewer': {
          description: 'Review code changes.',
          instructions: '.agentstd/agents/code-reviewer.md',
          tools: ['read', 'bash'],
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects command permissions expressed as shell strings', () => {
    const result = agentStdConfigSchema.safeParse({
      version: 1,
      permissions: {
        commands: {
          allow: ['pnpm test'],
        },
      },
    });
    expect(result.success).toBe(false);
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
