# mm-ng Roadmap

This document tracks active roadmap work for **mm-ng**, a community-driven
revival of the archived MineMeld project originally released by Palo Alto
Networks.

The goal of mm-ng is to preserve MineMeld's core functionality and
configuration model while modernizing the runtime, deployment story, and WebUI.
Completed baseline and WebUI foundation work has been removed from this active
roadmap so the remaining items reflect what is still open.

---

## Guiding Principles

- Preserve backward compatibility with existing MineMeld configurations where feasible
- Favor minimal, incremental changes over large rewrites
- Keep the core runtime stable and predictable
- Treat integrations and providers as optional extensions
- Be explicit about what is supported, experimental, or deprecated
- Keep the legacy AngularJS WebUI and modern React/Vite WebUI able to coexist

---

## Milestone 1 - Core Stabilization

### Runtime and Packaging

- Expand automated test coverage beyond focused runtime checks
- Add CI for supported Python versions and container builds
- Continue provider-by-provider Python compatibility hardening
- Document required native dependencies, including LevelDB
- Improve graceful handling of optional or missing integrations
- Define support expectations for legacy providers that cannot be modernized cleanly

### Operations

- Finalize installation and upgrade documentation
- Add sample configurations and a reproducible demo setup
- Document backup and restore procedures for runtime configuration and local data files
- Document operational troubleshooting for Redis, API, engine, and WebUI containers

---

## Milestone 2 - Modern WebUI Parity Gaps

The React/Vite WebUI now covers the main read-only operator workflow, local and
OIDC authentication, admin user management, node details, graphs, prototype
editing, candidate config commit, dashboard charts, logs, system status, and
whitelist miner indicator management. Remaining WebUI work should focus on
specific legacy parity gaps instead of broad scaffolding.

### Configuration Workflows

- Add candidate node edit and delete flows
- Add explicit changed/unchanged diffs for node-level candidate config
- Add import and export flows when needed by operators
- Add validation around destructive configuration changes

### Indicator and Table Workflows

- Complete the generic Add Indicator route
- Add table/feed indicator workflows not covered by whitelist miner management
- Review legacy table editing behavior and decide what should be mutable in the modern UI

### Logs and System

- Improve logs table parity and add log entry detail views where useful
- Add backup, restore, extension upload, and install-from-Git workflows
- Continue system metric polish for CPU, disk, memory, engine, and extension status

### Admin and Authorization

- Add tag management if required for full legacy parity
- Audit local, feed, and OIDC user behavior against the legacy UI
- Prevent unsupported mutations on externally managed identities

---

## Milestone 3 - Authentication and Security Hardening

- Add token-based API authentication if required for non-browser clients
- Improve CSRF protection for mutating endpoints
- Review OIDC session lifetime, logout, and role-mapping edge cases
- Support uploading custom certificates for internal nodes
- Configure the number of chassis from supported configuration paths

---

## Milestone 4 - First Community Release

- Tag releases for `mm-ng-core`, `mm-ng-webui`, and `mm-ng-webui-vite`
- Finalize the versioning scheme, including any `-mmng` suffix policy
- Publish installation and upgrade documentation
- Publish sample configurations and demo setup
- Add contribution guidelines
- Announce the release and clearly describe supported vs experimental areas

---

## Milestone 5 - Integrations and Extensions

- Revive selected integrations as separate packages where maintainable
- Define a supported plugin/provider interface
- Explicitly mark deprecated or unsupported integrations
- Document migration paths for integrations that cannot be carried forward

---

## Non-Goals

- Rebranding or claiming ownership of the MineMeld trademark
- Breaking existing MineMeld configurations unnecessarily
- Large-scale rewrites without demonstrated need
- Supporting every historical provider indefinitely
- Removing the legacy AngularJS WebUI before the modern WebUI has proven parity

---

## Notes

mm-ng is a community project. Progress depends on available maintainers,
contributors, and real-world usage.

Milestones may be adjusted based on feedback and practical constraints.
