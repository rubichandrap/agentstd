import path from 'node:path';
import fs from 'fs-extra';
import type { AgentStdConfig } from './config';
import { agentsOf, mcpServersOf, permissionsOf } from './config-defaults';
import { fileExists, readJsonIfExists, writeJson } from './fs';
import { renderTomlTable, upsertManagedBlock } from './managed-text';
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
  projectRoot: string,
  config: AgentStdConfig,
  operations: FileOperation[],
  dryRun?: boolean,
): Promise<string[]> {
  const serverEntries = Object.entries(mcpServersOf(config));
  if (serverEntries.length === 0) return [];

  const filePath = mcpConfigPath(projectRoot);
  const exists = await fileExists(filePath);
  operations.push({
    type: exists ? 'update-file' : 'create-file',
    path: path.relative(projectRoot, filePath) || filePath,
  });

  if (dryRun) return ['.mcp.json'];

  const current = (await readJsonIfExists<MpcJson>(filePath)) ?? {};
  const currentServers = current.mcpServers ?? {};
  const mcpServers: Record<string, unknown> = {};

  for (const [name, server] of Object.entries(currentServers)) {
    if (!name.startsWith(AGENTSTD_MCP_SERVER_PREFIX)) {
      mcpServers[name] = server;
    }
  }

  for (const [name, server] of serverEntries) {
    mcpServers[name] = removeEmptyValues({
      command: server.command,
      args: server.args,
      url: server.url,
      env: server.env,
    });
  }

  await writeJson(filePath, { ...current, mcpServers });
  return ['.mcp.json'];
}

export async function syncClaudeAgents(
  projectRoot: string,
  config: AgentStdConfig,
  operations: FileOperation[],
  dryRun?: boolean,
): Promise<string[]> {
  const changed: string[] = [];
  for (const [id, agent] of Object.entries(agentsOf(config))) {
    const sourcePath = path.resolve(projectRoot, agent.instructions);
    const content = await fs.readFile(sourcePath, 'utf8').catch(() => '');
    const targetPath = path.join(claudeAgentsDir(projectRoot), `${id}.md`);
    const targetExists = await fileExists(targetPath);
    const next = renderClaudeAgent(agent.description, agent.tools, content);
    const current = targetExists ? await fs.readFile(targetPath, 'utf8') : null;

    if (current === next) {
      operations.push({ type: 'skip', description: targetPath, reason: `agent ${id} unchanged` });
      continue;
    }

    operations.push({
      type: targetExists ? 'update-file' : 'create-file',
      path: path.relative(projectRoot, targetPath) || targetPath,
    });
    if (!dryRun) {
      await fs.ensureDir(path.dirname(targetPath));
      await fs.writeFile(targetPath, next);
    }
    changed.push(path.join('.claude', 'agents', `${id}.md`));
  }
  return changed;
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
  projectRoot: string,
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

  if (blocks.length === 0) return [];

  const filePath = codexConfigPath(projectRoot);
  const current = (await fs.readFile(filePath, 'utf8').catch(() => '')) as string;
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
    path: path.relative(projectRoot, filePath) || filePath,
  });
  if (!dryRun) {
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, text);
  }
  return ['.codex/config.toml'];
}

export async function syncCodexRules(
  projectRoot: string,
  config: AgentStdConfig,
  operations: FileOperation[],
  dryRun?: boolean,
): Promise<string[]> {
  const rules = renderCodexRules(config);
  if (!rules) return [];

  const filePath = codexAgentStdRulesPath(projectRoot);
  const current = await fs.readFile(filePath, 'utf8').catch(() => null);
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
    path: path.relative(projectRoot, filePath) || filePath,
  });
  if (!dryRun) {
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, rules);
  }
  return ['.codex/rules/agentstd.rules'];
}

export async function syncCodexAgents(
  projectRoot: string,
  config: AgentStdConfig,
  operations: FileOperation[],
  dryRun?: boolean,
): Promise<string[]> {
  const changed: string[] = [];
  for (const [id, agent] of Object.entries(agentsOf(config))) {
    const sourcePath = path.resolve(projectRoot, agent.instructions);
    const content = await fs.readFile(sourcePath, 'utf8').catch(() => '');
    const filePath = path.join(codexAgentsDir(projectRoot), `${id}.toml`);
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
      path: path.relative(projectRoot, filePath) || filePath,
    });
    if (!dryRun) {
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, next);
    }
    changed.push(path.join('.codex', 'agents', `${id}.toml`));
  }
  return changed;
}

function renderClaudeAgent(description: string, tools: string[], body: string): string {
  const lines = ['---', `description: ${description}`];
  if (tools.length > 0) lines.push(`tools: ${tools.join(', ')}`);
  lines.push('---', '', body.trim(), '');
  return lines.join('\n');
}

function renderCodexAgent(description: string, instructions: string, tools: string[]): string {
  const values: Record<string, unknown> = {
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
