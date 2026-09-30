(function (root) {
  'use strict';
  const CONTENT_PROTOCOL = 'compatibility-health-v1';
  const MAX_BYTES = 16384, MAX_TIME = 4102444800000, MAX_REVISION = 1000000000;
  const REMOTE_STATUS = 'REMOTE_PROFILE_KEY_UNPROVISIONED';
  // Public verification key only. Provisioning and transport require a separately reviewed release.
  const OWNER_PUBLIC_KEY = null;
  const validatedProfiles = new WeakSet();
  const groups = {
    stop:['button[data-testid="stop-button"]','button[aria-label="回答を停止"]','button[aria-label="Stop generating"]','button[aria-label="Stop response"]','button[aria-label="停止"]'],
    streaming:['[data-is-streaming="true"]','[data-stream-active="true"]'],
    finalCopy:['button[data-testid="copy-turn-action-button"]','button[aria-label="回答をコピーする"]','button[aria-label="Copy response"]'],
    finalRegenerate:['button[aria-label="回答を再生成"]','button[aria-label="Regenerate response"]'],
    turn:['[data-turn]','[data-testid^="conversation-turn-"]'],
    wrapper:['[data-testid^="conversation-turn-"]','article[data-turn-id]'],
    user:['[data-message-author-role="user"]','[data-turn="user"]'],
    assistant:['[data-message-author-role="assistant"]','[data-turn="assistant"]'],
    message:['[data-message-author-role]','[data-turn]'],
    searchUnit:['[data-chatgpt-search-unit-key]','[data-content-search-unit-key]'],
    markdown:['[data-markdown-han-text]','[data-markdown-copy]'],
    markdownCopy:['[data-markdown-copy]','button[data-testid="copy-turn-action-button"]'],
    timeline:['[data-app-action-timeline-scroll]','[data-app-action-timeline]'],
    request:['[data-request-input-activity-root]','[data-request-root]']
  };
  const SIGNALS = Object.freeze(Object.keys(groups));
  const ATTRIBUTES = new Set(['data-testid','aria-label','data-is-streaming','data-stream-active','data-turn','data-turn-id','data-message-author-role','data-chatgpt-search-unit-key','data-content-search-unit-key','data-markdown-han-text','data-markdown-copy','data-app-action-timeline-scroll','data-app-action-timeline','data-request-input-activity-root','data-request-root']);
  function exact(value, keys) {
    return value !== null && typeof value === 'object' && !Array.isArray(value) &&
      Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
  }
  function fail(code) { throw new Error(code); }
  function timestamp(value) { return Number.isSafeInteger(value) && value >= 0 && value <= MAX_TIME; }
  function revision(value) { return Number.isSafeInteger(value) && value >= 1 && value <= MAX_REVISION; }
  // Intentionally a small CSS subset: no combinators, pseudo-classes, wildcards,
  // URLs, script, text matching, extraction instructions, or attribute-name indirection.
  function selectorShape(selector) {
    if (typeof selector !== 'string' || selector.length > 160) fail('PROFILE_SELECTOR_INVALID');
    const match = /^(button|article|section|div)?\[([a-z-]+)(?:(\^?=)"([A-Za-z0-9_ .:\-\u3040-\u30ff\u3400-\u9fff]{1,64})")?\]$/.exec(selector);
    if (!match || !ATTRIBUTES.has(match[2])) fail('PROFILE_SELECTOR_INVALID');
    if (match[2] === 'aria-label' && match[1] !== 'button') fail('PROFILE_SELECTOR_INVALID');
    return [match[1] || '', match[2], match[3] || 'presence'].join('|');
  }
  function validateSelector(selector, doc) {
    const shape = selectorShape(selector);
    if (!doc?.querySelector) fail('PROFILE_SELECTOR_VALIDATOR_REQUIRED');
    try { doc.querySelector(selector); } catch { fail('PROFILE_SELECTOR_INVALID'); }
    return shape;
  }
  function freezeProfile(profile) {
    for (const list of Object.values(profile.signals)) Object.freeze(list);
    Object.freeze(profile.signals);
    validatedProfiles.add(profile);
    return Object.freeze(profile);
  }
  const packaged = freezeProfile({schemaVersion:1, profileId:'chatgpt-dom', revision:1, revisionId:'packaged-1', signals:groups});
  const shapes = Object.fromEntries(SIGNALS.map(name => [name, new Set(groups[name].map(selectorShape))]));
  const packagedCandidates = new Set(Object.values(groups).flat());
  let active = packaged;
  function activeProfile() { return active; }
  // Trusted packaged callers only; no page message or remote transport invokes this.
  function activateValidatedProfile(profile) {
    if (!validatedProfiles.has(profile)) fail('PROFILE_NOT_VALIDATED');
    active = profile;
    return active;
  }
  function resetPackaged() { return activateValidatedProfile(packaged); }
  // Only JSON strings enter this boundary; getters, functions and prototypes cannot enter.
  function parseProfile(raw, doc) {
    if (typeof raw !== 'string' || raw.length > MAX_BYTES || new TextEncoder().encode(raw).length > MAX_BYTES) fail('PROFILE_SIZE_INVALID');
    let p; try { p = JSON.parse(raw); } catch { fail('PROFILE_JSON_INVALID'); }
    if (!exact(p, ['schemaVersion','profileId','revision','revisionId','signals']) || p.schemaVersion !== 1 ||
        p.profileId !== 'chatgpt-dom' || !revision(p.revision) || typeof p.revisionId !== 'string' ||
        !/^[a-z0-9-]{1,48}$/.test(p.revisionId) || !exact(p.signals, SIGNALS)) fail('PROFILE_SCHEMA_INVALID');
    for (const [name, list] of Object.entries(p.signals)) {
      if (!Array.isArray(list) || list.length < 1 || list.length > 8 || new Set(list).size !== list.length) fail('PROFILE_SIGNAL_INVALID');
      for (const candidate of list) {
        // Only values may drift; tag, attribute and operator stay category-specific.
        if (!shapes[name].has(validateSelector(candidate, doc)) ||
            (packagedCandidates.has(candidate) && !groups[name].includes(candidate))) fail('PROFILE_SIGNAL_SHAPE_INVALID');
      }
    }
    return freezeProfile(p);
  }
  function selector(name, profile = active) {
    if (!SIGNALS.includes(name)) fail('PROFILE_SIGNAL_UNKNOWN');
    if (!validatedProfiles.has(profile)) fail('PROFILE_NOT_VALIDATED');
    return profile.signals[name].join(', ');
  }
  function health(doc, {known = false, ready = false, provisional = false, ambiguous = false, selectedMain = doc.querySelector('main')} = {}, now = Date.now()) {
    const main = selectedMain;
    const matched = SIGNALS.filter(name => !!main?.querySelector(selector(name)));
    const reasons = [];
    if (ambiguous) reasons.push('REQUEST_AMBIGUOUS');
    else if (!main) reasons.push('MAIN_MISSING');
    else if (!known) reasons.push('STRUCTURE_UNKNOWN');
    else if (provisional) reasons.push('FINAL_CONTROLS_DEFERRED');
    else if (ready && !matched.includes('markdownCopy') && matched.includes('timeline')) reasons.push('MARKDOWN_COPY_MISSING');
    else if (!matched.includes('assistant') && !matched.includes('user')) reasons.push('ROLE_SIGNALS_MISSING');
    const state = !main || ambiguous || !known ? 'incompatible' : reasons.length ? 'degraded' : 'healthy';
    return {state, reasons, matched, profileId:active.profileId, revision:active.revision,
      revisionId:active.revisionId, timestamp:timestamp(now) ? now : 0, remoteStatus:REMOTE_STATUS};
  }
  function parseEnvelope(raw, doc, now, minimumRevision = 1) {
    if (typeof raw !== 'string' || raw.length > MAX_BYTES || new TextEncoder().encode(raw).length > MAX_BYTES) fail('REMOTE_PROFILE_SIZE_INVALID');
    let e; try { e = JSON.parse(raw); } catch { fail('REMOTE_PROFILE_JSON_INVALID'); }
    if (!exact(e, ['schemaVersion','keyId','issuedAt','expiresAt','profile','signature']) || e.schemaVersion !== 1 ||
        e.keyId !== 'owner-1' || !timestamp(now) || !timestamp(e.issuedAt) || !timestamp(e.expiresAt) ||
        e.issuedAt > now + 300000 || e.expiresAt <= now || e.expiresAt <= e.issuedAt ||
        e.expiresAt - e.issuedAt > 30 * 86400000 || !revision(minimumRevision) ||
        typeof e.signature !== 'string' || !/^[a-f0-9]{128}$/.test(e.signature)) fail('REMOTE_PROFILE_ENVELOPE_INVALID');
    const profile = parseProfile(JSON.stringify(e.profile), doc);
    if (profile.revision < minimumRevision) fail('REMOTE_PROFILE_ROLLBACK');
    // Canonical order is defined here, not by JSON property order on the wire.
    const canonicalProfile = {...profile, signals:Object.fromEntries(SIGNALS.map(k => [k, profile.signals[k]]))};
    const signed = JSON.stringify([e.schemaVersion,e.keyId,e.issuedAt,e.expiresAt,
      canonicalProfile.schemaVersion,canonicalProfile.profileId,canonicalProfile.revision,canonicalProfile.revisionId,canonicalProfile.signals]);
    return {profile, signed, signature:e.signature};
  }
  async function verifyEnvelope(raw, doc, {now = Date.now(), minimumRevision = 1, publicKey = OWNER_PUBLIC_KEY, subtle = root.crypto?.subtle} = {}) {
    if (!publicKey) fail(REMOTE_STATUS);
    const parsed = parseEnvelope(raw, doc, now, minimumRevision);
    const key = await subtle.importKey('jwk', publicKey, {name:'ECDSA',namedCurve:'P-256'}, false, ['verify']);
    const signature = Uint8Array.from(parsed.signature.match(/../g), hex => parseInt(hex,16));
    if (!await subtle.verify({name:'ECDSA',hash:'SHA-256'}, key, signature, new TextEncoder().encode(parsed.signed))) fail('REMOTE_PROFILE_SIGNATURE_INVALID');
    return parsed.profile;
  }
  // No fetch, activation message, storage writer or remote host exists in v0.3.0.
  // Future trusted callers must persist the high-water revision before activation,
  // retain signed envelopes, and reverify LKG after restart (including expiry).
  async function selectRemote(remote, lastKnownGood, doc, options = {}) {
    if (!OWNER_PUBLIC_KEY) return {profile:packaged, source:'packaged', reason:REMOTE_STATUS};
    for (const [source, raw] of [['remote',remote],['last-known-good',lastKnownGood]]) {
      if (!raw) continue;
      try {return {profile:await verifyEnvelope(raw, doc, {...options, publicKey:OWNER_PUBLIC_KEY}), source, reason:''};} catch { /* Fall back without exporting untrusted error text. */ }
    }
    return {profile:packaged, source:'packaged', reason:'REMOTE_PROFILE_REJECTED'};
  }
  root.ChappyCompatibility = {CONTENT_PROTOCOL, packaged, SIGNALS, REMOTE_STATUS, activeProfile, activateValidatedProfile, resetPackaged,
    selector, health, parseProfile, parseEnvelope, verifyEnvelope, selectRemote};
  if (typeof module !== 'undefined') module.exports = root.ChappyCompatibility;
})(globalThis);
