# Contributing

Thanks for helping improve ChatGPT Completion Sound.

## Before opening a pull request

1. Search existing issues and pull requests.
2. Keep changes focused; browser-lifecycle bugs are easier to review as small patches.
3. Add or update a regression test for behavior changes.
4. Do not add real conversation text, personal audio, API keys, cookies, exported browser profiles, or other private data to fixtures.
5. Run:

```bash
npm ci --ignore-scripts
npm test
npm run validate
```

## Pull request checklist

- [ ] The change has a clear problem statement.
- [ ] Tests cover the changed state transition or permission boundary.
- [ ] `npm test` passes.
- [ ] No new network endpoint or permission was added unintentionally.
- [ ] Privacy/security docs were updated if needed.
- [ ] User-visible behavior is documented.
- [ ] Manual-stop, duplicate-delivery, background-tab, and next-job behavior were considered when relevant.

## Bug reports

For timing/lifecycle bugs, please include:

- Chrome version and OS;
- foreground vs background tab;
- whether the tab was pinned, grouped, split, frozen, or discarded;
- expected yellow/blue/audio behavior;
- whether clicking the tab changes the result.

Never paste private conversation content just to demonstrate a UI-state bug.

## Code style

The extension intentionally uses plain JavaScript with small modules and no runtime bundler. Avoid adding dependencies unless they materially reduce risk or complexity.

## Security issues

Follow [SECURITY.md](SECURITY.md). Do not file public exploit details.
