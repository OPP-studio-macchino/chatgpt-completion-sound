# Changelog

All notable changes are documented here.

## [Unreleased]

- Public OSS repository setup, CI, contribution workflow, and security documentation.

## [0.2.12] - 2026-09-29

### Fixed

- Restored reliable completion notification for ChatGPT jobs that finish while their tab is in the background.
- Bound native browser timers to the global receiver, fixing the real-Chrome `TypeError: Illegal invocation` that silently stopped background polling.
- Reported visibility-only tab transitions immediately instead of waiting for the periodic STATUS refresh.
- Updated busy detection for the current Japanese `停止` control.
- Updated current timeline-UI completion detection so final action controls can be recognized outside search-index nodes and when `data-markdown-copy` is absent.
- Kept request identity stable across assistant-index replacement and same-turn DOM churn.
- Changed `webRequest` handling so network completion only triggers a DOM probe; transport completion never directly emits completion audio or blue state.
- Preserved deduplication so one response produces one extension playback.

### Validation

- **185 automated regression checks PASS**.
- Real-device macOS Chrome acceptance passed for background generation, yellow → blue completion, unfocused-tab completion, and exactly-once playback.
- Physical completion audio was confirmed during the v0.2.12 acceptance session.
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

- 111 automated regression checks passed on that source tree.
- Real-device E2E work on macOS Chrome covered foreground/background completion, repeated jobs on the same tab, physical audio output, and manual-stop suppression.
