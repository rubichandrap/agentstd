# AgentStd Domain Model

Standardized agent configuration management CLI that synchronizes project and user agent settings across multi-agent environments.

## Core Concepts

**Portable Config**:
The umbrella `.agentstd.yaml` config that declares agent behavior provider-agnostically and is compiled into provider-native files.
_Avoid_: Umbrella config, shared config, source-of-truth config

**Target Adapter**:
A provider-specific translator that compiles unified standard configuration into target AI tool settings and artifacts.
_Avoid_: Provider plugin, integration driver

**Sync Scope**:
The operational context determining where output configurations are written—either local project target directories or user home directories.
_Avoid_: Output mode, target folder

**Config Layer**:
A hierarchical configuration source (user home vs project root) evaluated during configuration compilation.
_Avoid_: Config tier, override file

**Project-Only Mode**:
A configuration boundary flag enforcing project isolation by disabling home-layer configuration inheritance.
_Avoid_: Isolated mode, standalone flag

**Capability**:
A declared level of support an adapter has for an umbrella config group, one of `native`, `partial`, or `none` — e.g. Claude declares `instructions: native` because shared instructions compile to `CLAUDE.md`.
_Avoid_: Feature support, feature flag, coverage

**Target Scoping**:
An optional `targets` list on an umbrella config entry (e.g. an MCP server) restricting which provider adapters compile it; absent means all active targets.
_Avoid_: Target filter, provider whitelist, scope restriction

**Managed Block**:
A designated section in a target file delimited by start and end markers, owned and maintained exclusively by AgentStd.
_Avoid_: AgentStd section, managed snippet

**Skill Source**:
An origin directory containing agent skill definition packages, categorized by layer hierarchy.
_Avoid_: Skill folder, skill location

**Permission Token**:
A structured security declaration defining execution policies for commands or file system operations.
_Avoid_: Security rule, permission pattern
