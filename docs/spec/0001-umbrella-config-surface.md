# Specification: Umbrella Config Surface for Claude & Codex

## Problem Statement

AgentStd's core promise is "one source of truth for AI agent behavior, synced to every provider." The current architecture delivers this well for claude and codex in most areas, but two holes undermine the umbrella promise for the providers that matter most:

1. **MCP servers are all-or-nothing.** A server declared in `mcpServers` is compiled to *every* active target. There is no way to express "this server is for Claude only" — so users are forced to either sync a server where it is unwanted or duplicate the entry with a provider-specific name (`graphify-claude`, `graphify-codex`), which fragments the source of truth and breaks the umbrella promise.
2. **Shared instructions silently miss Claude.** `instructions.shared` is compiled only to Codex (`AGENTS.md`). The Claude adapter declares `instructions: 'partial'` but performs no instruction write at all — a user writing one shared instruction file gets it in Codex and never in Claude, a correctness gap in the tool's central value proposition.

## Solution

Add **Target Scoping** to umbrella config entries: an optional `targets` field on each MCP server declaring which provider adapters compile it, defaulting to all active targets. This replaces the duplicate-with-suffix workaround with a single declarative mechanism.

Add **Claude shared instructions support**: the Claude adapter compiles `instructions.shared` into a managed block in `CLAUDE.md` (project scope) or `~/.claude/CLAUDE.md` (global scope), mirroring the existing Codex `AGENTS.md` mechanism — including `pathSources` ownership resolution, stale-block removal on unset, `doctor` verification, and `uninstall` stripping.

## User Stories

1. As a user, I want every MCP server I declare in `mcpServers` to sync to every active target by default, so that the current behavior is preserved when I don't specify scoping.
2. As a user, I want to limit a specific MCP server to a subset of active targets (e.g. `targets: [claude]`), so that provider-specific servers stay out of providers that cannot or should not run them.
3. As a user, I want the `targets` filter to accept any registered adapter id, so that scoping works identically across claude, codex, and future targets.
4. As a user, I want a scoped-out server to be absent from that provider's compiled output, so that I never see servers I did not intend for that provider.
5. As a user, I want a server scoped back into a target to be compiled on the next sync, so that removing `targets` or extending the list restores it.
6. As a user, I want a server whose scoping removes it from a target to be cleaned out of that target's config on the next sync, so that stale scoped servers never linger.
7. As a user, I want `agentstd sync --dry-run` and `--check` to reflect target scoping accurately, so that CI gates and previews match the real sync.
8. As a user, I want `agentstd doctor`/`check` to pass for a target when its scoped servers match the declared `targets` filter, so that scoping does not create false drift alarms.
9. As a user, I want `agentstd uninstall` to clean scoped MCP servers from the providers that got them, so that removing AgentStd leaves no scoped servers behind.
10. As a user, I want the shared instructions I write in `instructions.shared` to be compiled into Claude's `CLAUDE.md`, so that both Claude and Codex receive the same shared instructions from one source file.
11. As a user, I want the Claude instruction block to be marked as AgentStd-managed, so that my own hand-written content in `CLAUDE.md` is preserved on sync.
12. As a user, I want removing `instructions.shared` to strip the AgentStd-managed block from `CLAUDE.md`, so that stale instructions never persist.
13. As a user, I want a project sync that inherits a home-defined `instructions.shared` to read the source from the home layer and write it to the project's `CLAUDE.md`, so that cross-layer ownership rules are respected.
14. As a user, I want `agentstd sync` from `$HOME` to write shared instructions to `~/.claude/CLAUDE.md`, so that global sync keeps Claude and Codex home configs in sync.
15. As a user, I want `agentstd doctor`/`check` to verify Claude's instruction block matches the source file, so that drift is detected before I notice it in my agent.
16. As a user, I want `agentstd uninstall` to strip the AgentStd-managed instruction block from `CLAUDE.md` without touching my own content, so that removing AgentStd leaves a clean file.
17. As a user, I want `agentstd status` to reflect the declared scope of my MCP servers, so that I can audit which providers receive which servers.
18. As a user, I want the config schema to validate `targets` values against the registered adapter ids, so that typos fail fast with a clear message instead of silently scoping nothing.

## Implementation Decisions

- **Schema**: add `targets: z.array(z.string()).optional()` to the `mcpServerSchema`. Absent (or empty) means "all active targets" — preserves existing behavior with zero config changes. Zod `union`/optional parsing keeps the field additive and backward-compatible.
- **Scoping is per-entry, not per-group**: the `targets` filter lives on each MCP server entry (and is designed to extend to `agents` and other umbrella groups later), not as a global per-provider map. This keeps one logical server declared once, with scoping as a per-entry concern.
- **One filter function**: add a single shared helper (e.g. `mcpServersForTarget(config, targetId)`) in the core config layer that both the claude and codex adapters (and their `doctor` checks) call. Every consumer filters through this one function so scoping semantics stay consistent and testable in one place.
- **Claude instructions module**: add a claude instructions module mirroring the existing codex instructions module — same managed-block id, same `readSharedInstructions`/`pathSources` ownership resolution, same missing-file warning behavior (warn + empty body rather than fail), same unset→strip logic. Target paths: `CLAUDE.md` in project scope, `~/.claude/CLAUDE.md` in global scope.
- **Claude capability declaration**: update the claude adapter's `instructions` capability from `'partial'` to `'native'` once the shared-instructions write lands, so `targets list` messaging and README matrix reflect reality.
- **`remove()`** for MCP needs no change: it already strips `agentstd:`-prefixed servers by name. Claude `remove()` gains an instruction-block strip via the new module.
- **Managed-block id reuse is safe**: claude writes to `CLAUDE.md`, codex to `AGENTS.md`/`~/.codex/AGENTS.md`; the same block id in different files does not collide.
- **README matrix**: update the claude "Instructions" row from "System prompts / settings" to native `CLAUDE.md`, and document the `targets` filter in the MCP config-field section.

## Testing Decisions

Good tests verify external behavior — what lands on disk and what a command reports — not private helper internals.

### Modules to Test

- **Config schema** (`config` tests): `targets` field validates adapter ids; absent/empty = all targets; invalid ids fail with a clear error.
- **Scoping filter** (core helper): a server scoped to `[claude]` appears for claude and not codex; unscoped appears for both; empty `targets` behaves like unscoped.
- **Claude sync**: `instructions.shared` writes a managed block into `CLAUDE.md`; user content preserved; removing `shared` strips the block; global scope writes `~/.claude/CLAUDE.md`; home-defined instruction file is read from the home layer.
- **Claude doctor**: reports pass when the block matches and drift when it does not.
- **Claude remove**: strips the managed block and removes the file when it becomes empty.
- **End-to-end sync** (existing integration tests): scoped servers land only in the intended providers; `--check` exit codes reflect scoping.

### Seams for Testing

1. **Adapter `sync()` seam (primary)**: feed a `SyncContext` with a config exercising scoping and shared instructions, assert the provider files on disk. Prior art: `tests/codex-adapter.test.ts`, `tests/sync-integration.test.ts`, `tests/settings.test.ts`.
2. **Schema seam**: parse `.agentstd.yaml` shapes through `agentStdConfigSchema`. Prior art: `tests/config.test.ts`, `tests/config-merge.test.ts`.
3. **`remove()` seam**: run adapter `remove()` against a synced temp project and assert scoped servers / instruction blocks are cleaned. Prior art: `tests/claude-remove.test.ts`, `tests/codex-remove.test.ts`.

## Out of Scope

- Per-target MCP **overrides** (different transport/command per provider). Explicitly deferred — see ADR `0001`. If a server genuinely differs per provider, the user duplicates the entry; `targets` scoping exists so the duplicate is not forced everywhere.
- Extending `targets` scoping to `permissions`, `hooks`, or `agents` groups. The mechanism is designed to extend, but this spec ships MCP-only scoping.
- Growing the gemini/opencode/commandcode adapters beyond MCP. The umbrella dream is acknowledged; this spec deepens claude and codex first.
- New provider adapters (cursor, windsurf, pi, aider).

## Further Notes

- Domain terminology follows [CONTEXT.md](../../CONTEXT.md); new terms added for this work: **Portable Config**, **Capability**, **Target Scoping**.
- The scoping decision is recorded in ADR `0001`.
