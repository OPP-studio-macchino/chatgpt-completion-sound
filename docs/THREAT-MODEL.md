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

`webRequest.onCompleted` is treated only as a hint that an active background job should be checked again. The extension does not inspect request/response bodies or headers, and a transport completion event cannot directly set a tab blue or play audio. Normal DOM completion state and deduplication remain authoritative.

### Tab-group takeover

Color support is optional. The extension manages only groups it owns or conservatively migrates from its own canonical historical state. Pinned tabs, split-view tabs, shared groups, ordinary existing groups, and user-modified groups are left alone.

### Browser lifecycle failures

Manifest V3 workers can suspend. Active jobs are persisted in session state, Chrome alarms restore monitoring, open ChatGPT tabs are rehydrated after extension reload, and transient completion-delivery failures are retried.

## Out of scope

- Compromise of the browser or operating system.
- Malicious Chrome extensions with equivalent local privileges.
- Notifications while Chrome is closed, the computer is asleep, or a tab is fully discarded and not observable.
- Guaranteeing compatibility with future ChatGPT DOM changes without maintenance.
