# AGENTS.md

Instructions for coding agents and automated contributors.

## Goal

Maintain a privacy-first Chrome MV3 extension that notifies users when ChatGPT web responses finish, including in background tabs.

## Read first

- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/THREAT-MODEL.md`
- `SECURITY.md`

## Required checks

Before proposing a change:

```bash
npm ci --ignore-scripts
npm test
npm run validate
```

## Invariants

- Never send conversation text or user audio to an external service.
- Do not add broad host permissions when a narrower permission works.
- Do not weaken sender/origin validation in extension messaging.
- Do not make elapsed time alone mean "completed".
- Manual stop, navigation, and recognized errors must not emit a completion notification.
- Background completion delivery must tolerate service-worker suspension/restart and remain deduplicated.
- Respect pinned tabs, existing groups, split view, and user-modified groups.
- Do not add real user conversations to fixtures.

## Change discipline

Prefer a failing regression test before the fix. Keep browser-state transitions explicit and reviewable. Permission changes require documentation and threat-model updates.
