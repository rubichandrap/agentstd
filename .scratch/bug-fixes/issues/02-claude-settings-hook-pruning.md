# 02 — Fix Claude Settings Hook Pruning & Tests

**What to build:**
When no preToolUse hooks are configured in `.agentstd.yaml`, `agentstd sync` omits the `"PreToolUse"` array key from `.claude/settings.json` and strips empty `hooks` objects, ensuring clean settings files without empty array pollution.

**Blocked by:** None — can start immediately.

**Status: completed

- [x] Update `computeFinalHooks` in `src/adapters/claude/settings.ts` to omit `"PreToolUse"` when `filtered.length === 0`.
- [x] Strip empty `hooks` block in `computeFinalSettings`.
- [x] Add unit test verifying `.claude/settings.json` is not polluted when zero hooks are configured.
- [x] Ensure all existing tests continue passing cleanly.
