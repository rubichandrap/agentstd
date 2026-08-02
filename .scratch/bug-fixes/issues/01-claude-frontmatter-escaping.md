# 01 — Fix Claude Frontmatter Serialization & Tests

**What to build:**
Custom sub-agents defined in `.agentstd.yaml` with colons, quotes, or multiline descriptions compile into valid YAML frontmatter inside `.claude/agents/*.md` files, ensuring Claude Code parses agent definitions without YAML syntax errors.

**Blocked by:** None — can start immediately.

**Status: completed**

- [x] Escape `description` in `renderClaudeAgent` using `JSON.stringify(description)`.
- [x] Add unit test verifying agent frontmatter parsing with special characters in descriptions.
- [x] Ensure all existing tests continue passing cleanly.
