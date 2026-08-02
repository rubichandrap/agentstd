# MCP Servers Support Target Scoping, Not Per-Target Overrides

Status: accepted

The umbrella `mcpServers` config was all-or-nothing — a declared server compiled to every active target, forcing users to either accept unwanted servers or duplicate entries with provider-specific names, fragmenting the source of truth. We decided each MCP server entry may carry an optional `targets` list restricting which provider adapters compile it (absent = all active targets). This gives users one declarative "apply to a subset" mechanism without inventing per-target override syntax.

Per-target **overrides** (different transport/command/env per provider for the same logical server) were explicitly **rejected for now**. A server whose transport genuinely diverges per provider (e.g. stdio for Claude vs URL for Gemini) is usually a different-environment concern rather than provider intent, and override merge semantics (deep-merge? replace? missing-field handling?) are real complexity best designed against a concrete requirement, not speculatively. When a real case lands, the schema can grow overrides deliberately; `targets` covers the common "some providers only" need today and keeps every adapter reading through one filter function so semantics stay consistent when overrides arrive.

## Considered Options

- **Flat all-or-nothing (status quo)** — Rejected: forces duplicate-with-suffix workarounds that break the umbrella promise; a scoped server cannot be expressed at all.
- **Per-target override map per server** — Deferred: speculative complexity with no concrete case; merge semantics would be designed without a real requirement.
- **Per-server `targets` filter** — Accepted: minimal shape (a list of adapter ids), no merge semantics, additive and backward-compatible with the existing Zod schema, and the same mechanism extends later to other umbrella groups (agents, permissions) if needed.

## Consequences

- Config gains an additive optional `targets` field on each MCP server entry; existing configs are unaffected.
- One shared filter function in the core config layer is the single consumer-facing scoping API; every adapter and doctor check reads through it.
- The duplicate-with-suffix workaround is obsolete for scoping purposes (still the escape hatch for genuine per-target transport differences until overrides are designed).
- When per-target overrides are eventually needed, they build on this same `targets` seam rather than replacing it.
