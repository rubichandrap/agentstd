# 01 — MCP Server Target Scoping

**What to build:** Every MCP server entry in `mcpServers` may carry an optional `targets` list restricting which provider adapters compile it. Absent (or empty) means all active targets, preserving today's behavior. A scoped server is compiled only into the listed providers' native config files and is cleaned from a target's config when it is scoped out on a later sync. A single shared filter helper is the one consumer-facing API: claude sync, codex sync, and both `doctor` checks all read through it so scoping semantics stay consistent.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Schema accepts optional `targets` on each MCP server entry; invalid adapter ids fail config validation with a clear message
- [ ] Unscoped servers compile to every active target (existing behavior unchanged)
- [ ] Server scoped to `[claude]` appears in Claude output and is absent from Codex output
- [ ] Removing a server's scoping restores it to all active targets on the next sync
- [ ] Re-scoping a server out of a target cleans it from that target's config on the next sync
- [ ] `--dry-run` and `--check` reflect scoping in their planned operations and exit codes
- [ ] `doctor` passes when scoped servers match the declared `targets` and reports drift otherwise
- [ ] `uninstall` cleans scoped servers from the providers that received them
