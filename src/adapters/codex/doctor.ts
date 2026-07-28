import path from 'node:path';
import { fileExists } from '../../core/fs';
import {
  agentsMdPath,
  codexAgentStdRulesPath,
  codexAgentsDir,
  codexAgentsMdPath,
  codexConfigPath,
  codexHooksPath,
} from '../../core/paths';
import type { DoctorCheck, DoctorContext, DoctorResult } from '../../core/types';
import { hasCodexPreToolUseHookSynced } from './hooks';
import { hasCodexInstructionsSynced } from './instructions';

export async function doctor(ctx: DoctorContext): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];
  const config = ctx.config;
  const outputRoot = ctx.outputRoot ?? ctx.projectRoot;
  const scope = ctx.scope ?? 'project';
  const instructionsPath =
    scope === 'global' ? codexAgentsMdPath(outputRoot) : agentsMdPath(outputRoot);

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
    const synced = await hasCodexInstructionsSynced(
      ctx.projectRoot,
      outputRoot,
      config,
      scope,
      ctx.homeRoot,
      ctx.pathSources,
    );
    checks.push({
      label: `${path.relative(outputRoot, instructionsPath) || instructionsPath} instructions synced`,
      status: synced ? 'pass' : 'warn',
      message: synced ? undefined : `Run: agentstd sync codex (${instructionsPath})`,
    });
  }

  if (config.hooks.preToolUse) {
    const synced = await hasCodexPreToolUseHookSynced(codexHooksPath(outputRoot), config);
    checks.push({
      label: 'PreToolUse hook synced',
      status: synced ? 'pass' : 'warn',
      message: synced ? undefined : 'Run: agentstd sync codex',
    });
  }

  if (Object.keys(config.mcpServers ?? {}).length > 0) {
    checks.push({
      label: '.codex/config.toml found',
      status: (await fileExists(codexConfigPath(outputRoot))) ? 'pass' : 'warn',
      message: 'Run: agentstd sync codex',
    });
  }

  const hasCommandPermissions = Object.values(config.permissions?.commands ?? {}).some(
    (entries) => entries.length > 0,
  );
  if (hasCommandPermissions) {
    checks.push({
      label: 'Codex rules synced',
      status: (await fileExists(codexAgentStdRulesPath(outputRoot))) ? 'pass' : 'warn',
      message: 'Run: agentstd sync codex',
    });
  }

  const hasFilePermissions =
    (config.permissions?.files?.denyRead?.length ?? 0) > 0 ||
    (config.permissions?.files?.denyWrite?.length ?? 0) > 0;
  if (hasFilePermissions) {
    checks.push({
      label: 'Codex file permissions support',
      status: 'warn',
      message:
        'Codex rules do not support file permissions (denyRead/denyWrite); file restrictions are skipped for codex target.',
    });
  }

  if (Object.keys(config.agents ?? {}).length > 0) {
    checks.push({
      label: 'Codex agents directory found',
      status: (await fileExists(codexAgentsDir(outputRoot))) ? 'pass' : 'warn',
      message: `Run: agentstd sync codex (${path.relative(outputRoot, codexAgentsDir(outputRoot))})`,
    });
  }

  return {
    target: 'codex',
    checks,
  };
}
