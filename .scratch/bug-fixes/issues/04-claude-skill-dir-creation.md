# 04 — Fix Claude Skill Directory Creation

**What to build:**
Defer creation of `.claude/skills/` during Claude sync until skills are actually discovered and copied, preventing the creation of empty skill folders on 0-skill syncs.

**Blocked by:** None — can start immediately.

**Status: completed

- [x] Remove unconditional `await ensureDir(destSkills)` from `src/adapters/claude/sync.ts`.
- [x] Verify `syncClaudeSkills` creates `destSkills` when skills are present.
- [x] Add unit test verifying running sync on a zero-skill project does not leave `.claude/skills/` on disk.
- [x] Ensure all existing tests continue passing cleanly.
