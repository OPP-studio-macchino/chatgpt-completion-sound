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

## Local Windows Codex preparation: owner-reported (2026-10-29 JST)

The owner provided the following Codex results from their separate Windows
computer. These are **owner-reported** observations, not directly inspected
via this chat's computer-control tools:

- Local clean clone at `935480e753af153043ff004bc7fd01b4e7a1d15b`.
- `npm ci --ignore-scripts` completed and `npm test` reported
  **268 checks PASS**; Python 3.13 repository validation and
  validation unit test also reported PASS.
- A dedicated Chrome test profile and a synthetic 250 ms WAV were
  prepared. The existing Chrome profile, installed extensions, settings,
  and WAV files were not changed.
- The Windows Computer Use agent stopped when it could not safely verify
  the Chrome URL. Loading the unpacked `extension/` directory,
  notification/color setup, and all actual ChatGPT foreground/background
  scenarios were **not performed**.
- The URL-verification safety check must **not** be disabled or worked
  around by an unverified automation path. A human can explicitly open
  `chrome://extensions` in the *dedicated* test-profile window, enable
  developer mode, and load the candidate `extension/` directory. Then
  resume authorized tests, requesting physical audible confirmation.
- No additional runtime failure or verified real-DOM structure was
  observed. **Windows real-device acceptance remains UNVERIFIED**;
  the issue and PR remain open/Draft until live acceptance.

## Windows real-Chrome partial acceptance: owner/Codex report (2026-10-30 JST)

**Evidence classification:** The following is the Windows Codex/owner's reported
real-device outcome supplied in chat; the current GitHub update agent did not
directly observe the Windows display or sound. Do not convert any unobserved
scenario to PASS.

- **Tested candidate:** `935480e753af153043ff004bc7fd01b4e7a1d15b`.
  GitHub comparison against the immediately preceding PR head
  `1bf9b09617822fcae1a68d18336849febf5ce84c`
  shows only a subsequent `docs/ISSUE-7-INVESTIGATION.md` change,
  not a runtime extension change.
- **Windows:** Windows 11 Home, OS version `10.0.26200` / build `26200`.
  **Chrome:** Google Chrome `155.0.8059.82`. This is *not* the
  issue reporter's `155.0.8059.40` build.
- **Automated on local Windows:** `npm test` 268 checks PASS; Python 3.13
  repository validation and validator unit test PASS.
- **Isolation:** Separate test Chrome profile; synthetic 250 ms WAV.
  Owner/Codex previously reported no changes to the existing
  personal Chrome profile, extensions, settings or WAV files.

| Live scenario | Result | Observed evidence / boundary |
| --- | --- | --- |
| Ordinary response, foreground | **PASS (reported)** | Yellow while generating, blue on completion; owner heard completion sound |
| Ordinary response, background: sound on completion | **NOT RUN / UNVERIFIED** | No explicit confirmation of audible sound while still in the background |
| Actual Writing Block, foreground | **NOT RUN** | Actual Writing Block was not rendered |
| Actual Writing Block, background | **NOT RUN** | Actual Writing Block was not rendered |
| Return to tab after at least 5 s in background | **PASS (limited; reported)** | No *additional* sound on refocus; does **not** prove a background completion sound occurred |
| Yellow / blue tab-group color | **PASS only for ordinary foreground** | Background and Writing Block color transitions not established |
| Physical sound | **PASS only for WAV one-shot and ordinary foreground** | Owner heard both; background and Writing Block audibility remain unverified |
| Manual stop suppression | **NOT RUN** | No live observation |
| Recognized-error suppression | **NOT RUN** | No live observation |
| Navigation suppression | **NOT RUN** | No live observation |
| Historical conversation load suppression | **NOT RUN** | No live observation |

**Observed configuration failure:** The first ordinary-response trial
produced no notification because **automatic notifications were disabled**.
A privacy-safe structural diagnostic reported `ready: true` and
`ROLE_SIGNALS_MISSING` degraded health. The degraded warning was not
the completion gate; after enabling notifications, the ordinary foreground
trial succeeded. Do not disable the Compatibility Shield or relax guards
to silence warnings.

**Decision:** This is **partial Windows real-device acceptance, not an
Issue #7 fix verification**. In particular, neither Writing Block scenario
was run; the reported original failure is still unverified on an actual
Writing Block. Keep PR #8 **Draft** and Issue #7 **open**. Do not merge,
release, or publish.

**Next scenarios (do not rerun known-good checks without a reason):**
1. Render a genuine Writing Block containing only invented/synthetic text;
   verify foreground start, yellow, completed blue and **one physically
   heard sound**. If a Writing Block does not appear, record NOT RUN.
2. Repeat with a genuine Writing Block kept in a background tab through
   completion. Confirm the sound **while still unfocused**, observe the
   eligible tab's colors, wait at least 5 seconds, then refocus and
   confirm no duplicate.
3. Run ordinary background with the same sound/color/dedup criteria.
4. Check manual Stop, recognized error (only if safely reproducible),
   navigation, historical chat display, and second response in the same
   tab without allowing a false completion.
5. If any case fails, collect privacy-safe structural path/busy/ready
   and scoped editor/final-toolbar location metadata only. Avoid the
   conversation text and any identifiers/secrets. Add an anonymized
   regression and the minimum defensible runtime patch if supported
   by observed evidence.

