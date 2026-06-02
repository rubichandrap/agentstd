import type { AgentStdConfig } from '../../core/config';
import { readJsonIfExists, writeJson } from '../../core/fs';

const AGENTSTD_HOOK_ID = 'agentstd-pretooluse';

interface ClaudeHook {
  matcher: string;
  hooks: ClaudeHookEntry[];
}

type ClaudeHookWithMeta = ClaudeHook & { _agentstd?: string };

interface ClaudeHookEntry {
  type: string;
  command: string;
}

interface ClaudeSettings {
  hooks?: Record<string, ClaudeHook[]>;
  [key: string]: unknown;
}

function buildAgentStdHook(config: AgentStdConfig): ClaudeHook {
  return {
    matcher: 'Bash|Edit|Write|MultiEdit',
    hooks: [
      {
        type: 'command',
        command: config.hooks.preToolUse?.command ?? '',
      },
    ],
  };
}

function markAsAgentStd(hook: ClaudeHook): ClaudeHook {
  // copy hook structure to an object we can annotate without breaking merge
  const tagged: ClaudeHook & { _agentstd?: string } = { ...hook };
  tagged._agentstd = AGENTSTD_HOOK_ID;
  return tagged;
}

function isAgentStdHook(hook: ClaudeHook): boolean {
  const cmd = (hook.hooks?.[0] as ClaudeHookEntry | undefined)?.command ?? '';
  return cmd.includes('agentstd/hooks/pretooluse');
}

export async function readSettings(settingsPath: string): Promise<ClaudeSettings> {
  return (await readJsonIfExists<ClaudeSettings>(settingsPath)) ?? {};
}

export async function upsertPreToolUseHook(
  settingsPath: string,
  config: AgentStdConfig,
): Promise<boolean> {
  const settings = await readSettings(settingsPath);
  const hooks: Record<string, ClaudeHook[]> = settings.hooks ?? {};

  const existingHooks = hooks.PreToolUse ?? [];

  // remove any existing agentstd hooks
  const filtered = existingHooks.filter((h) => !isAgentStdHook(h));

  // add the current agentstd hook if preToolUse is configured
  if (config.hooks.preToolUse) {
    const agentStdHook = buildAgentStdHook(config);
    filtered.push(markAsAgentStd(agentStdHook));
  }

  const finalHooks: Record<string, ClaudeHook[]> = {};
  for (const key of Object.keys(hooks)) {
    if (key === 'PreToolUse') continue;
    // strip _agentstd before writing
    finalHooks[key] = hooks[key].map((h) => {
      const { _agentstd, ...rest } = h as ClaudeHookWithMeta;
      return rest;
    });
  }
  finalHooks.PreToolUse = filtered.map((h) => {
    const { _agentstd, ...rest } = h as ClaudeHookWithMeta;
    return rest;
  });

  await writeJson(settingsPath, { ...settings, hooks: finalHooks });
  return true;
}

export async function hasPreToolUseHookSynced(
  settingsPath: string,
  _config: AgentStdConfig,
): Promise<boolean> {
  const settings = await readSettings(settingsPath);
  const hooks = settings.hooks?.PreToolUse ?? [];
  return hooks.some((h) => isAgentStdHook(h));
}
