import path from 'node:path';
import fs from 'fs-extra';
import { fileExists, readJsonIfExists, writeJson } from '../../core/fs';
import { removeManagedBlock } from '../../core/managed-text';
import {
  claudeAgentsDir,
  claudeMdPath,
  claudeSettingsPath,
  claudeSkillsDir,
  homeClaudeMdPath,
  homeRoot,
  mcpConfigPath,
} from '../../core/paths';
import { compileClaudePermissions } from './permissions';
import { listMergedSkills } from '../../core/skill';
import { resolveSkillSources } from '../../core/skill-resolve';
import type { FileOperation, RemoveContext, RemoveResult } from '../../core/types';
import {
  claudeHookCommand,
  DEFAULT_PROJECT_HOOK_COMMAND,
  isAgentStdHook,
  readSettings,
} from './settings';

const AGENTSTD_MCP_PREFIX = 'agentstd:';

interface SettingsShape {
  hooks?: Record<string, unknown[]>;
  permissions?: Record<string, string[]>;
  _agentstd?: {
    permissions?: Record<string, string[]>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export async function remove(ctx: RemoveContext): Promise<RemoveResult> {
  const removed: string[] = [];
  const warnings: string[] = [];
  const operations: FileOperation[] = [];
  const { projectRoot, config, dryRun } = ctx;
  const outputRoot = ctx.outputRoot ?? projectRoot;

  // .claude/settings.json — strip agentstd hooks and compiled permissions.
  const settingsPath = claudeSettingsPath(outputRoot);
  if (await fileExists(settingsPath)) {
    try {
      const settings = (await readSettings(settingsPath)) as SettingsShape;
      let changed = false;

      if (settings.hooks?.PreToolUse) {
        const existing = settings.hooks.PreToolUse as {
          hooks?: { command?: string }[];
          _agentstd?: string;
        }[];
        const expected = config.hooks.preToolUse
          ? claudeHookCommand(config.hooks.preToolUse.command ?? DEFAULT_PROJECT_HOOK_COMMAND)
          : undefined;
        const filtered = existing.filter((h) => !isAgentStdHook(h as never, expected));
        if (filtered.length !== existing.length) {
          if (filtered.length > 0) settings.hooks.PreToolUse = filtered as unknown[];
          else {
            delete settings.hooks.PreToolUse;
            if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
          }
          changed = true;
        }
      }

      const agentstdPerms = settings._agentstd?.permissions ?? compileClaudePermissions(config);
      const currentPerms = settings.permissions ?? {};
      const newPerms: Record<string, string[]> = {};
      let permsChanged = false;
      for (const [key, entries] of Object.entries(currentPerms)) {
        // Subtract exactly one copy per AgentStd entry so a user-authored
        // duplicate of an AgentStd entry survives uninstall.
        const toSubtract = new Set(agentstdPerms[key] ?? []);
        const kept: string[] = [];
        for (const entry of entries) {
          if (toSubtract.has(entry)) {
            toSubtract.delete(entry);
            continue;
          }
          kept.push(entry);
        }
        if (kept.length !== entries.length) permsChanged = true;
        if (kept.length > 0) newPerms[key] = kept;
      }
      if (permsChanged) {
        if (Object.keys(newPerms).length > 0) settings.permissions = newPerms;
        else delete settings.permissions;
        changed = true;
      }

      if (settings._agentstd) {
        delete settings._agentstd;
        changed = true;
      }

      if (changed) {
        operations.push({
          type: 'update-file',
          path: path.relative(outputRoot, settingsPath) || settingsPath,
        });
        if (!dryRun) {
          if (Object.keys(settings).length === 0) await fs.remove(settingsPath);
          else await writeJson(settingsPath, settings);
        }
        removed.push('.claude/settings.json');
      }
    } catch (err) {
      warnings.push(`Failed to clean Claude settings: ${(err as Error).message}`);
    }
  }

  // CLAUDE.md — remove the managed instructions block.
  const claudeMdFile =
    ctx.scope === 'global' ? homeClaudeMdPath(outputRoot) : claudeMdPath(outputRoot);
  const relativeClaudeMd = path.relative(outputRoot, claudeMdFile) || claudeMdFile;
  if (await fileExists(claudeMdFile)) {
    try {
      const current = await fs.readFile(claudeMdFile, 'utf8');
      const { text, changed } = removeManagedBlock(current, 'instructions');
      if (changed) {
        operations.push({
          type: 'update-file',
          path: relativeClaudeMd,
        });
        if (!dryRun) {
          if (text.trim().length === 0) await fs.remove(claudeMdFile);
          else await fs.writeFile(claudeMdFile, text);
        }
        removed.push(relativeClaudeMd);
      }
    } catch (err) {
      warnings.push(`Failed to clean ${relativeClaudeMd}: ${(err as Error).message}`);
    }
  }

  // .mcp.json — strip agentstd: prefixed servers.
  const mcpPath = mcpConfigPath(outputRoot);
  if (await fileExists(mcpPath)) {
    try {
      const current =
        (await readJsonIfExists<{ mcpServers?: Record<string, unknown> }>(mcpPath)) ?? {};
      const servers = current.mcpServers ?? {};
      const kept: Record<string, unknown> = {};
      let mcpChanged = false;
      for (const [name, server] of Object.entries(servers)) {
        if (name.startsWith(AGENTSTD_MCP_PREFIX)) {
          mcpChanged = true;
          continue;
        }
        kept[name] = server;
      }
      if (mcpChanged) {
        operations.push({
          type: 'update-file',
          path: path.relative(outputRoot, mcpPath) || mcpPath,
        });
        if (!dryRun) {
          if (Object.keys(kept).length === 0) await fs.remove(mcpPath);
          else await writeJson(mcpPath, { ...current, mcpServers: kept });
        }
        removed.push('.mcp.json');
      }
    } catch (err) {
      warnings.push(`Failed to clean .mcp.json: ${(err as Error).message}`);
    }
  }

  // .claude/agents/<id>.md for each configured agent.
  const agentsDir = claudeAgentsDir(outputRoot);
  for (const id of Object.keys(config.agents ?? {})) {
    const file = path.join(agentsDir, `${id}.md`);
    if (await fileExists(file)) {
      operations.push({
        type: 'remove-file',
        path: path.relative(outputRoot, file) || file,
      });
      if (!dryRun) await fs.remove(file);
      removed.push(`.claude/agents/${id}.md`);
    }
  }

  // .claude/skills/<dirName> for each merged skill.
  const homeRootResolved = ctx.homeRoot ?? homeRoot();
  const sources = resolveSkillSources(
    projectRoot,
    config,
    homeRootResolved,
    ctx.scope ?? 'project',
    ctx.hasHomeConfig ?? true,
  );
  const skills = await listMergedSkills(sources);
  const skillsDest = claudeSkillsDir(outputRoot);
  for (const skill of skills) {
    const dir = path.join(skillsDest, skill.dirName);
    if (await fileExists(dir)) {
      operations.push({
        type: 'remove-dir',
        path: path.relative(outputRoot, dir) || dir,
      });
      if (!dryRun) await fs.remove(dir);
      removed.push(`.claude/skills/${skill.dirName}`);
    }
  }

  return { target: 'claude', removed, warnings, operations };
}
