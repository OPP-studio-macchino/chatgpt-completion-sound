const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const {createHash, webcrypto} = require('node:crypto');
const {parseHTML} = require(require.resolve('linkedom', {paths:[process.env.CHAPPY_DOM_DEPENDENCIES || __dirname]}));
const flush = () => new Promise(setImmediate);
const turn = (id, ready = false) => `<section data-testid="conversation-turn-${id}">${ready ? '<button data-testid="copy-turn-action-button">Copy</button>' : ''}</section>`;
function diagnostics(f) {
  let result;
  for (const listener of f.messages) assert.equal(listener({type:'GET_DIAGNOSTICS'}, {}, value => {result = value;}), false);
  // Model Chrome message serialization into the caller's realm for strict comparisons.
  return JSON.parse(JSON.stringify(result));
}

test('dots Thinking bridges transcript changes but cannot hold yellow forever without verified work', async t => {
  const {panel} = require('./dots-activity-fixture.cjs');
  for (const visibility of ['visible','hidden']) {
    const f = await fixture(); t.after(() => f.dispose());
    f.context.location.pathname = '/dots/fixture';
    Object.defineProperty(f.document, 'visibilityState', {value:visibility, configurable:true});
    const running = panel([false]).replace('<h2>', '<button class="group/aeon-status"><span class="invisible">Active</span><span>Thinking</span></button><h2>');
    const composer = '<div data-codex-composer-root><button aria-label="送信"></button></div>';
    for (const [time, transcript] of [[100,''], [1000,'<article data-message-id="chunk"><div data-markdown-copy><button></button></div>PRIVATE_CHUNK</article>'], [2000,'']]) {
      await f.scan(running + composer + transcript, time);
      assert.equal(f.sent.findLast(m => m.type === 'STATUS').state, 'generating');
    }
    await f.scan(null, 60000); await f.settleHashes();
    assert.equal(f.sent.findLast(m => m.type === 'STATUS').state, 'watching');
    const dom = diagnostics(f).trace.at(-1).dom;
    assert.equal(dom.dotsTopStatus.state, 'thinking');
    assert.equal(dom.dotsTopStatus.ignoredHiddenNodes, 1);
    assert.equal(dom.dotsVerifiedWorkSpinners.verifiedWorkSpinnerCount, 0);
    assert.equal(f.sent.some(m => m.type === 'COMPLETE' || m.type === 'STATUS' && m.state === 'complete'), false);
  }
});

for (const evidence of ['thinking', 'stop']) {
  test(`dots startup ${evidence} bridges disappearance into verified work without a yellow drop`, async t => {
    const {panel} = require('./dots-activity-fixture.cjs');
    const f = await fixture(); t.after(() => f.dispose());
    f.context.location.pathname = '/dots/fixture';
    const startup = evidence === 'thinking' ? panel([]).replace('<h2>',
      '<button class="group/aeon-status"><span>Thinking</span></button><h2>') :
      '<div data-codex-composer-root><button data-testid="stop-button"></button></div>';
    for (const [html, time] of [[startup,100], ['',600], ['<div role="dialog"></div><div role="alert">PRIVATE</div>',1100], [panel([true]),2100]]) {
      await f.scan(html, time);
      assert.equal(f.sent.findLast(m => m.type === 'STATUS').state, 'generating');
      assert.equal(f.sent.filter(m => m.type === 'COMPLETE').length, 0);
    }
    const trace = diagnostics(f).trace;
    assert.equal(trace.find(e => e.detector.startupEvidence === evidence).detector.startupHoldRemaining, '5s');
    assert.equal(trace.at(-1).detector.startupHold, false);
    assert.equal(trace.at(-1).detector.armedLifecycle, true);
    assert.equal(trace.at(-1).detector.startupEvidence, 'spinner');
    assert.doesNotMatch(JSON.stringify(diagnostics(f)), /PRIVATE/);
  });
}

for (const interruption of ['expiry','cancel','block','error','route','pagehide','disable','reinject']) {
  test(`dots startup ${interruption} releases yellow without completion`, async t => {
    const f = await fixture(); t.after(() => f.dispose());
    f.context.location.pathname = '/dots/fixture';
    const stop = '<div data-codex-composer-root><button data-testid="stop-button"><span></span></button></div>';
    await f.scan(stop, 100);
    assert.equal(diagnostics(f).trace.at(-1).detector.startupHold, true);
    if (interruption === 'cancel') f.document.querySelector('button span').dispatchEvent(new f.window.Event('click', {bubbles:true}));
    if (interruption === 'route') f.context.location.pathname = '/dots/another';
    if (interruption === 'pagehide') for (const fn of f.windowListeners.get('pagehide')) fn();
    if (interruption === 'disable') for (const fn of f.messages) fn({type:'SET_ENABLED',enabled:false}, {}, () => {});
    // Remove startup evidence before reinjection, so this represents a new idle document.
    if (interruption === 'reinject') {f.document.querySelector('main').innerHTML = ''; await f.inject();}
    const html = interruption === 'block' ? '<div role="dialog" aria-modal="true"></div>' :
      interruption === 'error' ? '<div role="alert" data-state="error"></div>' : '';
    await f.scan(html, interruption === 'expiry' ? 5099 : 600);
    if (interruption === 'expiry') {
      assert.equal(f.sent.findLast(m => m.type === 'STATUS').state, 'generating');
      await f.scan(null, 5100);
    }
    assert.equal(diagnostics(f).trace.at(-1).detector.startupHold, false);
    assert.notEqual(f.sent.findLast(m => m.type === 'STATUS').state, 'generating');
    await f.scan('', 20000); await f.settleHashes();
    assert.equal(f.sent.filter(m => m.type === 'COMPLETE').length, 0);
  });
}

test('dots spinner lifecycle holds yellow through churn and settle, completes once, and rearms', async t => {
  const {panel} = require('./dots-activity-fixture.cjs');
  const html = (rows, state = 'Active') => panel(rows).replace('<h2>',
    `<button class="group/aeon-status"><span>${state}</span></button><h2>`);
  for (const visibility of ['visible','hidden']) {
    const f = await fixture(); t.after(() => f.dispose());
    f.context.location.pathname = '/dots/fixture';
    Object.defineProperty(f.document, 'visibilityState', {value:visibility, configurable:true});
    const state = () => f.sent.findLast(m => m.type === 'STATUS').state;
    const completions = () => f.sent.filter(m => m.type === 'COMPLETE');
    await f.scan(html([false,false]), 100);
    await f.scan(null, 10000);
    assert.equal(state(), 'watching');
    assert.equal(diagnostics(f).trace.at(-1).detector.activeAfter, false);
    assert.equal(completions().length, 0);
    for (const [time, status] of [[11000,'Thinking'],[21000,'有効'],[31000,'Thinking'],[41000,'Active']]) {
      await f.scan(html([false,true,true], status), time);
      assert.equal(state(), 'generating');
      assert.equal(completions().length, 0);
    }
    await f.scan(html([false,false,true]), 42000);
    assert.equal(state(), 'generating');
    await f.scan(html([false,false,false]), 43000);
    await f.scan(null, 50999);
    assert.equal(state(), 'generating');
    assert.equal(completions().length, 0);
    await f.scan(html([true,false]), 51000);
    assert.equal(diagnostics(f).trace.at(-1).detector.candidatePresent, false);
    await f.scan(html([false,false]), 52000);
    await f.scan(null, 59999);
    assert.equal(state(), 'generating');
    assert.equal(completions().length, 0);
    await f.scan(null, 60000); await f.settleHashes();
    assert.equal(state(), 'complete');
    assert.equal(completions().length, 1);
    await f.scan(null, 90000); await f.settleHashes();
    assert.equal(state(), 'complete');
    assert.equal(completions().length, 1);
    await f.scan(html([true]), 91000);
    assert.equal(state(), 'generating');
    await f.scan(html([false]), 92000);
    await f.scan(null, 100000); await f.settleHashes();
    assert.equal(state(), 'complete');
    assert.equal(completions().length, 2);
    assert.notEqual(completions()[0].key, completions()[1].key);
    await f.scan(null, 110000); await f.settleHashes();
    assert.equal(completions().length, 2);
    assert.doesNotMatch(JSON.stringify(diagnostics(f)), /PRIVATE/);
  }
});

test('verified dots primitive relocates page-wide without a yellow drop; retained idle slot completes with panel closed', async t => {
  const {panel, row} = require('./dots-activity-fixture.cjs');
  for (const visibility of ['visible','hidden']) {
    const f = await fixture(); t.after(() => f.dispose());
    f.context.location.pathname = '/dots/fixture';
    Object.defineProperty(f.document, 'visibilityState', {value:visibility, configurable:true});
    const state = () => f.sent.findLast(m => m.type === 'STATUS').state;
    const count = () => diagnostics(f).dotsVerifiedWorkSpinners.verifiedWorkSpinnerCount;
    const completions = () => f.sent.filter(m => m.type === 'COMPLETE').length;
    // Synthetic placement of the already verified primitive, not evidence for
    // an unobserved second task-card implementation.
    await f.scan(panel([true]) + '<article></article><section></section>', 100);
    const main = f.document.querySelector('main');
    main.querySelector('article').innerHTML = row(true);
    await f.scan(null, 200);
    assert.equal(count(), 2);
    assert.equal(state(), 'generating');
    main.querySelector('[data-orbit-profile]').remove();
    await f.scan(null, 300);
    assert.equal(count(), 1);
    assert.equal(state(), 'generating');
    const button = main.querySelector('article > button');
    main.querySelector('section').append(button);
    await f.scan(null, 20000);
    assert.equal(count(), 1);
    assert.equal(state(), 'generating');
    assert.equal(completions(), 0);
    const icon = button.firstElementChild;
    const running = icon.innerHTML;
    icon.innerHTML = '<svg aria-hidden="true"><path></path></svg>';
    await f.scan(null, 21000);
    await f.scan(null, 28999);
    assert.equal(state(), 'generating');
    assert.equal(count(), 0);
    icon.innerHTML = running;
    await f.scan(null, 29000);
    assert.equal(diagnostics(f).trace.at(-1).detector.candidatePresent, false);
    icon.innerHTML = '<svg aria-hidden="true"><path></path></svg>';
    await f.scan(null, 30000);
    await f.scan(null, 37999);
    assert.equal(completions(), 0);
    await f.scan(null, 38000); await f.settleHashes();
    assert.equal(state(), 'complete');
    assert.equal(completions(), 1);
    await f.scan(null, 60000); await f.settleHashes();
    assert.equal(completions(), 1);
    assert.doesNotMatch(JSON.stringify(diagnostics(f).dotsVerifiedWorkSpinners), /PRIVATE|article|section|profile/);
  }
});

test('shared dots task-button spinner relocates both ways and settles without any panel or idle slot', async t => {
  const {panel} = require('./dots-activity-fixture.cjs');
  const mainSpinner = '<article><button><svg class="motion-safe:animate-spin"><circle></circle></svg></button></article>';
  for (const visibility of ['visible','hidden']) {
    const f = await fixture(); t.after(() => f.dispose());
    f.context.location.pathname = '/dots/fixture';
    Object.defineProperty(f.document, 'visibilityState', {value:visibility, configurable:true});
    const state = () => f.sent.findLast(m => m.type === 'STATUS').state;
    const complete = () => f.sent.filter(m => m.type === 'COMPLETE').length;
    for (const [time, html, count] of [[100,mainSpinner,1], [200,panel([true]),1],
      [300,mainSpinner,1], [400,mainSpinner + panel([true]),2], [500,'',0], [8499,'',0]]) {
      await f.scan(html, time);
      assert.equal(state(), 'generating');
      assert.equal(diagnostics(f).dotsVerifiedWorkSpinners.verifiedWorkSpinnerCount, count);
      assert.equal(complete(), 0);
    }
    await f.scan(mainSpinner, 8500);
    assert.equal(diagnostics(f).trace.at(-1).detector.candidatePresent, false);
    await f.scan('', 8600);
    await f.scan(null, 16599);
    assert.equal(state(), 'generating');
    await f.scan(null, 16600); await f.settleHashes();
    assert.equal(state(), 'complete'); assert.equal(complete(), 1);
    await f.scan(null, 30000); await f.settleHashes();
    assert.equal(complete(), 1);
    await f.scan(mainSpinner, 31000);
    assert.equal(state(), 'generating');
  }
});

test('page-wide dots initial zero never arms; hidden or removed work controls start zero settle', async t => {
  const {row} = require('./dots-activity-fixture.cjs');
  for (const loss of ['hidden','removed']) {
    const f = await fixture(); t.after(() => f.dispose());
    f.context.location.pathname = '/dots/fixture';
    await f.scan('<article>' + row(false) + '</article>', 100);
    await f.scan(null, 20000); await f.settleHashes();
    assert.equal(diagnostics(f).trace.at(-1).detector.activeAfter, false);
    assert.equal(f.sent.filter(m => m.type === 'COMPLETE').length, 0);
    await f.scan('<article>' + row(true) + '</article>', 21000);
    const article = f.document.querySelector('article');
    if (loss === 'hidden') article.hidden = true;
    else article.remove();
    await f.scan(null, 22000);
    await f.scan(null, 60000); await f.settleHashes();
    assert.equal(f.sent.findLast(m => m.type === 'STATUS').state, 'complete');
    assert.equal(diagnostics(f).dotsVerifiedWorkSpinners.verifiedWorkSpinnerCount, 0);
    assert.equal(f.sent.filter(m => m.type === 'COMPLETE').length, 1);
  }
});

for (const noise of ['<div role="dialog">PRIVATE_POPOVER</div>', '<div role="dialog" aria-modal="false"></div>', '<div role="alert">PRIVATE_ALERT</div>']) {
  test(`dots generic UI preserves armed work: ${noise.split('>')[0]}`, async t => {
    const f = await fixture(); t.after(() => f.dispose());
    f.context.location.pathname = '/dots/fixture';
    const spinner = '<button><svg class="motion-safe:animate-spin"><path></path><path></path></svg></button>';
    await f.scan(spinner, 100);
    await f.scan(spinner + noise, 200);
    const event = diagnostics(f).trace.at(-1);
    assert.equal(event.state, 'generating');
    assert.equal(event.detector.activeAfter, true);
    assert.equal(event.detector.lifecycleInterrupted, false);
    assert.equal(event.detector.verifiedBlocked, false);
    assert.equal(event.detector.verifiedError, false);
    await f.scan(noise, 300);
    await f.scan(null, 8300); await f.settleHashes();
    assert.equal(f.sent.filter(m => m.type === 'COMPLETE').length, 1);
  });
}

for (const interruption of ['<div role="dialog" aria-modal="true"></div>', '<div role="alertdialog"></div>',
  '<div role="alert" data-state="error">PRIVATE_ERROR</div>', '<div role="status" data-status="failed"></div>',
  '<div role="alert" aria-label="エラー"></div>']) {
  test(`dots verified interruption requires fresh running evidence: ${interruption.split('>')[0]}`, async t => {
    for (const visibility of ['visible', 'hidden']) {
      const f = await fixture(); t.after(() => f.dispose());
      f.context.location.pathname = '/dots/fixture';
      Object.defineProperty(f.document, 'visibilityState', {value:visibility, configurable:true});
      const spinner = '<button><svg class="motion-safe:animate-spin"><path></path><path></path></svg></button>';
      const state = () => f.sent.findLast(m => m.type === 'STATUS').state;
      const completions = () => f.sent.filter(m => m.type === 'COMPLETE').length;
      await f.scan(spinner, 100);
      const baseline = diagnostics(f).trace.at(-1).detector;
      await f.scan('', 200);
      assert.equal(diagnostics(f).trace.at(-1).detector.zeroSettleActive, true);
      await f.scan(spinner + interruption, 300);
      await f.scan(interruption, 10000); await f.settleHashes();
      assert.equal(state(), 'generating');
      let reason = diagnostics(f).trace.at(-1).detector;
      assert.equal(reason.lifecycleInterrupted, true);
      assert.equal(reason.zeroSettleActive, false);
      assert.equal(reason.verifiedSpinnerCount, 0);
      assert.equal(reason.verifiedBlocked || reason.verifiedError, true);
      assert.equal(completions(), 0);
      await f.scan('', 11000);
      await f.scan(null, 60000); await f.settleHashes();
      assert.equal(state(), 'generating');
      assert.equal(completions(), 0);
      assert.equal(diagnostics(f).trace.at(-1).detector.lifecycleInterrupted, true);
      await f.scan(spinner, 61000);
      reason = diagnostics(f).trace.at(-1).detector;
      assert.equal(reason.lifecycleInterrupted, false);
      assert.equal(reason.activeAfter, baseline.activeAfter);
      assert.equal(reason.verifiedSpinnerCount, 1);
      await f.scan('', 62000);
      await f.scan(null, 69999);
      assert.equal(state(), 'generating');
      await f.scan(null, 70000); await f.settleHashes();
      assert.equal(state(), 'complete');
      assert.equal(completions(), 1);
      await f.scan(null, 90000); await f.settleHashes();
      assert.equal(completions(), 1);
      assert.doesNotMatch(JSON.stringify(diagnostics(f)), /PRIVATE/);
    }
  });
}

test('dots blocked, error, route and cancellation suppress completion', async t => {
  const {panel} = require('./dots-activity-fixture.cjs');
  for (const interruption of ['blocked','error','route','cancel']) {
    const f = await fixture(); t.after(() => f.dispose());
    f.context.location.pathname = '/dots/fixture';
    await f.scan(panel([true]), 100);
    await f.scan(panel([false]), 200);
    let interrupted = panel([false]);
    if (interruption === 'blocked') interrupted += '<div role="alertdialog"></div>';
    if (interruption === 'error') interrupted += '<div role="alert" data-state="error">PRIVATE_ERROR</div>';
    if (interruption === 'route') f.context.location.pathname = '/dots/another';
    if (interruption === 'cancel') {
      interrupted += '<div data-codex-composer-root><button data-testid="stop-button"><span></span></button></div>';
      await f.scan(interrupted, 1000);
      f.document.querySelector('[data-testid="stop-button"] span').dispatchEvent(new f.window.Event('click', {bubbles:true}));
    }
    await f.scan(interrupted, 2000);
    await f.scan(null, 20000); await f.settleHashes();
    assert.equal(f.sent.filter(m => m.type === 'COMPLETE').length, 0, interruption);
    assert.equal(f.sent.findLast(m => m.type === 'STATUS').state,
      ['blocked','error'].includes(interruption) ? 'generating' : 'watching');
    await f.scan(panel([false]), 21000);
    await f.scan(null, 40000); await f.settleHashes();
    assert.equal(f.sent.filter(m => m.type === 'COMPLETE').length, 0);

  }
});

test('observed dots structure cannot mistake intermediate or historical answers for completion', async t => {
  const f = await fixture(); t.after(() => f.dispose());
  f.context.location.pathname = '/dots/fixture';
  const answer = '<main><article data-message-id="opaque"><div data-markdown-copy><button></button></div></article></main>';
  await f.scan(answer + '<div data-codex-composer-root><button aria-label="送信"></button></div>', 100);
  await f.scan(null, 5000);
  await f.scan(answer + '<div data-codex-composer-root><button data-testid="stop-button"></button></div>', 6000);
  assert.equal(f.sent.findLast(m => m.type === 'STATUS').state, 'generating');
  Object.defineProperty(f.document, 'visibilityState', {value:'hidden', configurable:true});
  await f.scan(answer + '<div data-codex-composer-root><button aria-label="送信"></button></div>', 7000);
  await f.scan(null, 20000); await f.settleHashes();
  assert.equal(f.sent.filter(m => m.type === 'COMPLETE').length, 0);
  assert.equal(f.sent.findLast(m => m.type === 'STATUS').state, 'watching');
});

async function fixture({legacy = false, digest = webcrypto.subtle.digest.bind(webcrypto.subtle), statusResult = 'ok', deliveryReply} = {}) {
  const pendingHashes = [];
  const {document, window} = parseHTML('<html><body><main></main></body></html>');
  window.Element.prototype.getClientRects = function() {return [{}];};
  window.getComputedStyle = e => ({display:e.style.display || 'block', visibility:e.style.visibility || 'visible', opacity:'1'});
  Object.defineProperty(document, 'visibilityState', {value:'visible', configurable:true});
  const timers = new Set(), observers = new Set(), messages = new Set(), domListeners = new Map(), windowListeners = new Map(), sent = [];
  for (const type of ['click', 'visibilitychange']) domListeners.set(type, new Set());
  const add = document.addEventListener.bind(document), remove = document.removeEventListener.bind(document);
  document.addEventListener = (type, fn, options) => {domListeners.get(type)?.add(fn); add(type, fn, options);};
  document.removeEventListener = (type, fn, options) => {domListeners.get(type)?.delete(fn); remove(type, fn, options);};
  let now = 0, invalidated = false, cancels = 0;
  const context = vm.createContext({document, window:{
    addEventListener(type, fn) {if (!windowListeners.has(type)) windowListeners.set(type, new Set()); windowListeners.get(type).add(fn);},
    removeEventListener(type, fn) {windowListeners.get(type)?.delete(fn);}
  }, location:{pathname:'/c/fixture'}, Element:window.Element,
  MutationObserver:class {
    constructor(fn) {this.callback = fn; this.observer = new window.MutationObserver(fn);}
    observe(target, options) {this.options = options; observers.add(this); this.observer.observe(target, options);}
    disconnect() {observers.delete(this); this.observer.disconnect();}
  }, chrome:{runtime:{id:'fixture',
    async sendMessage(msg) {
      if (invalidated) throw Error('Extension context invalidated.');
      sent.push(msg);
      if (deliveryReply && ['STATUS', 'COMPLETE'].includes(msg.type)) return deliveryReply(msg);
      if (msg.type === 'STATUS' && statusResult === 'threw') throw Error('synthetic private exception');
      if (msg.type === 'STATUS' && statusResult === 'missing') return undefined;
      if (msg.type === 'STATUS' && statusResult === 'not-ok') return {ok:false};
      return msg.target === 'settings' ? {enabled:true} : {ok:true};
    },
    onMessage:{addListener:fn => messages.add(fn), removeListener:fn => messages.delete(fn)}
  }}, crypto:{randomUUID:()=>webcrypto.randomUUID(),subtle:{digest(...args) {const pending = digest(...args); pendingHashes.push(pending); return pending;}}}, TextEncoder, Date:{now:() => now}, queueMicrotask,
  setInterval(fn) {timers.add(fn); return fn;}, clearInterval:fn => timers.delete(fn)});
  const run = file => vm.runInContext(fs.readFileSync(path.join(__dirname, '../extension', file), 'utf8'), context);
  run('compatibility.js'); run('detector.js'); run('dom-reader.js');
  const cancel = context.ChappyCompletionDetector.prototype.cancel;
  context.ChappyCompletionDetector.prototype.cancel = function() {cancels++; return cancel.call(this);};
  if (legacy) context.__chappySoundLoadedVersion = '0.2.11';
  const inject = async () => {run('content.js'); await flush();};
  await inject();
  return {document, window, context, sent, timers, observers, messages, domListeners, windowListeners, inject,
    async settleHashes() {await Promise.allSettled(pendingHashes); await flush();},
    get cancels() {return cancels;}, invalidate() {invalidated = true;},
    setTime(time) {now = time;},
    async scan(html, time) {now = time; if (html !== null) document.querySelector('main').innerHTML = html; for (const fn of timers) await fn(); await flush();},
    dispose() {context.__chappySoundInstance.dispose();}
  };
}

test('exact Stop label reports generating and nested manual-stop click suppresses completion', async t => {
  const f = await fixture(); t.after(() => f.dispose());
  await f.scan('<form data-chatgpt-composer><button type="button" aria-label="Stop"><span></span></button></form>', 100);
  const snapshot = f.context.ChappyDOM.read(f.document, '/c/fixture');
  assert.equal(snapshot.busy, true);
  assert.equal(snapshot.visibleStop, true);
  assert.equal(f.sent.findLast(m => m.type === 'STATUS').state, 'generating');
  f.document.querySelector('button span').dispatchEvent(new f.window.Event('click', {bubbles:true}));
  assert.equal(f.cancels, 1);
  assert.equal(f.sent.filter(m => m.type === 'CANCEL').length, 1);
  await f.scan(turn('stopped', true), 200);
  await f.scan(null, 10000); await f.settleHashes();
  assert.equal(f.sent.filter(m => m.type === 'COMPLETE').length, 0);
});

const rolloutGroup=(body='',key='PRIVATE_ROLLOUT_KEY')=>`<section data-turn-key="${key}" data-chatgpt-search-message-ids="PRIVATE_SEARCH_MESSAGE_IDS"><div data-user-message-bubble></div>${body}</section>`;
const rolloutAnswer='<div data-conversation-role="assistant"><div data-markdown-text-style="assistant-message">PRIVATE_ANSWER_PROSE</div></div>';
const rolloutAction='<div class="turn-action-controls"><button></button></div>';
test('rollout historical final group does not complete on initial load',async()=>{
 const f=await fixture();
 await f.scan(rolloutGroup(rolloutAnswer+rolloutAction),0);
 await f.scan(null,20000);await f.settleHashes();
 assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,0);
 f.dispose();
});
test('all rollout structural attribute mutations schedule content scans and redact values',async()=>{
 const f=await fixture();
 await f.scan(rolloutGroup(rolloutAnswer),0);
 for(const name of ['data-turn-key','data-conversation-role','data-chatgpt-agent-turn-start','data-user-message-bubble','data-markdown-text-style','data-chatgpt-search-message-ids']) {
  const before=diagnostics(f).trace.length;
  f.document.querySelector('[data-turn-key]').setAttribute(name,'PRIVATE_MUTATION');
  await flush();await f.settleHashes();
  assert.ok(diagnostics(f).trace.length>before,name);
 }
 assert.doesNotMatch(JSON.stringify([diagnostics(f),f.sent]),/PRIVATE_/);
 f.dispose();
});
test('rollout content lifecycle completes once with no legacy roles/testids and no transport',async()=>{
 const f=await fixture();
 await f.scan(rolloutGroup(),0);
 await f.scan(rolloutGroup()+'<button aria-label="Stop generating"></button>',100);
 const generation=f.sent.findLast(m=>m.type==='STATUS').watchGeneration;
 await f.scan(rolloutGroup(rolloutAnswer)+'<button aria-label="Stop generating"></button>',200);
 assert.equal(f.sent.findLast(m=>m.type==='STATUS').watchGeneration,generation);
 await f.scan(rolloutGroup(rolloutAnswer+rolloutAction),300);
 await f.scan(null,2299);assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,0);
 await f.scan(null,2300);await f.settleHashes();
 assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,1);
 assert.equal(f.sent.findLast(m=>m.type==='STATUS').state,'complete');
 await f.scan(null,10000);await f.settleHashes();
 assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,1);
 assert.doesNotMatch(JSON.stringify([diagnostics(f),f.sent]),/PRIVATE_/);
 f.dispose();
});
for(const guard of ['manual stop','error','blocked','incompatible','early action','user only'])test(`rollout content suppresses ${guard}`,async()=>{
 const f=await fixture();
 await f.scan(rolloutGroup()+'<button aria-label="Stop generating"></button>',0);
 if(guard==='manual stop')f.document.querySelector('button').dispatchEvent(new f.window.Event('click',{bubbles:true}));
 let html=rolloutGroup(rolloutAnswer+rolloutAction);
 if(guard==='error')html+='<div role="alert">Network error</div>';
 if(guard==='blocked')html+='<div role="dialog"></div>';
 if(guard==='incompatible')html='<main></main>';
 if(guard==='early action')html=rolloutGroup(rolloutAction+rolloutAnswer);
 if(guard==='user only')html=rolloutGroup(rolloutAction);
 await f.scan(html,100);await f.scan(null,20000);await f.settleHashes();
 assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,0);
 f.dispose();
});

test('visible control-free assistant completes only with a trusted transport hint',async()=>{
 for(const trusted of [false,true]) {
  const f=await fixture();
  await f.scan('<section data-testid="conversation-turn-1"><div data-message-author-role="assistant" data-message-id="synthetic-answer"><p>Synthetic writing block</p></div></section><button data-testid="stop-button">Stop</button>',0);
  await f.scan('<section data-testid="conversation-turn-1"><div data-message-author-role="assistant" data-message-id="synthetic-answer"><p>Synthetic writing block</p></div></section>',100);
  const watchGeneration=f.sent.findLast(m=>m.type==='STATUS').watchGeneration;
  for(const listener of f.messages)await new Promise(resolve=>listener({type:'SCAN_NOW',transportCompleted:true,watchGeneration},{id:trusted?'fixture':'foreign'},resolve));
  assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,0);
  await f.scan(null,4099);assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,0);
  await f.scan(null,4100);await f.settleHashes();
  assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,trusted?1:0);
  await f.scan(null,9000);assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,trusted?1:0);
  f.dispose();
 }
});
test('same active search-unit generation keeps G1 through reclassification and a busy transport hint',async()=>{
 for(const hintTiming of ['before-reclassification','while-busy','after-teardown','typed-reclassification']) {
 const f=await fixture();
 const unit=(key,body='')=>`<section data-chatgpt-search-unit-key="${key}">${body}</section>`;
 const history=unit('history-user')+unit('history-answer','<div data-markdown-copy>Fixture</div>');
 const prompt=history+unit('new-user');
 const pending=prompt+unit('new-answer');
 const writing=hintTiming==='typed-reclassification'
  ? '<section data-testid="conversation-turn-10"><div data-message-author-role="user" data-message-id="fixture-user">Fixture prompt</div></section><section data-testid="conversation-turn-11"><div data-message-author-role="assistant" data-message-id="fixture-answer">Fixture writing block</div></section>'
  : prompt+unit('new-answer','<div data-markdown-han-text>Fixture writing block</div>');
 const busy='<button data-testid="stop-button">Stop</button>';
 await f.scan(history,0);await f.scan(prompt+busy,100);
 const g1=f.sent.findLast(m=>m.type==='STATUS').watchGeneration;
 const hint=async()=>{for(const listener of f.messages)await new Promise(resolve=>listener({type:'SCAN_NOW',transportCompleted:true,watchGeneration:g1},{id:'fixture'},resolve));};
 if(hintTiming==='before-reclassification')await hint();
 await f.scan(pending+busy,200);await f.scan(writing+busy,300);
 assert.equal(f.sent.findLast(m=>m.type==='STATUS').watchGeneration,g1);
 if(hintTiming==='while-busy'||hintTiming==='typed-reclassification')await hint();
 await f.scan(writing,400);if(hintTiming==='after-teardown')await hint();
 await hint(); // Duplicate hints must neither restart stability nor double notify.
 await f.scan(null,4399);assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,0);
 await f.scan(null,4400);await f.settleHashes();assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,1);
 await f.scan(null,9000);assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,1);
 assert.equal(JSON.stringify(diagnostics(f)).includes(g1),false);f.dispose();
 }
});
test('stale transport lifecycle tokens cannot cross new prompt, route, cancel or reinjection',async()=>{
 const answer=(user,id,busy=false)=>`<section data-testid="conversation-turn-${user}"><div data-message-author-role="user" data-message-id="user-${user}"></div></section><section data-testid="conversation-turn-${id}"><div data-message-author-role="assistant" data-message-id="answer-${id}"><p>Synthetic</p></div></section>${busy?'<button data-testid="stop-button">Stop</button>':''}`;
 for(const lifecycle of ['new-prompt','route','cancel','reinjection','disable','navigation']) {
  const f=await fixture();await f.scan(answer(1,2,true),0);await f.scan(answer(1,2),100);
  const stale=f.sent.findLast(m=>m.type==='STATUS').watchGeneration;
  if(lifecycle==='cancel') {
   await f.scan(answer(1,2,true),200);
   f.document.querySelector('[data-testid="stop-button"]').click();
  }
  if(lifecycle==='route')f.context.location.pathname='/c/other';
  if(lifecycle==='reinjection')await f.inject();
  if(lifecycle==='navigation')for(const fn of f.windowListeners.get('popstate'))fn();
  if(lifecycle==='disable')for(const enabled of [false,true])for(const listener of f.messages)listener({type:'SET_ENABLED',enabled},{id:'fixture'},()=>{});
  await f.scan(answer(3,4,true),300);await f.scan(answer(3,4),400);
  const current=f.sent.findLast(m=>m.type==='STATUS').watchGeneration;
  assert.notEqual(current,stale,lifecycle);
  for(const listener of f.messages)await new Promise(resolve=>listener({type:'SCAN_NOW',transportCompleted:true,watchGeneration:stale},{id:'fixture'},resolve));
  await f.scan(null,5000);assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,0,lifecycle);
  const exported=JSON.stringify(diagnostics(f));assert.equal(exported.includes(stale),false);assert.equal(exported.includes(current),false);
  for(const listener of f.messages)await new Promise(resolve=>listener({type:'SCAN_NOW',transportCompleted:true,watchGeneration:current},{id:'fixture'},resolve));
  await f.scan(null,8999);assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,0,lifecycle);
  await f.scan(null,9000);await f.settleHashes();assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,1,lifecycle);
  f.dispose();
 }
});
test('manual stop erases already-recorded busy transport evidence',async()=>{
 const f=await fixture(),answer='<section data-testid="conversation-turn-1"><div data-message-author-role="assistant" data-message-id="fixture-answer">Fixture</div></section>';
 await f.scan(answer+'<button data-testid="stop-button">Stop</button>',0);
 const g1=f.sent.findLast(m=>m.type==='STATUS').watchGeneration;
 for(const listener of f.messages)await new Promise(resolve=>listener({type:'SCAN_NOW',transportCompleted:true,watchGeneration:g1},{id:'fixture'},resolve));
 f.document.querySelector('[data-testid="stop-button"]').click();
 await f.scan(answer,100);await f.scan(null,10000);
 assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,0);f.dispose();
});
test('content version handshake is authenticated, read-only and unavailable after disposal', async t => {
  const f = await fixture();
  t.after(() => f.dispose());
  await f.scan(turn('handshake') + '<button data-testid="stop-button">Stop</button>', 100);
  await f.scan(turn('handshake', true), 200);
  await f.scan(null, 2200);
  await f.settleHashes();
  assert.equal(f.sent.filter(message => message.type === 'STATUS').at(-1).state, 'complete');
  const before = JSON.stringify(diagnostics(f)), sent = f.sent.length;
  const [listener] = f.messages;
  let reply;
  assert.equal(listener({type:'GET_CONTENT_VERSION'}, {id:'fixture'}, value => {reply=value;}), false);
  assert.deepEqual(JSON.parse(JSON.stringify(reply)), {ok:true,version:'0.3.0',protocol:require('../extension/compatibility.js').CONTENT_PROTOCOL});
  assert.equal(JSON.stringify(diagnostics(f)), before);assert.equal(f.sent.length, sent);
  for (const sender of [{}, {id:'foreign'}]) {
    reply=undefined;
    listener({type:'GET_CONTENT_VERSION'}, sender, value => {reply=value;});
    assert.equal(reply, undefined);
  }
  f.context.chrome.runtime.id=undefined;reply=undefined;
  listener({type:'GET_CONTENT_VERSION'}, {id:'fixture'}, value => {reply=value;});
  assert.equal(reply, undefined);
  f.context.chrome.runtime.id='fixture';
  f.dispose();reply=undefined;
  listener({type:'GET_CONTENT_VERSION'}, {id:'fixture'}, value => {reply=value;});
  assert.equal(reply, undefined);
});

test('characterData-only records schedule a private mutation scan without heartbeat after reinjection', async t => {
  const f = await fixture();
  t.after(() => f.dispose());
  f.document.querySelector('main').innerHTML = '<p>PRIVATE_CHARACTER_DATA</p>';
  await flush();
  await f.inject();
  Object.defineProperty(f.document, 'visibilityState', {value:'hidden', configurable:true});
  assert.equal(f.timers.size, 1);
  for (const set of [f.observers, f.messages, ...f.domListeners.values(), ...f.windowListeners.values()]) assert.equal(set.size, 1);
  const [observer] = f.observers;
  assert.equal(observer.options.subtree, true);
  assert.equal(observer.options.childList, true);
  assert.equal(observer.options.attributes, true);
  assert.equal(observer.options.characterData, true);
  assert.equal(observer.options.characterDataOldValue, undefined);
  assert.equal(observer.options.attributeOldValue, undefined);
  assert.deepEqual(Array.from(observer.options.attributeFilter), [
    'data-turn-key','data-conversation-role','data-chatgpt-agent-turn-start','data-user-message-bubble','data-markdown-text-style','data-chatgpt-search-message-ids',
    'disabled','aria-disabled','type','contenteditable',
    'data-testid','data-is-streaming','data-stream-active','data-message-id','data-turn-id','data-turn',
    'aria-label','aria-hidden','hidden','class','style','data-markdown-copy','data-markdown-han-text',
    'data-chatgpt-search-unit-key','data-content-search-unit-key','data-orbit-profile','data-state','data-status','role','aria-modal'
  ]);
  const before = diagnostics(f).trace.length;
  // Deliver only a browser-shaped characterData record, with no childList fallback.
  observer.callback([{type:'characterData', target:f.document.querySelector('p').firstChild,
    addedNodes:[], removedNodes:[], oldValue:null}]);
  await flush();
  await f.settleHashes();
  const payload = diagnostics(f);
  assert.equal(payload.trace.length, before + 1);
  assert.equal(payload.trace.at(-1).source, 'mutation');
  assert.deepEqual(payload.trace.at(-1).mutationNodes, []);
  assert.doesNotMatch(JSON.stringify(payload), /PRIVATE_CHARACTER_DATA|textContent|innerText|oldValue/);
});

test('search-unit marker and key mutations schedule private scans and use the normal completion settle path', async t => {
  const f = await fixture();
  t.after(() => f.dispose());
  Object.defineProperty(f.document, 'visibilityState', {value:'hidden', configurable:true});
  f.document.querySelector('main').innerHTML = '<section data-chatgpt-search-unit-key="PRIVATE_USER"><p>PRIVATE_PROMPT</p></section>' +
    '<section data-chatgpt-search-unit-key="PRIVATE_ASSISTANT"><p data-markdown-han-text="PRIVATE_HAN">PRIVATE_ANSWER</p></section>';
  await flush();
  const unit = f.document.querySelectorAll('section')[1], answer = unit.querySelector('p');
  f.setTime(100);
  let before = diagnostics(f).trace.length;
  unit.setAttribute('data-chatgpt-search-unit-key', 'PRIVATE_NEXT_ASSISTANT');
  await flush();
  assert.equal(diagnostics(f).trace.length, before + 1);
  assert.equal(diagnostics(f).trace.at(-1).source, 'mutation');
  assert.equal(diagnostics(f).trace.at(-1).state, 'generating');
  f.setTime(200);
  before = diagnostics(f).trace.length;
  answer.setAttribute('data-markdown-copy', 'PRIVATE_COPY');
  await flush();
  assert.equal(diagnostics(f).trace.length, before + 1);
  let event = diagnostics(f).trace.at(-1);
  assert.equal(event.source, 'mutation');
  assert.equal(event.dom.ready, true);
  assert.equal(event.detector.candidatePresent, true);
  assert.equal(f.sent.filter(m => m.type === 'COMPLETE').length, 0);
  // The observer starts the existing 500ms search-unit settle path; elapsed time alone does not complete it.
  await f.scan(null, 699);
  assert.equal(f.sent.filter(m => m.type === 'COMPLETE').length, 0);
  await f.scan(null, 700);
  await f.settleHashes();
  assert.equal(f.sent.filter(m => m.type === 'COMPLETE').length, 1);
  assert.equal(diagnostics(f).trace.at(-1).state, 'complete');
  const payload = diagnostics(f);
  for (const mutation of payload.trace.filter(e => e.source === 'mutation').slice(-2)) assert.deepEqual(mutation.mutationNodes, []);
  assert.doesNotMatch(JSON.stringify(payload), /PRIVATE_|textContent|innerText|oldValue/);
});

for (const failure of ['missing', 'not-ok', 'threw']) {
  for (const state of ['generating', 'complete']) {
    test(`${state} STATUS retries ${failure} replies after 1s independently of COMPLETE`, async t => {
      let attempts = 0;
      const f = await fixture({deliveryReply:msg => {
        if (msg.type === 'STATUS' && msg.state === state && ++attempts === 1) {
          if (failure === 'threw') throw Error('PRIVATE failure');
          return failure === 'missing' ? undefined : {ok:false};
        }
        return {ok:true};
      }});
      t.after(() => f.dispose());
      await f.scan(turn(0, true), 50);
      await f.scan(turn(1), 100);
      if (state === 'complete') {
        await f.scan(turn(1, true), 200);
        await f.scan(null, 2300);
        await f.settleHashes();
        assert.equal(f.sent.filter(m => m.type === 'COMPLETE').length, 1);
        assert.equal(diagnostics(f).deliveryHistory.find(e => e.kind === 'complete').result, 'reply-ok');
      }
      const firstTime = state === 'generating' ? 100 : 2300;
      assert.equal(attempts, 1);
      const history = () => diagnostics(f).deliveryHistory.filter(e => e.kind === 'status' && e.state === state);
      assert.equal(history()[0].result, failure === 'missing' ? 'reply-missing' : failure === 'not-ok' ? 'reply-not-ok' : 'threw');
      for (const delta of [1, 500, 999]) await f.scan(null, firstTime + delta);
      assert.equal(attempts, 1);
      assert.deepEqual(diagnostics(f).trace.at(-1).status, {attempted:false, result:'not-attempted'});
      await f.scan(null, firstTime + 1000);
      assert.equal(attempts, 2);
      assert.deepEqual(history().map(e => e.attempt), [1, 2]);
      assert.equal(history().at(-1).result, 'reply-ok');
      assert.deepEqual(diagnostics(f).trace.at(-1).status, {attempted:true, result:'reply-ok'});
      await f.scan(null, firstTime + 2000);
      assert.equal(attempts, 2);
      assert.equal(f.sent.filter(m => m.type === 'COMPLETE').length, state === 'complete' ? 1 : 0);
    });
  }
}

test('stale in-flight STATUS acknowledgement cannot clear a newer pending desired state', async t => {
  let release, generatingAttempts = 0;
  const f = await fixture({deliveryReply:msg => {
    if (msg.state === 'waiting') return new Promise(resolve => {release = resolve;});
    if (msg.state === 'generating' && ++generatingAttempts === 1) return {ok:false};
    return {ok:true};
  }});
  t.after(() => f.dispose());
  await f.scan('<button data-testid="stop-button">Stop</button>', 100);
  assert.equal(generatingAttempts, 1);
  release({ok:true});
  await flush();
  await f.scan(null, 1099);
  assert.equal(generatingAttempts, 1);
  await f.scan(null, 1100);
  assert.equal(generatingAttempts, 2);
  assert.equal(diagnostics(f).deliveryHistory.at(-1).result, 'reply-ok');
  await f.scan(null, 2100);
  assert.equal(generatingAttempts, 2);
});

test('healthy STATUS cadence starts at acknowledgement and avoids duplicate in-flight sends', async t => {
  let release, attempts = 0;
  const f = await fixture({deliveryReply:() => {
    if (++attempts === 1) return new Promise(resolve => {release = resolve;});
    return {ok:true};
  }});
  t.after(() => f.dispose());
  await f.scan(null, 5000);
  assert.equal(attempts, 1);
  release({ok:true});
  await flush();
  for (const time of [5001, 6000, 30001, 35000]) await f.scan(null, time);
  assert.equal(attempts, 1);
  await f.scan(null, 35001);
  assert.equal(attempts, 2);
  await f.scan(null, 36001);
  assert.equal(attempts, 2);
});

test('COMPLETE delivery diagnostics retain retry results without keys or private content', async t => {
  let attempts = 0;
  const f = await fixture({deliveryReply:msg => {
    if (msg.type !== 'COMPLETE') return {ok:true};
    attempts++;
    if (attempts === 1) return undefined;
    if (attempts === 2) return {ok:false};
    if (attempts === 3) throw Error('PRIVATE failure');
    return {ok:true};
  }});
  t.after(() => f.dispose());
  await f.scan(turn(0, true), 50);
  const rawId = '12345678-abcd-4321-abcd-123456789abc';
  await f.scan(turn(rawId) + '<p>PRIVATE plaintext</p>', 100);
  await f.scan(turn(rawId, true), 200);
  await f.scan(null, 2300);
  await f.settleHashes();
  // Hash completion may schedule the first attempt after the scan resolves.
  for (let i = attempts; i < 4; i++) await f.scan(null, 3300 + i * 1000);
  const history = diagnostics(f).deliveryHistory.filter(e => e.kind === 'complete');
  assert.deepEqual(history.map(e => e.result), ['reply-missing', 'reply-not-ok', 'threw', 'reply-ok']);
  assert.deepEqual(history.map(e => e.attempt), [1, 2, 3, 4]);
  for (const entry of history) assert.deepEqual(Object.keys(entry).sort(), ['attempt','kind','result','sequence']);
  const serialized = JSON.stringify(diagnostics(f));
  assert.doesNotMatch(serialized, /PRIVATE|\/c\/fixture/);
  assert.equal(serialized.includes(rawId), false);
  for (const msg of f.sent.filter(m => m.type === 'COMPLETE')) assert.equal(serialized.includes(msg.key), false);
  await f.scan(null, 10000);
  assert.equal(attempts, 4);
});

test('deliveryHistory caps at 32 and reinjection discards old in-flight delivery results', async t => {
  const f = await fixture();
  t.after(() => f.dispose());
  for (let i = 1; i <= 40; i++) await f.scan(null, i * 30001);
  const history = diagnostics(f).deliveryHistory;
  assert.equal(history.length, 32);
  assert.deepEqual(history.map(e => e.sequence), Array.from({length:32}, (_, i) => i + 10));
  for (const entry of history) assert.deepEqual(Object.keys(entry).sort(), ['attempt','kind','result','sequence','state']);
  let release;
  const send = f.context.chrome.runtime.sendMessage;
  f.context.chrome.runtime.sendMessage = msg => msg.type === 'STATUS'
    ? new Promise(resolve => {release = resolve;}) : send(msg);
  await f.scan(null, 41 * 30001);
  f.context.chrome.runtime.sendMessage = send;
  await f.inject();
  const reset = diagnostics(f).deliveryHistory;
  assert.deepEqual(reset, [{sequence:1, kind:'status', state:'waiting', attempt:1, result:'reply-ok'}]);
  release({ok:true});
  await flush();
  assert.deepEqual(diagnostics(f).deliveryHistory, reset);
});

for (const kind of ['STATUS', 'COMPLETE']) {
  test(`${kind} context invalidation disposes and prevents subsequent retries`, async t => {
    const f = await fixture();
    t.after(() => f.dispose());
    let attempts = 0;
    const send = f.context.chrome.runtime.sendMessage;
    f.context.chrome.runtime.sendMessage = msg => {
      if (msg.type === kind) {attempts++; throw Error('Extension context invalidated.');}
      return send(msg);
    };
    await f.scan(turn(0, true), 50);
    await f.scan(turn(1), 100);
    if (kind === 'COMPLETE') {
      await f.scan(turn(1, true), 200);
      await f.scan(null, 2300);
      await f.settleHashes();
    }
    assert.equal(attempts, 1);
    for (const set of [f.timers, f.observers, f.messages, ...f.domListeners.values(), ...f.windowListeners.values()]) assert.equal(set.size, 0);
    await f.scan(null, 5000);
    assert.equal(attempts, 1);
  });
}

test('legacy same-version marker allows connection; reinjection leaves one complete lifecycle', async () => {
  const f = await fixture({legacy:true});
  assert.equal(f.sent.filter(m => m.type === 'STATUS').length, 1);
  // Existing completed turn is historical baseline before a same-version reload.
  await f.scan(turn(0, true), 50);
  const first = f.context.__chappySoundInstance;
  await f.inject();
  assert.notEqual(first, f.context.__chappySoundInstance);
  assert.equal(f.timers.size, 1);
  for (const set of [f.observers, f.messages, ...f.domListeners.values(), ...f.windowListeners.values()]) assert.equal(set.size, 1);
  f.sent.length = 0;
  for (const fn of f.messages) await new Promise(resolve => assert.equal(fn({type:'SCAN_NOW'}, {}, resolve), true));
  await f.scan(turn(1), 100);
  await f.scan(turn(1, true), 200);
  await f.scan(null, 2300);
  await f.scan(null, 5000);
  assert.deepEqual(f.sent.filter(m => m.type === 'STATUS').map(m => m.state), ['generating', 'complete']);
  assert.equal(f.sent.filter(m => m.type === 'COMPLETE').length, 1);
  await f.scan(turn(2) + '<button data-testid="stop-button">Stop</button>', 6000);
  f.document.querySelector('[data-testid="stop-button"]').dispatchEvent(new f.window.Event('click', {bubbles:true}));
  await f.scan(turn(2, true), 6100);
  await f.scan(null, 9000);
  assert.equal(f.cancels, 1);
  assert.equal(f.sent.filter(m => m.type === 'COMPLETE').length, 1);
  f.dispose();
  for (const set of [f.timers, f.observers, f.messages, ...f.domListeners.values(), ...f.windowListeners.values()]) assert.equal(set.size, 0);
});

test('invalidated context disposes every content resource', async () => {
  const f = await fixture();
  f.invalidate();
  // Force a STATUS transition so the invalidated runtime is actually observed.
  await f.scan('<button data-testid="stop-button">Stop</button>', 100);
  for (const set of [f.timers, f.observers, f.messages, ...f.domListeners.values(), ...f.windowListeners.values()]) assert.equal(set.size, 0);
});

test('reinjection cancels a pending hash from the disposed instance', async () => {
  const releases = [];
  const f = await fixture({digest:() => new Promise(resolve => {releases.push(resolve);})});
  // Baseline the historical turn; only the next role-less turn is a generation.
  await f.scan(turn(0, true), 50);
  await f.scan(turn(1), 100);
  await f.scan(turn(1, true), 200);
  const pending = f.scan(null, 2300);
  await flush();
  await f.inject();
  releases.forEach(release => release(new ArrayBuffer(32)));
  await pending;
  assert.equal(f.sent.filter(m => m.type === 'COMPLETE').length, 0);
  f.dispose();
});

test('role-less DOM keeps route identity and requires rendered final controls without reading prose', async () => {
  const f = await fixture();
  const main = f.document.querySelector('main');
  main.innerHTML = '<section data-turn="assistant" data-turn-id="old"></section>' + turn(1);
  Object.defineProperty(main.lastElementChild, 'textContent', {get() {throw Error('conversation prose read');}});
  let snap = f.context.ChappyDOM.read(f.document, '/c/a');
  assert.equal(snap.turn, '/c/a\u001fconversation-turn-1');
  assert.equal(snap.ready, false);
  main.innerHTML = turn(1, true);
  assert.equal(f.context.ChappyDOM.read(f.document, '/c/b').turn, '/c/b\u001fconversation-turn-1');
  assert.equal(f.context.ChappyDOM.read(f.document, '/c/b').ready, true);
  main.querySelector('button').style.display = 'none';
  assert.equal(f.context.ChappyDOM.read(f.document, '/c/b').ready, false);
  Object.defineProperty(f.document, 'visibilityState', {value:'hidden'});
  assert.equal(f.context.ChappyDOM.read(f.document, '/c/b').ready, false);
  f.dispose();
});

test('diagnostics are read-only, bounded, hash-only and reset on reinjection', async () => {
  const f = await fixture();
  f.context.location.pathname = '/g/g-p-secret-project/c/secret-chat';
  await f.scan('<section data-testid="conversation-turn-12345678-abcd-4321-abcd-123456789abc" data-turn="assistant" data-turn-id="secret-turn"><div data-message-author-role="user" data-message-id="secret-user">synthetic private prompt</div><div data-message-author-role="assistant" data-message-id="secret-message">synthetic private answer</div><button data-testid="copy-turn-action-button">synthetic copy label</button></section><input value="synthetic input"><div role="alert">synthetic alert</div>', 100);
  // Drain native WebCrypto work without relying on a fixed sleep.
  for (let i = 0; i < 100 && Object.keys(diagnostics(f).trace.at(-1).identities).length < 4; i++) await flush();
  const before = diagnostics(f);
  const last = before.trace.at(-1);
  assert.equal(last.route, 'project-conversation');
  assert.deepEqual(Object.keys(last.identities).sort(), ['message','testid','turn','user']);
  for (const hash of Object.values(last.identities)) assert.match(hash, /^[a-f0-9]{12}$/);
  assert.equal(JSON.stringify(before).includes('secret'), false);
  assert.equal(JSON.stringify(before).includes('synthetic'), false);
  assert.equal(JSON.stringify(before.trace).includes('/g/'), false);
  for (const value of Object.values(last.detector)) assert.equal(typeof value, 'boolean');
  const sentBefore = JSON.stringify(f.sent);
  const read = f.context.ChappyDOM.read, step = f.context.ChappyCompletionDetector.prototype.step;
  f.context.ChappyDOM.read = () => {throw Error('retrieval scanned DOM');};
  f.context.ChappyCompletionDetector.prototype.step = () => {throw Error('retrieval stepped detector');};
  assert.equal(JSON.stringify(diagnostics(f)), JSON.stringify(before));
  assert.equal(JSON.stringify(f.sent), sentBefore);
  const copy = diagnostics(f); copy.trace.length = 0;
  assert.equal(JSON.stringify(diagnostics(f)), JSON.stringify(before));
  f.context.ChappyDOM.read = read; f.context.ChappyCompletionDetector.prototype.step = step;
  for (let i = 0; i < 70; i++) await f.scan(null, 200 + i);
  assert.equal(diagnostics(f).trace.length, 64);
  await f.inject();
  assert.equal(f.messages.size, 1);
  assert.equal(diagnostics(f).trace.length, 1);
  assert.equal(diagnostics(f).trace[0].sequence, 1);
  assert.equal(diagnostics(f).trace[0].source, 'init');
  f.dispose();
});

test('structureHistory keeps its baseline and distinct unit counts through seventy unchanged scans', async t => {
  const f = await fixture();
  t.after(() => f.dispose());
  const chat = 'data-chatgpt-search-unit-key', content = 'data-content-search-unit-key';
  const baseline = diagnostics(f).structureHistory;
  assert.equal(baseline.length, 1);
  assert.equal(baseline[0].sequence, 1);
  assert.equal(baseline[0].counts[`[${chat}]`], 0);
  assert.equal(baseline[0].counts[`[${content}]`], 0);
  await f.scan('<div>PRIVATE initial prose</div>', 1);
  assert.deepEqual(diagnostics(f).structureHistory, baseline);
  const unit = f.document.querySelector('main > div');
  unit.setAttribute(chat, 'PRIVATE_CHAT_KEY');
  await f.scan(null, 2);
  unit.setAttribute(content, 'PRIVATE_CONTENT_KEY');
  await f.scan(null, 3);
  unit.removeAttribute(chat);
  await f.scan(null, 4);
  const distinct = diagnostics(f).structureHistory;
  assert.deepEqual(distinct.map(entry => [entry.counts[`[${chat}]`], entry.counts[`[${content}]`]]),
    [[0, 0], [1, 0], [1, 1], [0, 1]]);
  assert.deepEqual(distinct[0], baseline[0]);
  assert.ok(distinct.every((entry, index) => !index || entry.sequence > distinct[index - 1].sequence));
  unit.textContent = 'PRIVATE changed prose';
  unit.setAttribute(content, 'PRIVATE_REPLACEMENT_KEY');
  for (let i = 0; i < 70; i++) await f.scan(null, 10 + i);
  assert.equal(diagnostics(f).trace.length, 64);
  assert.deepEqual(diagnostics(f).structureHistory, distinct);
});

test('structureHistory caps structural changes at the latest thirty-two entries', async t => {
  const f = await fixture();
  t.after(() => f.dispose());
  const main = f.document.querySelector('main');
  for (let i = 1; i <= 40; i++) {
    main.append(f.document.createElement('button'));
    await f.scan(null, i);
    assert.equal(diagnostics(f).structureHistory.length, Math.min(i + 1, 32));
  }
  assert.deepEqual(diagnostics(f).structureHistory.map(entry => entry.counts.button),
    Array.from({length:32}, (_, index) => index + 9));
});

test('unitSummaries keeps the last six units per attribute and never exposes raw keys before or after WebCrypto', async t => {
  let release;
  const gate = new Promise(resolve => {release = resolve;});
  const digests = [];
  const f = await fixture({digest:(...args) => {
    const pending = gate.then(() => webcrypto.subtle.digest(...args));
    digests.push(pending);
    return pending;
  }});
  t.after(() => f.dispose());
  const keys = {
    'data-chatgpt-search-unit-key':Array.from({length:9}, (_, i) => `PRIVATE_CHAT_UNIT_${i}`),
    'data-content-search-unit-key':Array.from({length:8}, (_, i) => `PRIVATE_CONTENT_UNIT_${i}`)
  };
  await f.scan(Object.entries(keys).map(([attribute, values]) =>
    values.map(key => `<section ${attribute}="${key}"></section>`).join('')).join(''), 1);
  const pending = diagnostics(f);
  for (const [attribute, values] of Object.entries(keys)) {
    assert.equal(pending.unitSummaries[attribute].length, 6);
    assert.ok(pending.unitSummaries[attribute].every(unit => !Object.hasOwn(unit, 'keyHash')));
    for (const key of values) assert.equal(JSON.stringify(pending).includes(key), false, key);
  }
  release();
  await Promise.all(digests);
  await flush();
  const settled = diagnostics(f);
  for (const [attribute, values] of Object.entries(keys)) {
    const units = settled.unitSummaries[attribute];
    assert.deepEqual(units.map(unit => unit.keyHash),
      values.slice(-6).map(key => createHash('sha256').update(key).digest('hex').slice(0, 12)));
    for (const unit of units) assert.match(unit.keyHash, /^[a-f0-9]{12}$/);
    for (const key of values) assert.equal(JSON.stringify(settled).includes(key), false, key);
  }
});

test('unit descendant counts and normalized patterns exclude private content from all structural diagnostics', async t => {
  const f = await fixture();
  t.after(() => f.dispose());
  const attributes = ['data-chatgpt-search-unit-key', 'data-content-search-unit-key'];
  const descendants = '<button type="button" data-state="closed" data-testid="control-123" aria-label="PRIVATE_BUTTON_LABEL" title="PRIVATE_BUTTON_TITLE" class="PRIVATE_BUTTON_CLASS" id="PRIVATE_BUTTON_ID" style="--private:PRIVATE_BUTTON_STYLE">PRIVATE button prose</button>' +
    '<button type="submit" data-state="open" data-testid="control-456"></button>' +
    '<button type="button" data-state="closed"></button>' +
    '<button type="PRIVATE type prose" data-state="PRIVATE state prose" data-testid="PRIVATE testid prose"></button>' +
    '<div contenteditable="true" data-markdown-copy="PRIVATE_COPY" data-markdown-han-text="PRIVATE_HAN" data-state="open" data-testid="result-987654-12345678-abcd-4321-abcd-123456789abc-deadbeef-AzByCxDwEvFuGtHs">PRIVATE answer prose</div>' +
    '<div contenteditable="false" data-markdown-copy="PRIVATE_COPY"></div><span data-markdown-han-text="PRIVATE_HAN"></span><div data-state="closed"></div>' +
    '<input value="PRIVATE_INPUT_ATTRIBUTE"><textarea>PRIVATE textarea prose</textarea><a href="https://private.invalid/PRIVATE_HREF">PRIVATE link prose</a>';
  await f.scan('<form aria-label="PRIVATE_FORM_LABEL" title="PRIVATE_FORM_TITLE" class="PRIVATE_FORM_CLASS" id="PRIVATE_FORM_ID" style="--private:PRIVATE_FORM_STYLE">' + attributes.map(attribute =>
    `<section ${attribute}="PRIVATE_UNIT_KEY_${attribute}" contenteditable="true" data-markdown-copy="PRIVATE_ROOT_COPY" data-markdown-han-text="PRIVATE_ROOT_HAN" data-state="open" data-testid="unit-789" aria-label="PRIVATE_LABEL" title="PRIVATE_TITLE" class="PRIVATE_CLASS" id="PRIVATE_ID" style="--private:PRIVATE_STYLE">${descendants}</section>`).join('') + '</form>', 1);
  for (const input of f.document.querySelectorAll('input, textarea')) input.value = 'PRIVATE_INPUT_VALUE';
  await f.scan(null, 2);
  const payload = diagnostics(f);
  const expectedCounts = {button:4, '[contenteditable="true"]':1, '[data-markdown-copy]':2,
    '[data-markdown-han-text]':2, '[data-state]':6, '[data-testid]':4};
  for (const attribute of attributes) {
    assert.equal(payload.unitSummaries[attribute].length, 1);
    const unit = payload.unitSummaries[attribute][0];
    // Matching attributes on the unit itself must not count as descendants.
    assert.deepEqual(unit.descendantCounts, expectedCounts);
    assert.deepEqual(unit.testIdPatterns, ['#']);
    assert.deepEqual(unit.buttonStateCounts, [{count:4}]);
    assert.deepEqual(unit.buttonTypeCounts, [{value:'button', count:2}, {value:'submit', count:1}]);
  }
  const structure = payload.structureHistory.at(-1);
  assert.deepEqual(structure.testIdPatterns, ['#']);
  assert.deepEqual(structure.buttonStateCounts, [{count:8}]);
  assert.deepEqual(structure.buttonTypeCounts, [{value:'button', count:4}, {value:'submit', count:2}]);
  assert.deepEqual(structure.formSummary.descendantCounts,
    {button:8, '[contenteditable="true"]':4, '[data-state]':14, '[data-testid]':10});
  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /PRIVATE|private\.invalid|987654|12345678-abcd-4321-abcd-123456789abc|deadbeef|AzByCxDwEvFuGtHs/);
  for (const raw of ['control-123', 'control-456', 'unit-789']) assert.equal(serialized.includes(raw), false, raw);
  // Button count buckets legitimately use a `value` field; DOM input values do not.
  for (const summary of [structure.formSummary, ...Object.values(payload.unitSummaries).flat()]) {
    assert.equal(Object.hasOwn(summary, 'value'), false);
  }
  for (const name of ['aria-label','title','href','class','id','style','textContent','innerText']) {
    assert.equal(serialized.includes(JSON.stringify(name) + ':'), false, name);
  }
});

test('reinjection resets structureHistory and unitSummaries along with trace', async t => {
  let hold = false;
  const releases = [], digests = [];
  const f = await fixture({digest:(...args) => {
    const pending = hold
      ? new Promise(resolve => {releases.push(() => resolve(webcrypto.subtle.digest(...args)));})
      : webcrypto.subtle.digest(...args);
    digests.push(pending);
    return pending;
  }});
  t.after(() => f.dispose());
  const attributes = ['data-chatgpt-search-unit-key', 'data-content-search-unit-key'];
  await f.scan(attributes.map(attribute => `<section ${attribute}="PRIVATE_${attribute}"></section>`).join(''), 1);
  await f.scan(null, 2);
  await Promise.all(digests);
  await flush();
  const before = diagnostics(f);
  assert.ok(before.trace.length > 1);
  assert.ok(before.structureHistory.length > 1);
  for (const attribute of attributes) assert.match(before.unitSummaries[attribute][0].keyHash, /^[a-f0-9]{12}$/);
  hold = true;
  await f.inject();
  const reset = diagnostics(f);
  assert.equal(f.messages.size, 1);
  assert.equal(reset.trace.length, 1);
  assert.equal(reset.trace[0].sequence, 1);
  assert.equal(reset.trace[0].source, 'init');
  assert.deepEqual(reset.structureHistory, [{...before.structureHistory.at(-1), sequence:1}]);
  for (const attribute of attributes) {
    assert.equal(reset.unitSummaries[attribute].length, 1);
    const {keyHash, ...summary} = before.unitSummaries[attribute][0];
    assert.deepEqual(reset.unitSummaries[attribute][0], summary);
  }
  releases.forEach(release => release());
  await Promise.all(digests);
  await flush();
  assert.deepEqual(diagnostics(f).unitSummaries, before.unitSummaries);
});

test('unit lifecycle records rotation at ten units, retains changes over 100 text scans, caps and resets', async t => {
  const f = await fixture();
  t.after(() => f.dispose());
  const chat = 'data-chatgpt-search-unit-key', content = 'data-content-search-unit-key';
  const hash = key => createHash('sha256').update(key).digest('hex').slice(0, 12);
  const unit = i => `<section ${chat}="PRIVATE_KEY_${i}" ${content}="PRIVATE_KEY_${i}"><p>PRIVATE prose</p></section>`;
  const history = () => diagnostics(f).unitLifecycleHistory;
  const baseline = history();
  await f.scan(Array.from({length:10}, (_, i) => unit(i)).join(''), 1);
  await f.settleHashes();
  assert.equal(history().length, 2);
  assert.deepEqual(history()[0], baseline[0]);
  assert.deepEqual(history().at(-1).units.map(u => u.keyHash), Array.from({length:6}, (_, i) => hash(`PRIVATE_KEY_${i + 4}`)));
  assert.deepEqual(Object.keys(diagnostics(f).unitSummaries), [chat]);
  const main = f.document.querySelector('main');
  const structure = diagnostics(f).structureHistory;
  main.lastElementChild.setAttribute(chat, 'PRIVATE_ROTATED');
  main.lastElementChild.setAttribute(content, 'PRIVATE_ROTATED');
  await f.scan(null, 2);
  await f.settleHashes();
  assert.equal(history().length, 3);
  assert.equal(history().at(-1).units.at(-1).keyHash, hash('PRIVATE_ROTATED'));
  main.firstElementChild.remove();
  main.insertAdjacentHTML('beforeend', unit(10));
  await f.scan(null, 3);
  await f.settleHashes();
  assert.equal(main.querySelectorAll(`[${chat}]`).length, 10);
  assert.equal(history().length, 4);
  assert.equal(history().at(-1).units.at(-1).keyHash, hash('PRIVATE_KEY_10'));
  assert.deepEqual(diagnostics(f).structureHistory, structure);
  const retained = history();
  for (let i = 0; i < 100; i++) {
    main.querySelector('p').textContent = `PRIVATE text ${i}`;
    await f.scan(null, 4 + i);
  }
  await f.settleHashes();
  assert.deepEqual(history(), retained);
  for (let i = 0; i < 35; i++) {
    main.lastElementChild.setAttribute(chat, `PRIVATE_NEXT_${i}`);
    await f.scan(null, 200 + i);
  }
  await f.settleHashes();
  assert.equal(history().length, 32);
  assert.deepEqual(history().map(e => e.units.at(-1).keyHash), Array.from({length:32}, (_, i) => hash(`PRIVATE_NEXT_${i + 3}`)));
  for (const entry of history()) for (const u of entry.units) assert.match(u.keyHash, /^[0-9a-f]{12}$/);
  assert.doesNotMatch(JSON.stringify(diagnostics(f)), /PRIVATE/);
  const last = history().at(-1);
  await f.inject();
  await f.settleHashes();
  assert.deepEqual(history(), [{...last, sequence:1}]);
});

test('unit lifecycle captures wrapper controls and only privacy-safe fields', async t => {
  const f = await fixture();
  t.after(() => f.dispose());
  f.context.location.pathname = '/g/PRIVATE_PROJECT/c/PRIVATE_CHAT';
  const control = '<button type="button" data-state="closed" aria-label="PRIVATE label" title="PRIVATE title" class="PRIVATE class" id="PRIVATE id" style="--secret:PRIVATE">PRIVATE prose</button>';
  await f.scan(`<article><aside>${control}<div><section data-chatgpt-search-unit-key="PRIVATE_KEY"><p>PRIVATE answer</p><input value="PRIVATE_VALUE"><img src="PRIVATE_SRC"><a href="PRIVATE_HREF"></a><div contenteditable="true" data-markdown-copy="PRIVATE" data-markdown-han-text="PRIVATE" data-state="open"></div></section>${control}</div></aside></article>`, 1);
  const section = f.document.querySelector('section');
  for (let i = 0; i < 12; i++) section.insertAdjacentHTML('beforeend', `<span data-testid="control-${String.fromCharCode(97+i)}-123"></span>`);
  await f.scan(null, 2);
  await f.settleHashes();
  const entry = diagnostics(f).unitLifecycleHistory.at(-1), u = entry.units[0];
  assert.equal(entry.route, 'project-conversation');
  assert.deepEqual(Object.keys(entry).sort(), ['route','sequence','units']);
  assert.deepEqual(u.descendantCounts, {button:0, '[contenteditable="true"]':1, '[data-markdown-copy]':1, '[data-markdown-han-text]':1, '[data-state]':1, '[data-testid]':12});
  assert.equal(u.parentDescendantCounts.button, 1);
  assert.equal(u.grandparentDescendantCounts.button, 2);
  assert.deepEqual([u.unitHasButtons, u.parentHasButtons, u.grandparentHasButtons], [false,true,true]);
  for (const prefix of ['', 'parent', 'grandparent']) {
    const field = name => prefix ? prefix + name[0].toUpperCase() + name.slice(1) : name;
    const count = prefix === '' ? 0 : prefix === 'parent' ? 1 : 2;
    assert.deepEqual(u[field('buttonStateCounts')], count ? [{count}] : []);
    assert.deepEqual(u[field('buttonTypeCounts')], count ? [{value:'button', count}] : []);
    assert.deepEqual(u[field('testIdPatterns')], ['#']);
  }
  const before = diagnostics(f).unitLifecycleHistory.length;
  section.parentElement.querySelector('button').setAttribute('type', 'submit');
  await f.scan(null, 3);
  await f.settleHashes();
  assert.equal(diagnostics(f).unitLifecycleHistory.length, before + 1);
  const serialized = JSON.stringify(diagnostics(f));
  assert.doesNotMatch(serialized, /PRIVATE/);
  for (const name of ['aria-label','title','href','src','class','id','style','textContent','innerText']) assert.equal(serialized.includes(`"${name}":`), false, name);
});

test('lifecycle async hashing preserves scan order, skips failures and discards disposed scans', async t => {
  let hold = false;
  const releases = [];
  const f = await fixture({digest:(...args) => hold ? new Promise((resolve, reject) => releases.push({resolve:() => resolve(webcrypto.subtle.digest(...args)), reject})) : webcrypto.subtle.digest(...args)});
  t.after(() => f.dispose());
  hold = true;
  await f.scan('<section data-chatgpt-search-unit-key="PRIVATE_A"></section>', 1);
  f.document.querySelector('section').setAttribute('data-chatgpt-search-unit-key', 'PRIVATE_B');
  await f.scan(null, 2);
  assert.doesNotMatch(JSON.stringify(diagnostics(f)), /PRIVATE/);
  releases.splice(0).reverse().forEach(r => r.resolve());
  await f.settleHashes();
  const hashes = diagnostics(f).unitLifecycleHistory.slice(1).map(e => e.units[0].keyHash);
  assert.deepEqual(hashes, ['PRIVATE_A', 'PRIVATE_B'].map(key => createHash('sha256').update(key).digest('hex').slice(0,12)));
  const before = diagnostics(f).unitLifecycleHistory;
  await f.scan(null, 3);
  releases.splice(0).forEach(r => r.reject(Error('PRIVATE failure')));
  await f.settleHashes();
  assert.deepEqual(diagnostics(f).unitLifecycleHistory, before);
  await f.scan(null, 4);
  await f.inject();
  assert.deepEqual(diagnostics(f).unitLifecycleHistory, []);
  releases.splice(0).reverse().forEach(r => r.resolve());
  await f.settleHashes();
  assert.equal(diagnostics(f).unitLifecycleHistory.length, 1);
  assert.equal(diagnostics(f).unitLifecycleHistory[0].sequence, 1);
});

test('multiple mains expose counts and busy health from the selected conversation main', async () => {
  const f = await fixture();
  f.document.body.innerHTML = '<main></main><main>' + turn('second') + '<button data-testid="stop-button">Stop</button></main>';
  await f.scan(null, 100);
  const event = diagnostics(f).trace.at(-1);
  assert.equal(event.dom.mainCount, 2);
  assert.equal(event.dom.selectedMainIndex, 1);
  assert.equal(event.dom.documentConversationWrapperCount, 1);
  assert.equal(event.dom.conversationWrapperCount, 1);
  assert.equal(event.dom.turnSelectorCount, 1);
  assert.equal(event.dom.stopMatchedCount, 1);
  assert.equal(event.dom.busy, true);
  assert.notEqual(event.dom.compatibility.state, 'incompatible');
  assert.ok(event.dom.compatibility.matched.includes('stop'));
  f.dispose();
});

test('structural mutation and focus diagnostics exclude prose and forbidden attributes', async () => {
  const f = await fixture();
  const main = f.document.querySelector('main');
  main.innerHTML = '<form role="group" data-state="open" data-slot="composer" aria-live="polite" aria-busy="false" data-turn="PRIVATE_TURN" data-message-id="PRIVATE_MESSAGE" data-extra="PRIVATE_EXTRA" class="PRIVATE_CLASS" id="PRIVATE_ID" style="--private:PRIVATE_STYLE" aria-label="PRIVATE_LABEL" title="PRIVATE_TITLE"><button type="submit">PRIVATE_PROSE</button><textarea placeholder="PRIVATE_PLACEHOLDER">PRIVATE_INPUT</textarea><div contenteditable="true">PRIVATE_ANSWER</div><a href="https://private.invalid/PRIVATE_HREF"><img src="PRIVATE_SRC" alt="PRIVATE_ALT"></a></form>';
  const form = main.firstElementChild;
  form.querySelector('textarea').value = 'PRIVATE_VALUE';
  Object.defineProperty(f.document, 'activeElement', {value:form});
  await flush();
  const payload = diagnostics(f);
  const event = payload.trace.findLast(e => e.source === 'mutation');
  const summary = event.mutationNodes.find(n => n.tag === 'form');
  assert.equal(summary.parentTag, 'main');
  assert.equal(summary.depthFromMain, 1);
  assert.equal(summary.role, 'group');
  assert.equal(summary['data-state'], undefined);
  assert.equal(summary.hasButtonDescendant, true);
  assert.equal(summary.hasTextareaDescendant, true);
  assert.equal(summary.hasContentEditableDescendant, true);
  assert.deepEqual(summary.attributeNames, ['aria-busy','aria-live','data-message-id','data-slot','data-state','data-turn','role']);
  assert.deepEqual(event.dom.focusedElement, summary);
  assert.doesNotMatch(JSON.stringify(payload), /PRIVATE_|private\.invalid/);
  for (const name of ['class','style','id','value','aria-label','title','alt','placeholder','href','src','textContent','innerText']) assert.equal(Object.hasOwn(summary, name), false);
  form.remove();
  await flush();
  const removed = diagnostics(f).trace.findLast(e => e.source === 'mutation').mutationNodes.find(n => n.tag === 'form');
  assert.equal(removed.tag, 'form');
  assert.ok(removed.parentTag === null || /^[a-z][a-z0-9-]*$/.test(removed.parentTag));
  assert.ok(removed.depthFromMain === null || Number.isInteger(removed.depthFromMain));
  f.dispose();
});

test('testid diagnostics export presence only, including numeric UUID hex and short private values', async () => {
  const f = await fixture();
  const el = f.document.createElement('div');
  const summarize = () => f.context.ChappyDOM.structuralSummary(el, null);
  el.setAttribute('data-testid', 'turn-123-12345678-abcd-4321-abcd-123456789abc-deadbeef-AzByCxDwEvFuGtHs');
  assert.equal(summarize()['data-testidPattern'], '#');
  el.setAttribute('data-testid', 'slot-'.repeat(20) + 'AzByCxDwEvFuGtHs');
  assert.equal(summarize()['data-testidPattern'], '#');
  for (const value of ['private prose', 'https://private.invalid/path']) {
    el.setAttribute('data-testid', value);
    el.setAttribute('data-state', value);
    assert.equal(summarize()['data-testidPattern'], undefined);
    assert.equal(summarize()['data-state'], undefined);
  }
  el.setAttribute('data-slot', 'x'.repeat(41));
  assert.equal(summarize()['data-slot'], undefined);
  f.dispose();
});

test('diagnostics exclude syntactically valid private data values route IDs and watch tokens', async t => {
  const f = await fixture(); t.after(() => f.dispose());
  f.context.location.pathname = '/c/PRIVATE_ROUTE_123';
  await f.scan('<section data-testid="conversation-turn-PRIVATE_TURN"><div data-message-author-role="assistant" data-message-id="PRIVATE_MESSAGE"><button type="button" data-state="PRIVATE_STATE" data-slot="PRIVATE_SLOT" data-testid="PRIVATE_TESTID">PRIVATE_PROSE</button></div></section><button data-testid="stop-button">Stop</button>', 100);
  await f.settleHashes();
  const token = f.sent.findLast(m => m.type === 'STATUS').watchGeneration;
  const exported = JSON.stringify(diagnostics(f));
  assert.doesNotMatch(exported, /PRIVATE_|PRIVATE_PROSE|backend-api|transportCompleted|watchGeneration/);
  assert.equal(exported.includes(token), false);
  assert.ok(exported.includes('keyHash') || exported.includes('identities'));
});

test('census counts scoped structure and data attribute names only with a top twelve cap', async () => {
  const f = await fixture();
  await f.scan('<article data-custom="PRIVATE_A"><section data-custom="PRIVATE_B" data-state="open"><form><button role="button" aria-busy="true" aria-live="polite" data-testid="control-123"></button><textarea></textarea><div contenteditable="true"></div></form></section></article>', 1);
  const census = diagnostics(f).trace.at(-1).dom.census;
  for (const key of ['article','section','form','button','textarea','[contenteditable="true"]','[role]','[aria-busy="true"]','[aria-live]','[data-testid]','[data-state]']) assert.equal(census[key], 1, key);
  assert.equal(census.dataAttributeElements, 3);
  assert.deepEqual(census.topDataAttributeNames, [{name:'data-custom', count:2},{name:'data-state', count:1},{name:'data-testid', count:1}]);
  assert.doesNotMatch(JSON.stringify(census), /PRIVATE_|open|control/);
  const article = f.document.querySelector('article');
  for (let i = 0; i < 20; i++) article.setAttribute('data-key-' + i, 'PRIVATE_VALUE');
  article.setAttribute('data-' + 'x'.repeat(41), 'PRIVATE_VALUE');
  await f.scan(null, 2);
  const top = diagnostics(f).trace.at(-1).dom.census.topDataAttributeNames;
  assert.equal(top.length, 12);
  assert.deepEqual(top[0], {name:'data-custom', count:2});
  assert.ok(top.every(entry => /^data-[a-z0-9_-]{1,40}$/.test(entry.name)));
  f.document.querySelector('main').remove();
  await flush();
  assert.equal(diagnostics(f).trace.at(-1).dom.census.article, 0);
  f.dispose();
});

test('mutation summaries cap at eight elements and the trace stays at sixty-four events', async () => {
  const f = await fixture();
  const main = f.document.querySelector('main');
  main.append('PRIVATE_TEXT');
  for (let i = 0; i < 20; i++) main.append(f.document.createElement('section'));
  await flush();
  assert.equal(diagnostics(f).trace.findLast(e => e.source === 'mutation').mutationNodes.length, 8);
  for (let i = 0; i < 70; i++) {main.append(f.document.createElement('button')); await flush();}
  const trace = diagnostics(f).trace;
  assert.equal(trace.length, 64);
  assert.ok(trace.every(e => e.mutationNodes.length <= 8));
  assert.doesNotMatch(JSON.stringify(trace), /PRIVATE_TEXT/);
  f.dispose();
});

test('structural summaries cap attribute names and depth and omit detached focus ancestry', async () => {
  const f = await fixture();
  const main = f.document.querySelector('main');
  let el = main;
  for (let i = 0; i < 13; i++) {const child = f.document.createElement('div'); el.append(child); el = child;}
  const summarize = node => f.context.ChappyDOM.structuralSummary(node, main);
  assert.equal(summarize(main).depthFromMain, 0);
  assert.equal(summarize(el.parentElement).depthFromMain, 12);
  assert.equal(summarize(el).depthFromMain, null);
  for (const name of 'role type contenteditable aria-busy aria-live aria-atomic aria-disabled data-testid data-state data-slot data-turn data-is-streaming data-stream-active data-message-author-role data-message-id data-turn-id'.split(' ')) el.setAttribute(name, 'true');
  assert.equal(summarize(el).attributeNames.length, 12);
  assert.deepEqual([...summarize(el).attributeNames], [...summarize(el).attributeNames].sort());
  el.remove();
  assert.equal(summarize(el).parentTag, null);
  assert.equal(summarize(el).depthFromMain, null);
  f.dispose();
});

test('STATUS diagnostics distinguish acknowledged, missing, rejected, thrown and invalidated replies', async () => {
  for (const [statusResult, expected] of [['ok','reply-ok'], ['missing','reply-missing'], ['not-ok','reply-not-ok'], ['threw','threw']]) {
    const f = await fixture({statusResult});
    assert.equal(diagnostics(f).trace[0].status.attempted, true);
    assert.equal(diagnostics(f).trace[0].status.result, expected);
    assert.equal(JSON.stringify(diagnostics(f)).includes('private exception'), false);
    await f.scan(null, 1);
    assert.equal(diagnostics(f).trace.at(-1).status.result, 'not-attempted');
    assert.equal(diagnostics(f).trace.at(-1).source, 'heartbeat');
    for (const listener of f.messages) await new Promise(resolve => listener({type:'SCAN_NOW'}, {}, resolve));
    assert.equal(diagnostics(f).trace.at(-1).source, 'scan-now');
    // Hold a reference to the event only inside the test to observe disposal.
    let event;
    const read = f.context.ChappyDOM.read;
    f.context.ChappyDOM.read = (...args) => {event = args[3]; return read(...args);};
    const send = f.context.chrome.runtime.sendMessage;
    f.context.chrome.runtime.sendMessage = async msg => {
      if (msg.type === 'STATUS') {
        // GET is still read-only while the send is pending.
        assert.equal(diagnostics(f).trace.at(-1).status.result, 'pending');
      }
      return send(msg);
    };
    f.invalidate();
    await f.scan('<button data-testid="stop-button">Stop</button>', 100);
    assert.ok(event);
    assert.equal(f.messages.size, 0);
    f.dispose();
  }
});

test('visibility-only transitions send STATUS immediately, without the 30-second refresh', async t => {
  const f = await fixture();
  t.after(() => f.dispose());
  await f.scan(turn('working') + '<button data-testid="stop-button">Stop</button>', 100);
  assert.equal(f.sent.filter(m => m.type === 'STATUS').at(-1).visibility, 'visible');
  let before = f.sent.filter(m => m.type === 'STATUS').length;
  f.setTime(101);
  Object.defineProperty(f.document, 'visibilityState', {value:'hidden', configurable:true});
  f.document.dispatchEvent(new f.window.Event('visibilitychange'));
  await flush();
  assert.equal(f.sent.filter(m => m.type === 'STATUS').length, before + 1);
  assert.equal(f.sent.filter(m => m.type === 'STATUS').at(-1).visibility, 'hidden');
  before++;
  f.setTime(102);
  Object.defineProperty(f.document, 'visibilityState', {value:'visible', configurable:true});
  f.document.dispatchEvent(new f.window.Event('visibilitychange'));
  await flush();
  assert.equal(f.sent.filter(m => m.type === 'STATUS').length, before + 1);
  assert.equal(f.sent.filter(m => m.type === 'STATUS').at(-1).visibility, 'visible');
});
