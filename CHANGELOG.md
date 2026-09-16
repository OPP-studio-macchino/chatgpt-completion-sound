# Changelog

All notable changes are documented here.

## [Unreleased]

- Public OSS repository setup, CI, contribution workflow, and security documentation.

## [0.2.9] - 2026-09-17

### Fixed

- Prevented manual stop from being treated as normal completion.
- Neutralized extension-owned tab-group state before ungrouping to avoid stale blue completion UI.
- Preserved no-sound/no-blue semantics for manual-stop paths.

### Reliability carried forward from 0.2.8

- Retried completion delivery after transient Manifest V3 service-worker restarts until acknowledged.
- Deduplicated retries so a completion sound is not replayed twice for the same response.
- Recovered extension-owned singleton tab groups conservatively while respecting user-created or modified groups.

### Validation

- 111 automated regression checks pass on the current source tree.
- Real-device E2E work on macOS Chrome covered foreground/background completion, repeated jobs on the same tab, physical audio output, and manual-stop suppression.
