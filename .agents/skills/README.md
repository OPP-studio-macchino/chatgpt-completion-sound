# Repo-local Skills

Skills here are optional, narrow workflow overlays. Their descriptions are the trigger boundary.

| Skill | Trigger | Do not trigger for |
| --- | --- | --- |
| `permission-privacy-review` | Changing permissions/host scope/CSP/networking, sender-origin validation, stored diagnostic/content data, or matching public privacy/security claims | Ordinary UI, detector behavior, styling, unrelated bugs |
| `real-device-acceptance` | Running or preparing acceptance that depends on real Chrome lifecycle, hidden tabs, tab-group UI, service-worker behavior, or audible playback | Unit/integration tests that can establish the result deterministically |
| `release-readiness` | Preparing or validating a versioned release candidate, release ZIP, GitHub release, or Chrome Web Store submission | Normal development, ordinary PR review, unrelated refactors |

A Skill does not expand user scope. If its workflow reaches an external publication, live-browser side effect, or other approval boundary not already authorized, stop only at that boundary while preserving completed safe local work.

Do not add another Skill unless the workflow is both recurring and meaningfully different from normal development in expertise, procedure, or safety boundary.
