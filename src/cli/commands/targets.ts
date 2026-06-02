export async function targetsListCmd(): Promise<void> {
  const targets = [
    {
      id: 'claude',
      preToolUse: 'native',
      skills: 'native',
      instructions: 'partial',
      status: 'supported',
    },
    {
      id: 'opencode',
      preToolUse: 'planned',
      skills: 'planned',
      instructions: 'planned',
      status: 'planned',
    },
    {
      id: 'commandcode',
      preToolUse: 'unknown',
      skills: 'unknown',
      instructions: 'unknown',
      status: 'planned',
    },
    {
      id: 'pi',
      preToolUse: 'unknown',
      skills: 'unknown',
      instructions: 'unknown',
      status: 'planned',
    },
  ];

  const headers = ['Target', 'PreToolUse', 'Skills', 'Instructions', 'Status'];

  const rows = targets.map((t) => [t.id, t.preToolUse, t.skills, t.instructions, t.status]);

  const colWidths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));

  const pad = (s: string, w: number) => s + ' '.repeat(w - s.length);

  console.log(
    pad(headers[0], colWidths[0] + 2) +
      pad(headers[1], colWidths[1] + 2) +
      pad(headers[2], colWidths[2] + 2) +
      pad(headers[3], colWidths[3] + 2) +
      headers[4],
  );
  for (const row of rows) {
    console.log(
      pad(row[0], colWidths[0] + 2) +
        pad(row[1], colWidths[1] + 2) +
        pad(row[2], colWidths[2] + 2) +
        pad(row[3], colWidths[3] + 2) +
        row[4],
    );
  }
}
