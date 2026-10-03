# Threat Model

## Assets

- User-selected completion audio.
- Extension settings and diagnostic metadata.
- Integrity of completion notifications.
- User control of existing Chrome tab groups and browser UI state.
- Privacy of ChatGPT conversations.

## Trust boundaries

1. **ChatGPT page DOM → content script**: page structure is untrusted and may change.
2. **Content script → extension service worker**: messages must be accepted only from the extension's expected ChatGPT context.
3. **Extension page → service worker**: privileged test actions are restricted to extension-owned pages.
4. **Service worker → offscreen document**: only local audio data is passed for playback.
5. **Extension → Chrome tabGroups API**: group ownership must not be inferred too broadly.
6. **Chrome webRequest metadata → service worker**: transport completion is untrusted as a task-completion signal and may only trigger a DOM re-check.

## Primary risks and mitigations

### Message spoofing

`background.js` validates extension identity, top-frame sender, and `https://chatgpt.com` origin before accepting page status or completion events. Privileged test playback is accepted only from the extension's own options/popup pages.

### Conversation-data exfiltration

The extension does not send conversation prose to the background worker or external servers. Extension CSP blocks outbound connections from extension pages. Completion identity uses a hash of an opaque message ID, not answer text.

### Duplicate or replayed notifications

The service worker reserves seen completion keys before playback; content retries delivery until acknowledged. This allows recovery from worker restarts without intentionally replaying the same completion.

### False completion after manual stop

The detector has an explicit cancellation path. Manual stop clears the active completion candidate and must not produce blue state or completion audio.

### False completion from network transport

`webRequest.onCompleted` is treated only as a hint that an active background job should be checked again. The transport hint does not inspect request/response bodies or headers, and a transport completion event cannot directly set a tab blue or play audio. Normal DOM completion state and deduplication remain authoritative.

### Dots completion heuristic

Dots uses page-wide rendered verified work spinners, excluding composer, navigation and media/avatar regions. Thinking or Stop starts a five-second startup hold; only an observed verified spinner arms completion. Absence for eight uninterrupted seconds completes once, and reappearance cancels the settle. This is a heuristic, not a guaranteed platform terminal state. Generic dialogs/alerts are not blockers; verified modal/error states prevent completion and require fresh spinner evidence. Manual cancel and navigation disarm the lifecycle. Top-status Thinking is startup/running evidence only.

`dotsVerifiedWorkSpinners` contains only total and overlapping signature counts. Bounded in-memory lifecycle diagnostics describe startup hold, arming, zero settle and verified block/error state. No task/conversation text, opaque IDs, locations or network response data enters dots diagnostics. There is no dots page-world injection, network interception or probe session storage. Existing authenticated completion delivery and audio deduplication remain in force.

### Tab-group takeover

Color support is optional. The extension manages only groups it owns or conservatively migrates from its own canonical historical state. Pinned tabs, split-view tabs, shared groups, ordinary existing groups, and user-modified groups are left alone.

### Browser lifecycle failures

Manifest V3 workers can suspend. Active jobs are persisted in session state, Chrome alarms restore monitoring, open ChatGPT tabs are rehydrated after extension reload, and transient completion-delivery failures are retried.

## Out of scope

- Compromise of the browser or operating system.
- Malicious Chrome extensions with equivalent local privileges.
- Notifications while Chrome is closed, the computer is asleep, or a tab is fully discarded and not observable.
- Guaranteeing compatibility with future ChatGPT DOM changes without maintenance.

## Compatibility Shield data boundary — v0.3.0

Untrusted profile JSON is size-bounded, exact-schema checked and limited to named groups of packaged selector shapes. New bounded values within pre-approved shapes support minor drift; tag, attribute, operator and presence semantics cannot change or migrate between groups, and existing packaged candidates cannot move categories. Structural semantic changes require a package update. No text extraction instructions, expressions, remote HTML, or executable code are accepted. Health exports only fixed categories/reasons, active validated profile/revision and a bounded timestamp. Explicit internal activation checks parser/verifier object provenance; it is not remotely exposed. Parsing/selection leave active state unchanged, and production starts packaged. Future remote callers must verify signatures before activation. Unknown/ambiguous structure suppresses normal completion; degraded evidence must still satisfy packaged detector logic.

Remote envelopes have signature, time and revision checks, but the pinned public key is absent and production remote selection is disabled. No remote host/CSP expansion or upload exists. LKG revalidation and packaged fallback are defined by the verifier/selector interface; durable rollback protection must be reviewed before enabling remote persistence/transport. See [COMPATIBILITY.md](COMPATIBILITY.md).

The opt-in local Canary page reads existing extension diagnostics and Chrome tab/group/focus metadata. Its projected, bounded JSON excludes conversation prose, URL/title, tab IDs, cookies, credentials and audio. It never sends prompts, plays audio, groups tabs or writes evidence automatically. A dedicated owner-authenticated test profile is required; exported browser profiles and private conversations are prohibited as evidence.
