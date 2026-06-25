import fs from 'fs-extra';
import type { AgentStdConfig } from '../../core/config';
import { fileExists, writeJson } from '../../core/fs';

const AGENTSTD_HOOK_ID = 'agentstd-pretooluse';

interface ClaudeHook {
  matcher: string;
  hooks: ClaudeHookEntry[];
  _agentstd?: string;
}

interface ClaudeHookEntry {
  type: string;
  command: string;
}

interface ClaudeSettings {
  hooks?: Record<string, ClaudeHook[]>;
  [key: string]: unknown;
}

function buildAgentStdHook(config: AgentStdConfig): ClaudeHook {
  const hook: ClaudeHook = {
    matcher: 'Bash|Edit|Write|MultiEdit',
    hooks: [
      {
        type: 'command',
        command: config.hooks.preToolUse?.command ?? '',
      },
    ],
    _agentstd: AGENTSTD_HOOK_ID,
  };
  return hook;
}

function isAgentStdHook(hook: ClaudeHook): boolean {
  if (hook._agentstd === AGENTSTD_HOOK_ID) return true;
  const cmd = (hook.hooks?.[0] as ClaudeHookEntry | undefined)?.command ?? '';
  return cmd.includes('agentstd/hooks/pretooluse');
}

export async function readSettings(settingsPath: string): Promise<ClaudeSettings> {
  if (!(await fileExists(settingsPath))) return {};
  const raw = await fs.readFile(settingsPath, 'utf8');
  try {
    return JSON.parse(raw) as ClaudeSettings;
  } catch (err) {
    const msg = err instanceof SyntaxError ? err.message : String(err);
    throw new Error(`Invalid JSON in ${settingsPath}: ${msg}`);
  }
}

export async function upsertPreToolUseHook(
  settingsPath: string,
  config: AgentStdConfig,
): Promise<boolean> {
  const settings = await readSettings(settingsPath);
  const finalHooks = computeFinalHooks(settings, config);
  await writeJson(settingsPath, { ...settings, hooks: finalHooks });
  return true;
}

function computeFinalHooks(
  settings: ClaudeSettings,
  config: AgentStdConfig,
): Record<string, ClaudeHook[]> {
  const hooks: Record<string, ClaudeHook[]> = settings.hooks ?? {};
  const existingHooks = hooks.PreToolUse ?? [];

  const filtered = existingHooks.filter((h) => !isAgentStdHook(h));

  if (config.hooks.preToolUse) {
    const agentStdHook = buildAgentStdHook(config);
    filtered.push(agentStdHook);
  }

  const finalHooks: Record<string, ClaudeHook[]> = {};
  for (const key of Object.keys(hooks)) {
    if (key === 'PreToolUse') continue;
    finalHooks[key] = hooks[key].map((h) => {
      const { _agentstd, ...rest } = h;
      return rest;
    });
  }
  finalHooks.PreToolUse = filtered.map((h) => {
    const { _agentstd, ...rest } = h;
    return rest;
  });

  return finalHooks;
}

export async function needsSettingsUpdate(
  settingsPath: string,
  config: AgentStdConfig,
): Promise<boolean> {
  const settings = await readSettings(settingsPath);
  const finalHooks = computeFinalHooks(settings, config);
  const currentHooks = settings.hooks ?? {};
  return JSON.stringify(currentHooks) !== JSON.stringify(finalHooks);
}

export async function hasPreToolUseHookSynced(
  settingsPath: string,
  _config: AgentStdConfig,
): Promise<boolean> {
  const settings = await readSettings(settingsPath);
  const hooks = settings.hooks?.PreToolUse ?? [];
  return hooks.some((h) => isAgentStdHook(h));
}
