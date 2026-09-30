const {test, beforeEach, afterEach} = require('node:test');
const assert = require('node:assert/strict');
const {parseHTML} = require('linkedom');
const C = require('../extension/compatibility.js');
const DOM = require('../extension/dom-reader.js');
const Detector = require('../extension/detector.js');
function fixture(html = '') {
  const {document,window} = parseHTML('<html><body><main>'+html+'</main></body></html>');
  window.HTMLElement.prototype.getClientRects = function() {return [{}];};
  window.getComputedStyle = e => ({display:e.style.display || 'block',visibility:'visible',opacity:'1'});
  return document;
}
const doc = fixture();
const profile = () => JSON.parse(JSON.stringify(C.packaged));
beforeEach(() => C.resetPackaged());
afterEach(() => C.resetPackaged());
test('minor drift accepts new values only inside packaged per-signal selector shapes', () => {
  const p=profile();
  p.signals.stop=['button[aria-label="生成を中断"]','button[data-testid="stop-generation-v3"]'];
  p.signals.finalRegenerate=['button[aria-label="Try response again"]'];
  p.signals.turn=['[data-testid^="conversation-entry-"]'];
  p.signals.searchUnit=['[data-content-search-unit-key]'];
  assert.deepEqual(C.parseProfile(JSON.stringify(p),doc).signals,p.signals);
  assert.equal(C.activeProfile(),C.packaged);
});
test('minor drift rejects tag, attribute, operator, category, presence and value-bound changes', () => {
  for (const [name,candidate] of [
    ['stop','div[data-testid="new-stop"]'],['stop','[data-testid="new-stop"]'],
    ['stop','button[data-turn="new-stop"]'],['stop','button[data-testid^="new-stop"]'],
    ['stop','button[data-testid]'],['stop','button[aria-label="Copy response"]'],
    ['finalRegenerate','button[data-testid="new-final"]'],
    ['searchUnit','[data-markdown-copy]'],['searchUnit','div[data-chatgpt-search-unit-key]'],
    ['searchUnit','[data-chatgpt-search-unit-key="new"]'],['turn','[data-testid="new-turn"]'],
    ['stop','button[aria-label="'+ 'x'.repeat(65) +'"]'],
    ['stop','button[aria-label=""]'],['stop','button[aria-label*="new"]'],
    ['stop','*[aria-label="new"]'],['stop','button[aria-label="new"] span'],
    ['stop','button[aria-label="new"]:has(p)'],['stop','button[aria-label="new\\value"]']
  ]) {
    const p=profile();p.signals[name]=[candidate];
    assert.throws(()=>C.parseProfile(JSON.stringify(p),doc),undefined,name+': '+candidate);
  }
});
test('explicit activation updates reader stop matching, manual-stop selector and health; reset restores packaged', async () => {
  const d=fixture('<section data-turn="user"></section><button aria-label="生成を中断"></button>');
  const p=profile();p.revision=2;p.revisionId='minor-drift-2';p.signals.stop=['button[aria-label="生成を中断"]'];
  const parsed=C.parseProfile(JSON.stringify(p),doc);
  assert.equal(DOM.read(d,'/c/test').busy,false);
  assert.throws(()=>C.activateValidatedProfile(p),/NOT_VALIDATED/);
  assert.throws(()=>C.activateValidatedProfile({...parsed}),/NOT_VALIDATED/);
  assert.equal(C.activeProfile(),C.packaged);
  C.activateValidatedProfile(parsed);
  assert.equal(C.activeProfile(),parsed);
  const s=DOM.read(d,'/c/test');assert.equal(s.busy,true);
  assert.equal(d.querySelector('button').matches(DOM.STOP),true);
  assert.equal(s.compatibility.profileId,parsed.profileId);
  assert.equal(s.compatibility.revision,2);assert.equal(s.compatibility.revisionId,'minor-drift-2');
  assert.ok(s.compatibility.matched.includes('stop'));
  for (const name of C.SIGNALS.filter(name=>name!=='stop')) assert.equal(C.selector(name),C.selector(name,C.packaged));
  assert.notEqual(C.selector('stop'),C.selector('stop',C.packaged));
  const selected=await C.selectRemote(null,null,doc);
  assert.equal(selected.profile,C.packaged);assert.equal(C.activeProfile(),parsed);
  C.resetPackaged();assert.equal(DOM.read(d,'/c/test').busy,false);
  assert.equal(d.querySelector('button').matches(DOM.STOP),false);
  assert.equal(C.health(d).revisionId,'packaged-1');
  assert.equal(C.health(d).matched.includes('stop'),false);
});
test('activated copy and regenerate value drift reaches existing final-control reader paths', () => {
  const copy=fixture('<section data-turn="assistant" data-turn-id="a"><button aria-label="Copy final answer"></button></section>');
  const timeline=fixture('<div data-app-action-timeline-scroll><section><div data-chatgpt-search-unit-key="u"></div><div data-chatgpt-search-unit-key="a"></div><button aria-label="Try response again"></button></section></div>');
  assert.equal(DOM.read(copy,'/c/test').ready,false);assert.equal(DOM.read(timeline,'/c/test').ready,false);
  const p=profile();p.signals.finalCopy=['button[aria-label="Copy final answer"]'];
  p.signals.finalRegenerate=['button[aria-label="Try response again"]'];
  C.activateValidatedProfile(C.parseProfile(JSON.stringify(p),doc));
  assert.equal(DOM.read(copy,'/c/test').ready,true);assert.equal(DOM.read(timeline,'/c/test').ready,true);
  assert.equal(C.selector('stop'),C.selector('stop',C.packaged));
  C.resetPackaged();assert.equal(DOM.read(copy,'/c/test').ready,false);assert.equal(DOM.read(timeline,'/c/test').ready,false);
});
test('packaged profile validates every selector and is deeply immutable with multiple candidates', () => {
  assert.deepEqual(C.parseProfile(JSON.stringify(C.packaged),doc), C.packaged);
  for (const candidates of Object.values(C.packaged.signals)) {
    assert.ok(candidates.length >= 2); assert.ok(Object.isFrozen(candidates));
  }
  assert.ok(Object.isFrozen(C.packaged.signals));
  assert.throws(() => C.selector('text'), /UNKNOWN/);
  assert.throws(() => C.selector('stop',profile()), /NOT_VALIDATED/);
});
test('profile schema rejects unknown keys, missing groups, bad ids, revisions, sizes and non-JSON objects', () => {
  for (const mutate of [p=>p.schemaVersion=2,p=>p.profileId='wrong',p=>p.revision=0,p=>p.revision=1e10,
    p=>p.revisionId='https://private.invalid',p=>p.signals.unknown=[],p=>delete p.signals.stop,
    p=>p.extract='textContent',p=>p.signals.stop=[],p=>p.signals.stop=Array(9).fill('button[aria-label="停止"]'),
    p=>p.signals.stop=['x'.repeat(161)]]) {
    const p=profile();mutate(p);assert.throws(()=>C.parseProfile(JSON.stringify(p),doc));
  }
  assert.throws(()=>C.parseProfile(' '.repeat(16385),doc));
  assert.throws(()=>C.parseProfile(C.packaged,doc));
  assert.throws(()=>C.parseProfile('{',doc));
  assert.throws(()=>C.parseProfile(JSON.stringify(C.packaged),null));
});
test('profiles cannot execute code, select prose or redirect categories to arbitrary DOM', () => {
  globalThis.compatibilityAttack = false;
  for (const candidate of ['[', 'script', 'main', '[data-private]', '[role="alert"]',
    'button:has(p)', '[data-testid="x"] p', '<script>compatibilityAttack=true</script>',
    '(()=>{globalThis.compatibilityAttack=true})()', 'button[onclick="compatibilityAttack=true"]',
    '[data-turn]', '[data-markdown-copy="private response"]']) {
    const p=profile();p.signals.finalCopy=[candidate];
    assert.throws(()=>C.parseProfile(JSON.stringify(p),doc));
  }
  assert.equal(globalThis.compatibilityAttack,false);
  const p=profile();p.signals.stop=[p.signals.stop[0]];
  assert.equal(C.parseProfile(JSON.stringify(p),doc).signals.stop.length,1);
  // Parsing configuration is not activation and never reads text, HTML or arbitrary attributes.
  const noProse={querySelector(selector){assert.ok(!selector.includes('textContent'));return null;},
    get textContent(){throw Error('prose read');},get innerHTML(){throw Error('HTML read');}};
  C.parseProfile(JSON.stringify(p),noProse);
  assert.equal(C.selector('stop'),C.packaged.signals.stop.join(', '));
});
test('JP and EN stop candidates work independently; health exports fixed structural metadata only', () => {
  for (const label of ['回答を停止','停止','Stop response','Stop generating']) {
    const d=fixture('<section data-turn="user"><p>PRIVATE_PROMPT</p></section><button aria-label="'+label+'">PRIVATE_LABEL</button>');
    const s=DOM.read(d,'/c/PRIVATE_URL');assert.equal(s.busy,true);
    assert.equal(s.compatibility.state,'healthy');
    assert.equal(JSON.stringify(s.compatibility).includes('PRIVATE'),false);
    assert.deepEqual(Object.keys(s.compatibility).sort(),['matched','profileId','reasons','remoteStatus','revision','revisionId','state','timestamp']);
  }
  assert.equal(C.health(doc,{},Infinity).timestamp,0);
});
test('missing stop still permits independent streaming and scoped final evidence', () => {
  const d=fixture('<section data-turn="assistant" data-turn-id="one" data-is-streaming="true"></section>');
  const detector=new Detector();detector.step(DOM.read(d,'/c/x'),0);
  d.querySelector('section').removeAttribute('data-is-streaming');
  d.querySelector('section').innerHTML='<button data-testid="copy-turn-action-button"></button>';
  const s=DOM.read(d,'/c/x');assert.equal(s.ready,true);
  assert.equal(detector.step(s,1),null);assert.ok(detector.step(s,2001));
});
test('future-like unknown DOM and ambiguous mains cannot complete even after an active job', () => {
  const d=fixture('<section data-turn="assistant" data-turn-id="one" data-is-streaming="true"></section>');
  const detector=new Detector();detector.step(DOM.read(d,'/c/x'),0);
  d.querySelector('main').innerHTML='<future-answer data-finished="true">PRIVATE_ANSWER<button>Copy</button></future-answer>';
  const s=DOM.read(d,'/c/x');assert.equal(s.compatibility.state,'incompatible');assert.equal(s.ready,false);
  assert.equal(detector.step({...s,ready:true,turn:'malformed'},10000),null);
  d.body.innerHTML='<main><section data-turn="assistant" data-turn-id="one"><button data-testid="copy-turn-action-button"></button></section></main>'.repeat(2);
  assert.equal(DOM.read(d,'/c/x').ready,false);
});
const now=1800000000000;
test('health optionally scopes categories and reasons to the selected main, including no selection',()=>{
 const d=fixture('<div data-turn="user"></div>');
 d.body.insertAdjacentHTML('beforeend','<main><div data-app-action-timeline></div><button aria-label="Regenerate response"></button></main>');
 const selectedMain=d.querySelectorAll('main')[1];
 assert.ok(C.health(d,{known:true}).matched.includes('user'));
 const h=C.health(d,{selectedMain,known:true,ready:true});
 assert.deepEqual(h.matched,['finalRegenerate','timeline']);
 assert.deepEqual(h.reasons,['MARKDOWN_COPY_MISSING']);
 assert.deepEqual(C.health(d,{selectedMain:null,ambiguous:true}).matched,[]);
 assert.deepEqual(C.health(d,{selectedMain:null}).reasons,['MAIN_MISSING']);
});
test('multiple-main scoring respects validated active selectors',()=>{
 const d=fixture('');d.body.insertAdjacentHTML('beforeend','<main><section data-testid="conversation-entry-1"><button aria-label="Copy final answer"></button></section></main>');
 assert.deepEqual(DOM.read(d,'/c/test').compatibility.reasons,['REQUEST_AMBIGUOUS']);
 const p=profile();p.signals.turn=['[data-testid^="conversation-entry-"]'];p.signals.finalCopy=['button[aria-label="Copy final answer"]'];
 C.activateValidatedProfile(C.parseProfile(JSON.stringify(p),d));
 const diagnostic={dom:{}},s=DOM.read(d,'/c/test',true,diagnostic);
 assert.equal(diagnostic.dom.selectedMainIndex,1);assert.ok(s.compatibility.matched.includes('finalCopy'));
 assert.equal(s.compatibility.reasons.includes('REQUEST_AMBIGUOUS'),false);
});
const envelope=()=>({schemaVersion:1,keyId:'owner-1',issuedAt:now-1000,expiresAt:now+60000,profile:profile(),signature:'00'.repeat(64)});
test('remote envelope enforces size, schema, expiry, clock, revision and signature bounds', () => {
  assert.equal(C.parseEnvelope(JSON.stringify(envelope()),doc,now).profile.revision,1);
  for (const mutate of [e=>e.extra='private',e=>e.schemaVersion=2,e=>e.keyId='unknown',e=>e.expiresAt=now,
    e=>e.issuedAt=now+300001,e=>e.expiresAt=now+31*86400000,e=>e.signature='bad',e=>e.profile.revision=0]) {
    const e=envelope();mutate(e);assert.throws(()=>C.parseEnvelope(JSON.stringify(e),doc,now));
  }
  assert.throws(()=>C.parseEnvelope(JSON.stringify(envelope()),doc,now,2),/ROLLBACK/);
  assert.throws(()=>C.parseEnvelope(JSON.stringify(envelope()),doc,Infinity));
  assert.throws(()=>C.parseEnvelope(' '.repeat(16385),doc,now));
});
test('verification authenticates canonical envelope bytes, fails closed; remote selection cannot be enabled by data', async () => {
  const raw=JSON.stringify(envelope());
  await assert.rejects(C.verifyEnvelope(raw,doc),/KEY_UNPROVISIONED/);
  let bytes;
  // Stub only the cryptographic boundary; no private keys or credentials generated.
  const subtle={importKey:async()=>({}),verify:async(algorithm,key,signature,data)=>{
    assert.equal(algorithm.name,'ECDSA');assert.equal(signature.length,64);bytes=Buffer.from(data).toString();return true;
  }};
  const p=await C.verifyEnvelope(raw,doc,{now,publicKey:{},subtle});assert.equal(p.revision,1);
  assert.equal(bytes,C.parseEnvelope(raw,doc,now).signed);
  await assert.rejects(C.verifyEnvelope(raw,doc,{now,publicKey:{},subtle:{...subtle,verify:async()=>false}}),/SIGNATURE_INVALID/);
  const result=await C.selectRemote(raw,raw,doc,{now,publicKey:{},subtle});
  assert.equal(result.source,'packaged');assert.equal(result.reason,'REMOTE_PROFILE_KEY_UNPROVISIONED');
  assert.equal(result.profile,C.packaged);
});
test('native WebCrypto rejects a forged signature with a public P-256 test point; no private key is generated', async () => {
  const publicKey={kty:'EC',crv:'P-256',
    x:Buffer.from('6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296','hex').toString('base64url'),
    y:Buffer.from('4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5','hex').toString('base64url')};
  await assert.rejects(C.verifyEnvelope(JSON.stringify(envelope()),doc,{now,publicKey,
    subtle:require('node:crypto').webcrypto.subtle}),/SIGNATURE_INVALID/);
});
