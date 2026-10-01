const {test}=require('node:test');
const assert=require('node:assert/strict');
const Detector=require('../extension/detector.js');
const base={route:'/c/test',user:'u1',enabled:true,busy:false,ready:true,message:'old',blocked:false,error:false};
function snap(change={}){return {...base,...change};}
function finish(d,id='new',t=100){assert.equal(d.step(snap({message:id}),t),null);return d.step(snap({message:id}),t+2000);}
test('opening old chat does not notify',()=>{const d=new Detector();assert.equal(d.step(base,0),null);assert.equal(d.step(base,5000),null);});
test('normal completion waits for final controls and settles, exactly once',()=>{const d=new Detector();d.step(snap({busy:true}),0);assert.equal(d.step(snap({message:'new',ready:false}),20),null);assert.equal(finish(d),'new');assert.equal(d.step(snap({message:'new'}),9999),null);});
test('attaching during active answer can notify',()=>{const d=new Detector();d.step(snap({busy:true,ready:false,message:'new'}),0);assert.equal(finish(d),'new');});
test('old copy controls while starting a new response do not notify',()=>{const d=new Detector();d.step(snap({busy:true}),0);d.step(base,100);assert.equal(d.step(base,6000),null);});
test('temporary stop-button disappearance cannot finish without a new final answer',()=>{const d=new Detector();d.step(snap({busy:true,ready:false,message:''}),0);d.step(snap({ready:false,message:''}),100);assert.equal(d.step(snap({ready:false,message:''}),4000),null);d.step(snap({busy:true,ready:false,message:'new'}),4100);assert.equal(finish(d,'new',5000),'new');});
test('generation restarts during settle period',()=>{const d=new Detector();d.step(snap({busy:true}),0);d.step(snap({message:'new'}),100);d.step(snap({busy:true,message:'new'}),1000);assert.equal(d.step(snap({message:'new'}),2500),null);assert.equal(d.step(snap({message:'new'}),4500),'new');});
test('a route-scoped assistant turn does not re-complete when Work changes user and message ids',()=>{const d=new Detector();const first='/c/test\u001fconversation-turn-1',second='/c/test\u001fconversation-turn-2';d.step(snap({busy:true,ready:false,message:'',turn:''}),0);assert.equal(d.step(snap({message:'m1',turn:first}),100),null);assert.equal(d.step(snap({message:'m1',turn:first}),2100),first);assert.equal(d.step(snap({busy:true,ready:false,message:'m2',turn:first}),3000),null);assert.equal(d.step(snap({user:'u2',message:'m2',turn:first}),5000),null);d.step(snap({user:'u3',busy:true,ready:false,message:'',turn:''}),6000);assert.equal(d.step(snap({user:'u3',message:'m3',turn:second}),6100),null);assert.equal(d.step(snap({user:'u3',message:'m3',turn:second}),8100),second);});
test('manual stop suppresses partial reply but subsequent turn works',()=>{const d=new Detector();d.step(snap({busy:true}),0);d.cancel();assert.equal(d.step(snap({message:'partial'}),100),null);assert.equal(d.step(snap({message:'partial'}),5000),null);d.step(snap({busy:true,user:'u2'}),6000);d.step(snap({user:'u2',message:'second'}),6100);assert.equal(d.step(snap({user:'u2',message:'second'}),8200),'second');});
test('navigation to another chat does not notify',()=>{const d=new Detector();d.step(snap({busy:true}),0);const other=snap({route:'/c/other',message:'other'});d.step(other,100);assert.equal(d.step(other,4000),null);});
test('new chat URL promotion retains active generation',()=>{const d=new Detector();d.step(snap({route:'/',busy:true,ready:false,message:''}),0);assert.equal(finish(d),'new');});
test('disable then enable does not notify a historical answer',()=>{const d=new Detector();d.step(snap({busy:true}),0);d.step(snap({enabled:false}),100);assert.equal(finish(d),null);});
test('approval dialog and error suppress completion',()=>{for(const flag of ['blocked','error']){const d=new Detector();d.step(snap({busy:true}),0);d.step(snap({[flag]:true,message:'new'}),100);assert.equal(finish(d),null);}});
test('different tabs each notify independently',()=>{const a=new Detector(),b=new Detector();a.step(snap({busy:true}),0);b.step(snap({busy:true}),0);assert.equal(finish(a,'a'),'a');assert.equal(finish(b,'b'),'b');});

test('hidden-toolbar fallback requires four seconds of stable final metadata',()=>{const d=new Detector();d.step(snap({busy:true,ready:false,message:''}),0);assert.equal(d.step(snap({ready:true,provisional:true,message:'new'}),100),null);assert.equal(d.step(snap({ready:true,provisional:true,message:'new'}),2200),null);assert.equal(d.step(snap({ready:true,provisional:true,message:'new'}),4100),'new');});
test('busy resuming cancels a provisional hidden completion',()=>{const d=new Detector();d.step(snap({busy:true,ready:false,message:''}),0);d.step(snap({ready:true,provisional:true,message:'new'}),100);d.step(snap({busy:true,ready:false,message:'new'}),3000);assert.equal(d.step(snap({ready:true,provisional:true,message:'new'}),3100),null);assert.equal(d.step(snap({ready:true,provisional:true,message:'new'}),6000),null);assert.equal(d.step(snap({ready:true,provisional:true,message:'new'}),7100),'new');});

test('second user turn starts generating before stop control appears',()=>{const d=new Detector();d.step(snap({busy:true}),0);d.step(snap({message:'first'}),100);assert.equal(d.step(snap({message:'first'}),2100),'first');assert.equal(d.active,false);d.step(snap({user:'u2',ready:false,message:'',busy:false}),3000);assert.equal(d.active,true);});
test('same-route historical branch change with a ready answer does not start generating',()=>{const d=new Detector();d.step(base,0);d.step(snap({user:'u2',ready:true,message:'historical'}),100);assert.equal(d.active,false);assert.equal(d.step(snap({user:'u2',ready:true,message:'historical'}),5000),null);});

const opaque=(n,change={})=>snap({user:'',message:'',turn:`/c/test\u001fconversation-turn-${n}`,ready:false,...change});
test('generation entry increments lifecycle exactly once, including an inferred new user',()=>{
 const d=new Detector();d.step(opaque(40,{user:'old-user',userExplicit:false,ready:true}),0);
 const before=d.lifecycle;
 d.step(opaque(41,{user:'new-user',userExplicit:false,busy:true}),100);
 assert.equal(d.lifecycle,before+1);
 d.step(opaque(42,{user:'pending-answer',userExplicit:false,busy:true}),200);
 assert.equal(d.lifecycle,before+1);
});
test('active transport completion while busy survives teardown and starts four stable seconds afterward',()=>{
 const d=new Detector(),answer=snap({ready:false,message:'writing'});
 d.step({...answer,busy:true},0);
 assert.equal(d.step({...answer,busy:true,transportCompleted:true},100),null);
 assert.equal(d.step({...answer,busy:true},9000),null);
 assert.equal(d.step(answer,9100),null);
 assert.equal(d.step(answer,13099),null);
 assert.equal(d.step(answer,13100),'writing');
});
test('transport correlation requires four stable seconds and completes exactly once',()=>{
 const d=new Detector(), answer=snap({ready:false,message:'writing'});
 d.step(snap({busy:true,ready:false,message:''}),0);
 assert.equal(d.step({...answer,transportCompleted:true},100),null);
 assert.equal(d.step({...answer,transportCompleted:true},4099),null);
 assert.equal(d.step(answer,4100),'writing');
 assert.equal(d.step({...answer,transportCompleted:true},9000),null);
});
test('control-free completion requires a usable transport hint',()=>{
 for(const busyHint of [false,true]) {
  const d=new Detector(), answer=snap({ready:false,message:'writing'});
  d.step(snap({busy:true,ready:false,message:'',transportCompleted:busyHint}),0);
  d.step(answer,100);assert.equal(d.step(answer,10000),null);
 }
});
test('transport evidence is erased by lifecycle suppression, and busy restarts stability',()=>{
 for(const change of [{busy:true},{user:'u2'},{route:'/c/other'},{blocked:true},{error:true},{compatibility:{state:'incompatible'}}]) {
  const d=new Detector(), answer=snap({ready:false,message:'writing'});
  d.step(snap({busy:true,ready:false,message:''}),0);
  d.step({...answer,transportCompleted:true},100);
  assert.equal(d.step({...answer,...change},200),null);
  assert.equal(d.step({...answer,...change,busy:false,blocked:false,error:false,compatibility:undefined},10000),null);
 }
});
test('manual stop before or after transport hint suppresses late hints',()=>{
 for(const before of [true,false]) {
  const d=new Detector(), answer=snap({ready:false,message:'writing',transportCompleted:true});
  d.step(snap({busy:true,ready:false,message:''}),0);
  if(before)d.cancel();d.step(answer,100);if(!before)d.cancel();
  assert.equal(d.step(answer,200),null);assert.equal(d.step(answer,10000),null);
 }
});
test('historical baseline and initial transport hints never complete',()=>{
 const d=new Detector();d.step({...base,ready:false,transportCompleted:true},0);
 assert.equal(d.step({...base,ready:false,transportCompleted:true},10000),null);
 d.step({...base,busy:true},11000);
 assert.equal(d.step({...base,ready:false,transportCompleted:true},12000),null);
 assert.equal(d.step({...base,ready:false},20000),null);
});
test('normal controls retain their settle timing after a transport hint',()=>{
 const d=new Detector();d.step(snap({busy:true,ready:false,message:''}),0);
 d.step(snap({ready:false,message:'new',transportCompleted:true}),100);
 assert.equal(d.step(snap({message:'new'}),200),null);
 assert.equal(d.step(snap({message:'new'}),2200),'new');
});
test('normal readiness retires transport fallback even if controls disappear again',()=>{
 const d=new Detector();d.step(snap({busy:true,ready:false,message:''}),0);
 d.step(snap({ready:false,message:'new',transportCompleted:true}),100);
 d.step(snap({message:'new'}),3900);
 assert.equal(d.step(snap({ready:false,message:'new'}),4100),null);
 assert.equal(d.step(snap({ready:false,message:'new'}),9000),null);
});
test('empty/nonempty user identity reclassification restarts stability within the same lifecycle',()=>{
 for(const [user,nextUser] of [['','u1'],['u1','']]) {
  const d=new Detector(),answer=snap({user,ready:false,message:'new'});
  d.step({...answer,busy:true,message:''},0);d.step({...answer,transportCompleted:true},100);
  d.step({...answer,user:nextUser},200);
  assert.equal(d.step({...answer,user:nextUser},4199),null);
  assert.equal(d.step({...answer,user:nextUser},4200),'new');
 }
});
test('busy oscillation preserves transport evidence but restarts the full stability window',()=>{
 const d=new Detector(),answer=snap({ready:false,message:'writing'});
 d.step({...answer,busy:true},0);d.step({...answer,busy:true,transportCompleted:true},100);
 d.step(answer,200);assert.equal(d.step(answer,4199),null);
 d.step({...answer,busy:true},4200);assert.equal(d.step({...answer,busy:true},10000),null);
 d.step(answer,10100);assert.equal(d.step(answer,14099),null);
 assert.equal(d.step(answer,14100),'writing');
});
test('answer identity churn restarts stability without erasing same-lifecycle evidence',()=>{
 const d=new Detector();d.step(snap({busy:true,ready:false,message:''}),0);
 d.step(snap({ready:false,message:'first',transportCompleted:true}),100);
 assert.equal(d.step(snap({ready:false,message:'second'}),4000),null);
 assert.equal(d.step(snap({ready:false,message:'second'}),7999),null);
 assert.equal(d.step(snap({ready:false,message:'second'}),8000),'second');
});
test('cancel, reset, disable, navigation and suppression erase busy transport evidence',()=>{
 for(const invalidation of ['cancel','reset','enabled','route','error','blocked','incompatible']) {
  const d=new Detector(),answer=snap({ready:false,message:'writing'});
  d.step({...answer,busy:true},0);d.step({...answer,busy:true,transportCompleted:true},100);
  if(invalidation==='cancel')d.cancel();
  else if(invalidation==='reset')d.reset();
  else d.step({...answer,...(invalidation==='route'?{route:'/c/other'}:invalidation==='incompatible'?{compatibility:{state:'incompatible'}}:invalidation==='enabled'?{enabled:false}:{[invalidation]:true})},200);
  assert.equal(d.transportCompleted,false,invalidation);
  assert.equal(d.step(answer,300),null);assert.equal(d.step(answer,10000),null,invalidation);
 }
});
test('inferred-to-explicit roles retain the lifecycle and normal controls keep their settle timing',()=>{
 const d=new Detector();d.step(snap({user:'inferred-input',userExplicit:false,turn:'inferred-answer',message:'',busy:true,ready:false}),0);
 const generation=d.lifecycle;
 d.step(snap({user:'inferred-input',userExplicit:false,turn:'inferred-answer',message:'',busy:true,ready:false,transportCompleted:true}),100);
 const ready=snap({user:'explicit-input',userExplicit:true,turn:'explicit-answer',message:'explicit-message'});
 assert.equal(d.step(ready,200),null);assert.equal(d.lifecycle,generation);
 assert.equal(d.step(ready,2199),null);assert.equal(d.step(ready,2200),'explicit-answer');
});
test('initial role-less turn is only a baseline, even before its final action appears',()=>{const d=new Detector();assert.equal(d.step(opaque(40),0),null);assert.equal(d.active,false);assert.equal(d.step(opaque(40,{ready:true}),3000),null);assert.equal(d.active,false);});
test('new role-less turn starts generating and completes once; second job also works',()=>{const d=new Detector();d.step(opaque(40),0);for(const [n,t] of [[41,100],[42,5000]]){assert.equal(d.step(opaque(n),t),null);assert.equal(d.active,true);assert.equal(d.step(opaque(n,{ready:true}),t+100),null);assert.equal(d.step(opaque(n,{ready:true}),t+2100),opaque(n).turn);assert.equal(d.active,false);assert.equal(d.step(opaque(n,{ready:true}),t+3000),null);}});
test('ready role-less historical branch updates baseline without generating',()=>{const d=new Detector();d.step(opaque(40,{ready:true}),0);assert.equal(d.step(opaque(41,{ready:true}),100),null);assert.equal(d.active,false);assert.equal(d.step(opaque(41,{ready:false}),200),null);assert.equal(d.active,false);assert.equal(d.step(opaque(41,{ready:true}),5000),null);});
test('role-less navigation does not start a generation',()=>{const d=new Detector();d.step(opaque(40),0);const other=opaque(41,{route:'/c/other',turn:'/c/other\u001fconversation-turn-41'});d.step(other,100);assert.equal(d.active,false);assert.equal(d.step({...other,ready:true},3000),null);});
test('role-less manual stop suppresses partial completion but allows the next turn',()=>{const d=new Detector();d.step(opaque(40),0);d.step(opaque(41),100);assert.equal(d.active,true);d.cancel();d.step(opaque(41),200);assert.equal(d.active,false);assert.equal(d.step(opaque(41,{ready:true}),3000),null);d.step(opaque(42),4000);assert.equal(d.active,true);d.step(opaque(42,{ready:true}),4100);assert.equal(d.step(opaque(42,{ready:true}),6100),opaque(42).turn);});
test('role-less errors and approval dialogs do not resume the same partial turn',()=>{for(const flag of ['error','blocked']){const d=new Detector();d.step(opaque(40),0);d.step(opaque(41),100);d.step(opaque(41,{[flag]:true}),200);d.step(opaque(41),300);assert.equal(d.active,false);assert.equal(d.step(opaque(41,{ready:true}),3000),null);}});
