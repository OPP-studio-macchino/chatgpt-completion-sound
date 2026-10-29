# Issue #7: editable-answer completion investigation

Date: 2026-10-29. Baseline: `6f641a86203661810fca8688d34eafe5064b9ccd`.

## Status and evidence

The issue remains open. This is a candidate fix for a reproduced DOM-reader
failure, not confirmation that the reporter's Windows problem is resolved.
The issue contains no DOM capture, and the repository had no Writing Block fixture.
All new fixtures are synthetic, contain invented content, and model only an
editable region inside the latest keyed answer with a sibling final toolbar.

In the timeline path, ancestor traversal previously stopped whenever an ancestor
contained any `contenteditable="true"` element. An editor inside the answer thus
prevented traversal to the sibling final regenerate control. The resulting
snapshot had `ready=false` even after generation ended. Both visible and hidden
regression cases failed against the baseline at the readiness assertion.

The fix exempts only editors contained by the selected latest keyed unit while
walking ancestors. Textareas and editors outside that unit still stop traversal.
The existing exactly-two-logical-unit requirement, final-control order and
rendering checks, busy signals, settle delay and completion identity are retained.
No background, transport, audio, permission or remote-profile code changes.

## Warning analysis and remaining hypotheses

- `ROLE_SIGNALS_MISSING` produces degraded health, not incompatible health; by
  itself it does not suppress completion.
- `REMOTE_PROFILE_KEY_UNPROVISIONED` is the packaged remote-profile status and
  is not a completion gate. Provisioning a key is unrelated to this patch.
- More than two distinct search units, an editor outside the keyed answer, or a
  missing final regenerate control can still prevent timeline completion. Do not
  relax ambiguity guards without evidence of the actual request boundary.
- Turn-based answers use a different final-copy path. This patch does not change
  that path. Actual Windows DOM evidence is needed to select among these causes.

## Automated validation

Current result: `npm test` PASS (228 Node tests + 26 DOM + 6 content + 4 hidden-tab
+ 4 options checks = 268 checks). `npm run validate` and `git diff --check` PASS.
These are automated model results, not live-browser acceptance.

- Added visible/hidden DOM-reader + detector cases: final toolbar reached,
  settle period respected and completion returned once.
- Added visible/hidden content-script integration cases: one hashed `COMPLETE`,
  no prose or raw identity export, and no completion from elapsed time alone.
- Negative cases cover external composer, editable input, textarea inside answer,
  busy state, hidden toolbar, historical load and manual cancellation; an
  intermediate-wrapper case covers nested answer layout.
- Existing suites cover ordinary responses, hidden-tab probing, retry/deduplication,
  manual stop, navigation, ambiguity and tab-color behavior.

## Required live acceptance (not performed)

Before treating Issue #7 as resolved, verify on Windows 11 25H2 / reported Chrome
or a documented current version, with the candidate extension loaded:

1. Ordinary answer, visible then background: one audible completion each.
2. Writing Block answer, visible then background: one audible completion each;
   if enabled, yellow during generation and blue only after completion.
3. Remain in the background through completion and wait at least five seconds:
   no duplicate playback.
4. Manually stop a Writing Block response: no completion playback.
5. Open an old completed conversation: no playback.

If a case fails, collect privacy-safe structural diagnostics (no conversation
prose, raw response IDs, browser profile or credentials), identify which reader
path was selected and whether the final toolbar is in that path's bounded scope.
Real Chrome hidden scheduling, service-worker suspension, actual Writing Block
markup and physical audibility are unverified by the model tests.

## Independent follow-up: 2026-10-29 (JST)

### Repository/CI state

- On 2026-10-29, Issue #7 was still open and PR #8 was open, unmerged,
  and Draft. The verified candidate HEAD was
  `99f2efe15c7931c0346b4dadb03df729776a5613`.
- GitHub Actions run `40797121627` on that candidate passed both
  `test (20.x)` and `test (22.x)`.
- Independent tests ran from a clean temporary clone of that exact
  candidate on the only connected computer (macOS iMac, Node.js 24.2.0,
  npm 11.3.0). Existing working-tree modifications in another checkout
  were preserved, not staged or changed.
- `npm ci --ignore-scripts --no-audit --no-fund` succeeded.
- `npm test` passed all 268 checks: 228 Node, 26 DOM, 6 content,
  4 background-model, 4 options. `npm run validate` passed;
  `python3 -m unittest tests.test_validate_repo` passed (1 test);
  `git diff --check` passed.
- No additional runtime defect was reproduced by this independent
  candidate verification; no additional runtime change is warranted
  without new evidence.

### Live Windows acceptance blocker

- Remote Desktop Commander listed one online device, `iMac-2.local`,
  and **no Windows device** accessible via that connection.
- Consequently, Windows OS/Chrome build, the real Writing Block DOM,
  foreground/background audible notifications, background-to-foreground
  deduplication, yellow/blue tab-group transitions and manual-stop/
  historical-load behavior **were not tested on Windows**.
- The synthetic failure mechanism remains a confirmed *model* regression,
  **not a confirmed diagnosis of the reporter's real Windows incident**.
  Warning codes are not evidence that the compatibility shield should
  be bypassed.
- Next gate: connect an authorized Windows computer (ideally Windows 11
  25H2 with Chrome 155.0.8059.40, otherwise record its actual versions)
  to a usable remote-control tool; preserve its extension settings/WAV
  before loading the candidate. Run the live acceptance matrix above
  with synthetic prompts and explicit human audio confirmation. If it
  fails, capture only redacted structural diagnostics and turn the
  observed structure into a targeted regression.
- Remain Draft and keep Issue #7 open. No merge, release, version bump,
  Chrome Web Store publication or claim of Windows PASS.

## Windows-hosted CI follow-up (2026-10-29 JST)

- Added `windows-test` to `.github/workflows/ci.yml`. The job uses
  GitHub-hosted `windows-latest`, Node.js 22 and Python 3.12; it does
  not run Chrome and cannot confirm actual sound, tab colors or Writing
  Block behavior in a real browser.
- Initial Windows CI run `40806948706`: **all 268 JavaScript/DOM tests
  passed**. The repository Python validator then failed with
  `UnicodeDecodeError` because `Path.read_text()` used the Windows
  system default encoding (cp1252) for UTF-8 files such as
  `extension/manifest.json`. This was a cross-platform validation
  defect, not evidence of the reported extension runtime defect.
- Corrected all five text reads in `scripts/validate_repo.py` to
  explicitly request `encoding="utf-8"`. No completion, compatibility,
  transport, audio or tab-color runtime source was changed.
- After the fix, GitHub Actions run `40807092224` passed all three
  jobs: Ubuntu/Node 20.x, Ubuntu/Node 22.x and Windows/Node 22.x.
  Windows `npm test`, Python repository validation and validator unit
  test all passed.
- The owner reports access to a Windows PC with Node.js v24.16.0,
  but this chat's authorized computer-control connection still lists
  only the iMac. The Windows-hosted CI result does not constitute
  local Windows/Chrome real-device acceptance.
- For the local Codex handoff, clone this PR branch into a new Windows
  folder, read `AGENTS.md` and the `real-device-acceptance` Skill and
  runbook, preserve any existing extension/settings/WAV, verify actual
  Windows/Chrome/extension versions, and perform synthetic ordinary and
  Writing Block foreground/background acceptance. Request human
  confirmation only when physical audio needs to be judged.
- **Windows real-device acceptance remains UNVERIFIED.** PR stays
  Draft; Issue #7 stays open. No merge, release or publication.
