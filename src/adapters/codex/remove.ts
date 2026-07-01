import path from 'node:path';
import fs from 'fs-extra';
import { fileExists, writeJson } from '../../core/fs';
import { removeManagedBlock } from '../../core/managed-text';
import {
  agentsMdPath,
  codexAgentStdRulesPath,
  codexAgentsDir,
  codexConfigPath,
  codexHooksPath,
} from '../../core/paths';
import type { FileOperation, RemoveContext, RemoveResult } from '../../core/types';
import { isAgentStdHook, readCodexHooks } from './hooks';

interface HooksConfig {
  hooks?: Record<string, unknown[]>;
  [key: string]: unknown;
}

export async function remove(ctx: RemoveContext): Promise<RemoveResult> {
  const removed: string[] = [];
  const warnings: string[] = [];
  const operations: FileOperation[] = [];
  const { projectRoot, dryRun } = ctx;

  // AGENTS.md — remove the managed instructions block.
  const agentsMd = agentsMdPath(projectRoot);
  if (await fileExists(agentsMd)) {
    try {
      const current = await fs.readFile(agentsMd, 'utf8');
      const { text, changed } = removeManagedBlock(current, 'instructions');
      if (changed) {
        operations.push({
          type: 'update-file',
          path: path.relative(projectRoot, agentsMd) || agentsMd,
        });
        if (!dryRun) {
          if (text.trim().length === 0) await fs.remove(agentsMd);
          else await fs.writeFile(agentsMd, text);
        }
        removed.push('AGENTS.md');
      }
    } catch (err) {
      warnings.push(`Failed to clean AGENTS.md: ${(err as Error).message}`);
    }
  }

  // .codex/hooks.json — strip agentstd hooks.
  const hooksPath = codexHooksPath(projectRoot);
  if (await fileExists(hooksPath)) {
    try {
      const current = (await readCodexHooks(hooksPath)) as HooksConfig;
      const hooks = current.hooks ?? {};
      const newHooks: Record<string, unknown[]> = {};
      let hooksChanged = false;
      for (const [key, entries] of Object.entries(hooks)) {
        const filtered = (entries as { hooks?: { command?: string }[]; _agentstd?: string }[]).filter(
          (h) => !isAgentStdHook(h as never),
        );
        if (filtered.length !== entries.length) hooksChanged = true;
        if (filtered.length > 0) newHooks[key] = filtered;
      }
      if (hooksChanged) {
        operations.push({
          type: 'update-file',
          path: path.relative(projectRoot, hooksPath) || hooksPath,
        });
        if (!dryRun) {
          const out: HooksConfig = { ...current };
          if (Object.keys(newHooks).length > 0) out.hooks = newHooks;
          else delete out.hooks;
          if (Object.keys(out).length === 0) await fs.remove(hooksPath);
          else await writeJson(hooksPath, out);
        }
        removed.push('.codex/hooks.json');
      }
    } catch (err) {
      warnings.push(`Failed to clean .codex/hooks.json: ${(err as Error).message}`);
    }
  }

  // .codex/config.toml — remove the managed codex-config block.
  const configPath = codexConfigPath(projectRoot);
  if (await fileExists(configPath)) {
    try {
      const current = await fs.readFile(configPath, 'utf8');
      const { text, changed } = removeManagedBlock(current, 'codex-config', { commentStyle: 'hash' });
      if (changed) {
        operations.push({
          type: 'update-file',
          path: path.relative(projectRoot, configPath) || configPath,
        });
        if (!dryRun) {
          if (text.trim().length === 0) await fs.remove(configPath);
          else await fs.writeFile(configPath, text);
        }
        removed.push('.codex/config.toml');
      }
    } catch (err) {
      warnings.push(`Failed to clean .codex/config.toml: ${(err as Error).message}`);
    }
  }

  // .codex/rules/agentstd.rules — delete.
  const rulesPath = codexAgentStdRulesPath(projectRoot);
  if (await fileExists(rulesPath)) {
    operations.push({
      type: 'remove-file',
      path: path.relative(projectRoot, rulesPath) || rulesPath,
    });
    if (!dryRun) await fs.remove(rulesPath);
    removed.push('.codex/rules/agentstd.rules');
  }

  // .codex/agents/<id>.toml for each configured agent.
  const agentsDir = codexAgentsDir(projectRoot);
  for (const id of Object.keys(ctx.config.agents)) {
    const file = path.join(agentsDir, `${id}.toml`);
    if (await fileExists(file)) {
      operations.push({
        type: 'remove-file',
        path: path.relative(projectRoot, file) || file,
      });
      if (!dryRun) await fs.remove(file);
      removed.push(`.codex/agents/${id}.toml`);
    }
  }

  return { target: 'codex', removed, warnings, operations };
}
