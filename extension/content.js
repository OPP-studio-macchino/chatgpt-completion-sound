(() => {
  'use strict';
  const CONTENT_VERSION = '0.2.9';
  if (globalThis.__chappySoundLoadedVersion === CONTENT_VERSION) return;
  globalThis.__chappySoundLoadedVersion = CONTENT_VERSION;
  globalThis.__chappySoundLoaded = true;
  const detector = new ChappyCompletionDetector();
  let enabled = false, disposed = false, scheduled = false, lastStatus = '', lastReport = 0;
  let completedMessage = '', completedRoute = '';
  let pendingComplete = null, completeSending = false;
  const send = async (message) => {
    try { return await chrome.runtime.sendMessage(message); }
    catch (e) {
      if (/Extension context invalidated/i.test(String(e?.message || e || ''))) dispose();
      return undefined;
    }
  };
  function dispose() { disposed = true; observer.disconnect(); clearInterval(heartbeat); }
  async function deliverComplete() {
    if (disposed || completeSending || !pendingComplete) return;
    completeSending = true;
    const current = pendingComplete;
    const result = await send({target:'background', type:'COMPLETE', key:current.key});
    completeSending = false;
    if (pendingComplete === current && result?.ok) pendingComplete = null;
  }
  async function scan() {
    if (disposed) return;
    const snap = ChappyDOM.read(document, location.pathname, enabled);
    const completed = detector.step(snap, Date.now());
    if (completed) {completedMessage = completed; completedRoute = snap.route;}
    if (!enabled || snap.busy || snap.error || snap.blocked || snap.message !== completedMessage || snap.route !== completedRoute) completedMessage = '';
    const working = (snap.busy || detector.active) && !detector.cancelled;
    const state = !enabled ? 'off' : snap.blocked ? 'waiting' : snap.error ? 'error' : working ? 'generating' : completedMessage ? 'complete' : 'watching';
    if (lastStatus !== state || Date.now() - lastReport > 30000) { lastStatus = state; lastReport = Date.now(); void send({target:'background', type:'STATUS', state, version:CONTENT_VERSION, visibility:document.visibilityState}); }
    if (completed) {
      // Opaque message IDs are hashed before leaving the content script.
      const bytes = new TextEncoder().encode(completed);
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const key = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('');
      // Keep the completion queued until the background acknowledges receipt.
      // A worker restart between STATUS=complete and COMPLETE must not lose the sound.
      pendingComplete = {key};
      void deliverComplete();
    } else if (pendingComplete) {
      void deliverComplete();
    }
    return {ok:true,busy:snap.busy,ready:snap.ready,visibility:document.visibilityState};
  }
  // Hidden-page timer throttling must not delay a DOM mutation notification.
  function schedule() { if (!disposed && !scheduled) {scheduled=true;queueMicrotask(() => {scheduled=false;void scan();});} }
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {subtree:true, childList:true, attributes:true,
    attributeFilter:['data-testid','data-is-streaming','data-stream-active','data-message-id','data-turn-id','data-turn','aria-label','aria-hidden','hidden','class','style']});
  document.addEventListener('click', e => {
    if (e.target instanceof Element && e.target.closest(ChappyDOM.STOP)) {detector.cancel(); completedMessage = ''; schedule();}
  }, true);
  document.addEventListener('visibilitychange', schedule);
  window.addEventListener('popstate', () => {detector.reset(); completedMessage = ''; schedule();});
  window.addEventListener('pagehide', () => {detector.reset(); completedMessage = ''; void send({target:'background',type:'STATUS',state:'watching',version:CONTENT_VERSION,visibility:document.visibilityState});});
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (msg?.type === 'SCAN_NOW' && !disposed) {scan().then(reply).catch(() => reply({ok:false}));return true;}
    if (msg?.type === 'SET_ENABLED') {enabled = msg.enabled === true; detector.reset(); completedMessage = ''; schedule();}
    return false;
  });
  const heartbeat = setInterval(scan, 1000); // Fallback only; active jobs are also checked by the extension worker.
  send({target:'settings',type:'GET_ENABLED'}).then(c => {enabled = c?.enabled === true; void scan();});
})();
