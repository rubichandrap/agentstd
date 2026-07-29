import { fileExists } from '../../core/fs';
import { commandCodeMcpPath } from '../../core/paths';
import type { DoctorCheck, DoctorContext, DoctorResult } from '../../core/types';

export async function doctor(ctx: DoctorContext): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];
  const config = ctx.config;
  const outputRoot = ctx.outputRoot ?? ctx.projectRoot;

  if (Object.keys(config.mcpServers ?? {}).length > 0) {
    checks.push({
      label: '.commandcode/mcp.json found',
      status: (await fileExists(commandCodeMcpPath(outputRoot))) ? 'pass' : 'warn',
      message: 'Run: agentstd sync commandcode',
    });
  }

  return { target: 'commandcode', checks };
}
