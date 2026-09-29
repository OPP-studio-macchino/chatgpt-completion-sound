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
});
test('legacy timeline final marker plus regenerate controls also completes while hidden',()=>{
 const f=fixture(block('a',final));assert.equal(f.read().ready,true);
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
