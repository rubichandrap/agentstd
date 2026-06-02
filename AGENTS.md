# Memory

## Project Overview
See @README.md for project overview and @package.json for available pnpm commands for this project.

## Code Style Guidelines
- Use descriptive variable names
- Follow existing patterns in the codebase
- Extract complex conditions into meaningful boolean variables

## Architecture Notes

The project uses an adapter pattern for multi-agent support:

- `src/core/` — shared types, config schema (Zod), path helpers, filesystem utilities, skill parser (gray-matter), logger
- `src/adapters/claude/` — Claude-specific sync, doctor, settings merge, and skill copy logic. Implements the `AgentAdapter` interface.
- `src/cli/commands/` — Commander.js command handlers (`init`, `sync`, `doctor`, `skills`, `targets`)
- `src/cli/index.ts` — CLI entry point, wires commands to the Commander program

Key design decisions:

- **Config validation** is centralized in `src/core/config.ts` using Zod. All commands load and validate `.agentstd.yaml` through this schema.
- **Adapter interface** (`src/core/types.ts`) defines `sync()`, `doctor()`, and `detect()` methods. New agents are added by implementing this interface and registering in the adapters map.
- **Settings merge** is idempotent: Claude's `settings.json` is read, existing non-AgentStd hooks are preserved, and the AgentStd hook is upserted by detecting its command string pattern.
- **Templates** live in `templates/` and serve as both the `agentstd init` source and the package's bundled defaults.
- **Tests** use `vitest` with real temp directories (`fs-extra` + `os.tmpdir()`) for filesystem tests.

## Common Workflows

- `pnpm dev` — run the CLI directly via tsx (no build needed)
- `pnpm build` — compile to `dist/` with tsup (ESM + DTS)
- `pnpm test` — run all vitest tests
- `pnpm typecheck` — TypeScript validation only
- Smoke test: `cd /tmp && mkdir test && cd test && node /path/to/dist/index.js init && node /path/to/dist/index.js sync && node /path/to/dist/index.js doctor`
- `agentstd sync [target]` — syncs all targets or a specific one (e.g. `claude`). The optional target argument filters to a single agent.

**Adding a new adapter:**
1. Create `src/adapters/<agent>/` with `index.ts`, `sync.ts`, `doctor.ts`
2. Implement the `AgentAdapter` interface from `src/core/types.ts`
3. Register in the adapters map in `src/cli/commands/sync.ts` and `src/cli/commands/doctor.ts`
