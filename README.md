# AgentStd

Standardize hooks, skills, and shared instructions across AI coding agents.

AgentStd gives your repository one source of truth for AI agent behavior, then syncs it into agent-specific config folders such as `.claude`.

Write your agent rules once. Sync them everywhere.

## What problem does AgentStd solve?

When using multiple AI coding agents (Claude Code, OpenCode, CommandCode, Pi, etc.), each agent expects its own config folder and format. You end up duplicating the same hooks, skills, and instructions across different folders. AgentStd eliminates this duplication by centralizing your rules, then compiling them to each agent's native format.

## Installation

```bash
pnpm add -g agentstd
```

## Quick start

```bash
# Initialize AgentStd in your project
agentstd init

# Sync your configuration to all configured agents
agentstd sync

# Or sync to a specific agent
agentstd sync claude

# Check that everything is healthy
agentstd doctor
```

## Commands

### `agentstd init`

Creates the base AgentStd project structure:

- `.agentstd.yaml` — project configuration
- `.agentstd/hooks/pretooluse.js` — pre-tool-use safety hook
- `.agentstd/skills/example-skill/SKILL.md` — example shared skill
- `.agentstd/instructions/shared.md` — shared instructions

### `agentstd sync`

Reads `.agentstd.yaml` and syncs configuration to target agent's folder.

```bash
# Sync all configured targets
agentstd sync

# Sync only a specific target
agentstd sync claude
```

For Claude, this:

- Copies all skills to `.claude/skills/`
- Updates `.claude/settings.json` with the PreToolUse hook
- Merges with existing settings (never overwrites unrelated config)
- Is idempotent — running it multiple times produces the same result

### `agentstd doctor`

Checks the current project state and prints a readable report. Verifies:

- `.agentstd.yaml` exists and is valid
- Hook and skills directories exist
- Each target agent's config is correctly synced

### `agentstd skills list`

Lists all skills from your standard skill directory with name and description.

### `agentstd skills show <skillId>`

Shows a skill's full metadata and content.

### `agentstd targets list`

Lists supported targets and their capability status.

## Claude support

| Feature       | Status    |
|---------------|-----------|
| PreToolUse    | Native    |
| Skills        | Native    |
| Instructions  | Partial   |

The Claude adapter:

- Writes to `.claude/settings.json` with proper hook config
- Copies skill directories to `.claude/skills/`
- Preserves existing Claude settings and hooks
- Never overwrites unrelated configuration

## Roadmap

- OpenCode adapter
- CommandCode adapter
- Pi adapter
- Runtime skill discovery
- Policy-based hook rules
- Adapter plugin API
- Dry-run mode
- Config diff mode

## License

MIT
