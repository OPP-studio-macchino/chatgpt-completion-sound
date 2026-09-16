(function (root) {
  'use strict';
  const STOP = 'button[data-testid="stop-button"], button[aria-label="回答を停止"], button[aria-label="Stop generating"], button[aria-label="Stop response"]';
  const COPY = 'button[data-testid="copy-turn-action-button"], button[aria-label="回答をコピーする"], button[aria-label="Copy response"]';
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
  function read(doc, route, enabled = true) {
    const main = doc.querySelector('main');
    const empty = {route, enabled, user:'', message:'', ready:false, provisional:false, busy:false, blocked:false, error:false};
    if (!main) return empty;
    const busy = [...main.querySelectorAll(STOP)].some(visible) ||
      [...main.querySelectorAll('[data-is-streaming="true"], [data-stream-active="true"]')].some(rendered);
    const turns = [...main.querySelectorAll('[data-turn]')];
    let turn = turns.at(-1);
    const users = [...main.querySelectorAll('[data-message-author-role="user"]')];
    const user = users.at(-1)?.getAttribute('data-message-id') || '';
    let assistant = null;
    if (turn) {
      if (turn.getAttribute('data-turn') === 'assistant') {
        assistant = [...turn.querySelectorAll('[data-message-author-role="assistant"]')].at(-1);
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
    const answerNode = assistant || (assistantTurn ? turn : null);
    const message = assistant?.getAttribute('data-message-id') || (assistantTurn ? turn.getAttribute('data-turn-id') || '' : '');
    const controlReady = !!message && !!turn && rendered(answerNode) && [...turn.querySelectorAll(COPY)].some(rendered);
    // ChatGPT can defer the final action toolbar while a tab is hidden. In that
    // case, require a finished assistant message id and no busy signal; the
    // detector applies a longer settle period before accepting this fallback.
    const hiddenReady = !busy && doc.visibilityState === 'hidden' &&
      !!assistant?.getAttribute('data-message-id') && rendered(assistant);
    const ready = controlReady || hiddenReady;
    const provisional = hiddenReady && !controlReady;
    // Inspect only control labels / alert UI, never message prose.
    const blocked = [...main.querySelectorAll('[role="dialog"], [role="alertdialog"]')].some(visible);
    const alertText = [...main.querySelectorAll('[role="alert"]')].filter(visible).map(e => e.textContent).join(' ');
    const error = /something went wrong|network error|error generating|問題が発生|エラーが発生|接続.*失敗|生成.*失敗/i.test(alertText);
    return {...empty, user, message, ready, provisional, busy, blocked, error};
  }
  root.ChappyDOM = {read, STOP, rendered};
  if (typeof module !== 'undefined') module.exports = root.ChappyDOM;
})(globalThis);
