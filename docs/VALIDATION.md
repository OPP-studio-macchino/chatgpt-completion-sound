# Validation Record

This document records the acceptance baseline for the current public OSS source tree.

## Current baseline

- Extension version: **0.2.9**
- Validation date: **2026-09-17**
- Primary real-device environment: macOS + Google Chrome 120+
- Automated regression checks: **111 PASS**

## Automated regression suite

| Area | Checks | Result |
| --- | ---: | --- |
| Node.js state/audio/background/tab-color/diagnostics tests | 80 | PASS |
| DOM-model tests | 18 | PASS |
| Content-script integration tests | 5 | PASS |
| Hidden-tab model tests | 4 | PASS |
| Options / optional-permission tests | 4 | PASS |
| **Total** | **111** | **PASS** |

Run locally with:

```bash
npm ci --ignore-scripts
npm test
npm run validate
```

## Real-device acceptance checks

These checks are intentionally separate from the test-double suite because Chrome scheduling, hidden-tab rendering, physical audio output, and Manifest V3 service-worker lifecycle can differ from a deterministic model.

| Scenario | Acceptance condition | Result |
| --- | --- | --- |
| Foreground generation | tab becomes yellow during generation | PASS |
| Foreground completion | tab becomes blue and configured WAV is heard once | PASS |
| Background completion | target tab is not refocused before completion; it becomes blue and configured WAV is heard | PASS |
| Second job on same tab | a previously-blue tab returns to yellow when a new user turn starts | PASS |
| Manual stop | stopping generation does not produce completion audio and does not create a blue completion state | PASS |
| Physical audio | configured WAV is audible through the Mac output device | PASS |
| Completion delivery retry | transient worker-delivery failure is retried and deduplicated | PASS (automated regression + E2E background behavior) |

## Release philosophy

A green unit-test run is necessary but not sufficient for release-critical browser-lifecycle changes. Bugs involving hidden tabs, service-worker restarts, tab-group UI, and physical audio should be accompanied by a real-device check whenever practical.

## Privacy of test evidence

The project does not require real conversation content for regression fixtures. Public issues and test evidence should use synthetic prompts and should not include cookies, authentication data, personal audio files, or private ChatGPT content.
