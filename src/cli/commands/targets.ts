import { listAdapters } from '../../adapters';

export async function targetsListCmd(): Promise<void> {
  const supported = listAdapters().map((adapter) => ({
    id: adapter.id,
    preToolUse: adapter.capabilities.preToolUse,
    skills: adapter.capabilities.skills,
    instructions: adapter.capabilities.instructions,
    mcpServers: adapter.capabilities.mcpServers,
    permissions: adapter.capabilities.permissions,
    agents: adapter.capabilities.agents,
    status: 'supported',
  }));
  const planned = [
    {
      id: 'opencode',
      preToolUse: 'planned',
      skills: 'planned',
      instructions: 'planned',
      mcpServers: 'planned',
      permissions: 'planned',
      agents: 'planned',
      status: 'planned',
    },
    {
      id: 'commandcode',
      preToolUse: 'unknown',
      skills: 'unknown',
      instructions: 'unknown',
      mcpServers: 'unknown',
      permissions: 'unknown',
      agents: 'unknown',
      status: 'planned',
    },
    {
      id: 'pi',
      preToolUse: 'unknown',
      skills: 'unknown',
      instructions: 'unknown',
      mcpServers: 'unknown',
      permissions: 'unknown',
      agents: 'unknown',
      status: 'planned',
    },
  ];
  const targets = [...supported, ...planned];

  const headers = [
    'Target',
    'PreToolUse',
    'Skills',
    'Instructions',
    'MCP',
    'Permissions',
    'Agents',
    'Status',
  ];

  const rows = targets.map((t) => [
    t.id,
    t.preToolUse,
    t.skills,
    t.instructions,
    t.mcpServers,
    t.permissions,
    t.agents,
    t.status,
  ]);

  const colWidths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));

  const pad = (s: string, w: number) => s + ' '.repeat(w - s.length);

  console.log(
    pad(headers[0], colWidths[0] + 2) +
      pad(headers[1], colWidths[1] + 2) +
      pad(headers[2], colWidths[2] + 2) +
      pad(headers[3], colWidths[3] + 2) +
      pad(headers[4], colWidths[4] + 2) +
      pad(headers[5], colWidths[5] + 2) +
      pad(headers[6], colWidths[6] + 2) +
      headers[7],
  );
  for (const row of rows) {
    console.log(
      pad(row[0], colWidths[0] + 2) +
        pad(row[1], colWidths[1] + 2) +
        pad(row[2], colWidths[2] + 2) +
        pad(row[3], colWidths[3] + 2) +
        pad(row[4], colWidths[4] + 2) +
        pad(row[5], colWidths[5] + 2) +
        pad(row[6], colWidths[6] + 2) +
        row[7],
    );
  }
}
