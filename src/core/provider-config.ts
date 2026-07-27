import path from 'node:path';
import fs from 'fs-extra';
import type { AgentStdConfig } from './config';
import { agentsOf, mcpServersOf, permissionsOf } from './config-defaults';
import { type ConfigPathSources, sourceRoot } from './config-merge';
import { fileExists, readJsonIfExists, writeJson } from './fs';
import { removeManagedBlock, renderTomlTable, upsertManagedBlock } from './managed-text';
import {
  claudeAgentsDir,
  codexAgentStdRulesPath,
  codexAgentsDir,
  codexConfigPath,
  mcpConfigPath,
} from './paths';
import type { FileOperation } from './types';

const AGENTSTD_MCP_SERVER_PREFIX = 'agentstd:';

interface MpcJson {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
}

export async function syncClaudeMcpServers(
  outputRoot: string,
  config: AgentStdConfig,
  operations: FileOperation[],
  dryRun?: boolean,
): Promise<string[]> {
  const serverEntries = Object.entries(mcpServersOf(config));
  const filePath = mcpConfigPath(outputRoot);
  const exists = await fileExists(filePath);
  if (!exists && serverEntries.length === 0) return [];

  // Read before pushing the op so --check sees no drift on a clean sync.
  const current = exists ? ((await readJsonIfExists<MpcJson>(filePath)) ?? {}) : {};
  const currentServers = current.mcpServers ?? {};
  const nextServers: Record<string, unknown> = {};

  for (const [name, server] of Object.entries(currentServers)) {
    if (!name.startsWith(AGENTSTD_MCP_SERVER_PREFIX)) {
      nextServers[name] = server;
    }
  }

  for (const [name, server] of serverEntries) {
    nextServers[agentStdMcpServerName(name)] = removeEmptyValues({
      command: server.command,
      args: server.args,
      url: server.url,
      env: server.env,
    });
  }

  if (mcpServersEqual(currentServers, nextServers)) {
    operations.push({
      type: 'skip',
      description: '.mcp.json',
      reason: 'MCP servers already synced',
    });
    return [];
  }

  const nextMcpJson = buildNextMcpJson(current, nextServers);
  operations.push({
    type: nextMcpJson.removeFile ? 'remove-file' : exists ? 'update-file' : 'create-file',
    path: path.relative(outputRoot, filePath) || filePath,
  });

  if (dryRun) return ['.mcp.json'];

  if (nextMcpJson.removeFile) await fs.remove(filePath);
  else await writeJson(filePath, nextMcpJson.data);
  return ['.mcp.json'];
}

function buildNextMcpJson(
  current: MpcJson,
  nextServers: Record<string, unknown>,
): { data: MpcJson; removeFile: false } | { removeFile: true } {
  if (Object.keys(nextServers).length > 0) {
    return { data: { ...current, mcpServers: nextServers }, removeFile: false };
  }
  const { mcpServers: _mcpServers, ...rest } = current;
  if (Object.keys(rest).length === 0) return { removeFile: true };
  return { data: rest, removeFile: false };
}

function mcpServersEqual(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.hasOwn(b, key)) return false;
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) return false;
  }
  return true;
}

function agentStdMcpServerName(name: string): string {
  return name.startsWith(AGENTSTD_MCP_SERVER_PREFIX)
    ? name
    : `${AGENTSTD_MCP_SERVER_PREFIX}${name}`;
}

async function readAgentInstructions(
  agentInstructions: string,
  id: string,
  pathSources: ConfigPathSources | undefined,
  projectRoot: string,
  homeRoot: string,
): Promise<{ content: string; missing: boolean; sourcePath: string }> {
  const layer = pathSources?.agents?.[id];
  const base = sourceRoot(layer, projectRoot, homeRoot);
  const sourcePath = path.resolve(base, agentInstructions);
  const missing = !(await fileExists(sourcePath));
  const content = missing ? '' : await fs.readFile(sourcePath, 'utf8');
  return { content, missing, sourcePath };
}

export async function syncClaudeAgents(
  projectRoot: string,
  outputRoot: string,
  config: AgentStdConfig,
  operations: FileOperation[],
  dryRun?: boolean,
  homeRoot?: string,
  pathSources?: ConfigPathSources,
): Promise<{ changed: string[]; warnings: string[] }> {
  const changed: string[] = [];
  const warnings: string[] = [];
  const resolvedHomeRoot = homeRoot ?? projectRoot;
  for (const [id, agent] of Object.entries(agentsOf(config))) {
    const { content, missing, sourcePath } = await readAgentInstructions(
      agent.instructions,
      id,
      pathSources,
      projectRoot,
      resolvedHomeRoot,
    );
    if (missing) warnings.push(`agent "${id}" instructions file not found: ${sourcePath}`);
    const targetPath = path.join(claudeAgentsDir(outputRoot), `${id}.md`);
    const targetExists = await fileExists(targetPath);
    const next = renderClaudeAgent(agent.description, agent.tools, content);
    const current = targetExists ? await fs.readFile(targetPath, 'utf8') : null;

    if (current === next) {
      operations.push({ type: 'skip', description: targetPath, reason: `agent ${id} unchanged` });
      continue;
    }

    operations.push({
      type: targetExists ? 'update-file' : 'create-file',
      path: path.relative(outputRoot, targetPath) || targetPath,
    });
    if (!dryRun) {
      await fs.ensureDir(path.dirname(targetPath));
      await fs.writeFile(targetPath, next);
    }
    changed.push(path.join('.claude', 'agents', `${id}.md`));
  }
  const removed = await removeStaleAgentFiles(
    claudeAgentsDir(outputRoot),
    Object.keys(agentsOf(config)),
    '.md',
    outputRoot,
    operations,
    dryRun,
  );
  changed.push(...removed.map((id) => path.join('.claude', 'agents', `${id}.md`)));
  return { changed, warnings };
}

export function compileClaudePermissions(config: AgentStdConfig): Record<string, string[]> {
  const permissions = permissionsOf(config);
  const allow = permissions.commands.allow.map((pattern) => `Bash(${pattern.join(' ')})`);
  const ask = permissions.commands.prompt.map((pattern) => `Bash(${pattern.join(' ')})`);
  const deny = [
    ...permissions.commands.deny.map((pattern) => `Bash(${pattern.join(' ')})`),
    ...permissions.files.denyRead.map((pattern) => `Read(${pattern})`),
    ...permissions.files.denyWrite.map((pattern) => `Write(${pattern})`),
  ];
  return removeEmptyPermissionLists({ allow, ask, deny });
}

export async function syncCodexConfigToml(
  outputRoot: string,
  config: AgentStdConfig,
  operations: FileOperation[],
  dryRun?: boolean,
): Promise<string[]> {
  const blocks: string[] = [];
  for (const [name, server] of Object.entries(mcpServersOf(config))) {
    blocks.push(
      renderTomlTable(
        `mcp_servers.${name}`,
        removeEmptyValues({
          command: server.command,
          args: server.args,
          url: server.url,
        }),
      ),
    );
  }

  const filePath = codexConfigPath(outputRoot);
  const current = (await fs.readFile(filePath, 'utf8').catch(() => '')) as string;
  if (blocks.length === 0) {
    const { text, changed } = removeManagedBlock(current, 'codex-config', {
      commentStyle: 'hash',
    });
    if (!changed) return [];
    operations.push({
      type: text.trim().length === 0 ? 'remove-file' : 'update-file',
      path: path.relative(outputRoot, filePath) || filePath,
    });
    if (!dryRun) {
      if (text.trim().length === 0) await fs.remove(filePath);
      else await fs.writeFile(filePath, text);
    }
    return ['.codex/config.toml'];
  }

  const { text, changed } = upsertManagedBlock(current, 'codex-config', blocks.join('\n\n'), {
    commentStyle: 'hash',
  });
  if (!changed) {
    operations.push({
      type: 'skip',
      description: '.codex/config.toml',
      reason: 'Codex config already synced',
    });
    return [];
  }

  operations.push({
    type: (await fileExists(filePath)) ? 'update-file' : 'create-file',
    path: path.relative(outputRoot, filePath) || filePath,
  });
  if (!dryRun) {
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, text);
  }
  return ['.codex/config.toml'];
}

export async function syncCodexRules(
  outputRoot: string,
  config: AgentStdConfig,
  operations: FileOperation[],
  dryRun?: boolean,
): Promise<string[]> {
  const rules = renderCodexRules(config);
  const filePath = codexAgentStdRulesPath(outputRoot);
  const current = await fs.readFile(filePath, 'utf8').catch(() => null);
  if (!rules) {
    if (current === null) return [];
    operations.push({
      type: 'remove-file',
      path: path.relative(outputRoot, filePath) || filePath,
    });
    if (!dryRun) await fs.remove(filePath);
    return ['.codex/rules/agentstd.rules'];
  }

  if (current === rules) {
    operations.push({
      type: 'skip',
      description: '.codex/rules/agentstd.rules',
      reason: 'Codex rules already synced',
    });
    return [];
  }

  operations.push({
    type: current === null ? 'create-file' : 'update-file',
    path: path.relative(outputRoot, filePath) || filePath,
  });
  if (!dryRun) {
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, rules);
  }
  return ['.codex/rules/agentstd.rules'];
}

export async function syncCodexAgents(
  projectRoot: string,
  outputRoot: string,
  config: AgentStdConfig,
  operations: FileOperation[],
  dryRun?: boolean,
  homeRoot?: string,
  pathSources?: ConfigPathSources,
): Promise<{ changed: string[]; warnings: string[] }> {
  const changed: string[] = [];
  const warnings: string[] = [];
  const resolvedHomeRoot = homeRoot ?? projectRoot;
  for (const [id, agent] of Object.entries(agentsOf(config))) {
    const { content, missing, sourcePath } = await readAgentInstructions(
      agent.instructions,
      id,
      pathSources,
      projectRoot,
      resolvedHomeRoot,
    );
    if (missing) warnings.push(`agent "${id}" instructions file not found: ${sourcePath}`);
    const filePath = path.join(codexAgentsDir(outputRoot), `${id}.toml`);
    const next = renderCodexAgent(agent.description, content, agent.tools);
    const current = await fs.readFile(filePath, 'utf8').catch(() => null);

    if (current === next) {
      operations.push({
        type: 'skip',
        description: filePath,
        reason: `Codex agent ${id} unchanged`,
      });
      continue;
    }

    operations.push({
      type: current === null ? 'create-file' : 'update-file',
      path: path.relative(outputRoot, filePath) || filePath,
    });
    if (!dryRun) {
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, next);
    }
    changed.push(path.join('.codex', 'agents', `${id}.toml`));
  }
  const removed = await removeStaleAgentFiles(
    codexAgentsDir(outputRoot),
    Object.keys(agentsOf(config)),
    '.toml',
    outputRoot,
    operations,
    dryRun,
  );
  changed.push(...removed.map((id) => path.join('.codex', 'agents', `${id}.toml`)));
  return { changed, warnings };
}

async function removeStaleAgentFiles(
  agentsDir: string,
  activeAgentIds: string[],
  extension: string,
  outputRoot: string,
  operations: FileOperation[],
  dryRun?: boolean,
): Promise<string[]> {
  const active = new Set(activeAgentIds.map((id) => `${id}${extension}`));
  const entries = await fs.readdir(agentsDir, { withFileTypes: true }).catch(() => []);
  const removed: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(extension) || active.has(entry.name)) continue;
    const filePath = path.join(agentsDir, entry.name);
    const content = await fs.readFile(filePath, 'utf8').catch(() => '');
    if (!isAgentStdAgentFile(content)) continue;
    operations.push({
      type: 'remove-file',
      path: path.relative(outputRoot, filePath) || filePath,
    });
    if (!dryRun) await fs.remove(filePath);
    removed.push(path.basename(entry.name, extension));
  }
  return removed;
}

function isAgentStdAgentFile(content: string): boolean {
  return content.includes('agentstd_managed = true') || content.includes('agentstd-managed: true');
}

function renderClaudeAgent(description: string, tools: string[], body: string): string {
  const lines = ['---', `description: ${description}`, 'agentstd-managed: true'];
  if (tools.length > 0) lines.push(`tools: ${tools.join(', ')}`);
  lines.push('---', '', body.trim(), '');
  return lines.join('\n');
}

function renderCodexAgent(description: string, instructions: string, tools: string[]): string {
  const values: Record<string, unknown> = {
    agentstd_managed: true,
    description,
    developer_instructions: instructions.trim(),
  };
  if (tools.length > 0) values.tools = tools;
  return `${renderTomlTable('agent', values)}\n`;
}

function renderCodexRules(config: AgentStdConfig): string {
  const permissions = permissionsOf(config);
  const lines = [
    '# Generated by AgentStd. Edit .agentstd.yaml instead.',
    '',
    ...permissions.commands.allow.map((pattern) => renderPrefixRule(pattern, 'allow')),
    ...permissions.commands.prompt.map((pattern) => renderPrefixRule(pattern, 'prompt')),
    ...permissions.commands.deny.map((pattern) => renderPrefixRule(pattern, 'forbidden')),
  ];
  const content = lines.join('\n').trim();
  return content === '# Generated by AgentStd. Edit .agentstd.yaml instead.' ? '' : `${content}\n`;
}

function renderPrefixRule(pattern: string[], decision: string): string {
  const renderedPattern = `[${pattern.map((part) => JSON.stringify(part)).join(', ')}]`;
  return `prefix_rule(pattern = ${renderedPattern}, decision = ${JSON.stringify(decision)})\n`;
}

function removeEmptyValues<T extends Record<string, unknown>>(value: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, entry] of Object.entries(value)) {
    const isEmptyArray = Array.isArray(entry) && entry.length === 0;
    const isEmptyObject =
      typeof entry === 'object' &&
      entry !== null &&
      !Array.isArray(entry) &&
      Object.keys(entry).length === 0;
    if (entry !== undefined && !isEmptyArray && !isEmptyObject) {
      out[key as keyof T] = entry as T[keyof T];
    }
  }
  return out;
}

function removeEmptyPermissionLists(value: Record<string, string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, entries] of Object.entries(value)) {
    if (entries.length > 0) out[key] = entries;
  }
  return out;
}
