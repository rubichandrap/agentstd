import { fileExists } from '../../core/fs';
import { geminiSettingsPath } from '../../core/paths';
import type { DoctorCheck, DoctorContext, DoctorResult } from '../../core/types';

export async function doctor(ctx: DoctorContext): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];
  const config = ctx.config;
  const outputRoot = ctx.outputRoot ?? ctx.projectRoot;

  if (Object.keys(config.mcpServers ?? {}).length > 0) {
    checks.push({
      label: '.gemini/settings.json found',
      status: (await fileExists(geminiSettingsPath(outputRoot))) ? 'pass' : 'warn',
      message: 'Run: agentstd sync gemini',
    });
  }

  return { target: 'gemini', checks };
}
