const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const {parseHTML}=require(require.resolve('linkedom',{paths:[process.env.CHAPPY_DOM_DEPENDENCIES||__dirname]}));
const {fakeClock,flush}=require('./fake-clock.cjs');
const ROOT=path.join(__dirname,'../extension');
const unit=(key,body='')=>`<section data-chatgpt-search-unit-key="${key}">${body}</section>`;
const stop='<button data-testid="stop-button">Stop</button>';
const history=unit('fixture-history-user')+unit('fixture-history-answer','<div data-markdown-copy>Fixture</div>');
const stale='<div data-is-streaming="true"></div>';
const writing=id=>`<section data-testid="conversation-turn-user-${id}"><div data-message-author-role="user" data-message-id="user-${id}"></div></section><section data-testid="conversation-turn-answer-${id}"><div data-message-author-role="assistant" data-message-id="answer-${id}"><p>Fixture writing</p></div></section>`;
// Live read-only composer inspection: type=submit, aria-label=送信, no testid.
const composer=(attributes='')=>`<form><div contenteditable="true"></div><button type="submit" aria-label="送信" ${attributes}></button></form>`;

test('DOM-only composer idle completes stale-streaming writing exactly once and independently for G2',async t=>{
 const f=await setup(t);
 for(const id of [1,2]) {
  await f.scan(writing(id)+stop+stale+composer('disabled'));
  await f.scan(writing(id)+stale+composer('disabled'));
  await f.advance(5000);
  assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,id-1);
  // Attribute mutation alone must schedule a scan, without a timer call.
  const before=f.sent.length;
  f.document.querySelector('button[type="submit"]').removeAttribute('disabled');
  await flush();await flush();
  assert.equal(f.detector.quietCandidate.length>0,true);
  assert.ok(f.sent.length>=before);
  await f.advance(2999);assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,id-1);
  await f.advance(1);await flush();
  assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,id);
  assert.equal(f.sent.findLast(m=>m.type==='STATUS').state,'complete');
  await f.advance(20000);
  assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,id);
  assert.equal(f.document.querySelector('[data-is-streaming="true"]')!==null,true);
 }
 assert.equal(f.hints.some(m=>m.transportCompleted),false);
});

for(const guard of ['history','user-only','stop','disabled','aria-disabled','hidden','transparent','hidden-page','manual-stop','outside-form']) {
 test(`composer-idle refuses ${guard}`,async t=>{
  const f=await setup(t,{initialHTML:guard==='history'?writing(1)+stale+composer():history});
  if(guard!=='history')await f.scan(writing(1)+stop+stale);
  if(guard==='manual-stop')f.document.querySelector('[data-testid="stop-button"]').dispatchEvent(new f.window.Event('click',{bubbles:true}));
  if(guard==='hidden-page')Object.defineProperty(f.document,'visibilityState',{value:'hidden',configurable:true});
  const answer=guard==='user-only'?'<section data-turn="user" data-turn-id="new-user"></section>':writing(1);
  const attrs={disabled:'disabled','aria-disabled':'aria-disabled="true"',hidden:'hidden',transparent:'style="opacity:0"'};
  await f.scan(answer+stale+(guard==='stop'?stop:'')+(guard==='outside-form'?'<button type="submit"></button>':composer(attrs[guard]||'')));
  await f.advance(20000);
  assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,0);
 });
}

test('composer childList insertion alone schedules the idle scan',async t=>{
 const f=await setup(t);
 await f.scan(writing(1)+stop+stale);
 await f.scan(writing(1)+stale);
 f.document.querySelector('main').insertAdjacentHTML('beforeend',composer());
 await flush();await flush();
 assert.ok(f.detector.quietCandidate);
 await f.advance(3000);await flush();
 assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,1);
});

for(const reset of ['route','new prompt','reinjection','disable','error','blocked','incompatible']) {
 test(`composer idle window resets on ${reset} without transport`,async t=>{
  const f=await setup(t);
  await f.scan(writing(1)+stop+stale);
  await f.scan(writing(1)+stale+composer());
  await f.advance(2999);
  if(reset==='route')f.page.location.pathname='/c/other';
  if(reset==='new prompt')await f.scan('<section data-turn="user" data-turn-id="new" data-message-author-role="user" data-message-id="user-2"></section>'+stale+composer());
  if(reset==='reinjection')await f.inject();
  if(reset==='disable')await f.deliverHint({type:'SET_ENABLED',enabled:false});
  if(reset==='error')await f.scan(writing(1)+stale+composer()+'<div role="alert">Network error</div>');
  if(reset==='blocked')await f.scan(writing(1)+stale+composer()+'<div role="dialog"></div>');
  if(reset==='incompatible')await f.scan(stale+composer());
  await f.advance(20000);
  assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,0);
 });
}

test('normal final controls retain priority over composer idle',async t=>{
 const f=await setup(t);
 await f.scan(writing(1)+stop);
 await f.scan(writing(1).replace('</p>','</p><button data-testid="copy-turn-action-button"></button>')+composer());
 await f.advance(1999);assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,0);
 await f.advance(1);await flush();
 assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,1);
});
async function setup(t,{immediateTransport=false,initialHTML=history}={}) {
 const f=require('./chrome-fixture.cjs')({soundName:'fixture.wav',soundData:'data:audio/wav;base64,TEST',playedCount:0});
 const clock=fakeClock(),workerListeners=new Set(),pageListeners=new Set(),networkListeners=[],sent=[],hints=[],plays=[];
 let contexts=[],tick,detector;
 const deliver=(listeners,message,sender)=>new Promise(resolve=>{
  for(const listener of listeners)if(listener(message,sender,resolve)===true)return;
  resolve(undefined);
 });
 const transport=()=>networkListeners[0]({tabId:1,frameId:0,method:'POST',statusCode:200,url:'https://chatgpt.com/backend-api/f/conversation'});
 const chrome=f.api;
 chrome.webRequest={onCompleted:{addListener:fn=>networkListeners.push(fn)}};
 chrome.runtime={id:'fixture',getURL:p=>'chrome-extension://fixture/'+p,getContexts:async()=>contexts,
  onMessage:{addListener:fn=>workerListeners.add(fn)},onInstalled:{addListener:()=>{}},
  sendMessage:async message=>{plays.push(message);return {ok:true};}};
 chrome.offscreen={createDocument:async()=>{contexts=[{}];}};
 chrome.tabs.sendMessage=async(id,message,options)=>{
  assert.equal(id,1);assert.deepEqual(options,{documentId:'fixture-document'});
  hints.push(JSON.parse(JSON.stringify(message)));return deliver(pageListeners,message,{id:'fixture'});
 };
 const worker=vm.createContext({chrome,ChappyCompatibility:require('../extension/compatibility.js'),ChappyTabColors:require('../extension/tab-colors.js'),ChappyBackgroundWatch:require('../extension/background-watch.js'),setTimeout:clock.setTimeout,clearTimeout:clock.clearTimeout,crypto:webcrypto,URL,console});
 vm.runInContext(fs.readFileSync(path.join(ROOT,'background.js'),'utf8').replace(/^import '\.\/[^']+';\s*/gm,''),worker);
 const {document,window}=parseHTML('<html><body><main>'+initialHTML+'</main></body></html>');
 Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});
 window.HTMLElement.prototype.getClientRects=function(){return [{}];};
 window.getComputedStyle=e=>({display:e.style.display||'block',visibility:e.style.visibility||'visible',opacity:e.style.opacity||'1'});
 const sender={id:'fixture',tab:{id:1},frameId:0,documentId:'fixture-document',url:'https://chatgpt.com/c/fixture'};
 const pageChrome={runtime:{id:'fixture',sendMessage:message=>{
  sent.push(JSON.parse(JSON.stringify(message)));
  const reply=deliver(workerListeners,message,sender);
  // Fire before the asynchronous watch write/STATUS acknowledgement finishes.
  if(immediateTransport && message.type==='STATUS' && message.state==='generating') {immediateTransport=false;transport();}
  return reply;
 },onMessage:{addListener:fn=>pageListeners.add(fn),removeListener:fn=>pageListeners.delete(fn)}}};
 const page=vm.createContext({document,window,location:{pathname:'/c/fixture'},Element:window.Element,MutationObserver:window.MutationObserver,chrome:pageChrome,crypto:webcrypto,TextEncoder,Date:{now:clock.now},queueMicrotask,setInterval:fn=>{tick=fn;return 1;},clearInterval:()=>{}});
 for(const file of ['compatibility.js','detector.js','dom-reader.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,file),'utf8'),page);
 const step=page.ChappyCompletionDetector.prototype.step;
 page.ChappyCompletionDetector.prototype.step=function(...args){detector=this;return step.apply(this,args);};
 const inject=async()=>{vm.runInContext(fs.readFileSync(path.join(ROOT,'content.js'),'utf8'),page);await flush();};
 await inject();t.after(()=>page.__chappySoundInstance.dispose());
 const scan=async(html=null)=>{if(html!==null)document.querySelector('main').innerHTML=html;await flush();await tick();await flush();};
 const advance=async(ms)=>{await clock.advance(ms);await scan();};
 return {...f,clock,document,window,page,scan,advance,transport,inject,sent,hints,plays,deliverHint:message=>deliver(pageListeners,message,{id:'fixture'}),get detector(){return detector;}};
}
for(const timing of ['while busy','after busy teardown','first generating STATUS']) {
 test(`writing-block content/background transport correlation end-to-end: ${timing}`,async t=>{
  const f=await setup(t,{immediateTransport:timing==='first generating STATUS'});
  const initialLifecycle=f.detector.lifecycle;
  const prompt=history+unit('fixture-new-user');
  await f.scan(prompt+stop);
  const g1=f.sent.findLast(m=>m.type==='STATUS'&&m.state==='generating').watchGeneration;
  assert.equal(f.session['watch-1'].watchGeneration,g1);
  assert.equal(f.detector.lifecycle,initialLifecycle+1);
  await f.scan(prompt+unit('fixture-pending-answer')+stop);
  await f.scan(prompt+unit('fixture-pending-answer','<div data-markdown-han-text>Fixture writing block</div>')+stop);
  const writing='<section data-testid="conversation-turn-10"><div data-message-author-role="user" data-message-id="fixture-user-1">Fixture</div></section><section data-testid="conversation-turn-11"><div data-message-author-role="assistant" data-message-id="fixture-answer-1">Fixture writing block</div></section>';
  await f.scan(writing+stop);
  assert.equal(f.detector.lifecycle,initialLifecycle+1);
  assert.equal(f.session['watch-1'].watchGeneration,g1);
  assert.deepEqual([...new Set(f.sent.filter(m=>m.type==='STATUS'&&m.state==='generating').map(m=>m.watchGeneration))],[g1]);
  if(timing==='while busy'){f.transport();await flush();}
  if(timing!=='after busy teardown')assert.equal(f.detector.transportCompleted,true);
  assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,0);
  await f.scan(writing);
  if(timing==='after busy teardown'){f.transport();await flush();}
  assert.equal(f.detector.transportCompleted,true);
  const hint=f.hints.find(m=>m.transportCompleted);
  assert.deepEqual(hint,{type:'SCAN_NOW',transportCompleted:true,watchGeneration:g1});
  assert.equal(f.page.ChappyDOM.read(f.document,'/c/fixture',true).ready,false);
  await f.advance(3999);assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,0);
  await f.advance(1);await flush();
  assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,1);
  assert.equal(f.session['tab-1'].state,'complete');assert.equal(f.groups.get(f.tabs.get(1).groupId).color,'blue');
  assert.equal(f.plays.length,1);assert.equal(f.session['watch-1'],undefined);
  await f.advance(10000);assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,1);
  const beforeSecond=f.detector.lifecycle;
  const second=writing+'<section data-testid="conversation-turn-12"><div data-message-author-role="user" data-message-id="fixture-user-2">Fixture second prompt</div></section>';
  await f.scan(second+stop);
  const g2=f.session['watch-1'].watchGeneration;
  assert.notEqual(g2,g1);assert.equal(f.detector.lifecycle,beforeSecond+1);
  const secondAnswer=second+'<section data-testid="conversation-turn-13"><div data-message-author-role="assistant" data-message-id="fixture-answer-2">Fixture second writing block</div></section>';
  await f.scan(secondAnswer+stop);await f.deliverHint(hint);await f.scan(secondAnswer);
  await f.advance(5000);assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,1);
  assert.equal(f.detector.transportCompleted,false);assert.equal(f.session['tab-1'].state,'generating');
  f.transport();await flush();await f.advance(4000);await flush();
  assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,2);assert.equal(f.plays.length,2);
  await f.advance(10000);assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,2);
  // Retrieve the real content export, which must not expose either correlation token.
  const exported=await f.deliverHint({type:'GET_DIAGNOSTICS'});
  assert.equal(JSON.stringify(exported).includes(g1),false);assert.equal(JSON.stringify(exported).includes(g2),false);
 });
}
test('stale streaming writing-block with same-lifecycle transport: 5999/6000ms, exact once, stale G1 rejected during G2',async t=>{
 const f=await setup(t);
 await f.scan(history+unit('new-user')+stop+stale);
 await f.scan(history+unit('new-user')+unit('new-answer')+stop+stale);
 await f.scan(writing(1)+stop+stale);
 f.transport();await flush();
 const hint=f.hints.find(m=>m.transportCompleted);
 await f.scan(writing(1)+stale);
 assert.equal(f.detector.transportCompleted,true);
 await f.advance(5999);assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,0);
 await f.advance(1);await flush();
 assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,1);
 assert.equal(f.sent.filter(m=>m.type==='STATUS'&&m.state==='complete').length,1);
 assert.equal(f.session['tab-1'].state,'complete');assert.equal(f.plays.length,1);
 await f.advance(10000);await f.scan();assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,1);
 await f.scan(writing(1)+stop+stale);
 assert.equal(f.sent.findLast(m=>m.type==='STATUS').state,'generating');
 assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,1);
 await f.scan(writing(2)+stop+stale);await f.scan(writing(2)+stale);
 await f.deliverHint(hint);
 assert.equal(f.detector.transportCompleted,false);
 await f.advance(20000);assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,1);
 f.transport();await flush();assert.equal(f.detector.transportCompleted,true);
 await f.advance(5999);assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,1);
 await f.advance(1);await flush();
 assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,2);
 assert.equal(f.sent.filter(m=>m.type==='STATUS'&&m.state==='complete').length,2);
 assert.equal(f.plays.length,2);
 await f.advance(10000);await f.scan();assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,2);
 const exported=JSON.stringify(await f.deliverHint({type:'GET_DIAGNOSTICS'}));
 for(const token of f.hints.filter(m=>m.transportCompleted).map(m=>m.watchGeneration))assert.equal(exported.includes(token),false);
 assert.doesNotMatch(exported,/watchGeneration|transportCompleted|backend-api/);
});
test('quiescence never completes with visible Stop, including a long mutation-free generation',async t=>{
 const f=await setup(t);await f.scan(writing(1)+stop+stale);
 f.transport();await flush();assert.equal(f.detector.transportCompleted,true);
 await f.advance(20000);assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,0);
 await f.scan(writing(1)+stale);await f.advance(5999);
 await f.scan(writing(1)+stop+stale);await f.advance(10000);
 assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,0);
 await f.scan(writing(1)+stale);await f.advance(5999);
 assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,0);
 await f.advance(1);assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,1);
});
test('completion-relevant structural mutations every less than six seconds reset quiescence',async t=>{
 const f=await setup(t);await f.scan(writing(1)+stop+stale);
 f.transport();await flush();await f.scan(writing(1)+stale);
 for(let i=0;i<4;i++) {
  await f.advance(5999);assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,0);
  f.document.querySelector('p').insertAdjacentHTML('beforeend','<div data-message-author-role="assistant"></div>');await f.scan();
 }
 await f.advance(5999);assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,0);
 await f.advance(1);assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,1);
});
test('quiescence ignores unrelated cursor timestamp and control churn with a fixed-size signature',async t=>{
 const f=await setup(t);await f.scan(writing(1)+stop+stale);
 f.transport();await flush();await f.scan(writing(1)+stale);
 const summary=f.page.ChappyDOM.structuralSummary;
 let summaryCalls=0;
 f.page.ChappyDOM.structuralSummary=(...args)=>{summaryCalls++;return summary(...args);};
 const main=f.document.querySelector('main');
 const panel=f.document.createElement('aside');main.append(panel);
 for(let i=0;i<4;i++) {
  panel.innerHTML='<time>Fixture timestamp</time><span class="cursor"></span>'+Array.from({length:1000},()=>'<span></span>').join('')+'<button type="button">Fixture unrelated control</button>';
  await f.scan();await f.advance(1499);
 }
 // Existing mutation summaries are bounded; the new signature adds no per-node calls.
 summaryCalls=0;await f.scan();assert.ok(summaryCalls<20);
 assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,0);
 await f.advance(4);await flush();
 assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,1);
 const exported=JSON.stringify(await f.deliverHint({type:'GET_DIAGNOSTICS'}));
 assert.equal(exported.includes('completionStructure'),false);
 assert.equal(exported.includes('Fixture timestamp'),false);
});
test('historical stale streaming without genuine generation evidence never completes',async t=>{
 const f=await setup(t);await f.scan(writing(1)+stale);await f.inject();
 await f.advance(20000);await f.scan();
 assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,0);
 assert.equal(f.detector.generationEvidence,false);
});
test('stale streaming and tool/reasoning-like pause without transport never complete after 20s quiet',async t=>{
 const f=await setup(t);await f.scan(writing(1)+stop+stale);
 await f.scan(writing(1)+stale);
 assert.equal(f.detector.generationEvidence,true);
 assert.equal(f.detector.transportCompleted,false);
 await f.advance(20000);await f.scan();
 assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,0);
 assert.equal(f.sent.filter(m=>m.type==='STATUS'&&m.state==='complete').length,0);
 assert.equal(f.session['tab-1'].state,'generating');
});
test('new prompt with stale streaming and no answer cannot quiesce into completion',async t=>{
 const f=await setup(t);
 const prompt='<section data-testid="conversation-turn-user-1"><div data-message-author-role="user" data-message-id="user-1"></div></section>';
 await f.scan(prompt+stop+stale);f.transport();await flush();await f.scan(prompt+stale);
 await f.advance(20000);assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,0);
});
test('quiescence old window invalidated by lifecycle, identity and unsafe state changes',async t=>{
 for(const change of ['manual cancel','route','new prompt','identity','error','blocked','incompatible','reinjection','disable','navigation'])await t.test(change,async t=>{
  const f=await setup(t);await f.scan(writing(1)+stop+stale);
  f.transport();await flush();assert.equal(f.detector.transportCompleted,true);
  if(change==='manual cancel')f.document.querySelector('button').dispatchEvent(new f.window.Event('click',{bubbles:true}));
  await f.scan(writing(1)+stale);await f.advance(5999);
  if(change==='route')f.page.location.pathname='/c/other';
  if(change==='new prompt')await f.scan(writing(2)+stale);
  if(change==='identity')f.document.querySelector('[data-testid="conversation-turn-answer-1"]').setAttribute('data-testid','conversation-turn-answer-replaced');
  if(change==='error')await f.scan(writing(1)+stale+'<div role="alert">Network error</div>');
  if(change==='blocked')await f.scan(writing(1)+stale+'<div role="dialog"></div>');
  if(change==='incompatible')await f.scan(stale);
  if(change==='reinjection')await f.inject();
  if(change==='disable')await f.deliverHint({type:'SET_ENABLED',enabled:false});
  if(change==='navigation')f.window.dispatchEvent(new f.window.Event('popstate'));
  await f.scan();await f.advance(1);
  assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,0);
  assert.equal(f.detector.transportCompleted,change==='identity');
  if(change==='identity') {
   await f.advance(5998);assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,0);
   await f.advance(1);assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,1);
  }
  if(!['identity','new prompt'].includes(change)) {
   await f.advance(10000);assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,0);
  }
 });
});
test('content/background lifecycle invalidation erases recorded busy transport evidence',async t=>{
 for(const invalidation of ['manual stop','route','error','blocked','incompatible','reinjection','disable'])await t.test(invalidation,async t=>{
  const f=await setup(t);
  const writing='<section data-testid="conversation-turn-10"><div data-message-author-role="user" data-message-id="fixture-user">Fixture</div></section><section data-testid="conversation-turn-11"><div data-message-author-role="assistant" data-message-id="fixture-answer">Fixture writing block</div></section>';
  await f.scan(writing+stop);const g1=f.session['watch-1'].watchGeneration;
  f.transport();await flush();assert.equal(f.detector.transportCompleted,true);
  const hint=f.hints.find(m=>m.transportCompleted);
  if(invalidation==='manual stop')f.document.querySelector('[data-testid="stop-button"]').dispatchEvent(new f.window.Event('click',{bubbles:true}));
  if(invalidation==='route'){f.page.location.pathname='/c/other';await f.scan();}
  if(invalidation==='error')await f.scan(writing+stop+'<div role="alert">Network error</div>');
  if(invalidation==='blocked')await f.scan(writing+stop+'<div role="dialog"></div>');
  if(invalidation==='incompatible')await f.scan(stop);
  if(invalidation==='reinjection')await f.inject();
  if(invalidation==='disable'){await f.deliverHint({type:'SET_ENABLED',enabled:false});await f.scan();await f.deliverHint({type:'SET_ENABLED',enabled:true});}
  await f.scan(writing);assert.equal(f.detector.transportCompleted,false,invalidation);
  await f.deliverHint(hint);await f.advance(10000);
  assert.equal(f.sent.filter(m=>m.type==='COMPLETE').length,0,invalidation);assert.equal(f.plays.length,0);
  assert.notEqual(f.session['tab-1'].state,'complete');
  const exported=await f.deliverHint({type:'GET_DIAGNOSTICS'});assert.equal(JSON.stringify(exported).includes(g1),false);
 });
});
