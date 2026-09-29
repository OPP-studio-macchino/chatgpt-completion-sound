# AGENTS.md

Repository-wide instructions for coding agents and automated contributors.

## Project identity

This repository is a privacy-first Chrome Manifest V3 extension for ChatGPT web completion notifications.
The primary user is a Chrome user who wants reliable local audio and optional yellow/blue tab-group status, including for background tabs.
Runtime code is plain JavaScript/HTML/CSS under `extension/`; development uses Node.js, npm, Python validation scripts, and GitHub Actions.
There is no runtime backend, OpenAI API key, payment flow, or server dependency.

## Instruction precedence

Apply guidance in this order:
1. The current explicit user request and its stated scope.
2. Hard safety, security, privacy, credential, and data-loss constraints.
3. Approved product/security contracts identified in **Source of Truth** below.
4. Repository operating rules in this file.
5. A narrowly triggered repo-local Skill and any Runbook it explicitly references.
6. Point-in-time validation evidence, status, and historical records.
7. Suggestions, examples, roadmap items, and proposals.

A Skill must never broaden the user's requested scope. If instructions conflict, follow the higher-priority source and identify any unresolved conflict that materially affects safety or the requested outcome.

## Work style

Read only the material needed for the current task; do not preload every repository document.
A review or investigation request does not authorize source changes. A fix, implementation, or refactor request authorizes reversible in-scope local edits and non-destructive validation without repeated approval pauses.
For reversible local work, continue through: inspect relevant evidence → implement → targeted validation → repair regressions caused by the change → revalidate → DONE.
Do not stop merely because the first edit, first passing test, or initial diagnosis is complete.
When subagents or collaboration tools are available, parallelize independent read-only discovery or independent test investigation when that reduces latency. Keep shared-contract changes, edits to the same mutable files, and final integration with the root agent.
The workflow must remain valid when no subagent is available.

## Source of Truth

| Concern | Read this |
| --- | --- |
| User-visible behavior and public privacy promise | `README.md` |
| Runtime component boundaries and completion pipeline | `docs/ARCHITECTURE.md` |
| Security/privacy model and trust boundaries | `SECURITY.md`, `docs/THREAT-MODEL.md` |
| Actual permissions, host scope, CSP, entry points, minimum Chrome | `extension/manifest.json` |
| Actual runtime behavior | Relevant files under `extension/` |
| Commands and deterministic repository checks | `package.json`, `scripts/validate_repo.py` |
| Point-in-time automated/real-device evidence | `docs/VALIDATION.md` |
| Historical release notes | `CHANGELOG.md` |
| Future or unapproved work | `ROADMAP.md` |

Treat `docs/VALIDATION.md` as dated evidence, not a permanent PASS claim. After source changes, do not carry its previous results forward without current verification.
If prose and current implementation disagree, do not silently rewrite the contract to match the code; inspect the relevant higher-priority source and report or resolve the mismatch within user scope.

## Stable invariants

- Never send conversation prose or the user's audio to an external service.
- Keep host access limited to the narrowest ChatGPT origin required by the product contract.
- Do not weaken sender/origin validation across page, content-script, extension-page, service-worker, and offscreen boundaries.
- Elapsed time alone must never mean “completed”.
- Manual stop, navigation, recognized error, or blocked state must not emit a normal completion notification.
- Completion delivery must remain deduplicated and resilient to Manifest V3 service-worker suspension/restart.
- Respect pinned tabs, split view, existing/shared/user-modified groups, and explicit user control of tab groups.
- Do not place real conversations, credentials, private audio, browser profiles, or other user secrets in fixtures or evidence.

## Skill routing

Repo-local Skills live under `.agents/skills/`. Load one only when its exact trigger matches the task:
- `permission-privacy-review`: permission/CSP/network/message-authentication/storage/privacy-boundary changes.
- `real-device-acceptance`: acceptance whose correctness depends on real Chrome lifecycle, tab UI, or physical audio.
- `release-readiness`: versioned release candidate, release ZIP, GitHub release, or Chrome Web Store preparation.

Do not use these Skills for ordinary UI edits, detector changes, general bug fixing, or routine tests unless their narrow trigger is actually met.
See `.agents/skills/README.md` for trigger boundaries.

## Risk-calibrated validation

- Docs-only or other small reversible non-runtime changes: run syntax/link/path/frontmatter checks relevant to the edit plus `git diff --check`. Do not run the full browser regression suite by default.
- Normal runtime feature/bug changes: run the closest targeted tests first; add relevant integration checks when the change crosses modules. Run `npm run validate` when repository integrity, manifest references, versions, or extension JavaScript validity may be affected.
- High-risk changes involving permissions, CSP/networking, sender/origin checks, privacy/storage, completion deduplication, background recovery, release packaging, or publication: use the matching Skill and run the broader checks it requires.
- Use real-device acceptance only for behavior that test doubles cannot establish, such as hidden-tab scheduling, visible tab-group behavior, service-worker lifecycle behavior in Chrome, or audible playback.
- Run `npm ci --ignore-scripts` only when dependencies must be installed/refreshed or the environment is not known to be ready; it is not a blanket per-task check.
- Once the required checks pass, do not repeat them unless a later change, failure, or unresolved concern gives a reason.
- Add regression tests for meaningful behavior changes or reproduced bugs when useful; do not mechanically add tests that only mirror implementation for a low-risk reversible edit.

## Git safety

Preserve unrelated dirty, staged, and untracked work. A dirty worktree alone is not a reason to abandon an otherwise safe unrelated task.
Do not use `git reset`, `git clean`, force checkout over files, or broad staging as convenience tools.
Stage only intended paths when staging is requested.
Commit, push, merge, tag, release, and deploy/publish only when included in the current user scope.
Never force-push without explicit authorization.

## Approval boundaries

Do not ask for approval at routine reversible local milestones.
Do not perform destructive operations on unrelated/user data, credential or key changes, external publication/provider mutation, or irreversible security-sensitive actions unless the current user request explicitly authorizes them.
Do not trigger real user-visible audio or modify live browser tabs/groups unless real-device acceptance or an equivalent live action is explicitly in scope.
A locally requested change to a browser permission or security boundary may be implemented without an extra pause, but treat it as high risk and validate/document it accordingly.
If an approved workflow contains multiple safe substeps, finish them without asking again at each normal checkpoint.

## Definition of Done

DONE means the requested scope is implemented, regressions introduced by the change are repaired, risk-appropriate checks pass (or a concrete blocker is reported), unrelated work is preserved, and no required in-scope step is knowingly left unfinished.
Close out concisely with files changed, validation performed, residual risk/blockers, and whether commit/push/release/publication occurred.
