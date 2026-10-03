const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const {webcrypto}=require('node:crypto');
function harness(fail=false,{hydrate=false,hydrateLegacy=false,contentReply=async()=>undefined}={}){
 const f=require('./chrome-fixture.cjs')({colorTabs:hydrateLegacy,soundData:'data:audio/wav;base64,TEST',volume:.8,playedCount:0});
 if(hydrateLegacy){f.tabs.get(1).groupId=77;f.groups.set(77,{id:77,title:'チャッピー · 完了',color:'blue',shared:false});}
 const {local,session}=f, listeners=[],plays=[];let contexts=[],creates=0;
 const chrome=f.api;const injections=[],tabQueries=[],webCompleted=[];
 const timers=new Map(),versionRequests=[];let nextTimer=0;
 const sendMessage=chrome.tabs.sendMessage;
 chrome.tabs.sendMessage=async(id,message,options)=>{
  if(message.type!=='GET_CONTENT_VERSION')return sendMessage(id,message,options);
  versionRequests.push({id,message,options});return contentReply(id);
 };
 chrome.webRequest={onCompleted:{addListener:fn=>webCompleted.push(fn)}};
 if(hydrate){const query=chrome.tabs.query;chrome.tabs.query=async q=>{tabQueries.push(q);return Object.keys(q).length===0?[{id:1},{id:2}]:query(q);};chrome.scripting={executeScript:async spec=>{injections.push(spec);if(hydrateLegacy&&spec.target.tabId===1)f.session['tab-1']={state:'generating',version:'0.2.7',visibility:'hidden',colorSkipped:'grouped'};return [];}};}
 chrome.runtime={id:'fixture',getManifest:()=>({version:'0.3.0'}),getURL:p=>'chrome-extension://fixture/'+p,getContexts:async()=>contexts,onMessage:{addListener:f=>listeners.push(f)},onInstalled:{addListener:()=>{}},sendMessage:async m=>{plays.push(m);if(fail)return {ok:false,error:'fixture playback failure'};return {ok:true};}};
 chrome.offscreen={createDocument:async()=>{creates++;contexts=[{}];}};
 // Inject the real module dependency in this VM, alongside mocked Chrome APIs.
 const runWorker=()=>vm.runInNewContext(fs.readFileSync(require.resolve('../extension/background.js'),'utf8').replace(/^import '\.\/[^']+';\s*/gm,''),{chrome,ChappyCompatibility:require('../extension/compatibility.js'),ChappyTabColors:require('../extension/tab-colors.js'),ChappyBackgroundWatch:require('../extension/background-watch.js'),setTimeout:(fn,delay)=>{timers.set(++nextTimer,{fn,delay});return nextTimer;},clearTimeout:id=>timers.delete(id),crypto:webcrypto,TextEncoder,URL,console});
 runWorker();
 const chat={id:'fixture',tab:{id:1},frameId:0,url:'https://chatgpt.com/c/fixture'};const own={id:'fixture',url:'chrome-extension://fixture/options.html'};
 function send(m,s=chat){return new Promise(resolve=>{for(const f of listeners){const result=f(m,s,resolve);if(result===true)return;} });}
 return {...f,chrome,local,session,plays,injections,tabQueries,webCompleted,versionRequests,timers,send,chat,own,creates:()=>creates,
  restart(){listeners.length=0;timers.clear();for(const handlers of Object.values(f.events))handlers.length=0;runWorker();}};
}
const key='a'.repeat(64);const msg={target:'background',type:'COMPLETE',key};
test('network hint requires a strict successful endpoint and active watch',async()=>{
 const h=harness(),messages=[];
 h.chrome.tabs.sendMessage=async(...args)=>{messages.push(args);return {ok:true};};
 const valid={tabId:1,frameId:0,method:'POST',statusCode:200,url:'https://chatgpt.com/backend-api/f/conversation'};
 const emit=async details=>{h.webCompleted[0](details);for(let i=0;i<8;i++)await new Promise(setImmediate);};
 await emit(valid);assert.equal(messages.length,0);
 await h.send({target:'background',type:'STATUS',state:'generating'},{...h.chat,documentId:'doc1'});
 for(const change of [{method:'GET'},{statusCode:500},{statusCode:302},{frameId:1},{tabId:-1},{url:'https://example.com/backend-api/f/conversation'},{url:'https://chatgpt.com/backend-api/f/conversation/extra'},{url:'https://chatgpt.com/backend-api/other'}])await emit({...valid,...change});
 assert.equal(messages.length,0);
 for(const path of ['f/conversation','conversation','codex/responses'])await emit({...valid,url:'https://chatgpt.com/backend-api/'+path});
 assert.equal(messages.length,3);
 for(const args of messages)assert.deepEqual(JSON.parse(JSON.stringify(args)),[1,{type:'SCAN_NOW',transportCompleted:true},{documentId:'doc1'}]);
 await h.send({target:'background',type:'CANCEL'},{...h.chat,documentId:'doc1'});await emit(valid);assert.equal(messages.length,3);
});
test('same response in simultaneous tabs plays once',async()=>{const h=harness();const r=await Promise.all([h.send(msg),h.send(msg,{...h.chat,tab:{id:2}})]);assert.equal(h.plays.length,1);assert.equal(r[1].ignored,'duplicate');});
test('different concurrent responses play twice and create one offscreen document',async()=>{const h=harness();await Promise.all([h.send(msg),h.send({...msg,key:'b'.repeat(64)})]);assert.equal(h.plays.length,2);assert.equal(h.creates(),1);assert.equal(h.local.playedCount,2);});
test('disabled setting blocks automatic playback but allows user test',async()=>{const h=harness();h.local.enabled=false;assert.equal((await h.send(msg)).ignored,'disabled');await h.send({target:'background',type:'TEST'},h.own);assert.equal(h.plays.length,1);});
test('page cannot request settings test or spoof foreign origin',async()=>{const h=harness();assert.equal((await h.send({target:'background',type:'TEST'})).ok,false);assert.equal((await h.send(msg,{...h.chat,url:'https://example.com'})).ok,false);assert.equal(h.plays.length,0);});
test('play failure is reported, not counted as success or replayed automatically',async()=>{const h=harness(true);const r=await h.send(msg);assert.equal(r.ok,false);assert.equal(h.local.playedCount,0);assert.match(h.local.lastError,/fixture/);assert.equal((await h.send(msg)).ignored,'duplicate');});
test('persisted reservation prevents replay after worker restart',async()=>{const h=harness();h.session.seen=[key];assert.equal((await h.send(msg)).ignored,'duplicate');assert.equal(h.plays.length,0);});
test('only the enabled flag is disclosed to content scripts',async()=>{const h=harness();assert.deepEqual(JSON.parse(JSON.stringify(await h.send({target:'settings',type:'GET_ENABLED'}))),{enabled:true});});

test('authenticated status switches colors independently of audio failures',async()=>{const h=harness(true);h.local.colorTabs=true;await h.send({target:'background',type:'STATUS',state:'generating'});assert.equal(h.groups.get(h.tabs.get(1).groupId).color,'yellow');await h.send({target:'background',type:'STATUS',state:'complete'});await h.send(msg);assert.equal(h.groups.get(h.tabs.get(1).groupId).color,'blue');});
test('a long audio playback does not delay tab color changes',async()=>{const h=harness();h.local.colorTabs=true;let finish;h.chrome.runtime.sendMessage=()=>new Promise(resolve=>{finish=resolve;});const sound=h.send(msg);await new Promise(setImmediate);await h.send({target:'background',type:'STATUS',state:'generating'});assert.equal(h.groups.get(h.tabs.get(1).groupId).color,'yellow');finish({ok:true});await sound;});
test('foreign page status cannot register or color a tab',async()=>{const h=harness();h.local.colorTabs=true;await h.send({target:'background',type:'STATUS',state:'complete'},{...h.chat,url:'https://example.com'});assert.equal(h.edits.length,0);assert.equal(h.session['tab-1'],undefined);});

test('existing ChatGPT tabs receive the current content scripts after extension load',async()=>{const h=harness(false,{hydrate:true});await new Promise(setImmediate);await new Promise(setImmediate);assert.deepEqual(JSON.parse(JSON.stringify(h.tabQueries)),[{}]);assert.equal(h.injections.length,2);for(const call of h.injections){assert.equal(JSON.stringify(call.files),JSON.stringify(['compatibility.js','detector.js','dom-reader.js','content.js']));assert.equal(JSON.stringify(call.target.frameIds),JSON.stringify([0]));}assert.equal(Object.keys(h.session).some(k=>k.startsWith('content-hydrated-')),false);});

test('worker hydration skips current content and probes only the top frame',async()=>{
 const h=harness(false,{hydrate:true,contentReply:async()=>({ok:true,version:'0.3.0',protocol:require('../extension/compatibility.js').CONTENT_PROTOCOL})});
 await new Promise(setImmediate);
 assert.equal(h.injections.length,0);assert.equal(h.versionRequests.length,2);assert.equal(h.timers.size,0);
 for(const request of h.versionRequests){
  assert.deepEqual(JSON.parse(JSON.stringify(request.message)),{type:'GET_CONTENT_VERSION'});
  assert.deepEqual(JSON.parse(JSON.stringify(request.options)),{frameId:0});
 }
});

test('missing, invalid, old and invalidated content replies still hydrate',async t=>{
 for(const [name,contentReply] of [
  ['no reply',async()=>undefined],
  ['same version without protocol',async()=>({ok:true,version:'0.3.0'})],
  ['same version wrong protocol',async()=>({ok:true,version:'0.3.0',protocol:'obsolete'})],
  ['invalid reply',async()=>({ok:false,version:'0.3.0'})],
  ['missing version',async()=>({ok:true})],
  ['old version',async()=>({ok:true,version:'0.2.11'})],
  ['missing listener',async()=>{throw Error('Receiving end does not exist');}],
  ['invalidated context',async()=>{throw Error('Extension context invalidated');}]
 ])await t.test(name,async()=>{
  const h=harness(false,{hydrate:true,contentReply});await new Promise(setImmediate);
  assert.deepEqual(h.injections.map(spec=>spec.target.tabId),[1,2]);assert.equal(h.timers.size,0);
 });
});

test('a hung version handshake times out and hydrates without waiting indefinitely',async()=>{
 const h=harness(false,{hydrate:true,contentReply:()=>new Promise(()=>{})});
 await new Promise(setImmediate);assert.equal(h.injections.length,0);assert.equal(h.timers.size,2);
 for(const timer of h.timers.values()){assert.equal(timer.delay,5000);timer.fn();}
 await new Promise(setImmediate);
 assert.equal(h.injections.length,2);assert.equal(h.timers.size,0);
});

test('completed session and owned blue group survive a fresh worker hydration',async()=>{
 const h=harness(false,{hydrate:true,contentReply:async()=>({ok:true,version:'0.3.0',protocol:require('../extension/compatibility.js').CONTENT_PROTOCOL})});
 await new Promise(setImmediate);h.local.colorTabs=true;
 await h.send({target:'background',type:'STATUS',state:'generating',version:'0.3.0',visibility:'hidden'});
 await h.send({target:'background',type:'STATUS',state:'complete',version:'0.3.0',visibility:'hidden'});
 await h.send(msg);
 const record=structuredClone(h.session['tab-1']),owner=structuredClone(h.local['_chappy-owner-1']);
 const group=structuredClone(h.groups.get(h.tabs.get(1).groupId)),edits=h.edits.length;
 assert.equal(record.state,'complete');assert.equal(group.color,'blue');assert.equal(h.local.playedCount,1);
 h.restart();await new Promise(setImmediate);
 assert.equal(h.versionRequests.length,4);assert.equal(h.injections.length,0);
 assert.deepEqual(h.session['tab-1'],record);assert.deepEqual(h.local['_chappy-owner-1'],owner);
 assert.deepEqual(h.groups.get(h.tabs.get(1).groupId),group);assert.equal(h.edits.length,edits);
 assert.equal(h.local.playedCount,1);assert.equal((await h.send(msg)).ignored,'duplicate');
});

test('reload hydration creates session evidence before legacy group migration',async()=>{const h=harness(false,{hydrate:true,hydrateLegacy:true});await new Promise(setImmediate);await new Promise(setImmediate);await new Promise(setImmediate);assert.equal(h.groups.get(77).color,'yellow');assert.equal(h.local['_chappy-owner-1'].groupId,77);assert.equal(h.session['tab-1'].colorSkipped,'');});

test('network transport completion alone never emits sound or blue',async()=>{
 const h=harness();h.local.colorTabs=true;
 await h.send({target:'background',type:'STATUS',state:'generating',version:'0.3.0',visibility:'hidden'});
 h.webCompleted[0]({tabId:1,frameId:0,method:'POST',statusCode:200,requestId:'x',url:'https://chatgpt.com/backend-api/f/conversation'});
 for(let i=0;i<8;i++)await new Promise(setImmediate);
 assert.equal(h.plays.length,0);assert.equal(h.groups.get(h.tabs.get(1).groupId).color,'yellow');
});
test('DOM completion after a network probe can still notify exactly once',async()=>{
 const h=harness();h.local.colorTabs=true;
 await h.send({target:'background',type:'STATUS',state:'generating',version:'0.3.0',visibility:'hidden'});
 h.webCompleted[0]({tabId:1,frameId:0,method:'POST',statusCode:200,requestId:'x',url:'https://chatgpt.com/backend-api/f/conversation'});
 for(let i=0;i<8;i++)await new Promise(setImmediate);
 await h.send({target:'background',type:'STATUS',state:'complete',version:'0.3.0',visibility:'hidden'});
 await h.send(msg);await h.send(msg);
 assert.equal(h.plays.length,1);assert.equal(h.groups.get(h.tabs.get(1).groupId).color,'blue');
});

test('dots completion delivery colors blue and plays once per spinner lifecycle across worker restart',async()=>{
 const h=harness();h.local.colorTabs=true;
 const sender={...h.chat,url:'https://chatgpt.com/dots/fixture',documentId:'fixture-document'};
 const status=state=>h.send({target:'background',type:'STATUS',state},sender);
 for(const completionKey of ['c'.repeat(64),'d'.repeat(64)]){
  await status('generating');
  assert.equal(h.groups.get(h.tabs.get(1).groupId).color,'yellow');
  const before=h.plays.length;
  await status('complete');
  const completion={target:'background',type:'COMPLETE',key:completionKey};
  await h.send(completion,sender);
  assert.equal(h.groups.get(h.tabs.get(1).groupId).color,'blue');
  assert.equal(h.plays.length,before+1);
  assert.equal((await h.send(completion,sender)).ignored,'duplicate');
  h.restart();
  assert.equal((await h.send(completion,sender)).ignored,'duplicate');
  assert.equal(h.plays.length,before+1);
 }
 assert.equal(h.local.playedCount,2);
});
