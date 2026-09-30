# Security Policy

## Supported versions

Security fixes are applied to the latest version on the default branch. Older diagnostic versions are not supported unless a release note explicitly says otherwise.

## Reporting a vulnerability

Please do **not** publish exploit details in a normal GitHub issue.

Use GitHub's **Security → Report a vulnerability** / private vulnerability reporting flow for this repository. If that UI is unavailable, open a minimal issue that says a private security contact is required, without including exploit steps, secrets, or affected user data.

A useful report includes:

- affected version or commit;
- the browser/OS used to reproduce it;
- the permission or trust boundary involved;
- impact and prerequisites;
- a minimal reproduction that does not contain real ChatGPT conversation content.

## Security invariants

Changes should preserve these constraints unless a maintainer explicitly documents and reviews the exception:

1. No conversation text is sent to an external service.
2. Host access stays scoped to `https://chatgpt.com/*` unless there is a documented compatibility reason.
3. Extension pages do not gain outbound network access without explicit review.
4. Messages from page/content/extension contexts are authenticated by sender/origin as appropriate.
5. Completion events are deduplicated before playback.
6. User-created tab groups, pinned tabs, and split-view state are not silently taken over.
7. Permission additions require README and threat-model updates.

See [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md).

## Compatibility profile trust boundary (v0.3.0)

Compatibility Shield accepts only bounded JSON with exact schemas and per-signal reviewed selector shapes. New bounded values within those shapes can repair minor DOM drift; tag, attribute, operator and presence semantics stay packaged. Known candidates cannot move categories. Structural changes require a package update. Profile data cannot execute code, load HTML, or redirect prose extraction. Explicit internal activation accepts only parser/verifier-produced frozen objects; parsing and selection do not activate them, and future remote callers must verify authenticity first. The owner public signing key is unprovisioned: remote selection fails closed with `REMOTE_PROFILE_KEY_UNPROVISIONED`, production starts packaged, and there is no remote fetch/activation message, additional host permission, CSP relaxation, or telemetry. Verification interfaces enforce expiry and minimum revision; future activation needs reviewed durable high-water/LKG storage and key provisioning. No private keys belong in this repository. See [the compatibility contract](docs/COMPATIBILITY.md).
