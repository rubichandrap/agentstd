# 03 — Fix Skill Path Resolution & Global Hook Quoting

**What to build:**
Resolve `config.skills.homeDir` using `path.resolve()` to support absolute paths, and wrap global default hook commands in double quotes (`node "${homeHookPath}"`) to prevent execution failures on home directory paths containing spaces.

**Blocked by:** None — can start immediately.

**Status: completed

- [x] Update `resolveSkillSources` in `src/core/skill-resolve.ts` to use `path.resolve(homeRoot, config.skills.homeDir)`.
- [x] Update `globalDefaultConfig` in `src/cli/commands/init.ts` to wrap home hook path in quotes.
- [x] Add unit test verifying absolute `homeDir` resolution and quoted global hook command formatting.
- [x] Ensure all existing tests continue passing cleanly.
