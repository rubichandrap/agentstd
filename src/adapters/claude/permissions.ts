import type { AgentStdConfig } from '../../core/config';
import { permissionsOf } from '../../core/config-defaults';

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

function removeEmptyPermissionLists(value: Record<string, string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, entries] of Object.entries(value)) {
    if (entries.length > 0) out[key] = entries;
  }
  return out;
}
