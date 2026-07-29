import path from 'node:path';
import fs from 'fs-extra';
import type { AgentStdConfig } from '../../core/config';
import { agentsOf } from '../../core/config-defaults';
import { type ConfigPathSources, sourceRoot } from '../../core/config-merge';
import { fileExists } from '../../core/fs';
import { renderTomlTable } from '../../core/managed-text';
import { codexAgentsDir } from '../../core/paths';
import type { FileOperation } from '../../core/types';

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

function renderCodexAgent(description: string, instructions: string, tools: string[]): string {
  const values: Record<string, unknown> = {
    agentstd_managed: true,
    description,
    developer_instructions: instructions.trim(),
  };
  if (tools.length > 0) values.tools = tools;
  return `${renderTomlTable('agent', values)}\n`;
}
