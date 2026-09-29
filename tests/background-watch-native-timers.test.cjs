const {test}=require('node:test');
const assert=require('node:assert/strict');
const Watch=require('../extension/background-watch.js');
const {fakeClock}=require('./fake-clock.cjs');
const fixture=require('./chrome-fixture.cjs');
test('browser timer receiver is preserved through schedule, probe and cancellation',async()=>{
  const f=fixture(), clock=fakeClock(), calls=[];
  function nativeSetTimeout(fn,delay){
    if(this!==globalThis)throw new TypeError('Illegal invocation');
    calls.push('set');return clock.setTimeout(fn,delay);
  }
  function nativeClearTimeout(id){
    if(this!==globalThis)throw new TypeError('Illegal invocation');
    calls.push('clear');return clock.clearTimeout(id);
  }
  const messages=[];
  f.api.tabs.sendMessage=async(...args)=>{messages.push(args);return {ok:true,busy:true,ready:false,visibility:'hidden'};};
  const watch=new Watch(f.api,{setTimeout:nativeSetTimeout,clearTimeout:nativeClearTimeout,now:clock.now});
  await watch.track(1,'generating','doc1');
  await clock.advance(2000);
  assert.equal(messages.length,1);
  assert.equal(f.session['probe-1'].visibility,'hidden');
  await watch.track(1,'watching','doc1');
  await clock.advance(10000);
  assert.equal(messages.length,1);assert.equal(clock.pending(),0);
  assert.ok(calls.includes('set'));assert.ok(calls.includes('clear'));
});
