import fs from 'fs-extra';
import type { AgentStdConfig } from '../../core/config';
import { fileExists, writeJson } from '../../core/fs';
import { compileClaudePermissions } from './permissions';

const AGENTSTD_HOOK_ID = 'agentstd-pretooluse';
export const DEFAULT_PROJECT_HOOK_COMMAND = 'node .agentstd/hooks/pretooluse.js';
const CLAUDE_PROJECT_DIR_PLACEHOLDER = '$' + '{CLAUDE_PROJECT_DIR}';
const CLAUDE_PROJECT_HOOK_COMMAND = `node "${CLAUDE_PROJECT_DIR_PLACEHOLDER}/.agentstd/hooks/pretooluse.js"`;

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
  permissions?: Record<string, string[]>;
  _agentstd?: {
    permissions?: Record<string, string[]>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

function buildAgentStdHook(config: AgentStdConfig): ClaudeHook {
  const hook: ClaudeHook = {
    matcher: 'Bash|Edit|Write|MultiEdit',
    hooks: [
      {
        type: 'command',
        command: claudeHookCommand(config.hooks.preToolUse?.command ?? ''),
      },
    ],
    _agentstd: AGENTSTD_HOOK_ID,
  };
  return hook;
}

function claudeHookCommand(command: string): string {
  return command === DEFAULT_PROJECT_HOOK_COMMAND ? CLAUDE_PROJECT_HOOK_COMMAND : command;
}

export { claudeHookCommand };

export function isAgentStdHook(hook: ClaudeHook, expectedCommand?: string): boolean {
  if (hook._agentstd === AGENTSTD_HOOK_ID) return true;
  if (expectedCommand === undefined) return false;
  const cmd = (hook.hooks?.[0] as ClaudeHookEntry | undefined)?.command ?? '';
  return cmd === expectedCommand;
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
  const finalSettings = computeFinalSettings(settings, config);
  await writeJson(settingsPath, finalSettings);
  return true;
}

export async function upsertClaudeSettings(
  settingsPath: string,
  config: AgentStdConfig,
): Promise<boolean> {
  const settings = await readSettings(settingsPath);
  const finalSettings = computeFinalSettings(settings, config);
  await writeJson(settingsPath, finalSettings);
  return true;
}

function computeFinalSettings(settings: ClaudeSettings, config: AgentStdConfig): ClaudeSettings {
  const computedHooks = computeFinalHooks(settings, config);
  const finalSettings: ClaudeSettings = {
    ...settings,
  };
  if (Object.keys(computedHooks).length > 0) {
    finalSettings.hooks = computedHooks;
  } else {
    delete finalSettings.hooks;
  }

  const agentStdPermissions = compileClaudePermissions(config);
  const userPermissions = subtractPermissions(
    settings.permissions,
    settings._agentstd?.permissions,
  );
  const merged = mergePermissions(userPermissions, agentStdPermissions);
  if (Object.keys(merged).length > 0) {
    finalSettings.permissions = merged;
  } else {
    delete finalSettings.permissions;
  }

  const metadata = computeAgentStdMetadata(settings._agentstd, agentStdPermissions);
  if (metadata) finalSettings._agentstd = metadata;
  else delete finalSettings._agentstd;

  return finalSettings;
}

function computeAgentStdMetadata(
  existing: ClaudeSettings['_agentstd'],
  permissions: Record<string, string[]>,
): ClaudeSettings['_agentstd'] | undefined {
  const next = { ...(existing ?? {}) };
  if (Object.keys(permissions).length > 0) {
    next.permissions = permissions;
  } else {
    delete next.permissions;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

function subtractPermissions(
  existing: Record<string, string[] | undefined> | undefined,
  agentStd: Record<string, string[]> | undefined,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, entries] of Object.entries(existing ?? {})) {
    const toSubtract = new Set(agentStd?.[key] ?? []);
    const kept: string[] = [];
    for (const entry of entries ?? []) {
      if (toSubtract.has(entry)) {
        toSubtract.delete(entry);
        continue;
      }
      kept.push(entry);
    }
    if (kept.length > 0) out[key] = kept;
  }
  return out;
}

function mergePermissions(
  existing: Record<string, string[] | undefined> | undefined,
  agentStd: Record<string, string[]>,
): Record<string, string[]> {
  // Union by entry for every list (allow/ask/deny). Earlier shallow spread
  // overwrote user allow arrays when AgentStd added an allow entry — here
  // both sides contribute to the final list. The remove() path subtracts
  // agentstd-owned entries from each list.
  const out: Record<string, string[]> = {};
  const seen = new Set<string>();
  const pushUnique = (key: string, list: string[] | undefined): void => {
    if (!list) return;
    for (const entry of list) {
      const tag = `${key}\u0000${entry}`;
      if (seen.has(tag)) continue;
      seen.add(tag);
      if (!out[key]) out[key] = [];
      out[key].push(entry);
    }
  };
  for (const key of Object.keys(existing ?? {})) {
    pushUnique(key, existing?.[key]);
  }
  for (const key of Object.keys(agentStd)) {
    pushUnique(key, agentStd[key]);
  }
  return out;
}

function computeFinalHooks(
  settings: ClaudeSettings,
  config: AgentStdConfig,
): Record<string, ClaudeHook[]> {
  const hooks: Record<string, ClaudeHook[]> = settings.hooks ?? {};
  const existingHooks = hooks.PreToolUse ?? [];

  // Pass the rendered command so the exact-match fallback catches hooks
  // written by older AgentStd versions that didn't preserve _agentstd.
  const expected = config.hooks.preToolUse
    ? claudeHookCommand(config.hooks.preToolUse.command ?? DEFAULT_PROJECT_HOOK_COMMAND)
    : undefined;
  const filtered = existingHooks.filter((hook) => !isAgentStdHook(hook, expected));

  if (config.hooks.preToolUse) {
    filtered.push(buildAgentStdHook(config));
  }

  const finalHooks: Record<string, ClaudeHook[]> = {};
  for (const key of Object.keys(hooks)) {
    if (key === 'PreToolUse') continue;
    finalHooks[key] = hooks[key];
  }
  if (filtered.length > 0) {
    finalHooks.PreToolUse = filtered;
  }

  return finalHooks;
}

export async function needsSettingsUpdate(
  settingsPath: string,
  config: AgentStdConfig,
): Promise<boolean> {
  const settings = await readSettings(settingsPath);
  const finalSettings = computeFinalSettings(settings, config);
  return JSON.stringify(settings) !== JSON.stringify(finalSettings);
}

export async function hasPreToolUseHookSynced(
  settingsPath: string,
  config: AgentStdConfig,
): Promise<boolean> {
  const settings = await readSettings(settingsPath);
  const hooks = settings.hooks?.PreToolUse ?? [];
  const expected = config.hooks.preToolUse
    ? claudeHookCommand(config.hooks.preToolUse.command ?? DEFAULT_PROJECT_HOOK_COMMAND)
    : undefined;
  return hooks.some((h) => isAgentStdHook(h, expected));
}
