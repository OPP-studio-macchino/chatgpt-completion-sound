const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parseHTML}=require('linkedom');
const C=require('../extension/compatibility.js');
const DOM=require('../extension/dom-reader.js');
const Detector=require('../extension/detector.js');
const action='<div class="turn-action-controls"><button></button></div>';
const answer='<div data-conversation-role="assistant"><div data-markdown-text-style="assistant-message"></div></div>';
const group=(body,key='PRIVATE_TURN_KEY')=>`<section data-turn-key="${key}" data-chatgpt-search-message-ids="PRIVATE_SEARCH_IDS"><div data-user-message-bubble></div>${body}</section>`;
function fixture(html,visibility='visible') {
 const {document,window}=parseHTML('<html><body><main>'+html+'</main></body></html>');
 window.HTMLElement.prototype.getClientRects=function(){return [{}];};
 window.getComputedStyle=e=>({display:e.style.display||'block',visibility:'visible',opacity:'1'});
 Object.defineProperty(document,'visibilityState',{value:visibility});
 const diagnostic={dom:{}};
 return {document,diagnostic,snapshot:DOM.read(document,'/c/fixture',true,diagnostic)};
}
test('rollout packaged selectors validate while combinators/classes/pseudo selectors remain rejected',()=>{
 const f=fixture(group(answer));
 assert.ok(C.parseProfile(JSON.stringify(C.packaged),f.document));
 for(const selector of ['[data-turn-key]:has([data-conversation-role="assistant"])','.turn-action-controls button','[data-turn-key] button','[data-private]']) {
  const profile=JSON.parse(JSON.stringify(C.packaged));profile.signals.turn=[selector];
  assert.throws(()=>C.parseProfile(JSON.stringify(profile),f.document));
 }
});
test('shared group has separate stable role identities; user-only is never ready',()=>{
 const u=fixture(group('')),a=fixture(group(answer));
 assert.equal(u.snapshot.user,a.snapshot.user);
 assert.notEqual(u.snapshot.turn,a.snapshot.turn);
 assert.equal(u.snapshot.ready,false);
 assert.equal(u.diagnostic.dom.selectedIsUser,true);
 assert.equal(a.diagnostic.dom.selectedIsUser,false);
 assert.equal(a.diagnostic.dom.selectedIsAssistant,true);
 assert.ok(a.snapshot.compatibility.matched.includes('markdown'));
 assert.equal(a.snapshot.compatibility.state,'healthy');
});
for(const [name,body,expected] of [
 ['after',answer+action,true],['before',action+answer,false],['user only',action,false],
 ['hidden action',answer+action.replace('<button>','<button hidden>'),false],
 ['legacy user footer','<button data-testid="copy-turn-action-button"></button>'+answer,false],
 ['other group',answer+'<section data-turn-key="other">'+action+'</section>',false]
])test(`rollout action scope/order: ${name}`,()=>assert.equal(fixture(group(body)).snapshot.ready,expected));
test('agent-start marker independently supplies assistant evidence',()=>{
 assert.equal(fixture(group('<div data-chatgpt-agent-turn-start></div>'+action)).snapshot.ready,true);
});
test('legacy ids retain precedence in rollout groups',()=>{
 const f=fixture(group(answer.replace('data-conversation-role="assistant"','data-conversation-role="assistant" data-message-id="legacy-message"')));
 assert.equal(f.snapshot.message,'legacy-message');
 assert.equal(f.snapshot.turn,'');
});
test('hidden rollout identity uses existing provisional path only without busy evidence',()=>{
 const f=fixture(group(answer),'hidden');
 assert.equal(f.snapshot.ready,true);assert.equal(f.snapshot.provisional,true);
 assert.equal(fixture(group(answer)+'<button aria-label="Stop generating"></button>','hidden').snapshot.ready,false);
 const d=new Detector();d.step(fixture(group('')).snapshot,0);
 d.step({...fixture(group(answer)).snapshot,busy:true,visibleStop:true},100);
 assert.equal(d.step(f.snapshot,200),null);
 assert.equal(d.step(f.snapshot,4199),null);
 assert.ok(d.step(f.snapshot,4200));
});
test('rollout group emergence stays in the observed generation lifecycle and completes once',()=>{
 const d=new Detector();
 d.step(fixture(group('')).snapshot,0);
 d.step({...fixture(group('')).snapshot,busy:true,visibleStop:true},100);
 const lifecycle=d.lifecycle;
 d.step(fixture(group(answer)).snapshot,200);
 assert.equal(d.lifecycle,lifecycle);
 const final=fixture(group(answer+action)).snapshot;
 assert.equal(d.step(final,300),null);
 assert.ok(d.step(final,2300));assert.equal(d.step(final,10000),null);
});
test('structural diagnostics omit raw rollout keys and search message ids',()=>{
 const f=fixture(group(answer+action));
 const summary=DOM.structuralSummary(f.document.querySelector('[data-turn-key]'),f.document.querySelector('main'));
 assert.ok(summary.attributeNames.includes('data-turn-key'));
 assert.ok(summary.attributeNames.includes('data-chatgpt-search-message-ids'));
 assert.doesNotMatch(JSON.stringify([f.diagnostic,summary]),/PRIVATE_/);
});
test('rollout markdown body also classifies existing search units without legacy markdown markers',()=>{
 const f=fixture('<section data-chatgpt-search-unit-key="input"></section><section data-chatgpt-search-unit-key="answer"><div data-markdown-text-style="assistant-message"></div></section>');
 assert.equal(f.diagnostic.dom.selectedIsAssistant,true);
 assert.equal(f.diagnostic.dom.selectedIsUser,false);
 assert.equal(f.snapshot.ready,false);
});
