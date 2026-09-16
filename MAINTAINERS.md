# Maintainers

## Primary maintainer

- [@OPP-studio-macchino](https://github.com/OPP-studio-macchino) — primary maintainer and release owner.

## Maintenance responsibilities

The maintainer workflow includes:

- triaging reproducible bug reports;
- reviewing pull requests and regression tests;
- tracking ChatGPT DOM/UI compatibility changes;
- reviewing browser permission and privacy changes;
- maintaining release notes and package validation;
- reviewing security reports and proposed remediations;
- running real-device acceptance checks for changes that cannot be proven by test doubles.

## Release gate

A release candidate should not be marked public-ready solely because unit tests pass. Background-tab notifications and physical audio output depend on real browser lifecycle behavior, so release-critical changes should include a macOS Chrome E2E check when possible.

## Automation policy

Automation and coding agents may prepare patches, tests, release notes, and security findings. A human maintainer reviews changes before merge or release, especially for permission, storage, messaging, and security-sensitive code.
