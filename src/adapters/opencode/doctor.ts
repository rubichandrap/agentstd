import { fileExists } from '../../core/fs';
import { openCodeMcpPath } from '../../core/paths';
import type { DoctorCheck, DoctorContext, DoctorResult } from '../../core/types';

export async function doctor(ctx: DoctorContext): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];
  const config = ctx.config;
  const outputRoot = ctx.outputRoot ?? ctx.projectRoot;

  if (Object.keys(config.mcpServers ?? {}).length > 0) {
    checks.push({
      label: '.opencode/mcp.json found',
      status: (await fileExists(openCodeMcpPath(outputRoot))) ? 'pass' : 'warn',
      message: 'Run: agentstd sync opencode',
    });
  }

  return { target: 'opencode', checks };
}
