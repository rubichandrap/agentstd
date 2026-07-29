# AgentStd

[![CI](https://github.com/rubichandrap/agentstd/actions/workflows/ci.yml/badge.svg)](https://github.com/rubichandrap/agentstd/actions/workflows/ci.yml)
[![license](https://img.shields.io/github/license/rubichandrap/agentstd.svg)](https://github.com/rubichandrap/agentstd/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![npm version](https://img.shields.io/npm/v/agentstd.svg)](https://www.npmjs.com/package/agentstd)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.20.0-brightgreen.svg)](https://nodejs.org/)

Standardize hooks, skills, instructions, MCP servers, permissions, and agents across AI coding agents.

Write your agent rules once. Sync them everywhere.

## What is AgentStd?

AgentStd gives your repository one source of truth for AI agent behavior. You write portable config once, then AgentStd compiles it into provider-native files such as `.claude/settings.json`, `.mcp.json`, `.codex/hooks.json`, and Codex `AGENTS.md`.

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

# Preview removing AgentStd (non-destructive)
agentstd uninstall --all --dry-run
```

## Commands

### `agentstd init`

Creates the base AgentStd project structure:

- `.agentstd.yaml` — project configuration
- `.agentstd/hooks/pretooluse.js` — pre-tool-use safety hook
- `.agents/skills/example-skill/SKILL.md` — example shared skill (`.agents/skills` is the source of truth)
- `.agentstd/instructions/shared.md` — shared instructions

In an interactive terminal, `init` prompts you to pick agent targets via a multiselect (Claude is preselected). Skip the prompt with `--no-interactive` or pre-select valid targets with a repeatable `-t/--target <id>`:

```bash
# Non-interactive, pre-select both adapters
agentstd init --no-interactive --target claude --target codex
```

Re-running `init` on an existing `.agentstd.yaml` is an **upgrade**, not an overwrite: it runs config migrations and backfills any newly-added default keys, writing a `.bak` backup first (comments are not preserved — the backup mitigates this). Your existing `targets` are preserved and you are never re-prompted.

- `--force` — reset an existing config to defaults (writes a `.bak` backup first).
- `--dry-run` — preview what an upgrade would change without writing.

### `agentstd init --global`

Seeds a **home-level** AgentStd config so a shared skill library lives across all your projects:

- `~/.agentstd.yaml` — home configuration (deep-merged under each project)
- `~/.agentstd/hooks/pretooluse.js` — home hook (shadowed by a project hook of the same name)
- `~/.agentstd/instructions/shared.md` — home shared instructions (shadowed by project instructions)
- `~/.agents/skills/` — home skill library (drop skills like Caveman here; they sync into every project)

`AGENTSTD_HOME` overrides the home location (useful for testing or non-standard `$HOME`). Re-running `init --global` upgrades an existing home config in place (same migration + backfill + `.bak` flow as project `init`); `--force` resets and `--dry-run` previews.

Run `agentstd sync` from `$HOME` to apply the home config to provider home folders. This is a global sync: Claude output goes to `~/.claude/*`, Codex output goes to `~/.codex/*`, and Codex shared instructions go to `~/.codex/AGENTS.md`.

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

- **Config**: project `./.agentstd.yaml` is deep-merged over `~/.agentstd.yaml`. Project scalars win; `targets` is replaced (not concatenated). Each layer's `version` is migrated to the current build's version independently; a config version newer than your installed AgentStd throws (upgrade AgentStd to resolve).
- **Skills**: union of `~/.agents/skills/` and `./.agents/skills/`. A project skill with the same id shadows the home one.
- **Hooks / instructions**: a project file fully replaces a home file by filename.
- **File-backed config values**: `instructions.shared` and each `agents[id].instructions` are read from the layer that owns them. A project sync that inherits a home-defined instruction or agent reads the source file from `~/.agentstd/...`, not `./.agentstd/...`. A project-defined `agents[id]` wins entirely (its `instructions` path is resolved against the project).
- **Missing source files**: when `instructions.shared` or `agents[id].instructions` points at a path that does not exist, AgentStd emits a warning (not an error) and writes the managed block or agent body with empty content so output stays consistent across runs.
- **No home config**: behaves as project-only (zero behavior change). Home skills are never pulled into a project that has no `~/.agentstd.yaml`, even though a `~/.agents/skills/` directory may exist.

### Project-only mode

Skip the home layer entirely (no `~/.agentstd.yaml` merge, no `~/.agents/skills/` pull, no home hooks/instructions) — useful for CI or hermetic repos:

- **Persistent**: set `projectOnly: true` in `.agentstd.yaml`.
- **One-off flag**: `agentstd sync --project-only` (forces ON), or `agentstd sync --no-project-only` (forces OFF, overrides config).
- Applies uniformly to `sync`, `doctor`/`check`, `status`, and `skills list/show`.
- Project-only controls input layering only. It does not change where provider files are written.

### `agentstd sync`

Reads `.agentstd.yaml` and syncs configuration to target agent folders.

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

# Apply the home config to provider home folders
cd ~
agentstd sync
```

Sync has two scopes:

- **Project sync**: run from a project directory. AgentStd reads `./.agentstd.yaml`, merges `~/.agentstd.yaml` underneath it by default, and writes provider files inside the project.
- **Global sync**: run from `$HOME` when `~/.agentstd.yaml` exists. AgentStd reads the home config only and writes provider files under provider home folders such as `~/.claude` and `~/.codex`.

For Claude, this:

- Copies all skills to `.claude/skills/`
- Updates `.claude/settings.json` with the PreToolUse hook
- Updates `.claude/settings.json` with portable permissions
- Writes MCP servers to `.mcp.json` under `agentstd:`-prefixed provider ids
- Writes AgentStd agents to `.claude/agents/`
- Merges with existing settings (never overwrites unrelated config)
- Removes stale AgentStd-owned hooks, permissions, MCP servers, and agent files when they are removed from `.agentstd.yaml`
- Is idempotent — running it multiple times produces the same result

For Codex, this:

- Uses `.agents/skills/` natively (no copy needed)
- In project sync, upserts shared instructions into root `AGENTS.md` using AgentStd managed markers
- In global sync, upserts shared instructions into `~/.codex/AGENTS.md`
- Writes hooks to `.codex/hooks.json`
- Writes MCP servers to `.codex/config.toml`
- Writes command permission rules to `.codex/rules/agentstd.rules`
- Writes AgentStd agents to `.codex/agents/`
- Removes stale AgentStd-owned hooks, managed instruction/config blocks, rules, and agent files when they are removed from `.agentstd.yaml`

Codex may require you to review/trust synced hooks with `/hooks` before they run. The default AgentStd hook blocks by exiting `2`; Codex and Claude treat that as an intentional blocking hook result.

If multiple targets are configured and the terminal is interactive, `agentstd sync` shows a multiselect with all targets preselected. In CI/non-interactive mode, `agentstd sync` syncs all configured targets without prompting.

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

Scope-aware:

- Run from a project: lists merged home + project skills (project shadows home by id) when a home config exists; lists project skills only when there is no `~/.agentstd.yaml`, or when `--project-only` is passed.
- Run from `$HOME` (`cd ~ && agentstd skills list`): lists home skills only (global scope).

`agentstd skills` also lists skills by default.

### `agentstd skills show <skillId>`

Shows a skill's full metadata and content, with its source (`home` or `project`). Resolution follows the same scope rules as `skills list` (project-only, no-home-config, or global). Use `--project-only` to restrict resolution to project skills only.

### `agentstd targets list`

Lists supported targets and their capability status.

`agentstd targets` also lists targets by default.

### `agentstd targets add` / `agentstd targets remove`

Add or remove a target from `.agentstd.yaml` without hand-editing the YAML. Validates the id against supported adapters (`claude`, `codex`); writes a `.bak` backup before mutating. `remove` refuses to delete the last configured target (use `agentstd uninstall` for a full tear-down). Use `--global` to mutate `~/.agentstd.yaml` instead.

When no target id is passed in an interactive terminal, `add` and `remove` prompt for a single target.

```bash
agentstd targets add codex        # add codex to the project config
agentstd targets remove claude    # remove claude (refuses if it's the last target)
agentstd targets add codex --global
```

Neither command auto-syncs — run `agentstd sync` afterward to apply, or `agentstd uninstall <id>` to clean a removed target's provider files.

### `agentstd uninstall`

Removes AgentStd from the current project (or the home layer with `--global`). It is the surgical inverse of `sync`: only AgentStd-managed provider entries are touched, and user-authored hooks, MCP servers, agents, and instructions are preserved.

What gets removed:

- **Provider artifacts** (via each adapter's `remove()`): agentstd hooks stripped from `.claude/settings.json` and `.codex/hooks.json`; `agentstd:`-prefixed MCP servers stripped from `.mcp.json`; managed `agentstd:start/end` blocks stripped from `AGENTS.md` and `.codex/config.toml`; `.codex/rules/agentstd.rules` deleted; configured agent files (`.claude/agents/<id>.md`, `.codex/agents/<id>.toml`) deleted; copied skill dirs removed from `.claude/skills/`. Files left empty by stripping are deleted.
- **`.agentstd.yaml`** — deleted when all configured targets are removed in this run (a `.bak` backup is written first).
- **`.agentstd/`** directory (hooks, instructions) — deleted under the same condition as `.agentstd.yaml`.

What is **kept**:

- `.agents/skills/` — your skill library is left in place. Pass `--purge-skills` to remove it too. In project scope this only purges the project skills directory; use `--global --purge-skills` to purge the configured home skills directory.
- `.agentstd.yaml` and `.agentstd/` — kept when uninstalling a subset of configured targets. Run `agentstd uninstall --all`, or remove the last remaining target, to also purge them.
- All user-authored provider content (hooks you wrote, MCP servers you added, agent files you authored).

```bash
# Uninstall a single target's artifacts (config kept when other targets remain;
# use --all to also purge config)
agentstd uninstall claude

# Uninstall everything (all configured targets) — also purges the config
agentstd uninstall --all

# Preview without changing anything
agentstd uninstall --all --dry-run

# Full nuke including the skills library
agentstd uninstall --all --purge-skills

# Purge the home layer instead of the project layer
agentstd uninstall --all --global

# Purge the home layer and its configured home skills directory
agentstd uninstall --all --global --purge-skills
```

`--project-only` skips the home layer; `--no-project-only` forces the merge when resolving which targets to uninstall. With no target arg and multiple configured targets in an interactive terminal, a multiselect is shown (all preselected).

### Update notifications

AgentStd checks `npm` for a newer published version at most once per 24 hours (cached at `~/.agentstd/.update-cache.json`) and prints a non-blocking hint to stderr when an update is available. The check never blocks startup or breaks execution.

Disable it by setting `AGENTSTD_NO_UPDATE_CHECK=1` in your environment. The check is also automatically suppressed in non-interactive (non-TTY) sessions and in tests.

## Config fields

AgentStd config is additive and versioned with a `version` field (currently `1`). Existing minimal configs continue to work: older `version` values are migrated to the current version in-memory at load time, so a stale on-disk config never breaks sync. A config version newer than your installed AgentStd throws — upgrade AgentStd to resolve.

Core fields:

- `targets` — target adapters to sync, currently `claude` and `codex`
- `hooks.preToolUse.command` — shared pre-tool-use command. The default project hook command is rendered provider-specifically so Claude resolves from `${CLAUDE_PROJECT_DIR}` and Codex resolves from the git repository root; custom commands are preserved exactly.
- `skills.dir` / `skills.homeDir` — project and home skill source directories
- `instructions.shared` — shared instruction file used by provider adapters

Umbrella config fields:

- `mcpServers` — portable MCP server definitions compiled to provider-native config
- `permissions.commands` — token-array command rules such as `[pnpm, test]`
- `permissions.files` — portable read/write file restrictions where supported
- `agents` — shared subagent definitions compiled to provider-native agent files

## Supported Targets & Feature Matrix

AgentStd currently supports **Claude Code** (`claude`) and **OpenAI Codex CLI** (`codex`).

| Feature       | Claude Code (`claude`) | OpenAI Codex CLI (`codex`) |
|---------------|-------------------------|----------------------------|
| **PreToolUse Hooks** | Native (`.claude/settings.json`) | Native (`.codex/hooks.json`) |
| **Skills** | Native copy (`.claude/skills/`) | Native (`.agents/skills/`) |
| **Instructions** | System prompts / settings | Native (`AGENTS.md` / `~/.codex/AGENTS.md`) |
| **MCP Servers** | Native (`.mcp.json`) | Native (`.codex/config.toml`) |
| **Command Permissions** | Native `Bash(...)` rules | Native (`.codex/rules/agentstd.rules`) |
| **File Permissions** | Native `Read(...)` & `Write(...)` | ⚠️ Unsupported by Codex rules |
| **Sub-agents** | Native (`.claude/agents/*.md`) | Native (`.codex/agents/*.toml`) |

### Target-Specific Behavior & Limitations

- **Codex CLI (`codex`)**:
  - **Skills Directory**: Codex natively reads `.agents/skills/`. If `skills.dir` in `.agentstd.yaml` is set to a custom directory (e.g. `my-skills`), AgentStd emits a warning during sync as custom skill directories are not copied for Codex.
  - **File Restrictions**: Codex `prefix_rule` configuration syntax only supports command pattern rules (`allow`, `prompt`, `forbidden`). File read/write restrictions (`permissions.files.denyRead` / `denyWrite`) are not supported by Codex rules syntax and are skipped during Codex sync.
  - **Instructions**: Project sync writes managed instruction blocks into root `AGENTS.md`; global sync writes managed blocks into `~/.codex/AGENTS.md`.
- **Claude Code (`claude`)**:
  - **Skills Directory**: Skills are synced into `.claude/skills/`.
  - **MCP Servers**: MCP server identifiers written to `.mcp.json` are prefixed with `agentstd:` (e.g. `agentstd:github`) so `agentstd uninstall` can safely identify and remove only AgentStd-managed entries without touching user-authored servers.

### Unsupported Adapters Notice

The following coding agents and tools are **not yet natively supported** as sync targets:
- **OpenCode** (`opencode`) — *In Progress / Planned*
- **Cursor** (`cursor`) — *Planned*
- **Windsurf** (`windsurf`) — *Planned*
- **Pi / CommandCode** (`pi`) — *Planned*
- **Aider** (`aider`) — *Planned*

If you are using these tools, you can still maintain your central rules in `.agentstd.yaml` and `.agents/skills/` while native compilation adapters are being developed.

## Safety guarantees

AgentStd is designed to be safe and predictable:

- **Source of truth**: `.agentstd` is the single source of truth; agent configs are derived
- **Never deletes user-authored files**: `sync` writes, updates, and removes only AgentStd-managed provider artifacts when config entries disappear (marked hooks, `agentstd:` MCP servers, managed blocks, generated agents/rules). `uninstall` removes only AgentStd-managed entries and deletes emptied files — user-authored content is always preserved. Project uninstall never purges the home skill library.
- **Preserves unknown settings**: Existing customization in agent configs is left intact
- **Idempotent**: Running `agentstd sync` multiple times produces the same result
- **No duplicate hooks**: AgentStd detects and avoids duplicating already-synced hooks
- **No duplicate skills**: Skills are compared and unchanged skills are skipped
- **Dry-run mode** (`agentstd sync --dry-run`): Preview all changes before applying
- **Check mode** (`agentstd sync --check`): Verify sync status in CI/CD pipelines

## Roadmap

- [ ] **OpenCode Adapter**: Native sync for OpenCode agent rules and settings
- [ ] **Cursor / Windsurf Adapters**: Support for IDE-based agent rule injection
- [ ] **Pi / CommandCode Adapter**: Native sync for Pi agent hooks and rules
- [ ] **Dynamic Policy Engine**: Policy-based hook rules with declarative rule matching
- [ ] **Adapter Plugin API**: Third-party adapter plugin registry for custom agent extensions

## License

MIT
