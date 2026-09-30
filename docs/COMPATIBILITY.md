# Compatibility Shield / 互換性シールド — v0.3.0

`extension/compatibility.js` is packaged code, loaded before the DOM reader and
content script both at initial injection and reinjection. Its deeply frozen built-in
`chatgpt-dom / packaged-1` profile is always available. Named signal groups have
multiple reviewed selector candidates: busy/stop, streaming, final copy/regenerate,
turns, wrappers, roles, search units, markdown markers, timeline and request roots.

Detection still requires an observed job and independent, latest-request completion
evidence. Timeline completion requires two request-local index units, a rendered
regenerate control following the latest unit, absence of busy signals, and the
existing settle interval. A previous request's final controls cannot be borrowed.
Missing markdown-copy can degrade health while regenerate controls allow normal
completion. Hidden legacy message-ID fallback keeps its longer four-second settle.
Time alone and network transport completion never establish completion.

Health is `healthy`, `degraded` or `incompatible`, with fixed structural reason codes,
matched categories, profile/revision identifiers and a timestamp bounded to
1970–2100. It is held in the content instance/64-entry trace and returned through
read-only diagnostics/probes. The popup exposes it without focusing the target.
It adds no persistent storage and includes no prose, URLs, titles, cookies, prompt/
response content or audio. Unknown or ambiguous structure blocks completion in both
the reader and detector. Health does not guarantee compatibility with arbitrary
future UI; loss of observability should be investigated with synthetic fixtures.

## Profile and remote DATA boundary

`parseProfile(rawJSON, document)` accepts at most 16 KiB of UTF-8 JSON. Required and
only fields: `schemaVersion: 1`, `profileId: "chatgpt-dom"`, integer `revision`
(1–1,000,000,000), `revisionId` (1–48 lowercase ASCII letters/digits/hyphens), and
`signals` with exactly the packaged category keys. Each category has 1–8 unique
selectors, each at most 160 characters. Selectors must parse as CSS, satisfy the
restricted structural grammar/attribute allowlist, and match a shape derived from
that same category's packaged candidates. A shape fixes the tag (including absence
of a tag), attribute and operator (`=`, `^=` or presence). New values of 1–64 allowed
characters within those pre-approved selector shapes are the minor-drift channel:
for example, a new stop-button aria-label or data-testid. Presence shapes cannot gain
values, and known packaged candidates cannot move to other categories. New structural
semantics still require a package update; no pseudo-classes, combinators or wildcards
are permitted.

There is no expression language, code loader, evaluation, dynamic function creation,
remote HTML or profile-selected text/attribute extraction. Fixed alert-UI error
inspection remains packaged reader logic; profiles cannot redirect it to messages.
Profile parsing never activates data. `activeProfile()` starts with the packaged
profile. The internal `activateValidatedProfile(profile)` seam accepts only frozen
objects produced by this module's strict parser/verifier (tracked by object identity);
plain objects and clones are rejected. `selector()` defaults to the active profile,
and health reports its identifiers and matched categories. Reader stop/copy controls
and the manual-stop selector resolve the active profile without reinjection.
`resetPackaged()` restores the built-in profile. These are trusted packaged-code
interfaces, not page or runtime-message handlers. Future remote integration must
verify authenticity before explicitly activating; validation alone is not authenticity.
Production startup remains packaged, with no remote activation caller.

`parseEnvelope` accepts at most 16 KiB and exactly `schemaVersion`, `keyId`, `issuedAt`,
`expiresAt`, `profile`, `signature`. Version is 1, key ID is `owner-1`, timestamps are
integer milliseconds bounded to 1970–2100, future issuance tolerance is five minutes,
and validity is at most 30 days. Expired profiles and revisions below the caller's
high-water mark are rejected. Signature is 64-byte ECDSA P-256/SHA-256 (IEEE P1363),
encoded as 128 lowercase hex characters. `parseEnvelope(...).signed` defines exact
UTF-8 signature bytes: JSON array of schema, key, issuance, expiry, profile schema,
profile ID, revision, revision ID, and signal object in packaged category order.
Candidate order is retained. Unknown fields are rejected before verification.

`verifyEnvelope` is the strict WebCrypto verifier interface. Its explicit key/subtle
parameters support trusted tests/integration, not data-supplied trust. `selectRemote`
uses only the package's pinned owner public key; caller options cannot replace it.
It tries a verified candidate, then reverified last-known-good (LKG) signed envelope,
then the packaged profile. LKG must also pass current expiry and revision bounds.
Selection and verification do not mutate the active profile; activation is explicit.

**Owner public key is not provisioned.** Production selection therefore immediately
returns the packaged profile with `REMOTE_PROFILE_KEY_UNPROVISIONED`. There is no
fetcher, remote endpoint, activation message, remote profile storage or remote host
permission. Existing CSP remains `connect-src 'none'`. No private key or credential
was created, stored or generated. No telemetry is uploaded.

Before a future enablement, the owner must supply a public verification key through
a reviewed package update. The owner retains signing secrets outside this project.
The update must review endpoint/host/CSP scope, persist a monotonic highest accepted
revision before activation, persist/reverify the signed LKG, reject same-revision
equivocation, and define key rotation and recovery. The interface implements revision
bounds now; durable anti-rollback and transport are intentionally not activated while
the key is absent. Storage clearing cannot provide a durable anti-rollback guarantee.

This design follows Chrome's distinction between remotely hosted executable code
and constrained configuration with all logic in the package. See the official
[MV3 requirements](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)
and [remote-code guidance](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code).
It is not a claim of Chrome Web Store approval.

## Maintainer acceptance

The [local Canary runbook](runbooks/COMPATIBILITY_CANARY.md) covers a dedicated owner-
authenticated Chrome profile and synthetic prompts only. `canary.html` reads status,
actual group color, focus/visibility, playback counter and structural health. It
records a bounded JSON result and requires human confirmation of exactly one sound.
The [schema](compatibility-canary.schema.json) is machine-readable; deterministic
tests of its state model are separate from real-device evidence. Live v0.3.0 acceptance
is pending until those preconditions and observations are actually satisfied.
