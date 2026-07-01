import { z } from 'zod';

const commandPatternSchema = z.array(z.string()).min(1);

const commandPermissionsSchema = z
  .object({
    allow: z.array(commandPatternSchema).default([]),
    prompt: z.array(commandPatternSchema).default([]),
    deny: z.array(commandPatternSchema).default([]),
  })
  .default({});

const filePermissionsSchema = z
  .object({
    denyRead: z.array(z.string()).default([]),
    denyWrite: z.array(z.string()).default([]),
  })
  .default({});

const permissionsSchema = z
  .object({
    commands: commandPermissionsSchema,
    files: filePermissionsSchema,
  })
  .default({});

const mcpServerSchema = z.object({
  transport: z.enum(['stdio', 'http', 'sse', 'streamable-http']).default('stdio'),
  command: z.string().optional(),
  args: z.array(z.string()).default([]),
  url: z.string().optional(),
  env: z.record(z.string()).default({}),
});

const agentConfigSchema = z.object({
  description: z.string(),
  instructions: z.string(),
  tools: z.array(z.string()).default([]),
});

export const agentStdConfigSchema = z.object({
  version: z.literal(1),
  projectOnly: z.boolean().default(false),
  targets: z.array(z.string()).default(['claude']),
  hooks: z
    .object({
      preToolUse: z
        .object({
          command: z.string(),
        })
        .optional(),
    })
    .default({}),
  skills: z
    .object({
      dir: z.string().default('.agents/skills'),
      homeDir: z.string().default('.agents/skills'),
    })
    .default({ dir: '.agents/skills', homeDir: '.agents/skills' }),
  instructions: z
    .object({
      shared: z.string().optional(),
    })
    .default({}),
  mcpServers: z.record(mcpServerSchema).default({}),
  permissions: permissionsSchema,
  agents: z.record(agentConfigSchema).default({}),
});

export type AgentStdConfig = z.infer<typeof agentStdConfigSchema>;
