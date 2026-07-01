import fs from 'fs-extra';
import type { AgentStdConfig } from '../../core/config';
import { fileExists, writeJson } from '../../core/fs';

const AGENTSTD_HOOK_ID = 'agentstd-pretooluse';

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
  const filtered = existing.filter((hook) => !isAgentStdHook(hook));

  if (config.hooks.preToolUse) {
    filtered.push({
      matcher: 'Bash|apply_patch|Edit|Write',
      hooks: [
        {
          type: 'command',
          command: config.hooks.preToolUse.command,
          statusMessage: 'Checking AgentStd policy',
        },
      ],
      _agentstd: AGENTSTD_HOOK_ID,
    });
  }

  const finalHooks: Record<string, CodexHook[]> = {};
  for (const key of Object.keys(hooks)) {
    if (key === 'PreToolUse') continue;
    finalHooks[key] = hooks[key].map(removeAgentStdMarker);
  }
  finalHooks.PreToolUse = filtered.map(removeAgentStdMarker);
  await writeJson(hooksPath, { ...current, hooks: finalHooks });
}

export async function needsCodexHookUpdate(
  hooksPath: string,
  config: AgentStdConfig,
): Promise<boolean> {
  const current = await readCodexHooks(hooksPath);
  const hooks = current.hooks ?? {};
  const existing = hooks.PreToolUse ?? [];
  const commands = existing
    .filter(isAgentStdHook)
    .flatMap((hook) => hook.hooks.map((entry) => entry.command));
  return config.hooks.preToolUse ? !commands.includes(config.hooks.preToolUse.command) : false;
}

export async function hasCodexPreToolUseHookSynced(
  hooksPath: string,
  config: AgentStdConfig,
): Promise<boolean> {
  if (!config.hooks.preToolUse) return true;
  const current = await readCodexHooks(hooksPath);
  const hooks = current.hooks?.PreToolUse ?? [];
  return hooks.some((hook) =>
    hook.hooks.some((entry) => entry.command === config.hooks.preToolUse?.command),
  );
}

export function isAgentStdHook(hook: CodexHook): boolean {
  if (hook._agentstd === AGENTSTD_HOOK_ID) return true;
  return hook.hooks.some((entry) => entry.command.includes('agentstd/hooks/pretooluse'));
}

function removeAgentStdMarker(hook: CodexHook): CodexHook {
  const { _agentstd, ...rest } = hook;
  return rest;
}
