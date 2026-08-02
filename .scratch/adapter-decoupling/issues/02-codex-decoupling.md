# 02 — Decouple Codex Target Adapter Compilation

**What to build:** Move Codex TOML configuration compilation, command rule rendering, and sub-agent generation from `src/core/provider-config.ts` directly into `src/adapters/codex/` modules (`config.ts`, `rules.ts`, `agents.ts`). Update `sync.ts` in `src/adapters/codex/` to import from these local modules.

**Blocked by:** None — can start immediately.

**Status: completed

- [x] Create `src/adapters/codex/config.ts` with `syncCodexConfigToml`
- [x] Create `src/adapters/codex/rules.ts` with `syncCodexRules`
- [x] Create `src/adapters/codex/agents.ts` with `syncCodexAgents`
- [x] Update imports in `src/adapters/codex/sync.ts`
- [x] Verify Codex tests pass
