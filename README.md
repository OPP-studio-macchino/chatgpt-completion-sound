# ChatGPT Completion Sound / チャッピー完了音

[![CI](https://github.com/OPP-studio-macchino/chatgpt-completion-sound/actions/workflows/ci.yml/badge.svg)](https://github.com/OPP-studio-macchino/chatgpt-completion-sound/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)

**ChatGPT Completion Sound** is a privacy-first Chrome Manifest V3 extension that watches open `chatgpt.com` tabs and lets you know when an answer finishes — with a user-selected local WAV sound and an optional Chrome tab-group color.

- **Yellow**: ChatGPT is generating.
- **Blue**: the response completed.
- **Sound**: plays once on completion, including when the ChatGPT tab is in the background.
- **Manual stop / error / navigation**: no completion notification.

No OpenAI API key is required. No server is required. Conversation text and the user's WAV file are not sent to an external service.

> **Project status:** active development. Current extension version: **v0.2.9**. The current code has **111 automated regression checks** and has also been exercised with real-device E2E tests on macOS Chrome for foreground completion, background completion without refocusing the tab, repeated jobs on the same tab, physical audio output, and manual-stop suppression.

## Why this project exists

Long ChatGPT tasks are often moved to background tabs while the user continues other work. That sounds simple, but a reliable notification extension has to deal with hidden-page throttling, Manifest V3 service-worker suspension, lazy UI rendering, extension reloads, duplicate completion events, tab-group ownership, and manual-stop false positives.

This repository turns those edge cases into a small, testable open-source reference implementation. It is useful both as an end-user extension and as an example of resilient MV3 coordination between a content script, a service worker, an offscreen audio document, and optional tab-group state.

## Key features

- Watches all open `https://chatgpt.com/*` tabs in the current Chrome profile.
- Detects generation start and changes an eligible tab to a yellow Chrome group.
- Detects completion in foreground and background tabs without automatically focusing the tab.
- Plays a locally selected WAV file once on completion.
- Retries completion delivery across transient service-worker restarts while deduplicating playback.
- Returns blue completion tabs to yellow on the next job in the same conversation.
- Suppresses completion notification after manual stop, recognized errors, or navigation.
- Preserves pinned tabs, split-view tabs, existing user groups, and user-modified groups.
- Rehydrates open ChatGPT tabs after an extension reload.
- Keeps diagnostics limited to state metadata; it does not store conversation text.

## Privacy and security model

The extension is deliberately narrow:

- Host access is limited to `https://chatgpt.com/*`.
- The CSP uses `connect-src 'none'`; extension pages do not make outbound network requests.
- Conversation text is not transmitted to the service worker or an external service.
- Opaque response identifiers are hashed before the completion event leaves the content script.
- The selected WAV is stored locally in Chrome extension storage and is not bundled in this repository.
- `tabGroups` is optional and requested only when the user enables color notifications.
- The extension does **not** request the broad `tabs` permission.

See [SECURITY.md](SECURITY.md), [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md), and the in-extension privacy page at [`extension/privacy.html`](extension/privacy.html).

## Permissions

| Permission | Why it is needed |
| --- | --- |
| `storage` | Stores local settings, the user-selected audio data, deduplication state, and non-content diagnostics. |
| `offscreen` | Plays completion audio from a Manifest V3 background context. |
| `alarms` | Recovers monitoring after service-worker suspension. |
| `scripting` | Re-injects the current content scripts into already-open ChatGPT tabs after extension reload. |
| `https://chatgpt.com/*` | Restricts page access to ChatGPT. |
| optional `tabGroups` | Adds yellow/blue visual state when explicitly enabled by the user. |

## Architecture

```text
ChatGPT tab
  └─ detector.js + dom-reader.js + content.js
       │  STATUS / COMPLETE (hashed opaque id)
       ▼
Manifest V3 service worker (background.js)
  ├─ background-watch.js   hidden-tab recovery / probing
  ├─ tab-colors.js         optional tab-group ownership + colors
  └─ offscreen.html/js     local WAV playback
```

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Install locally

Requires **Chrome 120+**.

1. Clone this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the `extension/` directory.
6. Open the extension settings and choose a WAV file (5 MB or less).
7. Use **Play sound once** to verify local audio.
8. Enable automatic notifications; optionally enable tab colors and grant the `tabGroups` permission.

The WAV is copied into Chrome extension storage. The source audio file does not need to remain attached afterward.

## Expected behavior

| Event | Tab state | Sound |
| --- | --- | --- |
| Generating / completion settling | Yellow `チャッピー · 作業中` | No |
| Normal response completion | Blue `チャッピー · 完了` | Once |
| Next job on the same tab | Yellow again | No, until completion |
| Manual stop | Managed completion state is cleared; never becomes blue because of the stop | No |
| Recognized error / navigation | Completion state is cleared | No |
| Extension disabled | Managed groups are released | No |

## Development

Requirements:

- Node.js 20+
- npm
- Python 3 (release validation only)

```bash
npm ci --ignore-scripts
npm test
npm run validate
```

The extension itself has no runtime npm dependencies. `linkedom` is used only by development tests.

### Test coverage

The current suite contains **111 regression checks**:

- 80 Node.js checks covering detection, audio, service-worker recovery, delivery retry, diagnostics, tab colors, migration, and permissions.
- 18 DOM-model checks.
- 5 content-script integration checks.
- 4 hidden-tab model checks.
- 4 options/permission checks.

The suite specifically covers bugs found during real-device E2E work, including background-tab completion, service-worker restarts, duplicate delivery, a second job on an already-blue tab, legacy group migration, and manual-stop suppression.

See [docs/VALIDATION.md](docs/VALIDATION.md) for the current automated and real-device acceptance baseline.

## Build a local release ZIP

```bash
npm run build
```

This validates the repository and writes a deterministic unpacked-extension ZIP under `dist/`. It does **not** upload or publish anything.

## Maintenance workflow

This project is maintained as an active OSS project rather than a one-off ZIP:

1. Reproduce bugs with a minimal fixture or real-device E2E case.
2. Add a regression test before or alongside the fix.
3. Run CI on every pull request.
4. Review permission or privacy changes explicitly.
5. Keep release notes in [CHANGELOG.md](CHANGELOG.md).
6. Triage bug reports and security reports separately.

See [MAINTAINERS.md](MAINTAINERS.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

## Codex and maintainer automation

The repository is intentionally structured for agent-assisted maintenance: small modules, explicit state machines, deterministic fixtures, an `AGENTS.md`, and regression tests for browser lifecycle failures.

Useful Codex workflows include:

- PR review and regression-test generation.
- Issue triage and reproduction planning.
- DOM-change analysis when ChatGPT UI structure changes.
- Release validation and changelog preparation.
- Security review of message origin checks, permission boundaries, persistent state migrations, and offscreen audio handling.

The project is also a good candidate for **Codex Security** because browser extensions combine privileged browser APIs, injected page code, cross-context messaging, persistent storage, and permission boundaries. Security findings still require human review before any patch is merged.

## Roadmap

- [ ] Public beta packaging and reproducible release artifacts.
- [ ] More real-device E2E scenarios across Chrome versions and macOS releases.
- [ ] Fixtures for additional ChatGPT UI variations without storing real conversation content.
- [ ] Automated package integrity checks in CI.
- [ ] Accessibility and localization improvements.
- [ ] Chrome Web Store release after public-release acceptance criteria are met.

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first. For security-sensitive reports, use the process in [SECURITY.md](SECURITY.md) rather than posting exploit details in a public issue.

## 日本語概要

「チャッピー完了音」は、開いているChatGPTタブの回答生成を監視し、**作業中は黄色、完了時は青色＋好きなWAV音声**で知らせるChrome拡張です。別タブを見ていても完了通知できること、同じタブで次の作業を始めると黄色へ戻ること、手動停止では完了音・青色を出さないことを重要な受入条件にしています。

会話本文や選択した音声を外部サーバーへ送信する実装はありません。開発・不具合報告・PRはこのリポジトリで公開して継続的に管理します。

## License

[MIT](LICENSE)

## Disclaimer

This is an independent open-source project and is **not an official OpenAI or ChatGPT extension**. “ChatGPT” is used only to describe compatibility with the ChatGPT web application.
