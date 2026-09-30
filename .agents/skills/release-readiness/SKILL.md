---
name: release-readiness
description: Use only when preparing or validating a versioned release candidate, release ZIP, GitHub release, or Chrome Web Store submission. Do not use for normal development, ordinary PR review, or unrelated refactors.
---

# Release readiness

## Purpose

Produce a locally verified release candidate without silently publishing it.

## Inputs

- Intended release/version scope.
- Current working tree and release-facing changes.

## Read

- `package.json`
- `extension/manifest.json`
- version constant in `extension/content.js`
- `CHANGELOG.md`
- release-facing sections of `README.md`
- `scripts/build_release.py`
- `docs/VALIDATION.md` as point-in-time evidence only
- the permission/privacy Skill when release changes touch its trigger
- the real-device Skill when release criteria depend on live Chrome behavior

## Workflow

1. Confirm version identifiers and public release notes are internally consistent.
2. Inspect the working tree so unrelated local work is not packaged or staged accidentally.
3. Run `npm test`, `npm run validate`, and `git diff --check`.
4. Run `npm run build` for a local candidate when packaging is in scope.
5. Inspect the generated archive for expected extension files and absence of secrets, private media, generated junk, or unrelated artifacts.
6. Require current real-device evidence for changed release-critical behavior that test doubles cannot prove.
7. Distinguish a locally ready candidate from a published release.

## Validation

Release readiness requires all required automated checks to pass, package/version consistency, and any applicable current real-device acceptance.
Do not inherit a historical PASS from `docs/VALIDATION.md` after relevant source changes.

## Stop / approval boundaries

Creating a local release ZIP is reversible and non-publishing.
Do not commit, push, merge, tag, create a GitHub release, upload to the Chrome Web Store, or otherwise publish unless that action is explicitly included in the current user request.
Never force-push as part of release preparation without explicit authorization.

## Output

Report candidate version, checks, archive path/hash when built, live acceptance status if required, blockers, and separately whether commit/push/tag/release/store publication occurred.
