# AgentStd

[![CI](https://github.com/rubichandrap/agentstd/actions/workflows/ci.yml/badge.svg)](https://github.com/rubichandrap/agentstd/actions/workflows/ci.yml)
[![license](https://img.shields.io/github/license/rubichandrap/agentstd.svg)](https://github.com/rubichandrap/agentstd/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![npm version](https://img.shields.io/npm/v/agentstd.svg)](https://www.npmjs.com/package/agentstd)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.20.0-brightgreen.svg)](https://nodejs.org/)

Standardize hooks, skills, instructions, MCP servers, permissions, and agents across AI coding agents.

Write your agent rules once. Sync them everywhere.

## What is AgentStd?

AgentStd gives your repository one source of truth for AI agent behavior. You write portable config once, then AgentStd compiles it into provider-native files such as `.claude/settings.json`, `.mcp.json`, `.codex/hooks.json`, and `AGENTS.md`.

## Why AgentStd?

When using multiple AI coding agents (Claude Code, Codex, OpenCode, CommandCode, Pi, etc.), each agent expects its own config folder and format. You end up duplicating the same hooks, skills, instructions, MCP servers, permissions, and subagent definitions across different folders. AgentStd eliminates this duplication by centralizing your rules, then compiling them to each agent's native format.

## Installation

[![npm version](https://img.shields.io/npm/v/agentstd.svg)](https://www.npmjs.com/package/agentstd)

```bash
pnpm add -g agentstd

# or
npm install -g agentstd
```

Package on npm: <https://www.npmjs.com/package/agentstd>

### From source

```bash
git clone https://github.com/rubichandrap/agentstd.git
cd agentstd
pnpm install
pnpm build
npm install -g .
```

## Quick start

```bash
# Initialize AgentStd in your project
agentstd init

# Preview what would change
agentstd sync --dry-run

# Apply changes
agentstd sync

# Inspect what AgentStd sees
agentstd status

# Verify everything is healthy
agentstd check
```

## Commands

### `agentstd init`

Creates the base AgentStd project structure:

- `.agentstd.yaml` — project configuration
- `.agentstd/hooks/pretooluse.js` — pre-tool-use safety hook
- `.agents/skills/example-skill/SKILL.md` — example shared skill (`.agents/skills` is the source of truth)
- `.agentstd/instructions/shared.md` — shared instructions

### `agentstd init --global`

Seeds a **home-level** AgentStd config so a shared skill library lives across all your projects:

- `~/.agentstd.yaml` — home configuration (deep-merged under each project)
- `~/.agentstd/hooks/pretooluse.js` — home hook (shadowed by a project hook of the same name)
- `~/.agents/skills/` — home skill library (drop skills like Caveman here; they sync into every project)

`AGENTSTD_HOME` overrides the home location (useful for testing or non-standard `$HOME`).

## Home and project layers

AgentStd layers home and project sources exactly like Claude (`~/.claude` + `.claude`) and OpenCode (`~/.config/opencode` + `.opencode`):

```
~/.agentstd.yaml            home config (shared defaults, deep-merged under each project)
~/.agentstd/hooks/          home hooks (shadowed by a project hook with the same filename)
~/.agentstd/instructions/   home instructions (shadowed by project)
~/.agents/skills/           home skill library (shadowed by a project skill with the same id)

./.agentstd.yaml            project config (overrides home)
./.agentstd/hooks/          project hooks (replace home by filename)
./.agentstd/instructions/   project instructions (replace home by filename)
./.agents/skills/           project skills (source of truth; override home by id)
```

Merge rules:

- **Config**: project `./.agentstd.yaml` is deep-merged over `~/.agentstd.yaml`. Project scalars win; `targets` is replaced (not concatenated); `version` must match across both.
- **Skills**: union of `~/.agents/skills/` and `./.agents/skills/`. A project skill with the same id shadows the home one.
- **Hooks / instructions**: a project file fully replaces a home file by filename.
- **No home config**: behaves as project-only (zero behavior change).

### Project-only mode

Skip the home layer entirely (no `~/.agentstd.yaml` merge, no `~/.agents/skills/` pull, no home hooks/instructions) — useful for CI or hermetic repos:

- **Persistent**: set `projectOnly: true` in `.agentstd.yaml`.
- **One-off flag**: `agentstd sync --project-only` (forces ON), or `agentstd sync --no-project-only` (forces OFF, overrides config).
- Applies uniformly to `sync`, `doctor`/`check`, `status`, and `skills list/show`.

### `agentstd sync`

Reads `.agentstd.yaml` and syncs configuration to target agent's folder.

```bash
# Sync all configured targets
agentstd sync

# Sync all configured targets without an interactive prompt
agentstd sync --all

# Sync only a specific target
agentstd sync claude
agentstd sync codex

# Preview changes without writing files
agentstd sync --dry-run

# Check if project is fully synced (exit code 1 if changes needed)
agentstd sync --check

# Skip the home layer (~/.agentstd.yaml + ~/.agents/skills/)
agentstd sync --project-only

# Force home merge (overrides projectOnly: true in config)
agentstd sync --no-project-only
```

For Claude, this:

- Copies all skills to `.claude/skills/`
- Updates `.claude/settings.json` with the PreToolUse hook
- Updates `.claude/settings.json` with portable permissions
- Writes MCP servers to `.mcp.json`
- Writes AgentStd agents to `.claude/agents/`
- Merges with existing settings (never overwrites unrelated config)
- Is idempotent — running it multiple times produces the same result

For Codex, this:

- Uses `.agents/skills/` natively (no copy needed)
- Upserts shared instructions into `AGENTS.md` using AgentStd managed markers
- Writes hooks to `.codex/hooks.json`
- Writes MCP servers to `.codex/config.toml`
- Writes command permission rules to `.codex/rules/agentstd.rules`
- Writes AgentStd agents to `.codex/agents/`

If multiple targets are configured and the terminal is interactive, `agentstd sync` asks which target to sync. In CI/non-interactive mode, `agentstd sync` keeps the current behavior and syncs all configured targets.

### `agentstd doctor`

Checks the current project state and prints a readable report. Verifies:

- `.agentstd.yaml` exists and is valid
- Hook and skills directories exist (project + home, unless `--project-only`)
- Each target agent's config is correctly synced
- Copied/managed skills and provider config are not stale

`--project-only` hides the Home section and skips `~/.agentstd.yaml` checks.

### `agentstd check`

Friendly alias for `agentstd doctor`.

### `agentstd status`

Shows a fast summary of what AgentStd sees in the current project:

- config validity and active mode (`project-only` or merged home + project)
- configured targets
- project/home sources
- skill counts
- configured hooks, instructions, MCP servers, permissions, and agents

`status` does not inspect provider output files. Use `agentstd check` for health checks and drift warnings.

### `agentstd skills list`

Lists all skills with name, description, and a `[home]`/`[project]` source tag. Use `--project-only` to list only project skills (no home library).

`agentstd skills` also lists skills by default.

### `agentstd skills show <skillId>`

Shows a skill's full metadata and content, with its source (`home` or `project`). Use `--project-only` to restrict resolution to project skills only.

### `agentstd targets list`

Lists supported targets and their capability status.

`agentstd targets` also lists targets by default.

## Config fields

AgentStd config is additive and versioned with `version: 1`. Existing minimal configs continue to work.

Core fields:

- `targets` — target adapters to sync, currently `claude` and `codex`
- `hooks.preToolUse.command` — shared pre-tool-use command
- `skills.dir` / `skills.homeDir` — project and home skill source directories
- `instructions.shared` — shared instruction file used by provider adapters

Umbrella config fields:

- `mcpServers` — portable MCP server definitions compiled to provider-native config
- `permissions.commands` — token-array command rules such as `[pnpm, test]`
- `permissions.files` — portable read/write file restrictions where supported
- `agents` — shared subagent definitions compiled to provider-native agent files

## Supported Targets

AgentStd currently supports Claude Code and Codex.

| Feature       | Claude Code | Codex |
|---------------|-------------|-------|
| PreToolUse    | Native      | Native |
| Skills        | Native copy | Native `.agents/skills` |
| Instructions  | Partial     | Native `AGENTS.md` |
| MCP servers   | Native `.mcp.json` | Native `.codex/config.toml` |
| Permissions   | Partial     | Partial |
| Agents        | Native `.claude/agents` | Native `.codex/agents` |

Claude skills are copied into `.claude/skills/`. Codex reads `.agents/skills/` directly, so custom `skills.dir` values are not copied for Codex.

Adapters preserve existing provider-owned settings and only replace AgentStd-managed entries or marked blocks.

## Safety guarantees

AgentStd is designed to be safe and predictable:

- **Source of truth**: `.agentstd` is the single source of truth; agent configs are derived
- **Never deletes user files**: Only writes and updates agent-specific config
- **Preserves unknown settings**: Existing customization in agent configs is left intact
- **Idempotent**: Running `agentstd sync` multiple times produces the same result
- **No duplicate hooks**: AgentStd detects and avoids duplicating already-synced hooks
- **No duplicate skills**: Skills are compared and unchanged skills are skipped
- **Dry-run mode** (`agentstd sync --dry-run`): Preview all changes before applying
- **Check mode** (`agentstd sync --check`): Verify sync status in CI/CD pipelines

## Roadmap

- OpenCode adapter
- CommandCode adapter
- Pi adapter
- Runtime skill discovery
- Policy-based hook rules
- Adapter plugin API

## License

MIT
