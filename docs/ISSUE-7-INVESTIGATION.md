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
