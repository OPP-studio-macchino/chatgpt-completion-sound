# Validation Record

This document records the acceptance baseline for the current public OSS source tree.

## Current baseline

- Extension version: **0.2.12**
- Validation date: **2026-09-29**
- Primary real-device environment: **macOS + Google Chrome 153** (extension minimum: Chrome 120+)
- Automated regression checks: **185 PASS**

## Automated regression suite

| Area | Checks | Result |
| --- | ---: | --- |
| Node.js state/audio/background/tab-color/diagnostics tests | 145 | PASS |
| DOM-model tests | 26 | PASS |
| Content-script integration tests | 6 | PASS |
| Hidden-tab model tests | 4 | PASS |
| Options / optional-permission tests | 4 | PASS |
| **Total** | **185** | **PASS** |

Run locally with:

```bash
npm ci --ignore-scripts
npm test
npm run validate
```
## Real-device acceptance checks — v0.2.12

These checks remain separate from test doubles because hidden-tab rendering, Chrome timer semantics, service-worker lifecycle, and physical audio output can differ from deterministic models.

| Scenario | Acceptance condition | Result |
| --- | --- | --- |
| Background generation | dedicated ChatGPT test tab becomes yellow, then remains unfocused | **PASS** |
| Background completion | while another tab remains selected, target changes yellow → blue without being opened | **PASS** |
| Exactly-once playback | extension playback counter increases by exactly one and remains stable for at least 3 seconds | **PASS** |
| Physical audio | configured WAV is audible on the Mac during the current v0.2.12 acceptance session | **PASS** |
| Same-conversation reuse | dedicated test conversation can start a later job again without stale completion state | **PASS** |
| Manual stop | stop path is covered by regression tests; no fresh v0.2.12 physical-stop run was required for this background-fix acceptance | **AUTOMATED PASS** |

### Real-device defects closed in this acceptance

- Native browser `setTimeout` / `clearTimeout` were invoked without their required global receiver, causing `TypeError: Illegal invocation` in the background watcher.
- Visibility-only transitions did not immediately refresh STATUS metadata.
- Current ChatGPT uses the Japanese stop label `停止`.
- Current timeline UI can place rendered final controls outside the search-index node and may omit `data-markdown-copy` on a completed answer.
- Transport completion is now only a signal to re-check the DOM; it cannot directly produce blue state or audio.

## Release philosophy

A green automated run is necessary but not sufficient for release-critical browser-lifecycle changes. Bugs involving hidden tabs, service-worker restarts, tab-group UI, and physical audio should be accompanied by a real-device check whenever practical.

## Privacy of test evidence

The project does not require real conversation content for regression fixtures. Public issues and test evidence should use synthetic prompts and should not include cookies, authentication data, personal audio files, or private ChatGPT content. Diagnostics retain bounded structural/state metadata only.
