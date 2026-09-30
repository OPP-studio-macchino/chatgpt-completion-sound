# Changelog

All notable changes are documented here.

## [Unreleased]

- Public OSS repository setup, CI, contribution workflow, and security documentation.

## [0.3.0] - 2026-09-30

- Added **Compatibility Shield / 互換性シールド**: packaged named selector groups, strict bounded profile validation, structural health and popup diagnostics.
- Unknown/ambiguous completion structure fails closed; current timeline final-regenerate fallback, hidden completion, manual stop, retries/deduplication and second jobs retain regression coverage.
- Added data-only signed-envelope verifier and fallback interfaces. Remote activation stays disabled with `REMOTE_PROFILE_KEY_UNPROVISIONED`; no keys, network permissions, remote code or telemetry added.
- Added a dedicated-profile synthetic Canary observation page, machine-readable schema, model tests and runbook.

### Fixed

- Repaired stale session-owner recovery to prevent stuck-blue state; recovery requires exact persistent ownership validation, and user-modified groups remain fail-closed.
- Handle multi-main ChatGPT DOM through structural unique-positive main selection; ties and zero positive matches fail closed.
- Reject same-version old content hydration unless the protocol handshake matches `compatibility-health-v1`.
- Use truthful ownership-uncertain wording when ownership cannot be established.
- Preserve cross-tab independence: one tab can complete/blue while another remains generating/yellow, and stopping the latter causes no second playback.

### Validation

- **258/258 automated checks PASS**: 218 Node + 26 DOM + 6 content + 4 hidden-tab + 4 options. Validator unit tests, repository validation (v0.3.0) and `git diff --check` also passed.
- **Isolated two-tab live acceptance PASS** in Repair Canary with a separate Chrome profile, extension ID and candidate source: playback delta exactly +1, manual stop caused no second playback, and the completed tab remained blue for at least 5 seconds.
- User confirmed physical completion audio was heard **exactly once** in isolated Repair Canary.
- After promotion, original extension files matched the candidate **28/28**, and six promoted regression tests were also byte-equal.
- Normal Chrome was explicitly reloaded after promotion; separate states remained distinct (working/completed/working), and the user later confirmed audible completion. Exact-once cross-tab proof is from isolated Repair Canary.
- Release-candidate evidence is dated **2026-09-30**; v0.2.12 evidence remains historical. No commit, push, tag, GitHub Release, store publication or other publication has occurred yet.

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
