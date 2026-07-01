# Memory

## Project Overview
See @README.md for project overview and @package.json for available pnpm commands for this project.

## Code Style Guidelines
- Use descriptive variable names
- Follow existing patterns in the codebase
- Extract complex conditions into meaningful boolean variables

## Architecture Notes

The project uses an adapter pattern for multi-agent support:

- `src/core/` — shared types, config schema (Zod), config merge (home+project layering), path helpers (project + home), filesystem utilities, skill parser (gray-matter), skill source resolution, logger
- `src/adapters/claude/` — Claude-specific sync, doctor, settings merge, MCP/permission/agent compile logic, and skill copy logic. Implements the `AgentAdapter` interface.
- `src/adapters/codex/` — Codex-specific sync, doctor, `AGENTS.md` managed instructions, `.codex/hooks.json`, `.codex/config.toml`, `.codex/rules/agentstd.rules`, and Codex agents.
- `src/adapters/index.ts` — central adapter registry. New supported targets are registered here, not in command handlers.
- `src/cli/commands/` — Commander.js command handlers (`init`, `sync`, `doctor`/`check`, `status`, `skills`, `targets`)
- `src/cli/program.ts` — testable Commander program factory and command wiring
- `src/cli/index.ts` — minimal CLI entry point that calls `createProgram().parse()`

Key design decisions:

- **Config validation** is centralized in `src/core/config.ts` using Zod. The Zod schema defines `skills.dir` and `skills.homeDir` (both default `.agents/skills`) plus additive umbrella config groups `mcpServers`, `permissions`, and `agents`; `AgentStdConfig` is exported as a re-exported `z.infer` so there is one type source of truth (do not duplicate it in `types.ts`). Command permissions are token arrays like `["pnpm", "test"]`, not shell strings.
- **Layered home + project sources**: `src/core/config-merge.ts` `loadMergedConfig(projectRoot, homeRoot, flagProjectOnly?)` deep-merges `~/.agentstd.yaml` under `./.agentstd.yaml` (project scalars win, `targets` array replaced, `version` must match). No home config = project-only (silent, zero behavior change). Hooks/instructions replace by filename (project wins); skills union with project shadowing home by `dirName`. When `projectOnly: true` (config) or the `--project-only` flag (overrides config either direction; `--no-project-only` forces merge), `loadMergedConfig` skips reading `~/.agentstd.yaml` and validates the project config standalone; the returned `config.projectOnly` reflects the effective setting so downstream consumers see the same flag value. `src/core/skill-resolve.ts` `resolveSkillSources()` returns the ordered `[home, project]` sources when projectOnly is false, or `[project]` only when true; `listMergedSkills()` dedups by `dirName` keeping the project copy, tagging each `SkillMeta` with `source: 'home' | 'project'`.
- **Home root**: `src/core/paths.ts` `homeRoot()` returns `process.env.AGENTSTD_HOME ?? os.homedir()`. All home path helpers (`homeAgentStdConfigPath`, `homeHooksDir`, `homeInstructionsDir`, `homeAgentsSkillsDir`) derive from it. `AGENTSTD_HOME` is the seam used by tests for hermetic isolation.
- **Adapter interface** (`src/core/types.ts`) defines `sync()`, `doctor()`, and `detect()` methods; `SyncContext`/`DoctorContext` carry an optional `homeRoot` so adapters can resolve home skills/hooks. New agents are added by implementing this interface and registering in `src/adapters/index.ts`.
- **Settings/config merge is idempotent**: provider config is read, existing non-AgentStd entries are preserved, and AgentStd-owned entries are upserted by stable markers or command patterns. Claude settings preserve unrelated hooks/settings; Codex `AGENTS.md` and `.codex/config.toml` use managed comment blocks.
- **Sync plan/apply pattern**: `sync()` returns `FileOperation[]` alongside changed files. The same planning logic is used for real sync, dry-run (`--dry-run`), and check mode (`--check`). Operations include `create-dir`, `create-file`, `update-file`, `copy-dir`, and `skip`.
- **DryRun flag** is threaded through `SyncContext` so adapters compute but skip writes when true.
- **CLI command wiring** lives in `src/cli/program.ts` so aliases and parent-command defaults can be tested without spawning the built binary. `agentstd check` is an alias for `doctor`; `agentstd skills` defaults to `skills list`; `agentstd targets` defaults to `targets list`; `agentstd status` is a fast summary and does not inspect provider output files.
- **Templates** live in `templates/` and serve as both the `agentstd init` source and the package's bundled defaults.
- **`agentstd init --global`** seeds `~/.agentstd.yaml`, `~/.agentstd/hooks/pretooluse.js`, and `~/.agents/skills/` (refuses to overwrite); project `init` never touches `$HOME`.
- **Tests** use `vitest` with real temp directories (`fs-extra` + `os.tmpdir()`). Tests isolate home by passing `homeRoot` in `SyncContext` (a non-existent tmp subdir) or setting `AGENTSTD_HOME` to a tmp dir, so the real `~/.agentstd.yaml`/`~/.agents/skills` never leak in.

## Common Workflows

- `pnpm dev` — run the CLI directly via tsx (no build needed)
- `pnpm build` — compile to `dist/` with tsup (ESM + DTS)
- `pnpm test` — run all vitest tests
- `pnpm typecheck` — TypeScript validation only
- Smoke test: `cd /tmp && mkdir test && cd test && node /path/to/dist/index.js init && node /path/to/dist/index.js sync --dry-run && node /path/to/dist/index.js sync --all && node /path/to/dist/index.js status && node /path/to/dist/index.js check` (also try `--project-only` on each)
- `agentstd init --global` — seeds `~/.agentstd.yaml`, `~/.agentstd/hooks/pretooluse.js`, and `~/.agents/skills/` (refuses to overwrite; project `init` never touches `$HOME`).
- `agentstd sync [target]` — syncs all targets or a specific one (e.g. `claude`, `codex`). With multiple configured targets in an interactive terminal, prompts for one target or all; use `--all` to skip the prompt.
- `agentstd sync --dry-run` — previews planned `FileOperation[]` without writing any files.
- `agentstd sync --check` — exits 0 if synced, 1 if changes needed (for CI/CD). Mutually exclusive with `--dry-run`.
- `agentstd sync --project-only` — skips the home layer (`~/.agentstd.yaml` + `~/.agents/skills/` + home hooks/instructions). Also available on `doctor`/`check`, `status`, and `skills list/show`. `--no-project-only` forces the merge even when `.agentstd.yaml` has `projectOnly: true` (flag wins either direction).
- `agentstd status` — fast summary of merged config, active targets, source layers, skill counts, and configured umbrella groups.

**Adding a new adapter:**
1. Create `src/adapters/<agent>/` with `index.ts`, `sync.ts`, `doctor.ts`
2. Implement the `AgentAdapter` interface from `src/core/types.ts`
3. Register in `src/adapters/index.ts`
4. Update `targets list` planned/supported messaging only if capability labels need custom presentation
