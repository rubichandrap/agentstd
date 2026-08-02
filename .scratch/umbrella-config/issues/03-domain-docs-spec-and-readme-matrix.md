# 03 — Domain Docs, Spec, and README Matrix

**What to build:** Capture the target-scoping and Claude-instructions work in the domain documentation. Update the `targets` capability matrix and config-field sections of the README so the documented surface matches the shipped behavior: Claude instructions row moves to native `CLAUDE.md`, and the MCP config section documents the `targets` filter. The `CONTEXT.md` glossary already gained **Portable Config**, **Capability**, and **Target Scoping** terms and the ADR `0001` records the scoping decision; confirm they stay accurate against the shipped implementation and that `targets list` capability messaging reflects the updated Claude declaration.

**Blocked by:** 01 (MCP Server Target Scoping), 02 (Claude Shared Instructions)

**Status:** completed

- [x] README feature matrix lists Claude `Instructions` as native `CLAUDE.md`
- [x] README MCP config-field section documents the `targets` filter with an example
- [x] `targets list` capability messaging reflects the Claude `instructions: native` declaration
- [x] Glossary and ADR `0001` remain consistent with the shipped behavior
