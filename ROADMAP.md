# Roadmap

## Compatibility Shield v0.3.0

- [x] Packaged signal profiles, strict data validation and privacy-safe health.
- [x] Fail-closed reader/detector integration and regression coverage.
- [x] Remote envelope/verifier/fallback interfaces, disabled without owner public key.
- [x] Local synthetic Canary harness, JSON schema and dedicated-profile runbook.
- [ ] Fresh owner-authenticated v0.3.0 real-Chrome Canary and physical-audio evidence.
- [ ] Separately reviewed remote enablement: owner public key, endpoint policy, durable anti-rollback/LKG storage, key rotation and recovery. No remote activation in v0.3.0.

## Near term

- Stabilize the public OSS workflow and CI.
- Expand real-device acceptance checks for background tabs and browser lifecycle events.
- Publish reproducible release artifacts.
- Improve diagnostic reporting without collecting conversation content.

## Before a Chrome Web Store release

- Public privacy-policy URL.
- Store screenshots and reviewer instructions.
- Fresh foreground/background/manual-stop acceptance pass.
- Review of requested permissions and package contents.

## Longer term

- Cross-platform Chrome validation.
- More resilient UI-change fixtures.
- Accessibility improvements.
- Maintainer automation for issue triage, PR review, release notes, and security regression tests.
