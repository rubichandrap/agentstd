# Memory

## Project Overview
See @README.md for project overview and @package.json for available pnpm commands for this project.

## Code Style Guidelines
- Use descriptive variable names
- Follow existing patterns in the codebase
- Extract complex conditions into meaningful boolean variables

## Architecture Notes

The project uses an adapter pattern for multi-agent support:

- `src/core/` — shared types (`AgentAdapter`, `SyncContext`/`DoctorContext`/`RemoveContext`), config schema (Zod, `config.ts`), additive config defaults (`config-defaults.ts`), layered config merge (`config-merge.ts`), config version migrations (`migrations.ts`), managed-text block upsert/remove (`managed-text.ts`), path helpers (project + home, `paths.ts`), filesystem utilities incl. `writeConfigWithBackup` (`fs.ts`), skill parser (gray-matter, `skill.ts`) and source resolution (`skill-resolve.ts`), provider-native config compile (`provider-config.ts`), package version lookup (`package-info.ts`), npm update check (`update-check.ts`), logger
- `src/adapters/claude/` — Claude-specific sync, doctor, remove, settings merge (`isAgentStdHook` marker), MCP/permission/agent compile, and skill copy. Implements the `AgentAdapter` interface.
- `src/adapters/codex/` — Codex-specific sync, doctor, remove, `AGENTS.md` managed instructions, `.codex/hooks.json` (`isAgentStdHook` marker), `.codex/config.toml`, `.codex/rules/agentstd.rules`, and Codex agents.
- `src/adapters/index.ts` — central adapter registry. New supported targets are registered here, not in command handlers.
- `src/cli/commands/` — Commander.js command handlers (`init`, `sync`, `doctor`/`check`, `status`, `skills`, `targets` + `targets add`/`remove`, `uninstall`)
- `src/cli/program.ts` — testable Commander program factory and command wiring
- `src/cli/index.ts` — minimal CLI entry point that calls `createProgram().parse()` and fires `checkForUpdate()` fire-and-forget to stderr (suppressed in non-TTY/test/`AGENTSTD_NO_UPDATE_CHECK`)

Key design decisions:

- **Config validation** is centralized in `src/core/config.ts` using Zod. The Zod schema defines `skills.dir` and `skills.homeDir` (both default `.agents/skills`) plus additive umbrella config groups `mcpServers`, `permissions`, and `agents`; `AgentStdConfig` is exported as a re-exported `z.infer` so there is one type source of truth (do not duplicate it in `types.ts`). Command permissions are token arrays like `["pnpm", "test"]`, not shell strings.
- **Layered home + project sources**: `src/core/config-merge.ts` `loadMergedConfig(projectRoot, homeRoot, flagProjectOnly?)` deep-merges `~/.agentstd.yaml` under `./.agentstd.yaml` (project scalars win, `targets` array replaced). No home config = project-only (silent, zero behavior change). Hooks/instructions replace by filename (project wins); skills union with project shadowing home by `dirName`. When `projectOnly: true` (config) or the `--project-only` flag (overrides config either direction; `--no-project-only` forces merge), `loadMergedConfig` skips reading `~/.agentstd.yaml` and validates the project config standalone; the returned `config.projectOnly` reflects the effective setting so downstream consumers see the same flag value. `src/core/skill-resolve.ts` `resolveSkillSources()` returns the ordered `[home, project]` sources when projectOnly is false, or `[project]` only when true; `listMergedSkills()` dedups by `dirName` keeping the project copy, tagging each `SkillMeta` with `source: 'home' | 'project'`. Each layer is migrated to `CURRENT_CONFIG_VERSION` independently by `migrateConfig` inside `readYamlObject`, so a stale on-disk version on either layer is upgraded in-memory without rewriting the user's file; a version newer than the build supports throws.
- **Home root**: `src/core/paths.ts` `homeRoot()` returns `process.env.AGENTSTD_HOME ?? os.homedir()`. All home path helpers (`homeAgentStdConfigPath`, `homeHooksDir`, `homeInstructionsDir`, `homeAgentsSkillsDir`) derive from it. `AGENTSTD_HOME` is the seam used by tests for hermetic isolation.
- **Adapter interface** (`src/core/types.ts`) defines `sync()`, `doctor()`, `detect()`, and `remove()` methods; `SyncContext`/`DoctorContext`/`RemoveContext` carry an optional `homeRoot` so adapters can resolve home skills/hooks. New agents are added by implementing this interface and registering in `src/adapters/index.ts`.
- **Settings/config merge is idempotent**: provider config is read, existing non-AgentStd entries are preserved, and AgentStd-owned entries are upserted by stable markers or command patterns. Claude settings preserve unrelated hooks/settings; Codex `AGENTS.md` and `.codex/config.toml` use managed comment blocks.
- **Sync plan/apply pattern**: `sync()` returns `FileOperation[]` alongside changed files. The same planning logic is used for real sync, dry-run (`--dry-run`), and check mode (`--check`). Operations include `create-dir`, `create-file`, `update-file`, `remove-file`, `remove-dir`, `copy-dir`, and `skip`; the `remove-*` variants are emitted by `remove()` (uninstall) so dry-runs can preview deletions.
- **DryRun flag** is threaded through `SyncContext` so adapters compute but skip writes when true.
- **CLI command wiring** lives in `src/cli/program.ts` so aliases and parent-command defaults can be tested without spawning the built binary. `agentstd check` is an alias for `doctor`; `agentstd skills` defaults to `skills list`; `agentstd targets` defaults to `targets list` and has `add`/`remove` subcommands; `agentstd status` is a fast summary and does not inspect provider output files. `init` accepts `--no-interactive` (skip the target prompt) and a repeatable `-t/--target <id>` (pre-select targets); `uninstall` accepts `--all`/`--dry-run`/`--purge-skills`/`--project-only`/`--global`.
- **Templates** live in `templates/` and serve as both the `agentstd init` source and the package's bundled defaults.
- **`agentstd init`** (project and `--global`) is upgrade-aware: when `.agentstd.yaml` already exists, it runs `migrateConfig()` then backfills missing default keys via the Zod schema, writing a `.bak` backup first (comments are not preserved — YAML.stringify limitation — the backup mitigates this). `--force` resets to defaults (also backed up); `--dry-run` previews the upgrade. Fresh init in a TTY prompts for targets via a clack multiselect over `listAdapters()` (claude preselected); `--no-interactive` or `-t/--target` skips the prompt. Upgrade path is silent — existing `targets` are preserved, never re-prompted. Project `init` never touches `$HOME`.
- **Config version migrations** (`src/core/migrations.ts`): the on-disk config carries a `version` field; `CURRENT_CONFIG_VERSION` is the build's max. `migrateConfig()` walks an ordered `Migration[]` registry (each step's `from` must equal the previous step's `to`) to bring a raw object up to current; additive-only fields are handled by Zod defaults at parse time, so a migration step is only required when a field is renamed/moved/removed. A version newer than the build supports throws. The registry is empty until the first breaking config refactor.
- **Update notifier** (`src/core/update-check.ts`): `checkForUpdate()` fetches `https://registry.npmjs.org/agentstd/latest` (3s timeout), compares against `packageVersion()` via `semver`, and is throttled by a 24h cache at `~/.agentstd/.update-cache.json`. Returns `null` (no-op) in non-TTY, `NODE_ENV=test`, or when `AGENTSTD_NO_UPDATE_CHECK` is set. `cli/index.ts` fires it fire-and-forget and prints a stderr hint; it never blocks startup or breaks execution.
- **Uninstall flow** (`src/cli/commands/uninstall.ts`): calls `adapter.remove(ctx)` for each selected target (strips agentstd-managed provider entries; deletes emptied files), then removes `.agentstd.yaml` and the `.agentstd/` dir (with `.bak` backup of the config). `.agents/skills/` is left in place by default; `--purge-skills` removes it too. `--global` purges the home layer; `--project-only` skips it. Adapter `remove()` is the surgical inverse of `sync()` — it preserves user-authored hooks/MCP servers/agents and only touches agentstd-marked entries (`isAgentStdHook`, `agentstd:` MCP prefix, `agentstd:start/end` managed blocks, configured agent ids, copied skill dirNames).
- **`removeManagedBlock`** (`src/core/managed-text.ts`) is the inverse of `upsertManagedBlock`: strips a managed block by id (including its trailing newline) and collapses any blank-line runs left behind, returning `changed: false` when no block matched.
- **`writeConfigWithBackup`** (`src/core/fs.ts`) writes an object as YAML to a path, backing up the previous content to `${path}.bak` first; returns the backup path or `null` when the file did not exist. Shared by `init` (upgrade/reset) and `targets add`/`remove` so config mutation is consistently safe.
- **Tests** use `vitest` with real temp directories (`fs-extra` + `os.tmpdir()`). Tests isolate home by passing `homeRoot` in `SyncContext` (a non-existent tmp subdir) or setting `AGENTSTD_HOME` to a tmp dir, so the real `~/.agentstd.yaml`/`~/.agents/skills` never leak in.

## Common Workflows

- `pnpm dev` — run the CLI directly via tsx (no build needed)
- `pnpm build` — compile to `dist/` with tsup (ESM + DTS)
- `pnpm test` — run all vitest tests
- `pnpm typecheck` — TypeScript validation only
- Smoke test: `cd /tmp && mkdir test && cd test && node /path/to/dist/index.js init && node /path/to/dist/index.js sync --dry-run && node /path/to/dist/index.js sync --all && node /path/to/dist/index.js status && node /path/to/dist/index.js check && node /path/to/dist/index.js uninstall --all --dry-run` (also try `--project-only` on each)
- `agentstd init --global` — seeds `~/.agentstd.yaml`, `~/.agentstd/hooks/pretooluse.js`, and `~/.agents/skills/` (upgrades in place on re-run; `--force` resets; `--dry-run` previews). Project `init` never touches `$HOME`.
- `agentstd sync [target]` — syncs all targets or a specific one (e.g. `claude`, `codex`). With multiple configured targets in an interactive terminal, prompts with a clack multiselect (all preselected); use `--all` to skip the prompt.
- `agentstd sync --dry-run` — previews planned `FileOperation[]` without writing any files.
- `agentstd sync --check` — exits 0 if synced, 1 if changes needed (for CI/CD). Mutually exclusive with `--dry-run`.
- `agentstd sync --project-only` — skips the home layer (`~/.agentstd.yaml` + `~/.agents/skills/` + home hooks/instructions). Also available on `doctor`/`check`, `status`, and `skills list/show`. `--no-project-only` forces the merge even when `.agentstd.yaml` has `projectOnly: true` (flag wins either direction).
- `agentstd status` — fast summary of merged config, active targets, source layers, skill counts, and configured umbrella groups.
- `agentstd targets add <id>` / `agentstd targets remove <id>` — mutate `targets` in `.agentstd.yaml` (or `~/.agentstd.yaml` with `--global`) without hand-editing. Validates against `listAdapters()`; `remove` refuses the last target; writes a `.bak` backup. Prints a sync hint; does not auto-sync.
- `agentstd uninstall [target]` — removes agentstd-managed provider artifacts (via `adapter.remove()`), then deletes `.agentstd.yaml` + `.agentstd/` (`.bak` written). `.agents/skills/` left in place; `--purge-skills` removes it. Supports `--all`, `--dry-run`, `--project-only`, `--global`.

**Adding a new adapter:**
1. Create `src/adapters/<agent>/` with `index.ts`, `sync.ts`, `doctor.ts`, `remove.ts`
2. Implement the `AgentAdapter` interface from `src/core/types.ts` (including `remove()` — the surgical inverse of `sync()`, preserving user-authored entries)
3. Register in `src/adapters/index.ts`
4. Update `targets list` planned/supported messaging only if capability labels need custom presentation
5. Config-mutating commands should reuse `writeConfigWithBackup` from `src/core/fs.ts` so backups are consistent
