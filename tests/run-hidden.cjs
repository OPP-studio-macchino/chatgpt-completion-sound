// Regression integration model. Chrome APIs/layout are mocked. In particular,
// this is NOT proof that a live ChatGPT hidden page renders its final controls.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const {parseHTML}=require(require.resolve('linkedom',{paths:[process.env.CHAPPY_DOM_DEPENDENCIES||__dirname]}));
const {fakeClock,flush}=require('./fake-clock.cjs');
const fixture=require('./chrome-fixture.cjs');
const ROOT=path.join(__dirname,'../extension');
const busy='<section data-turn="user"><div data-message-author-role="user" data-message-id="user1">private prompt</div></section><button data-testid="stop-button">Stop</button>';
const final=busy.replace('<button data-testid="stop-button">Stop</button>','<section data-turn="assistant"><div data-message-author-role="assistant" data-message-id="message1">private answer</div><button data-testid="copy-turn-action-button">Copy</button></section>');
async function setup() {
  const f=fixture({soundName:'example.wav',soundData:'data:audio/wav;base64,TEST',volume:.8,playedCount:0});
  const clock=fakeClock(),backgroundListeners=[],contentListeners=[],plays=[],messages=[];
  const pageTimers=[];let contexts=[];
  const sender={id:'fixture',tab:{id:1},frameId:0,documentId:'document1',url:'https://chatgpt.com/c/fixture'};
  const deliver=(listeners,msg,from)=>new Promise(resolve=>{
    for(const listener of listeners) {if(listener(msg,from,resolve)===true)return;}
    resolve(undefined);
  });
  const chrome=f.api;
  chrome.runtime={id:'fixture',getURL:p=>'chrome-extension://fixture/'+p,getContexts:async()=>contexts,
    onMessage:{addListener:fn=>backgroundListeners.push(fn)},onInstalled:{addListener:()=>{}},
    sendMessage:async msg=>{plays.push(msg);return {ok:true};}};
  chrome.offscreen={createDocument:async()=>{contexts=[{}];}};
  chrome.tabs.sendMessage=async(id,msg,options)=>{
    assert.equal(id,1);assert.equal(options.documentId,'document1');messages.push(msg);
    return deliver(contentListeners,msg,{id:'fixture'});
  };
  const background=vm.createContext({chrome,ChappyTabColors:require('../extension/tab-colors.js'),ChappyBackgroundWatch:require('../extension/background-watch.js'),setTimeout:clock.setTimeout,clearTimeout:clock.clearTimeout,crypto:webcrypto,URL,console});
  vm.runInContext(fs.readFileSync(path.join(ROOT,'background.js'),'utf8').replace(/^import '\.\/[^']+';\s*/gm,''),background);
  const {document,window}=parseHTML('<!doctype html><html><body><main></main></body></html>');
  Object.defineProperty(document,'visibilityState',{value:'hidden'});
  window.HTMLElement.prototype.getClientRects=function(){return [{}];};
  window.getComputedStyle=e=>({display:e.style.display||'block',visibility:e.style.visibility||'visible',opacity:e.style.opacity||'1'});
  const contentChrome={runtime:{id:'fixture',sendMessage:msg=>deliver(backgroundListeners,msg,sender),onMessage:{addListener:fn=>contentListeners.push(fn)}}};
  const content=vm.createContext({document,window,location:{pathname:'/c/fixture'},Element:window.Element,MutationObserver:window.MutationObserver,chrome:contentChrome,crypto:webcrypto,TextEncoder,Date:{now:clock.now},queueMicrotask,
    setTimeout:fn=>{pageTimers.push(fn);return pageTimers.length;},setInterval:fn=>{pageTimers.push(fn);return pageTimers.length;},clearTimeout:()=>{},clearInterval:()=>{},console});
  for(const name of ['compatibility.js','detector.js','dom-reader.js','content.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,name),'utf8'),content);
  await flush();
  const main=document.querySelector('main');main.innerHTML=busy;await flush();
  assert.equal(f.groups.get(f.tabs.get(1).groupId).color,'yellow');
  return {...f,clock,plays,messages,main,window,pageTimers};
}
async function settle(predicate) {for(let i=0;i<100;i++){if(predicate())return;await flush();}assert.ok(predicate());}
(async()=>{
  {
    const f=await setup();await f.clock.advance(1000);f.main.innerHTML=final;await flush();
    await f.clock.advance(5000);await settle(()=>f.plays.length===1);
    assert.equal(f.groups.get(f.tabs.get(1).groupId).color,'blue');assert.equal(f.local.playedCount,1);
    assert.equal(f.session['watch-1'],undefined);assert.equal(f.alarms.size,0);
    assert.equal(f.messages.every(m=>m.type==='SCAN_NOW'),true);assert.match(f.plays[0].key,/^[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(f.session).includes('private'),false);
    await f.clock.advance(30000);assert.equal(f.plays.length,1);
    console.log('PASS 非表示・ページ内タイマー未実行でも、DOMの完了表示後に音声要求1回と青色へ進む');
  }
  {
    const f=await setup();await f.clock.advance(60000);
    assert.equal(f.plays.length,0);assert.equal(f.groups.get(f.tabs.get(1).groupId).color,'yellow');
    assert.equal(f.session['probe-1'].visibility,'hidden');assert.equal(f.session['probe-1'].busy,true);
    console.log('PASS 非表示ページが作業中表示のままなら、経過時間だけでは完了にしない');
  }
  {
    const f=await setup();f.tabs.get(1).frozen=true;await f.clock.advance(10000);
    assert.equal(f.plays.length,0);assert.equal(f.session['probe-1'].issue,'frozen');assert.equal(f.messages.length,0);
    console.log('PASS Chromeが休止したタブは通知せず、監視できない状態として記録');
  }
  {
    const f=await setup();f.main.querySelector('button').dispatchEvent(new f.window.Event('click',{bubbles:true}));
    f.main.innerHTML=final;await flush();await f.clock.advance(10000);
    assert.equal(f.plays.length,0);assert.equal(f.tabs.get(1).groupId,-1);assert.equal(f.session['watch-1'],undefined);
    console.log('PASS 非表示タブでも手動停止後は音声・完了色・監視を停止');
  }
  console.log('TOTAL 4 / FAIL 0');
})().catch(e=>{console.error(e);process.exitCode=1;});
