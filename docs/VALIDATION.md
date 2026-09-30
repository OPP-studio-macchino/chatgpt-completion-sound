# Validation Record

This document separates current release-candidate evidence from historical validation.

## v0.3.0 Compatibility Shield — 2026-09-30 release candidate

Verified final evidence from the original source after promotion:

| Check | Result |
| --- | --- |
| `npm test` | **258/258 PASS**: 218 Node + 26 DOM + 6 content + 4 hidden-tab + 4 options |
| `python3 -m unittest tests.test_validate_repo` | **PASS** |
| `npm run validate` | **PASS (v0.3.0)** |
| `git diff --check` | **PASS** |
| Promotion equality | Original extension and isolated candidate byte-equal: **28/28 files**; six promoted regression tests also byte-equal to candidate |

Final source build archive SHA256:
`ea934227b98069519f61335aad2fbaceb30af434ab4c4884dfd197966cef60fe`.

### Isolated Repair Canary — PASS

Acceptance used a separate Chrome profile, separate extension ID and isolated
candidate source. In the live two-tab check, B was generating/yellow; A completed/blue
while B stayed generating/yellow. The playback counter delta was exactly **+1**.
Manually stopping B caused no second playback, and A remained blue for **at least
5 seconds**. The user explicitly confirmed hearing physical completion audio
**exactly once**.

### Repairs and recovery boundaries

- Current multi-main ChatGPT DOM uses structural unique-positive main selection;
  ties and zero positive matches fail closed.
- A stale session-owner versus persistent-owner storage failure was deterministically
  reproduced and repaired. Recovery requires exact persistent ownership validation;
  user-modified groups remain fail-closed.
- Same-semver old content hydration is rejected unless the current protocol
  `compatibility-health-v1` matches.

### Normal Chrome after promotion

The normal Chrome extension was explicitly reloaded after promotion. Immediately
afterward, separate group states remained distinct (**working/completed/working**).
The user later confirmed completion audio was audible in normal Chrome. This is
reload, separate-state and audible-completion evidence; the exact-once cross-tab
proof above belongs to the isolated Repair Canary, not a normal-Chrome synthetic rerun.

No commit, push, tag, GitHub Release, store publication or other publication has
occurred yet.

## Historical v0.2.12 baseline

- Extension version: **0.2.12**
- Validation date: **2026-09-29**
- Primary real-device environment: **macOS + Google Chrome** (minimum Chrome 120+)
- Automated regression checks: **185 PASS**

### Historical automated regression suite — v0.2.12

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
### Historical real-device acceptance checks — v0.2.12

These checks remain separate from test doubles because hidden-tab rendering, Chrome timer semantics, service-worker lifecycle, and physical audio output can differ from deterministic models.

| Scenario | Acceptance condition | Result |
| --- | --- | --- |
| Background generation | dedicated ChatGPT test tab becomes yellow, then remains unfocused | **PASS** |
| Background completion | while another tab remains selected, target changes yellow → blue without being opened | **PASS** |
| Exactly-once playback | extension playback counter increases by exactly one and remains stable for at least 3 seconds | **PASS** |
| Physical audio | configured WAV is audible on the Mac during the current v0.2.12 acceptance session | **PASS** |
| Same-conversation reuse | dedicated test conversation can start a later job again without stale completion state | **PASS** |
| Manual stop | stop path is covered by regression tests; no fresh v0.2.12 physical-stop run was required for this background-fix acceptance | **AUTOMATED PASS** |

#### Real-device defects closed in the historical v0.2.12 acceptance

- Native browser `setTimeout` / `clearTimeout` were invoked without their required global receiver, causing `TypeError: Illegal invocation` in the background watcher.
- Visibility-only transitions did not immediately refresh STATUS metadata.
- Current ChatGPT uses the Japanese stop label `停止`.
- Current timeline UI can place rendered final controls outside the search-index node and may omit `data-markdown-copy` on a completed answer.
- Transport completion is now only a signal to re-check the DOM; it cannot directly produce blue state or audio.

## Release philosophy

A green automated run is necessary but not sufficient for release-critical browser-lifecycle changes. Bugs involving hidden tabs, service-worker restarts, tab-group UI, and physical audio should be accompanied by a real-device check whenever practical.

## Privacy of test evidence

The project does not require real conversation content for regression fixtures. Public issues and test evidence should use synthetic prompts and should not include cookies, authentication data, personal audio files, or private ChatGPT content. Diagnostics retain bounded structural/state metadata only.
