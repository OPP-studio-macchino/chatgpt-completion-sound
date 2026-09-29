(function (root) {
  'use strict';
  const STOP = 'button[data-testid="stop-button"], button[aria-label="回答を停止"], button[aria-label="Stop generating"], button[aria-label="Stop response"], button[aria-label="停止"]';
  const COPY = 'button[data-testid="copy-turn-action-button"], button[aria-label="回答をコピーする"], button[aria-label="Copy response"]';
  // Privacy-safe structural diagnostics: never copy arbitrary attributes or node text.
  const STRUCTURAL_NAMES = new Set('role type contenteditable aria-busy aria-live aria-atomic aria-disabled data-testid data-state data-slot data-turn data-is-streaming data-stream-active data-message-author-role data-message-id data-turn-id'.split(' '));
  const VALUE_NAMES = new Set('role type contenteditable aria-busy aria-live aria-atomic aria-disabled data-state data-slot'.split(' '));
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
    // Reject prose/URLs; redact identifiers before truncating, including IDs crossing the cap.
    if (testid && /^[A-Za-z0-9_.:-]+$/.test(testid)) return testid
      .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '#')
      .replace(/[a-f0-9]{8,}|[A-Za-z0-9]{16,}/gi, '#').replace(/\d+/g, '#').slice(0, 80);
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
  function read(doc, route, enabled = true, diagnostic) {
    const main = doc.querySelector('main');
    const empty = {route, enabled, user:'', message:'', turn:'', ready:false, provisional:false, busy:false, blocked:false, error:false};
    if (diagnostic) Object.assign(diagnostic.dom, {
      mainCount:doc.querySelectorAll('main').length, selectedMainIndex:main ? 0 : -1,
      documentConversationWrapperCount:doc.querySelectorAll('[data-testid^="conversation-turn-"]').length,
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
    if (!main) return empty;
    const busy = [...main.querySelectorAll(STOP)].some(visible) ||
      [...main.querySelectorAll('[data-is-streaming="true"], [data-stream-active="true"]')].some(rendered);
    const turns = [...main.querySelectorAll('[data-turn], [data-testid^="conversation-turn-"]')];
    let turn = turns.at(-1);
    const users = [...main.querySelectorAll('[data-message-author-role="user"]')];
    let user = users.at(-1)?.getAttribute('data-message-id') || '';
    let assistant = null;
    if (turn) {
      if (turn.getAttribute('data-turn') !== 'user') {
        assistant = turn.matches('[data-message-author-role="assistant"]') ? turn
          : [...turn.querySelectorAll('[data-message-author-role="assistant"]')].at(-1);
      }
    } else {
      const messages = [...main.querySelectorAll('[data-message-author-role]')];
      const last = messages.at(-1);
      if (last?.getAttribute('data-message-author-role') === 'assistant') {
        assistant = last;
        turn = last.closest('[data-testid^="conversation-turn-"], article') || last;
      }
    }
    const assistantTurn = turn?.getAttribute?.('data-turn') === 'assistant';
    const message = assistant?.getAttribute('data-message-id') || (assistantTurn ? turn.getAttribute('data-turn-id') || '' : '');
    const conversationTurnTestId = turn?.closest('[data-testid^="conversation-turn-"]')?.getAttribute('data-testid') || '';
    let turnId = conversationTurnTestId
      ? `${route}\u001f${conversationTurnTestId}`
      : (assistantTurn || assistant) && turn?.getAttribute('data-turn-id') ? `${route}\u001f${turn.getAttribute('data-turn-id')}` : '';
    const opaqueTurn = !!conversationTurnTestId && !turn.hasAttribute('data-turn') &&
      !turn.hasAttribute('data-message-author-role') && !turn.querySelector('[data-message-author-role]');
    const answerNode = assistant || (assistantTurn || opaqueTurn ? turn : null);
    const controlReady = !!(message || turnId) && !!turn && rendered(answerNode) && [...turn.querySelectorAll(COPY)].some(rendered);
    // ChatGPT can defer the final action toolbar while a tab is hidden. In that
    // case, require a finished assistant message id and no busy signal; the
    // detector applies a longer settle period before accepting this fallback.
    const hiddenReady = !busy && doc.visibilityState === 'hidden' &&
      !!assistant?.getAttribute('data-message-id') && rendered(assistant);
    let ready = controlReady || hiddenReady;
    let provisional = hiddenReady && !controlReady;
    let searchUnitAssistant = false, searchUnitUser = false, timelineScoped = false;
    if (!turns.length && !main.querySelector('[data-message-author-role]')) {
      const units = [...main.querySelectorAll('[data-chatgpt-search-unit-key]')];
      const assistantLike = unit => !!unit.querySelector('[data-markdown-han-text], [data-markdown-copy]');
      // Keys are opaque DOM metadata; content.js hashes identities before export.
      const identity = unit => unit ? `${route}\u001fsearch-unit\u001f${unit.getAttribute('data-chatgpt-search-unit-key')}` : '';
      user = identity(units.filter(unit => !assistantLike(unit)).at(-1));
      turn = units.at(-1);
      turnId = identity(turn);
      searchUnitAssistant = !!turn && assistantLike(turn);
      searchUnitUser = !!turn && !searchUnitAssistant;
      ready = searchUnitAssistant && rendered(turn) && !!turn.querySelector('[data-markdown-copy]');
      provisional = false;
      // Live timeline UI places the rendered answer beside its search-index nodes.
      // Restrict the scope to the latest request, never the whole conversation.
      if (turn && main.querySelector('[data-app-action-timeline-scroll]')) {
        timelineScoped = true;
        let scope = turn;
        for (let p = turn.parentElement; p && p !== main; p = p.parentElement) {
          if (p.querySelectorAll('[data-chatgpt-search-unit-key]').length > 2 ||
              p.querySelector('[contenteditable="true"], textarea')) break;
          scope = p;
        }
        const requestUnits = [...scope.querySelectorAll('[data-chatgpt-search-unit-key]')];
        const input = requestUnits[0] || turn;
        // The user/input index stays stable while assistant index nodes are replaced.
        user = `${route}\u001ftimeline-input\u001f${input.getAttribute('data-chatgpt-search-unit-key')}`;
        turnId = user;
        const finalControls = [...scope.querySelectorAll('button[aria-label="回答を再生成"], button[aria-label="Regenerate response"]')];
        // The final action toolbar is the stable completion signal in current
        // timeline UI; data-markdown-copy can be absent on a finished answer.
        ready = !busy && requestUnits.length >= 2 && finalControls.some(rendered);
        searchUnitAssistant = ready || !!scope.querySelector('[data-markdown-han-text]');
        searchUnitUser = !searchUnitAssistant;
      }
    }
    // Inspect only control labels / alert UI, never message prose.
    const blocked = [...main.querySelectorAll('[role="dialog"], [role="alertdialog"]')].some(visible);
    const alertText = [...main.querySelectorAll('[role="alert"]')].filter(visible).map(e => e.textContent).join(' ');
    const error = /something went wrong|network error|error generating|問題が発生|エラーが発生|接続.*失敗|生成.*失敗/i.test(alertText);
    if (diagnostic) {
      const stops = [...main.querySelectorAll(STOP)];
      const streaming = [...main.querySelectorAll('[data-is-streaming="true"], [data-stream-active="true"]')];
      const copies = [...(turn?.querySelectorAll(COPY) || [])];
      Object.assign(diagnostic.dom, {
        conversationWrapperCount:main.querySelectorAll('[data-testid^="conversation-turn-"]').length,
        turnSelectorCount:turns.length, userRoleCount:users.length,
        assistantRoleCount:main.querySelectorAll('[data-message-author-role="assistant"]').length,
        stopMatchedCount:stops.length, stopVisibleCount:stops.filter(visible).length,
        streamingMatchedCount:streaming.length, streamingRenderedCount:streaming.filter(rendered).length,
        copyMatchedCount:copies.length, copyRenderedCount:copies.filter(rendered).length,
        busy, ready, provisional, blocked, error,
        userIdPresent:!!user, messageIdPresent:!!message, turnIdPresent:!!turnId, opaqueTurn,
        selectedIsUser:turn?.getAttribute('data-turn') === 'user' || turn?.getAttribute('data-message-author-role') === 'user' || !!turn?.querySelector('[data-message-author-role="user"]') || searchUnitUser,
        selectedIsAssistant:assistantTurn || !!assistant || searchUnitAssistant
      });
      diagnostic.identity?.('turn', turnId);
      diagnostic.identity?.('testid', conversationTurnTestId);
      diagnostic.identity?.('user', user);
      diagnostic.identity?.('message', message);
    }
    return {...empty, user, message, turn:turnId, ready, provisional, busy, blocked, error,
      ...(searchUnitAssistant && ready ? {settleMsOverride:timelineScoped ? 2000 : 500} : {})};
  }
  root.ChappyDOM = {read, STOP, rendered, structuralSummary, normalizedTestId};
  if (typeof module !== 'undefined') module.exports = root.ChappyDOM;
})(globalThis);
