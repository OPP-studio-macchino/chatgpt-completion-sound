const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parseHTML}=require(require.resolve('linkedom',{paths:[process.env.CHAPPY_DOM_DEPENDENCIES||__dirname]}));
const DOM=require('../extension/dom-reader.js');
const Detector=require('../extension/detector.js');
const unit=id=>`<div data-chatgpt-search-unit-key="${id}"></div>`;
const final='<div data-markdown-copy="private">private answer</div><button aria-label="回答を再生成">Regenerate</button>';
const block=(id,body='',assistant=true)=>`<section><div>${unit(id+'-user')}${assistant?unit(id+'-assistant'):''}</div>${body}</section>`;
function fixture(html){
 const {document,window}=parseHTML('<html><body><main><div data-request-input-activity-root="true"><div data-app-action-timeline-scroll>'+html+'</div><form><div contenteditable="true"></div></form></div></main></body></html>');
 window.HTMLElement.prototype.getClientRects=function(){return this.hidden?[]:[{}];};
 window.getComputedStyle=e=>({display:e.style.display||'block',visibility:e.style.visibility||'visible',opacity:'1'});
 Object.defineProperty(document,'visibilityState',{value:'hidden'});
 return {document,read:()=>DOM.read(document,'/c/fixture',true),set:html=>{document.querySelector('[data-app-action-timeline-scroll]').innerHTML=html;}};
}
test('live timeline final regenerate control completes while hidden even without markdown-copy',()=>{
 const f=fixture(block('a','<button aria-label="回答を再生成">Regenerate</button>'));assert.equal(f.read().ready,true);
 assert.equal(f.read().compatibility.state,'degraded');
 assert.deepEqual(f.read().compatibility.reasons,['MARKDOWN_COPY_MISSING']);
});
test('legacy timeline final marker plus regenerate controls also completes while hidden',()=>{
 const f=fixture(block('a',final));assert.equal(f.read().ready,true);
});
const duplicateRequest=(first='private-input',nested=first,second='private-answer',body=final)=>
 `<section><div><div data-chatgpt-search-unit-key="${first}"><div data-content-search-unit-key="${nested}"></div></div>${unit(second)}</div>${body}</section>`;
test('nested cross-attribute duplicates count as two logical units and reach sibling final controls',()=>{
 const f=fixture(duplicateRequest());
 assert.equal(f.document.querySelectorAll('[data-chatgpt-search-unit-key], [data-content-search-unit-key]').length,3);
 const snapshot=f.read();
 assert.equal(snapshot.ready,true);
 assert.notEqual(snapshot.compatibility.state,'incompatible');
 assert.equal(snapshot.compatibility.reasons.includes('REQUEST_AMBIGUOUS'),false);
 assert.equal(snapshot.user,'/c/fixture\u001ftimeline-input\u001fprivate-input');
});
test('three distinct keys and duplicate empty keys do not reach sibling final controls',()=>{
 for (const [first,nested,second] of [['input','distinct','answer'],['','','answer'],['input','','']]) {
  const f=fixture(duplicateRequest(first,nested,second));
  assert.equal(f.read().ready,false);
 }
});
test('normalized units preserve stop, streaming, rendering and final-control ordering guards',()=>{
 for (const busy of ['<button aria-label="停止">Stop</button>','<div data-is-streaming="true"></div>']) {
  const f=fixture(duplicateRequest()+busy);
  assert.equal(f.read().busy,true);assert.equal(f.read().ready,false);
 }
 const hidden=fixture(duplicateRequest());hidden.document.querySelector('button').hidden=true;
 assert.equal(hidden.read().ready,false);
 const before=fixture(duplicateRequest('input','input','answer',''));
 before.document.querySelector('[data-chatgpt-search-unit-key="answer"]').insertAdjacentHTML('beforebegin',final);
 assert.equal(before.read().ready,false);
 assert.equal(before.read().compatibility.reasons.includes('REQUEST_AMBIGUOUS'),true);
 const previous=fixture(duplicateRequest()+block('latest','',false));
 assert.equal(previous.read().ready,false);
});
test('live Japanese stop label remains busy even with sibling final controls',()=>{
 const f=fixture(block('a',final)+'<button aria-label="停止">Stop</button>');
 assert.equal(f.read().busy,true);assert.equal(f.read().ready,false);
});
test('tool output markers without final regenerate controls are not final',()=>{
 const f=fixture(block('a','<div data-markdown-copy="private">partial tool output</div>'));
 assert.equal(f.read().ready,false);
});
test('latest pending user cannot borrow a previous request final marker',()=>{
 const f=fixture(block('old',final)+block('new','',false));assert.equal(f.read().ready,false);
});
test('request identity survives assistant index replacement and completes only once',()=>{
 const f=fixture(block('old',final)),d=new Detector();assert.equal(d.step(f.read(),0),null);
 f.set(block('old',final)+block('new','',false));d.step(f.read(),10);assert.equal(d.active,true);
 const before=f.read().turn;
 f.set(block('old',final)+block('new'));assert.equal(f.read().turn,before);d.step(f.read(),20);
 f.set(block('old',final)+block('new',final));d.step(f.read(),30);
 assert.ok(d.step(f.read(),2030));assert.equal(d.step(f.read(),5000),null);
 f.document.querySelectorAll('[data-chatgpt-search-unit-key]')[3].setAttribute('data-chatgpt-search-unit-key','changed-assistant-index');
 assert.equal(f.read().turn,before);assert.equal(d.step(f.read(),8000),null);
});
test('manual stop suppresses a later sibling final marker',()=>{
 const f=fixture(block('old',final)),d=new Detector();d.step(f.read(),0);
 f.set(block('new'));d.step(f.read(),10);d.cancel();f.set(block('new',final));
 assert.equal(d.step(f.read(),20),null);assert.equal(d.step(f.read(),10000),null);
});
test('a final marker before the latest unit cannot finish that latest unit',()=>{
 const f=fixture('<section>'+final+unit('new-user')+'</section>');assert.equal(f.read().ready,false);
});
test('non-rendered regenerate controls do not complete',()=>{
 const f=fixture(block('a',final));f.document.querySelector('button').hidden=true;assert.equal(f.read().ready,false);
});
for (const index of [0,1]) test(`two mains select conversation at index ${index} and complete once`,()=>{
 const f=fixture(duplicateRequest()),d=new Detector();
 const main=f.document.querySelector('main');
 main.insertAdjacentHTML(index===0?'afterend':'beforebegin','<main><form><textarea>private composer</textarea></form></main>');
 const diagnostic={dom:{}};
 const initial=DOM.read(f.document,'/c/fixture',true,diagnostic);
 assert.equal(diagnostic.dom.mainCount,2);assert.equal(diagnostic.dom.selectedMainIndex,index);
 assert.equal(initial.ready,true);assert.notEqual(initial.compatibility.state,'incompatible');
 for (const category of ['searchUnit','timeline','request','finalRegenerate','markdownCopy']) assert.ok(initial.compatibility.matched.includes(category));
 assert.equal(JSON.stringify(initial.compatibility).includes('private'),false);
 d.step(initial,0);f.set(block('new','',false));d.step(f.read(),10);
 f.set(block('new',final));d.step(f.read(),20);
 assert.ok(d.step(f.read(),2020));assert.equal(d.step(f.read(),5000),null);
});
test('equal positive main scores fail closed despite duplicate nodes',()=>{
 const f=fixture(duplicateRequest());
 const main=f.document.querySelector('main'),other=main.cloneNode(true);
 other.querySelector('section').insertAdjacentHTML('beforeend',unit('extra').repeat(20));
 main.after(other);
 const diagnostic={dom:{}},s=DOM.read(f.document,'/c/fixture',true,diagnostic);
 assert.equal(diagnostic.dom.mainCount,2);assert.equal(diagnostic.dom.selectedMainIndex,-1);
 assert.equal(s.ready,false);assert.equal(s.compatibility.state,'incompatible');
 assert.deepEqual(s.compatibility.reasons,['REQUEST_AMBIGUOUS']);assert.deepEqual(s.compatibility.matched,[]);
});
test('two signal-free mains fail closed regardless of composer, size or text',()=>{
 const f=fixture('');f.document.body.innerHTML='<main><form><textarea>conversation-turn Stop response</textarea></form></main><main><p>answer</p></main>';
 const diagnostic={dom:{}},s=DOM.read(f.document,'/c/fixture',true,diagnostic);
 assert.equal(diagnostic.dom.mainCount,2);assert.equal(diagnostic.dom.selectedMainIndex,-1);
 assert.equal(s.ready,false);assert.equal(s.compatibility.state,'incompatible');
 assert.deepEqual(s.compatibility.reasons,['REQUEST_AMBIGUOUS']);assert.deepEqual(s.compatibility.matched,[]);
});
test('a unique higher category score wins over repeated lower-score nodes',()=>{
 const f=fixture(duplicateRequest());
 f.document.querySelector('main').insertAdjacentHTML('beforebegin','<main>'+unit('decoy').repeat(50)+'</main>');
 const diagnostic={dom:{}},s=DOM.read(f.document,'/c/fixture',true,diagnostic);
 assert.equal(diagnostic.dom.selectedMainIndex,1);assert.equal(s.ready,true);
});
