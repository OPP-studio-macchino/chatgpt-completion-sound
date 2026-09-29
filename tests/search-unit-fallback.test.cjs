const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const {createHash} = require('node:crypto');
const {parseHTML} = require(require.resolve('linkedom', {paths:[process.env.CHAPPY_DOM_DEPENDENCIES || __dirname]}));
const flush = () => new Promise(setImmediate);
const unit = (key, body = '') => `<section data-chatgpt-search-unit-key="${key}">${body}</section>`;
const han = '<div data-markdown-han-text>synthetic answer</div>';
const copy = '<div data-markdown-copy>synthetic final answer</div>';
const history = unit('private-user-history') + unit('private-answer-history', copy);

async function fixture(t, html = history) {
  const {document, window} = parseHTML(`<html><body><main>${html}</main></body></html>`);
  window.HTMLElement.prototype.getClientRects = function() {return [{}];};
  window.getComputedStyle = el => ({display:el.style.display || 'block', visibility:el.style.visibility || 'visible', opacity:el.style.opacity || '1'});
  Object.defineProperty(document, 'visibilityState', {value:'visible', configurable:true});
  let now = 0, tick;
  const sent = [], listeners = new Set();
  const context = vm.createContext({document, window, location:{pathname:'/c/search-fixture'}, Element:window.Element,
    // Scans are explicit so each assertion observes one controlled DOM transition.
    MutationObserver:class {observe() {} disconnect() {}},
    chrome:{runtime:{async sendMessage(message) {
      sent.push(JSON.parse(JSON.stringify(message)));
      return message.target === 'settings' ? {enabled:true} : {ok:true};
    }, onMessage:{addListener:fn => listeners.add(fn), removeListener:fn => listeners.delete(fn)}}},
    crypto:{subtle:{async digest(algorithm, bytes) {
      assert.equal(algorithm, 'SHA-256');
      return Uint8Array.from(createHash('sha256').update(bytes).digest()).buffer;
    }}}, TextEncoder, Date:{now:() => now}, queueMicrotask,
    setInterval(fn) {tick = fn; return 1;}, clearInterval() {}});
  for (const file of ['detector.js', 'dom-reader.js', 'content.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../extension', file), 'utf8'), context);
  }
  t.after(() => context.__chappySoundInstance.dispose());
  await flush();
  return {document, context, sent,
    read(route = context.location.pathname) {return context.ChappyDOM.read(document, route);},
    async scan(html, time) {
      now = time;
      if (html !== null) document.querySelector('main').innerHTML = html;
      await tick();
      await flush();
    },
    diagnostics() {
      let result;
      for (const listener of listeners) listener({type:'GET_DIAGNOSTICS'}, {}, value => {result = value;});
      return JSON.parse(JSON.stringify(result));
    },
    state() {return sent.filter(message => message.type === 'STATUS').at(-1)?.state;},
    completions() {return sent.filter(message => message.type === 'COMPLETE');}
  };
}

test('historical search units establish a route-scoped baseline without notifying', async t => {
  const f = await fixture(t);
  const snapshot = f.read();
  assert.ok(snapshot.user);
  assert.ok(snapshot.turn);
  assert.notEqual(snapshot.user, snapshot.turn);
  assert.notEqual(snapshot.user, f.read('/c/other').user);
  assert.notEqual(snapshot.turn, f.read('/c/other').turn);
  assert.equal(snapshot.message, '');
  assert.equal(snapshot.ready, true);
  assert.equal(snapshot.provisional, false);
  await f.scan(null, 5000);
  assert.equal(f.state(), 'watching');
  assert.equal(f.completions().length, 0);
});

test('new user, transient key replacement, and same assistant gaining copy complete once per job', async t => {
  const f = await fixture(t);
  let preceding = history;
  for (const [job, start] of [[1, 100], [2, 10000]]) {
    const oldUser = f.read().user;
    await f.scan(preceding + unit(`private-user-transient-${job}`), start);
    assert.notEqual(f.read().user, oldUser);
    assert.equal(f.read().turn, f.read().user);
    assert.equal(f.read().ready, false);
    assert.equal(f.read().busy, false);
    assert.equal(f.read().settleMsOverride, undefined);
    assert.equal(f.state(), 'generating');
    const transient = f.read().user;
    const prompt = unit(`private-user-final-${job}`);
    await f.scan(preceding + prompt, start + 100);
    assert.notEqual(f.read().user, transient);
    assert.equal(f.state(), 'generating');
    assert.equal(f.completions().length, job - 1);
    await f.scan(preceding + prompt + unit(`private-assistant-${job}`, han), start + 200);
    const assistantIdentity = f.read().turn;
    assert.notEqual(assistantIdentity, f.read().user);
    assert.equal(f.read().ready, false);
    assert.equal(f.read().provisional, false);
    assert.equal(f.read().settleMsOverride, undefined);
    await f.scan(null, start + 3000);
    assert.equal(f.state(), 'generating');
    assert.equal(f.completions().length, job - 1);
    // Add the final marker to the same element with the same search-unit key.
    f.document.querySelector('main').lastElementChild.insertAdjacentHTML('beforeend', copy);
    await f.scan(null, start + 3100);
    assert.equal(f.read().turn, assistantIdentity);
    assert.equal(f.read().ready, true);
    assert.equal(f.read().provisional, false);
    assert.equal(f.read().settleMsOverride, 500);
    assert.equal(f.completions().length, job - 1);
    await f.scan(null, start + 3599);
    assert.equal(f.completions().length, job - 1);
    assert.equal(f.state(), 'generating');
    await f.scan(null, start + 3600);
    assert.equal(f.completions().length, job);
    assert.equal(f.state(), 'complete');
    await f.scan(null, start + 8000);
    assert.equal(f.completions().length, job);
    preceding += prompt + unit(`private-assistant-${job}`, han + copy);
  }
  assert.notEqual(f.completions()[0].key, f.completions()[1].key);
  for (const message of f.completions()) assert.match(message.key, /^[a-f0-9]{64}$/);
  const diagnostic = f.diagnostics();
  assert.ok(diagnostic.trace.some(event => event.detector.completed));
  assert.ok(diagnostic.unitLifecycleHistory.length);
  assert.ok(Object.keys(diagnostic.trace.at(-1).identities).length);
  const exported = JSON.stringify({sent:f.sent, diagnostic});
  assert.equal(exported.includes('private-'), false);
  assert.equal(exported.includes('synthetic'), false);
  assert.equal(exported.includes('/c/search-fixture'), false);
});

test('a ready marker disappearing before 500ms resets search-unit completion stability', async t => {
  const f = await fixture(t);
  const prompt = history + unit('private-new-user');
  const partial = prompt + unit('private-new-answer', han);
  const ready = prompt + unit('private-new-answer', han + copy);
  await f.scan(prompt, 100);
  await f.scan(partial, 200);
  await f.scan(ready, 300);
  assert.equal(f.read().settleMsOverride, 500);
  await f.scan(partial, 799);
  assert.equal(f.read().ready, false);
  assert.equal(f.read().settleMsOverride, undefined);
  await f.scan(null, 800);
  await f.scan(null, 3000);
  assert.equal(f.completions().length, 0);
  assert.equal(f.state(), 'generating');
  await f.scan(ready, 3100);
  await f.scan(null, 3599);
  assert.equal(f.completions().length, 0);
  await f.scan(null, 3600);
  assert.equal(f.completions().length, 1);
});

test('legacy ready snapshots still require 2000ms of stability', async t => {
  const f = await fixture(t, '<section data-turn="assistant" data-turn-id="legacy-turn"><button data-testid="copy-turn-action-button"></button></section>');
  const snapshot = f.read();
  assert.equal(snapshot.ready, true);
  assert.equal(snapshot.settleMsOverride, undefined);
  const detector = new f.context.ChappyCompletionDetector();
  detector.step({...snapshot, ready:false, busy:true}, 0);
  assert.equal(detector.step(snapshot, 100), null);
  assert.equal(detector.step(snapshot, 600), null);
  assert.equal(detector.step(snapshot, 2099), null);
  assert.equal(detector.step(snapshot, 2100), snapshot.turn);
});

test('invalid settle overrides retain the default and provisional readiness retains 4000ms', async t => {
  const f = await fixture(t);
  for (const override of [-1, NaN, Infinity, '500', null]) {
    const detector = new f.context.ChappyCompletionDetector();
    const snapshot = {...f.read(), settleMsOverride:override};
    detector.step({...snapshot, ready:false, busy:true}, 0);
    assert.equal(detector.step(snapshot, 100), null);
    assert.equal(detector.step(snapshot, 2099), null);
    assert.equal(detector.step(snapshot, 2100), snapshot.turn);
  }
  const detector = new f.context.ChappyCompletionDetector();
  const snapshot = {...f.read(), provisional:true};
  detector.step({...snapshot, ready:false, busy:true}, 0);
  assert.equal(detector.step(snapshot, 100), null);
  assert.equal(detector.step(snapshot, 600), null);
  assert.equal(detector.step(snapshot, 4099), null);
  assert.equal(detector.step(snapshot, 4100), snapshot.turn);
});

test('switching to a historical ready branch never starts generation or notifies', async t => {
  const f = await fixture(t);
  await f.scan(unit('private-branch-user') + unit('private-branch-answer', copy), 100);
  assert.equal(f.read().ready, true);
  await f.scan(null, 5000);
  assert.equal(f.state(), 'watching');
  assert.equal(f.completions().length, 0);
  assert.equal(f.diagnostics().trace.at(-1).detector.activeAfter, false);
});

test('an older ready assistant cannot make the latest user ready, including in hidden tabs', async t => {
  const f = await fixture(t);
  Object.defineProperty(f.document, 'visibilityState', {value:'hidden'});
  await f.scan(history + unit('private-latest-user'), 100);
  assert.equal(f.read().ready, false);
  assert.equal(f.read().provisional, false);
  assert.equal(f.read().user, f.read().turn);
  await f.scan(null, 6000);
  assert.equal(f.state(), 'generating');
  assert.equal(f.completions().length, 0);
  await f.scan(history + unit('private-latest-user') + unit('private-partial-answer', han), 7000);
  assert.equal(f.read().ready, false);
  assert.equal(f.read().provisional, false);
  await f.scan(null, 12000);
  assert.equal(f.state(), 'generating');
  assert.equal(f.completions().length, 0);
});

test('fallback requires a rendered latest assistant and preserves STOP and streaming busy signals', async t => {
  const f = await fixture(t);
  const answer = f.document.querySelector('main').lastElementChild;
  answer.style.display = 'none';
  assert.equal(f.read().ready, false);
  answer.style.display = '';
  answer.hidden = true;
  assert.equal(f.read().ready, false);
  answer.hidden = false;
  assert.equal(f.read().ready, true);
  for (const busy of ['<button data-testid="stop-button"></button>', '<div data-is-streaming="true"></div>', '<div data-stream-active="true"></div>']) {
    await f.scan(history + busy, 100);
    assert.equal(f.read().busy, true);
    const control = f.document.querySelector('main').lastElementChild;
    control.style.display = 'none';
    assert.equal(f.read().busy, false);
  }
});

test('any legacy turn or message-role selector takes precedence over search units', async t => {
  const f = await fixture(t);
  for (const legacy of [
    '<section data-turn="assistant" data-turn-id="legacy-turn"><button data-testid="copy-turn-action-button"></button></section>',
    '<section data-testid="conversation-turn-legacy"><button data-testid="copy-turn-action-button"></button></section>',
    '<div data-message-author-role="assistant" data-message-id="legacy-message"><button data-testid="copy-turn-action-button"></button></div>'
  ]) {
    await f.scan(legacy + unit('private-ignored-user'), 100);
    const snapshot = f.read();
    assert.equal(snapshot.user, '');
    assert.equal(snapshot.ready, true);
    assert.equal(snapshot.settleMsOverride, undefined);
    assert.equal(JSON.stringify(snapshot).includes('private-ignored'), false);
  }
  await f.scan('<div data-message-author-role="user" data-message-id="legacy-user"></div>' + unit('private-ignored-answer', copy), 200);
  assert.equal(f.read().user, 'legacy-user');
  assert.equal(f.read().turn, '');
  assert.equal(f.read().ready, false);
});
