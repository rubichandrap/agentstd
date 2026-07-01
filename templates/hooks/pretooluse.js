#!/usr/bin/env node

const input = [];

process.stdin.on('data', (chunk) => input.push(chunk));
process.stdin.on('end', () => {
  const raw = Buffer.concat(input).toString('utf8');

  let event = {};
  try {
    event = raw ? JSON.parse(raw) : {};
  } catch {
    event = {};
  }

  const toolName = event.tool_name || event.toolName || '';
  const toolInput = event.tool_input || event.toolInput || {};
  const command = toolInput.command || toolInput.patch || '';
  const filePath = toolInput.file_path || toolInput.filePath || toolInput.path || '';

  const dangerousCommands = [
    'rm -rf',
    'DROP DATABASE',
    'TRUNCATE TABLE',
    'mkfs',
    'shutdown',
    'reboot',
  ];

  const protectedFiles = ['.env', '.env.local', '.env.production'];

  const isDangerousCommand =
    (toolName.toLowerCase().includes('bash') || toolName === 'apply_patch') &&
    dangerousCommands.some((pattern) => command.includes(pattern));

  const isProtectedFileEdit =
    ['Edit', 'Write', 'MultiEdit'].includes(toolName) &&
    protectedFiles.some((file) => filePath.endsWith(file));

  if (isDangerousCommand) {
    console.error('Blocked by AgentStd: dangerous command detected.');
    process.exit(2);
  }

  if (isProtectedFileEdit) {
    console.error('Blocked by AgentStd: protected environment file edit detected.');
    process.exit(2);
  }

  process.exit(0);
});
