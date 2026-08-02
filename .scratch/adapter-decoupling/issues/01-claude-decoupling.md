# 01 — Decouple Claude Target Adapter Compilation

**What to build:** Move Claude MCP server compilation, permission rules compilation, and sub-agent generation from `src/core/provider-config.ts` directly into `src/adapters/claude/` modules (`mcp.ts`, `permissions.ts`, `agents.ts`). Update `sync.ts`, `settings.ts`, and `remove.ts` in `src/adapters/claude/` to import from these local modules.

**Blocked by:** None — can start immediately.

**Status: completed

- [x] Create `src/adapters/claude/mcp.ts` with `syncClaudeMcpServers`
- [x] Create `src/adapters/claude/permissions.ts` with `compileClaudePermissions`
- [x] Create `src/adapters/claude/agents.ts` with `syncClaudeAgents`
- [x] Update imports in `src/adapters/claude/sync.ts`, `settings.ts`, `remove.ts`
- [x] Verify Claude tests pass
