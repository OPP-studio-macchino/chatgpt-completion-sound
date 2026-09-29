const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const {webcrypto}=require('node:crypto');
function harness(fail=false,{hydrate=false,hydrateLegacy=false}={}){
 const f=require('./chrome-fixture.cjs')({colorTabs:hydrateLegacy,soundData:'data:audio/wav;base64,TEST',volume:.8,playedCount:0});
 if(hydrateLegacy){f.tabs.get(1).groupId=77;f.groups.set(77,{id:77,title:'チャッピー · 完了',color:'blue',shared:false});}
 const {local,session}=f, listeners=[],plays=[];let contexts=[],creates=0;
 const chrome=f.api;const injections=[],tabQueries=[],webCompleted=[];
 chrome.webRequest={onCompleted:{addListener:fn=>webCompleted.push(fn)}};
 if(hydrate){const query=chrome.tabs.query;chrome.tabs.query=async q=>{tabQueries.push(q);return Object.keys(q).length===0?[{id:1},{id:2}]:query(q);};chrome.scripting={executeScript:async spec=>{injections.push(spec);if(hydrateLegacy&&spec.target.tabId===1)f.session['tab-1']={state:'generating',version:'0.2.7',visibility:'hidden',colorSkipped:'grouped'};return [];}};}
 chrome.runtime={id:'fixture',getURL:p=>'chrome-extension://fixture/'+p,getContexts:async()=>contexts,onMessage:{addListener:f=>listeners.push(f)},onInstalled:{addListener:()=>{}},sendMessage:async m=>{plays.push(m);if(fail)return {ok:false,error:'fixture playback failure'};return {ok:true};}};
 chrome.offscreen={createDocument:async()=>{creates++;contexts=[{}];}};
 // Inject the real module dependency in this VM, alongside mocked Chrome APIs.
 vm.runInNewContext(fs.readFileSync(require.resolve('../extension/background.js'),'utf8').replace(/^import '\.\/[^']+';\s*/gm,''),{chrome,ChappyTabColors:require('../extension/tab-colors.js'),ChappyBackgroundWatch:require('../extension/background-watch.js'),setTimeout:()=>1,clearTimeout:()=>{},crypto:webcrypto,TextEncoder,URL,console});
 const chat={id:'fixture',tab:{id:1},frameId:0,url:'https://chatgpt.com/c/fixture'};const own={id:'fixture',url:'chrome-extension://fixture/options.html'};
 function send(m,s=chat){return new Promise(resolve=>{for(const f of listeners){const result=f(m,s,resolve);if(result===true)return;} });}
 return {...f,chrome,local,session,plays,injections,tabQueries,webCompleted,send,chat,own,creates:()=>creates};
}
const key='a'.repeat(64);const msg={target:'background',type:'COMPLETE',key};
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

test('existing ChatGPT tabs receive the current content scripts after extension load',async()=>{const h=harness(false,{hydrate:true});await new Promise(setImmediate);await new Promise(setImmediate);assert.deepEqual(JSON.parse(JSON.stringify(h.tabQueries)),[{}]);assert.equal(h.injections.length,2);for(const call of h.injections){assert.equal(JSON.stringify(call.files),JSON.stringify(['detector.js','dom-reader.js','content.js']));assert.equal(JSON.stringify(call.target.frameIds),JSON.stringify([0]));}assert.equal(Object.keys(h.session).some(k=>k.startsWith('content-hydrated-')),false);});

test('reload hydration creates session evidence before legacy group migration',async()=>{const h=harness(false,{hydrate:true,hydrateLegacy:true});await new Promise(setImmediate);await new Promise(setImmediate);await new Promise(setImmediate);assert.equal(h.groups.get(77).color,'yellow');assert.equal(h.local['_chappy-owner-1'].groupId,77);assert.equal(h.session['tab-1'].colorSkipped,'');});

test('network transport completion alone never emits sound or blue',async()=>{
 const h=harness();h.local.colorTabs=true;
 await h.send({target:'background',type:'STATUS',state:'generating',version:'0.2.12',visibility:'hidden'});
 h.webCompleted[0]({tabId:1,frameId:0,method:'POST',statusCode:200,requestId:'x',url:'https://chatgpt.com/backend-api/f/conversation'});
 for(let i=0;i<8;i++)await new Promise(setImmediate);
 assert.equal(h.plays.length,0);assert.equal(h.groups.get(h.tabs.get(1).groupId).color,'yellow');
});
test('DOM completion after a network probe can still notify exactly once',async()=>{
 const h=harness();h.local.colorTabs=true;
 await h.send({target:'background',type:'STATUS',state:'generating',version:'0.2.12',visibility:'hidden'});
 h.webCompleted[0]({tabId:1,frameId:0,method:'POST',statusCode:200,requestId:'x',url:'https://chatgpt.com/backend-api/f/conversation'});
 for(let i=0;i<8;i++)await new Promise(setImmediate);
 await h.send({target:'background',type:'STATUS',state:'complete',version:'0.2.12',visibility:'hidden'});
 await h.send(msg);await h.send(msg);
 assert.equal(h.plays.length,1);assert.equal(h.groups.get(h.tabs.get(1).groupId).color,'blue');
});
