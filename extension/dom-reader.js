(function (root) {
  'use strict';
  const compatibility = root.ChappyCompatibility || (typeof require === 'function' ? require('./compatibility.js') : null);
  const signal = name => compatibility.selector(name);
  // Trusted packaged rollout structure; deliberately outside remote CSS grammar.
  const ROLLOUT_ACTION = '.turn-action-controls button';
  // Privacy-safe structural diagnostics: never copy arbitrary attributes or node text.
  const STRUCTURAL_NAMES = new Set('role type contenteditable aria-busy aria-live aria-atomic aria-disabled data-testid data-state data-slot data-turn data-is-streaming data-stream-active data-message-author-role data-message-id data-turn-id data-turn-key data-conversation-role data-chatgpt-agent-turn-start data-user-message-bubble data-markdown-text-style data-chatgpt-search-message-ids'.split(' '));
  const VALUE_NAMES = new Set('role type contenteditable aria-busy aria-live aria-atomic aria-disabled'.split(' '));
  function structuralSummary(el, main, parent = el?.parentElement) {
    if (el?.nodeType !== 1) return null;
    let depthFromMain = null;
    for (let node = el, depth = 0; node && depth <= 12; node = depth === 0 ? parent : node.parentElement, depth++) {
      if (node === main) {depthFromMain = depth; break;}
    }
    const attributeNames = el.getAttributeNames().filter(name => STRUCTURAL_NAMES.has(name)).sort().slice(0, 12);
    const summary = {tag:el.tagName.toLowerCase(), parentTag:parent?.tagName?.toLowerCase() || null,
      depthFromMain, attributeNames,
      hasButtonDescendant:!!el.querySelector('button'),
      hasContentEditableDescendant:!!el.querySelector('[contenteditable="true"]'),
      hasTextareaDescendant:!!el.querySelector('textarea')};
    for (const name of attributeNames) {
      if (!VALUE_NAMES.has(name)) continue;
      const value = el.getAttribute(name);
      if (/^[A-Za-z0-9_.:-]{1,40}$/.test(value)) summary[name] = value;
    }
    const pattern = normalizedTestId(el.getAttribute('data-testid'));
    if (pattern) summary['data-testidPattern'] = pattern;
    return summary;
  }
  function normalizedTestId(testid) {
    // Syntax alone cannot distinguish a UI identifier from a private value.
    // Export presence only; opaque completion identities are hashed separately.
    if (testid && /^[A-Za-z0-9_.:-]+$/.test(testid)) return '#';
  }
  function structuralCensus(main) {
    const counts = {};
    for (const selector of ['article','section','form','button','textarea','[contenteditable="true"]','[role]','[aria-busy="true"]','[aria-live]','[data-testid]','[data-state]']) {
      counts[selector] = main?.querySelectorAll(selector).length || 0;
    }
    const names = new Map();
    counts.dataAttributeElements = 0;
    for (const el of main?.querySelectorAll('*') || []) {
      const dataNames = el.getAttributeNames().filter(name => name.startsWith('data-'));
      if (dataNames.length) counts.dataAttributeElements++;
      for (const name of dataNames) {
        if (/^data-[a-z0-9_-]{1,40}$/.test(name)) names.set(name, (names.get(name) || 0) + 1);
      }
    }
    counts.topDataAttributeNames = [...names].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12)
      .map(([name, count]) => ({name, count}));
    return counts;
  }
  function rendered(el) {
    if (!el || !el.isConnected || !el.getClientRects().length) return false;
    // Copy toolbars can be transparent until hover; display/visibility matter, opacity does not.
    for (let p = el; p && p.nodeType === 1; p = p.parentElement) {
      const style = p.ownerDocument.defaultView.getComputedStyle(p);
      if (p.hidden || p.getAttribute('aria-hidden') === 'true' || style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  }
  function visible(el) { return rendered(el) && Number(el.ownerDocument.defaultView.getComputedStyle(el).opacity) > 0; }
  function selectMain(doc) {
    const mains = [...doc.querySelectorAll('main')];
    if (mains.length <= 1) return {main:mains[0] || null, mainCount:mains.length, selectedMainIndex:mains.length - 1};
    // Count packaged conversation categories once each, using the active profile.
    // Node multiplicity, prose, composer size and document order are not evidence.
    const categories = ['turn','message','searchUnit','timeline','request','stop','streaming','finalCopy','finalRegenerate','markdownCopy'];
    const scores = mains.map(main => categories.filter(name => main.querySelector(signal(name))).length);
    const highest = Math.max(...scores);
    const index = scores.indexOf(highest);
    const selectedMainIndex = highest > 0 && scores.lastIndexOf(highest) === index ? index : -1;
    return {main:mains[selectedMainIndex] || null, mainCount:mains.length, selectedMainIndex};
  }
  function read(doc, route, enabled = true, diagnostic) {
    const STOP = signal('stop'), COPY = signal('finalCopy');
    const {main, mainCount, selectedMainIndex} = selectMain(doc);
    const empty = {route, enabled, user:'', message:'', turn:'', ready:false, provisional:false, busy:false, blocked:false, error:false};
    if (diagnostic) Object.assign(diagnostic.dom, {
      mainCount, selectedMainIndex,
      documentConversationWrapperCount:doc.querySelectorAll(signal('wrapper')).length,
      conversationWrapperCount:0, turnSelectorCount:0, userRoleCount:0, assistantRoleCount:0,
      stopMatchedCount:0, stopVisibleCount:0, streamingMatchedCount:0, streamingRenderedCount:0,
      copyMatchedCount:0, copyRenderedCount:0,
      busy:false, ready:false, provisional:false, blocked:false, error:false,
      userIdPresent:false, messageIdPresent:false, turnIdPresent:false,
      opaqueTurn:false, selectedIsUser:false, selectedIsAssistant:false
    });
    if (diagnostic) {
      diagnostic.dom.census = structuralCensus(main);
      diagnostic.dom.focusedElement = structuralSummary(doc.activeElement, main);
    }
    if (!main) {
      const health = compatibility.health(doc, {selectedMain:main, ambiguous:mainCount > 1});
      if (diagnostic) diagnostic.dom.compatibility = health;
      return {...empty, compatibility:health};
    }
    const visibleStop = [...main.querySelectorAll(STOP)].some(visible);
    const streamingRendered = [...main.querySelectorAll(signal('streaming'))].filter(rendered).length;
    const busy = visibleStop || streamingRendered > 0;
    // Confirmed composer structure; never inspect input values or prose.
    // Hidden-tab layout evidence is insufficient for this fallback.
    const composerIdle = doc.visibilityState === 'visible' &&
      [...main.querySelectorAll(signal('composerSubmit'))].some(button => {
        const form = button.closest('form');
        return !!form && !!form.querySelector('textarea, [contenteditable="true"]') &&
          !button.closest(signal('turn') + ', ' + signal('message') + ', ' + signal('searchUnit')) &&
          visible(button) && !button.matches(':disabled') && !button.hasAttribute('disabled') &&
          !button.closest('[aria-disabled="true"]');
      });
    const turns = [...main.querySelectorAll(signal('turn'))];
    let turn = turns.at(-1);
    const users = [...main.querySelectorAll(signal('user'))];
    const latestUser = users.at(-1);
    const userGroupKey = latestUser?.closest('[data-turn-key]')?.getAttribute('data-turn-key');
    let user = latestUser?.getAttribute('data-message-id') || (userGroupKey ? `${route}\u001fgroup-user\u001f${userGroupKey}` : '');
    let assistant = null;
    if (turn) {
      if (turn.getAttribute('data-turn') !== 'user') {
        assistant = [...turn.querySelectorAll(signal('assistant'))].at(-1) || (turn.matches(signal('assistant')) ? turn : null);
      }
    } else {
      const messages = [...main.querySelectorAll(signal('message'))];
      const last = messages.at(-1);
      if (last?.getAttribute('data-message-author-role') === 'assistant') {
        assistant = last;
        turn = last.closest(signal('wrapper')+', article') || last;
      }
    }
    const assistantTurn = turn?.getAttribute?.('data-turn') === 'assistant';
    const message = assistant?.getAttribute('data-message-id') || (assistantTurn ? turn.getAttribute('data-turn-id') || '' : '');
    const conversationTurnTestId = turn?.closest(signal('wrapper'))?.getAttribute('data-testid') || '';
    let turnId = conversationTurnTestId
      ? `${route}\u001f${conversationTurnTestId}`
      : (assistantTurn || assistant) && turn?.getAttribute('data-turn-id') ? `${route}\u001f${turn.getAttribute('data-turn-id')}` : '';
    const group = turn?.matches('[data-turn-key]') ? turn : null;
    const groupKey = group?.getAttribute('data-turn-key');
    // One rollout group holds both roles. Keep user identity stable as the
    // assistant emerges, but give its completion identity a distinct role.
    if (!turnId && !message && groupKey) turnId = `${route}\u001fgroup-${assistant ? 'assistant' : 'user'}\u001f${groupKey}`;
    const opaqueTurn = !!conversationTurnTestId && !turn.hasAttribute('data-turn') &&
      !turn.hasAttribute('data-message-author-role') && !turn.querySelector(signal('message'));
    const answerNode = assistant || (assistantTurn || opaqueTurn ? turn : null);
    const ordered = group ? [...group.querySelectorAll('*')] : [];
    const rolloutReady = !!assistant && !!groupKey && rendered(assistant) &&
      [...group.querySelectorAll(ROLLOUT_ACTION)].some(button =>
        button.closest('[data-turn-key]') === group && rendered(button) &&
        ordered.indexOf(button) > ordered.indexOf(assistant));
    const controlReady = rolloutReady || (!!(message || turnId) && !!turn && rendered(answerNode) &&
      [...turn.querySelectorAll(COPY)].some(button => rendered(button) &&
        (!group || (button.closest('[data-turn-key]') === group && ordered.indexOf(button) > ordered.indexOf(assistant)))));
    // ChatGPT can defer the final action toolbar while a tab is hidden. In that
    // case, require a finished assistant message id and no busy signal; the
    // detector applies a longer settle period before accepting this fallback.
    const hiddenReady = !busy && doc.visibilityState === 'hidden' &&
      (!!assistant?.getAttribute('data-message-id') || (!!groupKey && !!assistant && !!turnId)) && rendered(assistant);
    let ready = controlReady || hiddenReady;
    let provisional = hiddenReady && !controlReady;
    let searchUnitAssistant = false, searchUnitUser = false, timelineScoped = false, ambiguous = false;
    const unitKey = node => node.getAttribute('data-chatgpt-search-unit-key') || node.getAttribute('data-content-search-unit-key') || '';
    const logicalUnits = scope => {
      const seen = new Set();
      return [...scope.querySelectorAll(signal('searchUnit'))].filter(unit => {
        const key = unitKey(unit);
        // Keep the first (outer) representative; unkeyed nodes stay distinct.
        if (!key) return true;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };
    if (!turns.length && !main.querySelector(signal('message'))) {
      const units = logicalUnits(main);
      const assistantLike = unit => !!unit.querySelector(signal('markdown'));
      // Keys are opaque DOM metadata; content.js hashes identities before export.
      const identity = unit => unit ? `${route}\u001fsearch-unit\u001f${unitKey(unit)}` : '';
      user = identity(units.filter(unit => !assistantLike(unit)).at(-1));
      turn = units.at(-1);
      turnId = identity(turn);
      searchUnitAssistant = !!turn && assistantLike(turn);
      searchUnitUser = !!turn && !searchUnitAssistant;
      ready = searchUnitAssistant && rendered(turn) && !!turn.querySelector(signal('markdownCopy'));
      provisional = false;
      // Live timeline UI places the rendered answer beside its search-index nodes.
      // Restrict the scope to the latest request, never the whole conversation.
      if (turn && main.querySelector(signal('timeline'))) {
        timelineScoped = true;
        let scope = turn;
        for (let p = turn.parentElement; p && p !== main; p = p.parentElement) {
          if (logicalUnits(p).length > 2 ||
              p.querySelector('[contenteditable="true"], textarea')) break;
          scope = p;
        }
        const requestUnits = logicalUnits(scope);
        const input = requestUnits[0] || turn;
        // The user/input index stays stable while assistant index nodes are replaced.
        user = `${route}\u001ftimeline-input\u001f${unitKey(input)}`;
        turnId = user;
        const finalControls = [...scope.querySelectorAll(signal('finalRegenerate'))];
        // The final action toolbar is the stable completion signal in current
        // timeline UI; data-markdown-copy can be absent on a finished answer.
        const ordered = [...scope.querySelectorAll('*')];
        const scopedFinal = finalControls.filter(control => ordered.indexOf(control) > ordered.indexOf(turn));
        ambiguous ||= requestUnits.length > 2 || (finalControls.some(rendered) && !scopedFinal.some(rendered));
        ready = !busy && requestUnits.length === 2 && scopedFinal.some(rendered);
        searchUnitAssistant = ready || !!scope.querySelector(signal('markdown'));
        searchUnitUser = !searchUnitAssistant;
      }
    }
    // Inspect only control labels / alert UI, never message prose.
    const blocked = [...main.querySelectorAll('[role="dialog"], [role="alertdialog"]')].some(visible);
    const alertText = [...main.querySelectorAll('[role="alert"]')].filter(visible).map(e => e.textContent).join(' ');
    const error = /something went wrong|network error|error generating|問題が発生|エラーが発生|接続.*失敗|生成.*失敗/i.test(alertText);
    const health = compatibility.health(doc, {selectedMain:main, known:!!(turns.length || assistant || turnId), ready, provisional, ambiguous});
    if (health.state === 'incompatible') {ready = false; provisional = false;}
    if (diagnostic) {
      diagnostic.dom.compatibility = health;
      const stops = [...main.querySelectorAll(STOP)];
      const streaming = [...main.querySelectorAll(signal('streaming'))];
      const copies = [...(turn?.querySelectorAll(COPY) || [])];
      Object.assign(diagnostic.dom, {
        conversationWrapperCount:main.querySelectorAll(signal('wrapper')).length,
        turnSelectorCount:turns.length, userRoleCount:users.length,
        assistantRoleCount:main.querySelectorAll(signal('assistant')).length,
        stopMatchedCount:stops.length, stopVisibleCount:stops.filter(visible).length,
        streamingMatchedCount:streaming.length, streamingRenderedCount:streaming.filter(rendered).length,
        copyMatchedCount:copies.length, copyRenderedCount:copies.filter(rendered).length,
        busy, ready, provisional, blocked, error,
        userIdPresent:!!user, messageIdPresent:!!message, turnIdPresent:!!turnId, opaqueTurn,
        selectedIsUser:group ? !assistant && !!group.querySelector(signal('user')) : turn?.getAttribute('data-turn') === 'user' || turn?.getAttribute('data-message-author-role') === 'user' || !!turn?.querySelector(signal('user')) || searchUnitUser,
        selectedIsAssistant:assistantTurn || !!assistant || searchUnitAssistant
      });
      diagnostic.identity?.('turn', turnId);
      diagnostic.identity?.('testid', conversationTurnTestId);
      diagnostic.identity?.('user', user);
      diagnostic.identity?.('message', message);
    }
    return {...empty, user, userExplicit:users.length > 0, message, turn:turnId, ready, provisional, busy, visibleStop, streamingRendered,
      composerIdle:composerIdle && rendered(answerNode || (searchUnitAssistant ? turn : null)), blocked, error, compatibility:health,
      ...(searchUnitAssistant && ready ? {settleMsOverride:timelineScoped ? 2000 : 500} : {})};
  }
  root.ChappyDOM = {read, get STOP() {return signal('stop');}, rendered, structuralSummary, normalizedTestId};
  if (typeof module !== 'undefined') module.exports = root.ChappyDOM;
})(globalThis);
