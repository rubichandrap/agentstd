import path from 'node:path';
import { fileExists } from '../../core/fs';
import {
  agentsMdPath,
  codexAgentStdRulesPath,
  codexAgentsDir,
  codexConfigPath,
  codexHooksPath,
} from '../../core/paths';
import type { DoctorCheck, DoctorContext, DoctorResult } from '../../core/types';
import { hasCodexPreToolUseHookSynced } from './hooks';
import { hasCodexInstructionsSynced } from './instructions';

export async function doctor(ctx: DoctorContext): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];
  const config = ctx.config;

  checks.push({
    label: 'Codex native skills directory',
    status: config.skills.dir === '.agents/skills' ? 'pass' : 'warn',
    message:
      config.skills.dir === '.agents/skills'
        ? undefined
        : `Codex reads .agents/skills natively; custom skills.dir "${config.skills.dir}" is not synced for Codex.`,
  });

  if (config.projectOnly) {
    checks.push({
      label: 'Project-only mode',
      status: 'warn',
      message:
        'AgentStd skips home-layer checks, but Codex may still read $HOME/.agents/skills natively.',
    });
  }

  if (config.instructions.shared) {
    const synced = await hasCodexInstructionsSynced(ctx.projectRoot, config);
    checks.push({
      label: 'AGENTS.md instructions synced',
      status: synced ? 'pass' : 'warn',
      message: synced ? undefined : `Run: agentstd sync codex (${agentsMdPath(ctx.projectRoot)})`,
    });
  }

  if (config.hooks.preToolUse) {
    const synced = await hasCodexPreToolUseHookSynced(codexHooksPath(ctx.projectRoot), config);
    checks.push({
      label: 'PreToolUse hook synced',
      status: synced ? 'pass' : 'warn',
      message: synced ? undefined : 'Run: agentstd sync codex',
    });
  }

  if (Object.keys(config.mcpServers ?? {}).length > 0) {
    checks.push({
      label: '.codex/config.toml found',
      status: (await fileExists(codexConfigPath(ctx.projectRoot))) ? 'pass' : 'warn',
      message: 'Run: agentstd sync codex',
    });
  }

  const hasCommandPermissions = Object.values(config.permissions?.commands ?? {}).some(
    (entries) => entries.length > 0,
  );
  if (hasCommandPermissions) {
    checks.push({
      label: 'Codex rules synced',
      status: (await fileExists(codexAgentStdRulesPath(ctx.projectRoot))) ? 'pass' : 'warn',
      message: 'Run: agentstd sync codex',
    });
  }

  if (Object.keys(config.agents ?? {}).length > 0) {
    checks.push({
      label: 'Codex agents directory found',
      status: (await fileExists(codexAgentsDir(ctx.projectRoot))) ? 'pass' : 'warn',
      message: `Run: agentstd sync codex (${path.relative(ctx.projectRoot, codexAgentsDir(ctx.projectRoot))})`,
    });
  }

  return {
    target: 'codex',
    checks,
  };
}
