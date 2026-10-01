const {test}=require('node:test');
const assert=require('node:assert/strict');
const Watch=require('../extension/background-watch.js');
const {fakeClock,flush}=require('./fake-clock.cjs');
function setup() {
  const f=require('./chrome-fixture.cjs')();const clock=fakeClock();const messages=[];
  f.api.tabs.sendMessage=async(...args)=>{messages.push(args);return {ok:true,busy:true,ready:false,visibility:'hidden'};};
  return {...f,clock,messages,watch:new Watch(f.api,clock)};
}
test('transport hint is one-shot and only targets a generating document',async()=>{
 const f=setup();await f.watch.probe(1,{transportCompleted:true});assert.equal(f.messages.length,0);
 await f.watch.track(1,'generating','doc1');await f.watch.probe(1,{transportCompleted:true});
 assert.deepEqual(f.messages[0],[1,{type:'SCAN_NOW',transportCompleted:true},{documentId:'doc1'}]);
 await f.watch.probe(1);assert.deepEqual(f.messages[1][1],{type:'SCAN_NOW'});
 await f.watch.track(1,'watching','doc1');await f.watch.probe(1,{transportCompleted:true});assert.equal(f.messages.length,2);
});
test('transport hints arriving during a periodic probe are coalesced and dispatched immediately afterward',async()=>{
 const f=setup();let reply;
 f.api.tabs.sendMessage=async(...args)=>{
  f.messages.push(args);
  if(f.messages.length===1)return new Promise(resolve=>{reply=resolve;});
  return {ok:true};
 };
 await f.watch.track(1,'generating','doc1');
 const periodic=f.watch.probe(1);await flush();assert.equal(f.messages.length,1);
 await Promise.all([f.watch.probe(1,{transportCompleted:true}),f.watch.probe(1,{transportCompleted:true})]);
 assert.equal(f.messages.length,1);reply({ok:true});await periodic;await flush();
 assert.deepEqual(f.messages.map(args=>args[1]),[{type:'SCAN_NOW'},{type:'SCAN_NOW',transportCompleted:true}]);
 await f.clock.advance(2000);assert.deepEqual(f.messages[2][1],{type:'SCAN_NOW'});
});
test('queued transport hints do not survive cancellation, removal, document replacement or restore',async()=>{
 for(const lifecycle of ['cancel','remove','document','restore','new-job','generation','disabled']) {
  const f=setup();let reply;
  f.api.tabs.sendMessage=async(...args)=>{f.messages.push(args);if(f.messages.length===1)return new Promise(resolve=>{reply=resolve;});return {ok:true};};
  await f.watch.track(1,'generating','doc1');const periodic=f.watch.probe(1);await flush();
  await f.watch.probe(1,{transportCompleted:true});
  if(lifecycle==='cancel'||lifecycle==='new-job')await f.watch.track(1,'watching','doc1');
  if(lifecycle==='new-job')await f.watch.track(1,'generating','doc1');
  if(lifecycle==='remove')await f.watch.remove(1);
  if(lifecycle==='document')await f.watch.track(1,'generating','doc2');
  if(lifecycle==='generation')await f.watch.track(1,'generating','doc1','new-generation');
  if(lifecycle==='restore')await f.watch.restore();
  if(lifecycle==='disabled')f.local.enabled=false;
  reply({ok:true});await periodic;await flush();await f.clock.advance(2000);
  assert.equal(f.messages.some(args=>args[1].transportCompleted===true),false,lifecycle);
 }
});
test('hint dispatch carries only the current opaque lifecycle token',async()=>{
 const f=setup();await f.watch.track(1,'generating','doc1','generation-one');
 await f.watch.probe(1,{transportCompleted:true});
 assert.deepEqual(f.messages[0][1],{type:'SCAN_NOW',transportCompleted:true,watchGeneration:'generation-one'});
 assert.equal('watchGeneration' in f.session['probe-1'],false);
});
test('frozen tabs consume pending hints without an immediate retry loop',async()=>{
 const f=setup();f.tabs.get(1).frozen=true;await f.watch.track(1,'generating','doc1');
 await f.watch.probe(1,{transportCompleted:true});await flush();assert.equal(f.watch.pendingTransport.size,0);
 assert.equal(f.messages.length,0);f.tabs.get(1).frozen=false;await f.clock.advance(30000);
 assert.equal(f.messages.some(args=>args[1].transportCompleted),false);
});
test('only active jobs are polled, in the worker and in the correct document',async()=>{
  const f=setup();await f.watch.track(2,'watching','doc2');assert.equal(f.clock.pending(),0);
  await f.watch.track(1,'generating','doc1');await f.clock.advance(2000);
  assert.deepEqual(f.messages,[[1,{type:'SCAN_NOW'},{documentId:'doc1'}]]);
  assert.equal(f.session['probe-1'].visibility,'hidden');assert.equal(f.alarms.get(Watch.ALARM).periodInMinutes,.5);
  await f.clock.advance(2000);assert.equal(f.messages.length,2);
});
test('completion and manual stop cancel polling and the recovery alarm',async()=>{
  for(const state of ['complete','watching']) {
    const f=setup();await f.watch.track(1,'generating','doc1');await f.clock.advance(2000);
    await f.watch.track(1,state,'doc1');await f.clock.advance(10000);
    assert.equal(f.messages.length,1);assert.equal(f.session['watch-1'],undefined);assert.equal(f.alarms.size,0);
  }
});
test('pending active jobs resume after worker restart without a page timer',async()=>{
  const f=setup();f.session['watch-1']={documentId:'doc1',startedAt:1};
  await f.watch.restore();await f.clock.advance(0);
  assert.equal(f.messages.length,1);assert.equal(f.alarms.size,1);
});
test('turning notifications off removes restored jobs and alarms',async()=>{
  const f=setup();await f.watch.track(1,'generating','doc1');f.local.enabled=false;
  await f.watch.restore();await f.clock.advance(60000);
  assert.equal(f.messages.length,0);assert.equal(f.session['watch-1'],undefined);assert.equal(f.alarms.size,0);
});
test('frozen and discarded tabs are diagnosed without pretending to complete',async()=>{
  for(const issue of ['frozen','discarded']) {
    const f=setup();f.tabs.get(1)[issue]=true;await f.watch.track(1,'generating','doc1');
    await f.clock.advance(2000);assert.equal(f.session['probe-1'].issue,issue);assert.equal(f.messages.length,0);
    f.tabs.get(1)[issue]=false;await f.clock.advance(30000);assert.equal(f.messages.length,1);assert.equal(f.session['probe-1'].issue,'');
  }
});
test('an unresponsive document times out and recovers without parallel requests',async()=>{
  const f=setup();let requests=0;
  f.api.tabs.sendMessage=()=>{requests++;return new Promise(()=>{});};
  await f.watch.track(1,'generating','doc1');await f.clock.advance(2000);assert.equal(requests,1);
  await f.watch.restore();await f.clock.advance(5000);
  assert.equal(f.session['probe-1'].issue,'no-reply');assert.equal(requests,1);
  f.api.tabs.sendMessage=async()=>{requests++;return {ok:true,busy:true};};
  await f.clock.advance(30000);assert.equal(requests,2);assert.equal(f.session['probe-1'].issue,'');
});
test('an old document shutdown cannot cancel a newer active document',async()=>{
  const f=setup();await f.watch.track(1,'generating','doc-new');await f.watch.track(1,'watching','doc-old');
  assert.equal(f.session['watch-1'].documentId,'doc-new');await f.clock.advance(2000);
  assert.equal(f.messages[0][2].documentId,'doc-new');
});
test('tab closure removes active jobs, diagnostics, and recovery alarm',async()=>{
  const f=setup();await f.watch.track(1,'generating','doc1');await f.clock.advance(2000);
  await f.watch.remove(1);await f.clock.advance(10000);
  assert.equal(f.session['watch-1'],undefined);assert.equal(f.session['probe-1'],undefined);assert.equal(f.messages.length,1);assert.equal(f.alarms.size,0);
});
test('a tab that disappears during a poll does not leave a recovery alarm',async()=>{
  const f=setup();await f.watch.track(1,'generating','doc1');f.tabs.delete(1);
  await f.clock.advance(2000);await flush();
  assert.equal(f.session['watch-1'],undefined);assert.equal(f.alarms.size,0);
});

test('restore removes watches and probes for tabs that no longer exist',async()=>{
  const f=setup();f.session['watch-99']={documentId:'gone',startedAt:1};f.session['probe-99']={issue:'no-reply',at:1};
  await f.watch.restore();await f.clock.advance(60000);
  assert.equal(f.session['watch-99'],undefined);assert.equal(f.session['probe-99'],undefined);assert.equal(f.alarms.size,0);assert.equal(f.messages.length,0);
});
