---
name: permission-privacy-review
description: Use only when changing Chrome permissions or host scope, CSP or outbound networking, cross-context sender/origin validation, persistent or diagnostic data handling, or public privacy/security claims tied to those boundaries. Do not use for ordinary UI, detector logic, styling, or unrelated bug fixes.
---

# Permission and privacy review

## Purpose

Keep browser privileges, data flow, and public privacy claims aligned with the repository's least-privilege contract.

## Inputs

- Current user-requested change and scope.
- The specific runtime or documentation surfaces being changed.

## Read

Read only the relevant parts of:
- `SECURITY.md`
- `docs/THREAT-MODEL.md`
- `extension/manifest.json`
- affected files under `extension/`
- `README.md` when a public privacy/permission claim changes

## Workflow

1. Identify the trust boundary, data item, permission, host, or claim affected.
2. Compare the requested change with the current manifest, message validation, storage/data flow, and outbound-network restrictions.
3. Prefer the narrowest permission and smallest data flow that satisfies the user request.
4. Implement only the requested local change; do not expand scope to adjacent hardening.
5. Update `README.md`, `SECURITY.md`, or `docs/THREAT-MODEL.md` only when the corresponding public or security contract actually changes.
6. Check that fixtures/evidence contain no real conversation text, audio, credentials, cookies, or browser-profile data.

## Validation

For runtime boundary changes, run `npm test`, `npm run validate`, and `git diff --check`.
For documentation/claim-only changes, verify each claim against the current manifest/code and run targeted Markdown/path checks plus `git diff --check`; do not run the full runtime suite without another reason.
If a later edit changes runtime behavior after a PASS, rerun the affected checks.

## Stop / approval boundaries

Do not broaden external access, expose conversation content, change credentials, or publish externally unless that action is explicitly in the current user scope.
Local in-scope permission/security edits are allowed without an extra approval pause; treat them as high risk and report the changed boundary.

## Output
Close out with the boundary changed, evidence checked, tests run, documentation updated, and any residual privacy/security risk.
