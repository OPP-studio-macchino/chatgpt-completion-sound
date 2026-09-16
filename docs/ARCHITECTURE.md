# Architecture

ChatGPT Completion Sound is intentionally unbundled and dependency-light at runtime.

## Runtime components

### `detector.js`
A small state machine. It turns DOM metadata into lifecycle transitions without receiving conversation prose.

### `dom-reader.js`
Reads only the page metadata needed to distinguish user/assistant turns, stop controls, final controls, errors, and blocking dialogs. It avoids using answer text as the completion signal.

### `content.js`
Runs in the ChatGPT tab, observes DOM changes, reports status, hashes opaque response identifiers, and retries completion delivery until the service worker acknowledges it.

### `background.js`
Authenticates extension messages, coordinates color/audio behavior, owns deduplication, creates the offscreen audio document, and rehydrates already-open ChatGPT tabs after extension reload.

### `background-watch.js`
Tracks only active jobs, probes hidden tabs from the extension context, records limited diagnostic state, and uses Chrome alarms to recover after service-worker suspension.

### `tab-colors.js`
Owns optional one-tab Chrome groups for yellow/blue status. Ownership is conservative: existing user groups, pinned tabs, split view, shared groups, and user-modified groups are preserved.

### `offscreen.js`
Plays the user-selected local WAV and returns an acknowledgement only after playback completes or errors.

## Completion pipeline

1. Generation is observed in a ChatGPT tab.
2. Content reports `STATUS: generating`.
3. Optional tab group becomes yellow.
4. The detector observes a stable final assistant message.
5. Content reports `STATUS: complete` and a hashed completion key.
6. Content retries `COMPLETE` delivery until acknowledged.
7. Background deduplicates the key.
8. Optional tab group becomes blue.
9. Offscreen audio plays once and acknowledges completion.

## Why the worker also probes active jobs

Hidden-page timers can be throttled. The extension therefore does not rely on page timers alone. Only tabs already observed as active jobs are probed, limiting work and avoiding historical-answer notifications.

## Testing strategy

The project combines state-machine tests, Chrome API fixtures, DOM model tests, content-script integration tests, hidden-tab models, and real-device E2E checks. Test doubles prove deterministic logic; real-device checks remain necessary for browser scheduling, audio output, and UI rendering behavior.
