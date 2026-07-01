import path from 'node:path';
import fs from 'fs-extra';
import { compileClaudePermissions } from '../../core/provider-config';
import { fileExists, readJsonIfExists, writeJson } from '../../core/fs';
import {
  claudeAgentsDir,
  claudeSettingsPath,
  claudeSkillsDir,
  homeRoot,
  mcpConfigPath,
} from '../../core/paths';
import { listMergedSkills } from '../../core/skill';
import { resolveSkillSources } from '../../core/skill-resolve';
import type { FileOperation, RemoveContext, RemoveResult } from '../../core/types';
import { isAgentStdHook, readSettings } from './settings';

const AGENTSTD_MCP_PREFIX = 'agentstd:';

interface SettingsShape {
  hooks?: Record<string, unknown[]>;
  permissions?: Record<string, string[]>;
  [key: string]: unknown;
}

export async function remove(ctx: RemoveContext): Promise<RemoveResult> {
  const removed: string[] = [];
  const warnings: string[] = [];
  const operations: FileOperation[] = [];
  const { projectRoot, config, dryRun } = ctx;

  // .claude/settings.json — strip agentstd hooks and compiled permissions.
  const settingsPath = claudeSettingsPath(projectRoot);
  if (await fileExists(settingsPath)) {
    try {
      const settings = (await readSettings(settingsPath)) as SettingsShape;
      let changed = false;

      if (settings.hooks?.PreToolUse) {
        const existing = settings.hooks.PreToolUse as { hooks?: { command?: string }[]; _agentstd?: string }[];
        const filtered = existing.filter((h) => !isAgentStdHook(h as never));
        if (filtered.length !== existing.length) {
          if (filtered.length > 0) settings.hooks.PreToolUse = filtered as unknown[];
          else {
            delete settings.hooks.PreToolUse;
            if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
          }
          changed = true;
        }
      }

      const agentstdPerms = compileClaudePermissions(config);
      const currentPerms = settings.permissions ?? {};
      const newPerms: Record<string, string[]> = {};
      let permsChanged = false;
      for (const [key, entries] of Object.entries(currentPerms)) {
        const toRemove = new Set(agentstdPerms[key] ?? []);
        const kept = entries.filter((e) => !toRemove.has(e));
        if (kept.length !== entries.length) permsChanged = true;
        if (kept.length > 0) newPerms[key] = kept;
      }
      if (permsChanged) {
        if (Object.keys(newPerms).length > 0) settings.permissions = newPerms;
        else delete settings.permissions;
        changed = true;
      }

      if (changed) {
        operations.push({
          type: 'update-file',
          path: path.relative(projectRoot, settingsPath) || settingsPath,
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

  // .mcp.json — strip agentstd: prefixed servers.
  const mcpPath = mcpConfigPath(projectRoot);
  if (await fileExists(mcpPath)) {
    try {
      const current = (await readJsonIfExists<{ mcpServers?: Record<string, unknown> }>(mcpPath)) ?? {};
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
          path: path.relative(projectRoot, mcpPath) || mcpPath,
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
  const agentsDir = claudeAgentsDir(projectRoot);
  for (const id of Object.keys(config.agents)) {
    const file = path.join(agentsDir, `${id}.md`);
    if (await fileExists(file)) {
      operations.push({
        type: 'remove-file',
        path: path.relative(projectRoot, file) || file,
      });
      if (!dryRun) await fs.remove(file);
      removed.push(`.claude/agents/${id}.md`);
    }
  }

  // .claude/skills/<dirName> for each merged skill.
  const homeRootResolved = ctx.homeRoot ?? homeRoot();
  const sources = resolveSkillSources(projectRoot, config, homeRootResolved);
  const skills = await listMergedSkills(sources);
  const skillsDest = claudeSkillsDir(projectRoot);
  for (const skill of skills) {
    const dir = path.join(skillsDest, skill.dirName);
    if (await fileExists(dir)) {
      operations.push({
        type: 'remove-dir',
        path: path.relative(projectRoot, dir) || dir,
      });
      if (!dryRun) await fs.remove(dir);
      removed.push(`.claude/skills/${skill.dirName}`);
    }
  }

  return { target: 'claude', removed, warnings, operations };
}
