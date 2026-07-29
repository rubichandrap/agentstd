import path from 'node:path';
import fs from 'fs-extra';
import YAML from 'yaml';
import type { AgentStdConfig } from '../../core/config';
import { agentsOf } from '../../core/config-defaults';
import { type ConfigPathSources, sourceRoot } from '../../core/config-merge';
import { fileExists } from '../../core/fs';
import { claudeAgentsDir } from '../../core/paths';
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
  const frontmatterData: Record<string, unknown> = {
    description,
    'agentstd-managed': true,
  };
  if (tools.length > 0) frontmatterData.tools = tools.join(', ');
  const frontmatter = YAML.stringify(frontmatterData).trim();
  return `---\n${frontmatter}\n---\n\n${body.trim()}\n`;
}
