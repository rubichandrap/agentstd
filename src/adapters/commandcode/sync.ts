import { syncCommandCodeMcpServers } from './mcp';
import type { FileOperation, SyncContext, SyncResult } from '../../core/types';

export async function sync(ctx: SyncContext): Promise<SyncResult> {
  const changed: string[] = [];
  const warnings: string[] = [];
  const operations: FileOperation[] = [];
  const outputRoot = ctx.outputRoot ?? ctx.projectRoot;

  changed.push(
    ...(await syncCommandCodeMcpServers(outputRoot, ctx.config, operations, ctx.dryRun)),
  );

  return { target: 'commandcode', changed, warnings, operations };
}
