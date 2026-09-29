# Real-device acceptance runbook

Use this procedure only through the `real-device-acceptance` Skill. It defines how to gather fresh browser/hardware evidence; it does not record a permanent PASS state.

## Preconditions

- Current user scope authorizes the live scenarios that will play audio or alter live test tabs/groups.
- Use the current local source tree in Chrome 120+ as an unpacked extension.
- Use a synthetic ChatGPT prompt and a non-private WAV file.
- Do not use personal conversation content, cookies, exported profiles, or private audio as evidence.
- Run the automated checks appropriate to the change before relying on live observations.

## Evidence header

Record these as point-in-time evidence:
- date/time and timezone;
- tested commit or explicit working-tree state;
- Chrome and macOS versions;
- extension version;
- scenarios selected and why they are relevant.

Never copy a prior PASS forward just because the scenario name is unchanged.

## Scenario A — local playback

1. Open extension settings and select the synthetic WAV.
2. Use the extension's one-shot playback control.
3. A human confirms whether the sound was actually heard.
4. PASS only when playback is heard once and the UI reports successful completion.

## Scenario B — foreground completion

1. Enable automatic notifications and, when color behavior is under test, enable the optional tab-color permission.
2. Start a synthetic ChatGPT response while the tab remains foreground.
3. During generation, verify an eligible extension-managed tab becomes yellow.
4. Let the response finish normally without pressing Stop.
5. Verify the tab becomes blue and the configured sound is heard once.
6. Record color and audio separately; one does not prove the other.

## Scenario C — background completion

1. Start a synthetic response in the target ChatGPT tab.
2. Confirm generation has started, then switch to another tab before completion.
3. Do not click or refocus the target ChatGPT tab to make completion happen.
4. When the response finishes, record whether the sound is heard while the target remains background.
5. Verify the target's extension-managed state is blue before using a refocus as a troubleshooting step.
6. PASS requires completion without needing to activate the target tab.

## Scenario D — second job on the same tab

1. Begin from a tab that completed normally and is blue.
2. Submit another synthetic prompt in the same conversation.
3. Verify the tab returns to yellow when the new job starts.
4. Let it finish normally.
5. Verify blue returns and exactly one new completion sound is heard.

## Scenario E — manual stop suppression

1. Start a synthetic response and confirm generation state.
2. Press ChatGPT's Stop control before normal completion.
3. Observe long enough to distinguish cancellation from delayed normal completion.
4. Verify no completion sound is emitted because of the stop.
5. Verify the extension does not leave or create a blue completion state because of the stop.

## Scenario F — lifecycle recovery

Run only when the change concerns Manifest V3 worker recovery, delivery retry, rehydration, or release-critical lifecycle behavior.

1. Start a synthetic active job.
2. Apply only the lifecycle interruption explicitly in test scope, such as an extension service-worker restart/reload procedure.
3. Keep the target tab's foreground/background condition unchanged unless the scenario requires otherwise.
4. Verify the active job is recovered as designed and completion is delivered at most once.
5. Record the exact interruption used; do not generalize one lifecycle case into all lifecycle cases.

## Scenario G — tab ownership safety

Run only when tab-group ownership or migration behavior changed.

Check the relevant cases using disposable/synthetic tabs:
- pinned tab;
- an already user-grouped tab;
- split-view tab when available;
- a user-modified extension-created group.

PASS requires the extension to avoid silently taking over user-owned state outside its documented ownership rules.

## Failure handling

A failed live scenario is a real result. Preserve the expected/actual observation, diagnose the smallest relevant cause, make only in-scope local repairs, rerun targeted automated checks, then repeat only the failed or invalidated live scenario.

Do not change the scenario mid-run merely to obtain PASS.

## Cleanup and closeout

Restore only extension-created disposable state used by the test. Do not rearrange unrelated browser tabs/groups.
Report PASS/FAIL per scenario, human audio confirmation where applicable, the automated checks run, and any scenario not run.
Update `docs/VALIDATION.md` only when the current user request explicitly includes recording the new evidence.
