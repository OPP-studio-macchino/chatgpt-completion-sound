---
name: real-device-acceptance
description: Use only when the user asks for physical or real-Chrome acceptance, or when release readiness requires current evidence for hidden/background tabs, tab-group UI, service-worker lifecycle, or audible playback. Do not use for deterministic unit or integration test work.
---

# Real-device acceptance

## Purpose

Establish current evidence for browser and hardware behavior that repository test doubles cannot prove.

## Inputs

- The exact behavior/change being accepted.
- Current source tree and relevant automated-test result.
- Explicit scope for any live browser action that plays audio or changes tabs/groups.

## Read

- `docs/runbooks/REAL_DEVICE_ACCEPTANCE.md`
- affected runtime files under `extension/`
- `docs/VALIDATION.md` only as historical/point-in-time context, never as current PASS evidence

## Workflow

1. Run the risk-appropriate automated checks first.
2. Select only Runbook scenarios relevant to the changed behavior or release criterion.
3. Use synthetic prompts and non-private audio only.
4. Record contemporaneous expected/actual observations before refocusing or otherwise changing the state under test.
5. For audible playback, PASS requires a human observation that the sound was actually heard.
6. Do not reuse a previous release's PASS after source changes.
7. Update `docs/VALIDATION.md` only when the user explicitly asks to record the new evidence there.

## Validation

A scenario passes only when its stated acceptance condition is observed in the current environment.
A failure is evidence to diagnose; do not convert it into PASS because unit tests are green.

## Stop / approval boundaries

If live Chrome manipulation or audio playback is not already in user scope, stop at that live-action boundary without discarding completed local preparation.
Do not expose real conversations, cookies, account data, private audio, or unrelated browser state in evidence.

## Output
Report environment, scenarios run, expected versus actual result, human audio confirmation where relevant, and PASS/FAIL per scenario.
