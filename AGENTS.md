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
- `src/adapters/claude/` — Claude-specific sync, doctor, settings merge, and skill copy logic. Implements the `AgentAdapter` interface.
- `src/cli/commands/` — Commander.js command handlers (`init`, `sync`, `doctor`, `skills`, `targets`)
- `src/cli/index.ts` — CLI entry point, wires commands to the Commander program

Key design decisions:

- **Config validation** is centralized in `src/core/config.ts` using Zod. The Zod schema defines `skills.dir` and `skills.homeDir` (both default `.agents/skills`); `AgentStdConfig` is exported as a re-exported `z.infer` so there is one type source of truth (do not duplicate it in `types.ts`).
- **Layered home + project sources**: `src/core/config-merge.ts` `loadMergedConfig(projectRoot, homeRoot)` deep-merges `~/.agentstd.yaml` under `./.agentstd.yaml` (project scalars win, `targets` array replaced, `version` must match). No home config = project-only (silent, zero behavior change). Hooks/instructions replace by filename (project wins); skills union with project shadowing home by `dirName`. `src/core/skill-resolve.ts` `resolveSkillSources()` returns the ordered `[home, project]` sources; `listMergedSkills()` dedups by `dirName` keeping the project copy, tagging each `SkillMeta` with `source: 'home' | 'project'`.
- **Home root**: `src/core/paths.ts` `homeRoot()` returns `process.env.AGENTSTD_HOME ?? os.homedir()`. All home path helpers (`homeAgentStdConfigPath`, `homeHooksDir`, `homeInstructionsDir`, `homeAgentsSkillsDir`) derive from it. `AGENTSTD_HOME` is the seam used by tests for hermetic isolation.
- **Adapter interface** (`src/core/types.ts`) defines `sync()`, `doctor()`, and `detect()` methods; `SyncContext`/`DoctorContext` carry an optional `homeRoot` so adapters can resolve home skills/hooks. New agents are added by implementing this interface and registering in the adapters map in `src/cli/commands/sync.ts` and `src/cli/commands/doctor.ts`.
- **Settings merge** is idempotent: Claude's `settings.json` is read, existing non-AgentStd hooks are preserved, and the AgentStd hook is upserted by detecting its command string pattern. `needsSettingsUpdate()` compares computed vs current hooks to avoid unnecessary writes.
- **Sync plan/apply pattern**: `sync()` returns `FileOperation[]` alongside changed files. The same planning logic is used for real sync, dry-run (`--dry-run`), and check mode (`--check`). Operations include `create-dir`, `create-file`, `update-file`, `copy-dir`, and `skip`.
- **DryRun flag** is threaded through `SyncContext` so adapters compute but skip writes when true.
- **Templates** live in `templates/` and serve as both the `agentstd init` source and the package's bundled defaults.
- **`agentstd init --global`** seeds `~/.agentstd.yaml`, `~/.agentstd/hooks/pretooluse.js`, and `~/.agents/skills/` (refuses to overwrite); project `init` never touches `$HOME`.
- **Tests** use `vitest` with real temp directories (`fs-extra` + `os.tmpdir()`). Tests isolate home by passing `homeRoot` in `SyncContext` (a non-existent tmp subdir) or setting `AGENTSTD_HOME` to a tmp dir, so the real `~/.agentstd.yaml`/`~/.agents/skills` never leak in.

## Common Workflows

- `pnpm dev` — run the CLI directly via tsx (no build needed)
- `pnpm build` — compile to `dist/` with tsup (ESM + DTS)
- `pnpm test` — run all vitest tests
- `pnpm typecheck` — TypeScript validation only
- Smoke test: `cd /tmp && mkdir test && cd test && node /path/to/dist/index.js init && node /path/to/dist/index.js sync --dry-run && node /path/to/dist/index.js sync && node /path/to/dist/index.js doctor`
- `agentstd sync [target]` — syncs all targets or a specific one (e.g. `claude`). The optional target argument filters to a single agent.
- `agentstd sync --dry-run` — previews planned `FileOperation[]` without writing any files.
- `agentstd sync --check` — exits 0 if synced, 1 if changes needed (for CI/CD). Mutually exclusive with `--dry-run`.

**Adding a new adapter:**
1. Create `src/adapters/<agent>/` with `index.ts`, `sync.ts`, `doctor.ts`
2. Implement the `AgentAdapter` interface from `src/core/types.ts`
3. Register in the adapters map in `src/cli/commands/sync.ts` and `src/cli/commands/doctor.ts`
