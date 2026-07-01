# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-07-01

### Added

- `agentstd uninstall [target]` command — the surgical inverse of `sync`. Removes AgentStd-managed provider entries (hooks, `agentstd:` MCP servers, managed blocks, configured agents/skills), then deletes `.agentstd.yaml` and the `.agentstd/` directory (with `.bak` backup). `.agents/skills/` is left in place; `--purge-skills` removes it too. Supports `--all`, `--dry-run`, `--project-only`, `--global`, and an interactive multiselect when no target is given.
- `agentstd targets add <id>` / `agentstd targets remove <id>` — add or remove a target from `.agentstd.yaml` (or `~/.agentstd.yaml` with `--global`) without hand-editing YAML. Validates against supported adapters, writes a `.bak` backup, and refuses to remove the last configured target.
- Update notifier — AgentStd checks npm for a newer published version at most once per 24 hours and prints a non-blocking hint to stderr. Disable with `AGENTSTD_NO_UPDATE_CHECK=1`; suppressed in non-TTY and test environments.
- Interactive provider selection in `agentstd init` — fresh init in a TTY prompts for targets via a multiselect (Claude preselected). New `--no-interactive` flag and repeatable `-t/--target <id>` skip the prompt.
- `agentstd init` upgrade flow — re-running `init` on an existing `.agentstd.yaml` upgrades it in place (runs config migrations, backfills missing default keys, writes a `.bak` backup) instead of refusing. `--force` resets to defaults; `--dry-run` previews.
- Config version migrations — `.agentstd.yaml` now carries a `version` field; older configs are migrated to the current version in-memory at load time. A config version newer than your installed AgentStd throws (upgrade AgentStd to resolve).

### Changed

- `agentstd sync` interactive prompt is now a multiselect with all targets preselected, instead of a single-pick menu.
- Per-adapter `remove()` is now part of the `AgentAdapter` interface; new adapters implement it as the surgical inverse of `sync()`.

## [0.3.0] - 2026-07-01

### Added

- Codex adapter — full support including `AGENTS.md` managed instructions, `.codex/hooks.json`, `.codex/config.toml`, `.codex/rules/agentstd.rules`, and Codex agents.
- Additive umbrella config groups `mcpServers`, `permissions`, and `agents`, compiled to each provider's native format.
- `agentstd status` command — fast summary of merged config, active targets, source layers, and skill counts.
- `agentstd targets list` — capability table showing what each supported target provides.
- Interactive target selection in `agentstd sync` when multiple targets are configured in a TTY.
- `agentstd --version` flag.

## [0.2.0] - 2026-06-29

### Added

- Layered home + project config — `~/.agentstd.yaml` is deep-merged under each project's `./.agentstd.yaml`, mirroring the Claude (`~/.claude` + `.claude`) and OpenCode (`~/.config/opencode` + `.opencode`) convention. Skills union across home and project; hooks/instructions replace by filename.
- `agentstd init --global` — seeds a home-level config, home hook, and `~/.agents/skills/` skill library.
- `AGENTSTD_HOME` environment variable to override the home location.
- Project-only mode — set `projectOnly: true` in config or pass `--project-only`/`--no-project-only` to skip the home layer. Available on `sync`, `doctor`/`check`, `status`, and `skills`.

## [0.1.0] - 2026-06-25

### Added

- Initial release of AgentStd — standardize hooks, skills, instructions, MCP servers, permissions, and agents across AI coding agents.
- Claude Code adapter with `sync`, `doctor`, settings merge, and skill copy.
- `agentstd init`, `sync`, `doctor`/`check`, `skills list`/`show`, and `targets list` commands.
- `.agentstd.yaml` Zod-validated config with hooks, skills, and instructions fields.
- Safe sync dry-run (`--dry-run`) and check (`--check`) modes for previewing and CI/CD verification.

[0.4.0]: https://www.npmjs.com/package/agentstd/v/0.4.0
[0.3.0]: https://www.npmjs.com/package/agentstd/v/0.3.0
[0.2.0]: https://www.npmjs.com/package/agentstd/v/0.2.0
[0.1.0]: https://www.npmjs.com/package/agentstd/v/0.1.0
