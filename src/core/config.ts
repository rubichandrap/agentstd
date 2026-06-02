import { z } from 'zod';

export const agentStdConfigSchema = z.object({
  version: z.literal(1),
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
      dir: z.string().default('.agentstd/skills'),
    })
    .default({ dir: '.agentstd/skills' }),
  instructions: z
    .object({
      shared: z.string().optional(),
    })
    .default({}),
});

export type AgentStdConfig = z.infer<typeof agentStdConfigSchema>;
