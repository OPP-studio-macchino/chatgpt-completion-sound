(() => {
  'use strict';
  const CONTENT_VERSION = '0.3.0';
  globalThis.__chappySoundInstance?.dispose();
  globalThis.__chappySoundLoadedVersion = CONTENT_VERSION;
  globalThis.__chappySoundLoaded = true;
  const detector = new ChappyCompletionDetector();
  const dotsSession = crypto.randomUUID();
  let watchGeneration = crypto.randomUUID(), lastWatchGeneration = '';
  let enabled = false, disposed = false, scheduled = false, lastStatus = '', lastVisibility = '', lastReport = 0;
  let compatibilityHealth = null;
  let completedIdentity = '', completedRoute = '';
  let pendingComplete = null, completeSending = false;
  let pendingStatus = null;
  const deliveryHistory = [];
  const trace = [];
  // Privacy-safe diagnostics, independent of detection and the per-scan trace.
  const structureHistory = [];
  const unitLifecycleHistory = [];
  let unitLifecycleFingerprint = '', lifecyclePending = Promise.resolve();
  let structureFingerprint = '', unitSummaries = {};
  const unitAttributes = ['data-chatgpt-search-unit-key', 'data-content-search-unit-key'];
  const descendantSelectors = ['button','[contenteditable="true"]','[data-markdown-copy]','[data-markdown-han-text]','[data-state]','[data-testid]'];
  function countsWithin(node, selectors) {
    return Object.fromEntries(selectors.map(selector => [selector, node?.querySelectorAll(selector).length || 0]));
  }
  function testIdPatterns(node, limit) {
    return [...new Set([...node?.querySelectorAll('[data-testid]') || []]
      .map(el => ChappyDOM.normalizedTestId(el.getAttribute('data-testid'))).filter(Boolean))].sort().slice(0, limit);
  }
  function buttonCounts(node, attribute) {
    if (attribute.startsWith('data-')) {
      const count = node?.querySelectorAll(`button[${attribute}]`).length || 0;
      return count ? [{count}] : [];
    }
    const counts = new Map();
    for (const button of node?.querySelectorAll('button') || []) {
      const value = button.getAttribute(attribute);
      if (value !== null && /^[A-Za-z0-9_.:-]{1,40}$/.test(value)) counts.set(value, (counts.get(value) || 0) + 1);
    }
    return [...counts].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).slice(0, 8).map(([value, count]) => ({value, count}));
  }
  function recordStructure(event) {
    const main = document.querySelector('main'), form = main?.querySelector('form');
    const structure = {route:event.route,
      counts:countsWithin(main, [...unitAttributes.map(name => `[${name}]`), ...descendantSelectors, 'form']),
      testIdPatterns:testIdPatterns(main, 12),
      buttonStateCounts:buttonCounts(main, 'data-state'), buttonTypeCounts:buttonCounts(main, 'type'),
      formSummary:form ? {...ChappyDOM.structuralSummary(form, main),
        descendantCounts:countsWithin(form, ['button','[contenteditable="true"]','[data-state]','[data-testid]'])} : null};
    // Sequence is metadata, not part of the comparison: text-only scans retain the baseline.
    const fingerprint = JSON.stringify(structure);
    if (fingerprint !== structureFingerprint) {
      structureFingerprint = fingerprint;
      structureHistory.push({sequence:event.sequence, ...structure});
      if (structureHistory.length > 32) structureHistory.shift();
    }
    const latest = {};
    const hashes = [], lifecycleUnits = [];
    unitSummaries = latest;
    for (const attribute of unitAttributes) {
      const unitHashes = [];
      hashes.push(unitHashes);
      latest[attribute] = [...main?.querySelectorAll(`[${attribute}]`) || []].slice(-6).map(unit => {
        const summary = {...ChappyDOM.structuralSummary(unit, main),
          descendantCounts:countsWithin(unit, descendantSelectors), testIdPatterns:testIdPatterns(unit, 8),
          buttonStateCounts:buttonCounts(unit, 'data-state'), buttonTypeCounts:buttonCounts(unit, 'type')};
        // Raw keys never enter diagnostic objects; failures omit the hash, with no fallback.
        unitHashes.push(crypto.subtle.digest('SHA-256', new TextEncoder().encode(unit.getAttribute(attribute))).then(digest => {
          const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('').slice(0,12);
          if (!disposed && unitSummaries === latest) summary.keyHash = hash;
          return hash;
        }).catch(() => null));
        if (attribute === unitAttributes[0]) {
          const parent = unit.parentElement, grandparent = parent?.parentElement;
          lifecycleUnits.push({descendantCounts:summary.descendantCounts,
            parentDescendantCounts:countsWithin(parent, descendantSelectors),
            grandparentDescendantCounts:countsWithin(grandparent, descendantSelectors),
            buttonStateCounts:summary.buttonStateCounts, buttonTypeCounts:summary.buttonTypeCounts,
            parentButtonStateCounts:buttonCounts(parent, 'data-state'), parentButtonTypeCounts:buttonCounts(parent, 'type'),
            grandparentButtonStateCounts:buttonCounts(grandparent, 'data-state'), grandparentButtonTypeCounts:buttonCounts(grandparent, 'type'),
            testIdPatterns:summary.testIdPatterns, parentTestIdPatterns:testIdPatterns(parent, 8),
            grandparentTestIdPatterns:testIdPatterns(grandparent, 8),
            unitHasButtons:!!unit.querySelector('button'), parentHasButtons:!!parent?.querySelector('button'),
            grandparentHasButtons:!!grandparent?.querySelector('button')});
        }
        return summary;
      });
    }
    const hashedUnits = Promise.all(hashes[0]);
    // Keep scan order even if digests resolve out of order; never delay detection.
    lifecyclePending = lifecyclePending.then(async () => {
      const keyHashes = await hashedUnits;
      if (disposed || keyHashes.includes(null)) return;
      const lifecycle = {route:event.route, units:lifecycleUnits.map((unit, i) => ({keyHash:keyHashes[i], ...unit}))};
      const fingerprint = JSON.stringify(lifecycle);
      if (fingerprint === unitLifecycleFingerprint) return;
      unitLifecycleFingerprint = fingerprint;
      unitLifecycleHistory.push({sequence:event.sequence, ...lifecycle});
      if (unitLifecycleHistory.length > 32) unitLifecycleHistory.shift();
    });
    void Promise.all(hashes.map(list => Promise.all(list))).then(([chat, content]) => {
      if (!disposed && unitSummaries === latest && !chat.includes(null) && !content.includes(null) &&
          JSON.stringify(chat) === JSON.stringify(content)) delete latest[unitAttributes[1]];
    });
  }
  let completionStructure = '', structuralChangedAt = 0;
  let sequence = 0;
  let mutationNodes = [];
  const send = async (message, diagnostic, delivery) => {
    if (diagnostic) {diagnostic.attempted = true; diagnostic.result = 'pending';}
    let result;
    try {
      const reply = await chrome.runtime.sendMessage(message);
      result = reply?.ok === true ? 'reply-ok' : reply == null ? 'reply-missing' : 'reply-not-ok';
      return reply;
    }
    catch (e) {
      const invalidated = /Extension context invalidated/i.test(String(e?.message || e || ''));
      result = invalidated ? 'context-invalidated' : 'threw';
      if (invalidated) dispose();
      return undefined;
    }
    finally {
      if (diagnostic) diagnostic.result = result;
      if (delivery) {
        deliveryHistory.push({...delivery, result});
        if (deliveryHistory.length > 32) deliveryHistory.shift();
      }
    }
  };
  async function reportStatus(state, scanSequence, diagnostic) {
    if (disposed) return;
    const now = Date.now();
    if ((pendingStatus?.payload.state ?? lastStatus) !== state ||
        (state === 'generating' && (pendingStatus?.payload.watchGeneration ?? lastWatchGeneration) !== watchGeneration) ||
        (pendingStatus?.payload.visibility ?? lastVisibility) !== document.visibilityState ||
        (!pendingStatus && now - lastReport > 30000)) {
      pendingStatus = {payload:{target:'background', type:'STATUS', state,
        version:CONTENT_VERSION, visibility:document.visibilityState, watchGeneration}, attempt:0, lastAttempt:0, sending:false};
    }
    const current = pendingStatus;
    if (!current || current.sending || (current.attempt && now - current.lastAttempt < 1000)) return;
    current.payload.visibility = document.visibilityState;
    current.sending = true;
    current.lastAttempt = now;
    const reply = await send(current.payload, diagnostic,
      {sequence:scanSequence, kind:'status', state, attempt:++current.attempt});
    current.sending = false;
    // An older reply must never acknowledge a newer desired state, even after A → B → A.
    if (!disposed && pendingStatus === current && reply?.ok === true) {
      lastStatus = state;
      lastVisibility = current.payload.visibility;
      lastWatchGeneration = current.payload.watchGeneration;
      lastReport = Date.now();
      pendingStatus = null;
    }
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    detector.reset();
    observer.disconnect();
    clearInterval(heartbeat);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('visibilitychange', schedule);
    window.removeEventListener('popstate', onPopState);
    window.removeEventListener('pagehide', onPageHide);
    try { chrome.runtime.onMessage.removeListener?.(onMessage); } catch (_) { /* Invalidated context. */ }
  }
  async function deliverComplete(scanSequence) {
    if (disposed || completeSending || !pendingComplete) return;
    completeSending = true;
    const current = pendingComplete;
    const result = await send({target:'background', type:'COMPLETE', key:current.key}, undefined,
      {sequence:scanSequence, kind:'complete', attempt:++current.attempt});
    completeSending = false;
    if (pendingComplete === current && result?.ok === true) pendingComplete = null;
  }
  async function scan(source = 'mutation', transportGeneration = '') {
    if (disposed) return;
    const route = location.pathname;
    const event = {sequence:++sequence, source,
      route:route === '/' ? 'home' : /^\/g\/[^/]+\/c\/[^/]+\/?$/.test(route) ? 'project-conversation' : /^\/c\/[^/]+\/?$/.test(route) ? 'conversation' : 'other',
      previousState:lastStatus, state:'', dom:{}, identities:{}, detector:{},
      status:{attempted:false, result:'not-attempted'}};
    if (source === 'mutation') {event.mutationNodes = mutationNodes; mutationNodes = [];}
    trace.push(event);
    if (trace.length > 64) trace.shift();
    recordStructure(event);
    const snap = ChappyDOM.read(document, route, enabled, {dom:event.dom, identity(name, raw) {
      if (!raw) return;
      // Only hashes enter the trace. Failure omits the hash; no raw fallback.
      void crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)).then(digest => {
        if (!disposed && trace.includes(event)) event.identities[name] = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('').slice(0,12);
      }).catch(() => {});
    }});
    // Fixed-size completion signature. Cursor, timestamp and unrelated control
    // churn must neither walk every descendant nor extend the quiet window.
    const dom = event.dom;
    const structure = JSON.stringify([snap.route, snap.user, snap.turn, snap.message,
      snap.ready, snap.visibleStop, snap.streamingRendered, snap.composerIdle, snap.blocked, snap.error,
      snap.compatibility?.state, enabled, detector.lifecycle,
      dom.mainCount, dom.selectedMainIndex, dom.conversationWrapperCount,
      dom.turnSelectorCount, dom.userRoleCount, dom.assistantRoleCount,
      dom.stopVisibleCount, dom.streamingRenderedCount, dom.copyRenderedCount,
      dom.opaqueTurn, dom.selectedIsUser, dom.selectedIsAssistant]);
    if (structure !== completionStructure) {
      completionStructure = structure;
      structuralChangedAt = Date.now();
    }
    snap.structuralChangedAt = structuralChangedAt;
    snap.completionEligible = !dom.selectedIsUser && (dom.selectedIsAssistant || dom.opaqueTurn);
    compatibilityHealth = snap.compatibility;
    snap.dotsSession = dotsSession;
    const identity = snap.turn || snap.message || '';
    const lifecycleBefore = detector.lifecycle;
    snap.transportCompleted = transportGeneration === watchGeneration;
    const completed = detector.step(snap, Date.now(), event.detector);
    // DOM identities may change within one reply. Only detector lifecycle
    // transitions create a new correlation token for an active job.
    if (detector.active && detector.lifecycle !== lifecycleBefore) watchGeneration = crypto.randomUUID();
    if (completed) {completedIdentity = completed; completedRoute = snap.route;}
    if (!enabled || snap.visibleStop || snap.error || snap.blocked || snap.compatibility?.state === 'incompatible' ||
        (snap.dots ? detector.baseline !== completedIdentity || snap.verifiedWorkSpinnerCount > 0 : identity !== completedIdentity) || snap.route !== completedRoute) completedIdentity = '';
    const working = (snap.dots ? detector.active || detector.startupHold : snap.busy || detector.active) && !detector.cancelled && !completedIdentity;
    const state = !enabled ? 'off' : snap.dots && (detector.active || detector.startupHold) && !detector.cancelled ? 'generating' : snap.blocked ? 'waiting' : snap.error ? 'error' : working ? 'generating' : snap.compatibility?.state === 'incompatible' ? 'waiting' : completedIdentity ? 'complete' : 'watching';
    event.state = state;
    void reportStatus(state, event.sequence, event.status);
    if (completed) {
      // Opaque completion identities are hashed before leaving the content script.
      const bytes = new TextEncoder().encode(completed);
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      if (disposed) return;
      const key = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('');
      // Keep the completion queued until the background acknowledges receipt.
      // A worker restart between STATUS=complete and COMPLETE must not lose the sound.
      pendingComplete = {key, attempt:0};
      void deliverComplete(event.sequence);
    } else if (pendingComplete) {
      void deliverComplete(event.sequence);
    }
    return {ok:true,busy:snap.busy,ready:snap.ready,compatibility:compatibilityHealth,visibility:document.visibilityState};
  }
  // Hidden-page timer throttling must not delay a DOM mutation notification.
  function schedule() { if (!disposed && !scheduled) {scheduled=true;queueMicrotask(() => {scheduled=false;void scan();});} }
  const observer = new MutationObserver(records => {
    if (disposed) return;
    const main = document.querySelector('main');
    // Combined added/removed budget; retain summaries only, never detached DOM nodes.
    mutations: for (const record of records) {
      for (const nodes of [record.addedNodes, record.removedNodes]) {
        for (const node of nodes || []) {
          if (mutationNodes.length >= 8) break mutations;
          if (node.nodeType === 1) mutationNodes.push(ChappyDOM.structuralSummary(node, main, (node.isConnected && node.parentElement) || (record.target.nodeType === 1 ? record.target : null)));
        }
      }
    }
    schedule();
  });
  observer.observe(document.documentElement, {subtree:true, childList:true, attributes:true, characterData:true,
    attributeFilter:['data-turn-key','data-conversation-role','data-chatgpt-agent-turn-start','data-user-message-bubble','data-markdown-text-style','data-chatgpt-search-message-ids','disabled','aria-disabled','type','contenteditable','data-testid','data-is-streaming','data-stream-active','data-message-id','data-turn-id','data-turn','aria-label','aria-hidden','hidden','class','style','data-markdown-copy','data-markdown-han-text','data-chatgpt-search-unit-key','data-content-search-unit-key','data-orbit-profile','data-state','data-status','role','aria-modal']});
  function onClick(e) {
    if (disposed) return;
    if (e.target instanceof Element && e.target.closest(ChappyDOM.STOP)) {
      detector.cancel(); completedIdentity = '';
      watchGeneration = crypto.randomUUID();
      void send({target:'background', type:'CANCEL', version:CONTENT_VERSION, visibility:document.visibilityState});
      schedule();
    }
  }
  function onPopState() {if (disposed) return; detector.reset(); watchGeneration = crypto.randomUUID(); completedIdentity = ''; schedule();}
  function onPageHide() {if (disposed) return; detector.reset(); watchGeneration = crypto.randomUUID(); completedIdentity = ''; void reportStatus('watching', sequence);}
  function onMessage(msg, sender, reply) {
    if (disposed) return false;
    if (msg?.type === 'GET_CONTENT_VERSION') {
      if (chrome.runtime.id && sender.id === chrome.runtime.id) reply({ok:true,version:CONTENT_VERSION,protocol:ChappyCompatibility.CONTENT_PROTOCOL});
      return false;
    }
    if (msg?.type === 'GET_DIAGNOSTICS') {reply({ok:true,...JSON.parse(JSON.stringify({dotsVerifiedWorkSpinners:/^\/dots(?:\/|$)/.test(location.pathname) ? ChappyDOM.dotsWorkSpinners(document) : null, dotsTopStatus:ChappyDOM.dotsTopStatus(document), compatibility:compatibilityHealth, deliveryHistory, unitLifecycleHistory, structureHistory, unitSummaries, trace}))});return false;}
    if (msg?.type === 'SCAN_NOW' && !disposed) {scan('scan-now', chrome.runtime.id && sender.id === chrome.runtime.id && msg.transportCompleted === true ? msg.watchGeneration : '').then(reply).catch(() => reply({ok:false}));return true;}
    if (msg?.type === 'SET_ENABLED') {enabled = msg.enabled === true; detector.reset(); watchGeneration = crypto.randomUUID(); completedIdentity = ''; schedule();}
    return false;
  }
  document.addEventListener('click', onClick, true);
  document.addEventListener('visibilitychange', schedule);
  window.addEventListener('popstate', onPopState);
  window.addEventListener('pagehide', onPageHide);
  chrome.runtime.onMessage.addListener(onMessage);
  const heartbeat = setInterval(() => scan('heartbeat'), 1000); // Fallback only; active jobs are also checked by the extension worker.
  globalThis.__chappySoundInstance = {dispose};
  send({target:'settings',type:'GET_ENABLED'}).then(c => {if (disposed) return; enabled = c?.enabled === true; void scan('init');});
})();
