# 02 — Claude Shared Instructions

**What to build:** The Claude adapter compiles `instructions.shared` into a managed block in `CLAUDE.md` (project scope) or `~/.claude/CLAUDE.md` (global scope), mirroring the Codex `AGENTS.md` mechanism. Cross-layer ownership is respected: a project sync that inherits a home-defined instruction file reads the source from the home layer. User-authored content in `CLAUDE.md` is preserved; removing `instructions.shared` strips the managed block; a missing source file warns and writes an empty body rather than failing. `doctor` verifies the block matches the source and `uninstall` strips it, and the adapter's `instructions` capability declaration advances from `partial` to `native`.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Project sync writes a managed block into `CLAUDE.md` from `instructions.shared`
- [ ] Global sync writes the managed block into `~/.claude/CLAUDE.md`
- [ ] User-authored content in `CLAUDE.md` is preserved around the managed block
- [ ] Removing `instructions.shared` strips the managed block (and removes the file when it becomes empty)
- [ ] A project sync inheriting a home-defined instruction file reads the source from the home layer
- [ ] A missing instruction source file warns and writes an empty body instead of failing
- [ ] `doctor`/`check` passes when the block matches and reports drift when it does not
- [ ] `uninstall` strips the managed block without touching user content
- [ ] Claude adapter `instructions` capability reports `native`
