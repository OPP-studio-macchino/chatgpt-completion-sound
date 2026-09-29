# Repo-local agent guidance

This directory contains task-specific guidance that should not live in the always-loaded root `AGENTS.md`.

## Loading model

1. Start with the current user request and root `AGENTS.md`.
2. Route to the relevant Source of Truth named there.
3. Load a Skill only when its description exactly matches the task.
4. Load a Runbook only when the triggered Skill says the exact procedure is needed.
5. Treat validation/status evidence as point-in-time evidence, never as a permanent current contract.

The goal is progressive disclosure: ordinary fixes should not pay the context or process cost of release, security, or real-device procedures.

## Repository Skills

See `skills/README.md` for the three narrow workflows currently justified by this repository:
- permission/privacy boundary review;
- real-device Chrome acceptance;
- release readiness.

Generic frontend, backend, coding, bug-fix, and test Skills are intentionally absent because normal repository work is covered by root guidance and current code/tests.
