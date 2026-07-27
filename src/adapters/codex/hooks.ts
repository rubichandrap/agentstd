import fs from 'fs-extra';
import type { AgentStdConfig } from '../../core/config';
import { fileExists, writeJson } from '../../core/fs';

const AGENTSTD_HOOK_ID = 'agentstd-pretooluse';
const DEFAULT_PROJECT_HOOK_COMMAND = 'node .agentstd/hooks/pretooluse.js';
const CODEX_PROJECT_HOOK_COMMAND =
  'node "$(git rev-parse --show-toplevel)/.agentstd/hooks/pretooluse.js"';

interface CodexHookEntry {
  type: string;
  command: string;
  statusMessage?: string;
}

interface CodexHook {
  matcher?: string;
  hooks: CodexHookEntry[];
  _agentstd?: string;
}

interface CodexHooksConfig {
  hooks?: Record<string, CodexHook[]>;
  [key: string]: unknown;
}

export async function readCodexHooks(hooksPath: string): Promise<CodexHooksConfig> {
  if (!(await fileExists(hooksPath))) return {};
  const raw = await fs.readFile(hooksPath, 'utf8');
  try {
    return JSON.parse(raw) as CodexHooksConfig;
  } catch (err) {
    const msg = err instanceof SyntaxError ? err.message : String(err);
    throw new Error(`Invalid JSON in ${hooksPath}: ${msg}`);
  }
}

export async function upsertCodexPreToolUseHook(
  hooksPath: string,
  config: AgentStdConfig,
): Promise<void> {
  const current = await readCodexHooks(hooksPath);
  const hooks = current.hooks ?? {};
  const existing = hooks.PreToolUse ?? [];

  const expected = config.hooks.preToolUse
    ? codexHookCommand(config.hooks.preToolUse.command)
    : undefined;
  const filtered = existing.filter((hook) => !isAgentStdHook(hook, expected));

  if (config.hooks.preToolUse) {
    filtered.push({
      matcher: 'Bash|apply_patch|Edit|Write',
      hooks: [
        {
          type: 'command',
          command: codexHookCommand(config.hooks.preToolUse.command),
          statusMessage: 'Checking AgentStd policy',
        },
      ],
      _agentstd: AGENTSTD_HOOK_ID,
    });
  }

  const finalHooks: Record<string, CodexHook[]> = {};
  for (const key of Object.keys(hooks)) {
    if (key === 'PreToolUse') continue;
    finalHooks[key] = hooks[key];
  }
  finalHooks.PreToolUse = filtered;
  await writeJson(hooksPath, { ...current, hooks: finalHooks });
}

export async function removeCodexPreToolUseHook(
  hooksPath: string,
  dryRun?: boolean,
): Promise<{ changed: boolean; removeFile: boolean }> {
  const current = await readCodexHooks(hooksPath);
  const hooks = current.hooks ?? {};
  const finalHooks: Record<string, CodexHook[]> = {};
  let changed = false;

  for (const [key, entries] of Object.entries(hooks)) {
    const filtered = entries.filter((hook) => !isAgentStdHook(hook));
    if (filtered.length !== entries.length) changed = true;
    if (filtered.length > 0) finalHooks[key] = filtered;
  }

  if (!changed) return { changed: false, removeFile: false };

  const next: CodexHooksConfig = { ...current };
  if (Object.keys(finalHooks).length > 0) next.hooks = finalHooks;
  else delete next.hooks;
  const removeFile = Object.keys(next).length === 0;

  if (!dryRun) {
    if (removeFile) await fs.remove(hooksPath);
    else await writeJson(hooksPath, next);
  }
  return { changed: true, removeFile };
}

export async function needsCodexHookUpdate(
  hooksPath: string,
  config: AgentStdConfig,
): Promise<boolean> {
  const current = await readCodexHooks(hooksPath);
  const hooks = current.hooks ?? {};
  const existing = hooks.PreToolUse ?? [];
  if (!config.hooks.preToolUse) return false;
  const expected = codexHookCommand(config.hooks.preToolUse.command);
  return !existing.some((hook) => isAgentStdHook(hook, expected));
}

export async function hasCodexPreToolUseHookSynced(
  hooksPath: string,
  config: AgentStdConfig,
): Promise<boolean> {
  if (!config.hooks.preToolUse) return true;
  const current = await readCodexHooks(hooksPath);
  const hooks = current.hooks?.PreToolUse ?? [];
  const expected = codexHookCommand(config.hooks.preToolUse.command);
  return hooks.some((hook) => isAgentStdHook(hook, expected));
}

export function isAgentStdHook(hook: CodexHook, expectedCommand?: string): boolean {
  if (hook._agentstd === AGENTSTD_HOOK_ID) return true;
  if (expectedCommand === undefined) return false;
  return hook.hooks.some((entry) => entry.command === expectedCommand);
}

function codexHookCommand(command: string): string {
  return command === DEFAULT_PROJECT_HOOK_COMMAND ? CODEX_PROJECT_HOOK_COMMAND : command;
}

export { codexHookCommand };
