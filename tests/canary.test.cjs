const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../extension/compatibility.js');
const {Canary}=require('../extension/canary-model.js');
const compatibility={state:'healthy',profileId:C.packaged.profileId,revision:1,revisionId:'packaged-1',reasons:[],matched:['turn','finalCopy']};
const sample=(at,state,color,playbackDelta=0)=>({at,state,color,playbackDelta,visibility:'hidden',unfocused:true,compatibility});
function run(){const c=new Canary(0);c.observe(sample(0,'waiting','none'));c.observe(sample(100,'generating','yellow'));c.observe(sample(200,'generating','yellow'));return c;}
test('Canary requires ordered live stages, quiet window and explicit human audio confirmation',()=>{
  const c=run();c.observe(sample(300,'complete','blue',1));c.observe(sample(5300,'complete','blue',1));
  assert.equal(c.result.status,'pending');c.confirmAudio(true);c.observe(sample(5800,'complete','blue',1));
  assert.equal(c.result.status,'pass');assert.equal(c.result.stages.length,4);
  c.observe(sample(6000,'complete','blue',2));assert.equal(c.result.status,'fail');
});
test('Canary refuses shortcuts, refocus, timeouts, incompatible completion and early playback',()=>{
  const early=new Canary(0);early.observe(sample(0,'complete','blue',1));assert.equal(early.result.status,'fail');
  const c=run();c.observe({...sample(300,'complete','blue',1),unfocused:false});assert.equal(c.result.reason,'TARGET_REFOCUSED');
  const timeout=run();timeout.observe(sample(600001,'generating','yellow'));assert.equal(timeout.result.reason,'TIMEOUT');
  const bad=run();bad.observe({...sample(300,'complete','blue',1),compatibility:{...compatibility,state:'incompatible'}});
  bad.confirmAudio(true);assert.equal(bad.result.status,'pending');
});
test('Canary projects bounded structural data and rejects malformed health without retaining private input',()=>{
  const c=run();for(let i=1;i<=150;i++)c.observe({...sample(200+i,'generating','yellow'),url:'PRIVATE_URL',text:'PRIVATE_PROSE'});
  assert.equal(c.result.samples.length,120);assert.equal(JSON.stringify(c.result).includes('PRIVATE'),false);
  c.observe({...sample(400,'complete','blue',1),compatibility:{...compatibility,reasons:['PRIVATE_PROSE']}});
  assert.equal(c.result.reason,'HEALTH_INVALID');assert.equal(JSON.stringify(c.result).includes('PRIVATE'),false);
});
test('local Canary UI observes read-only APIs and cannot PASS before human confirmation',async()=>{
  const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
  const {parseHTML}=require('linkedom');
  const root=path.join(__dirname,'../extension');
  const {document,window}=parseHTML(fs.readFileSync(path.join(root,'canary.html'),'utf8'));
  const flush=()=>new Promise(setImmediate);
  let now=0,tick,record={version:'0.3.0',state:'waiting',visibility:'visible'},color='grey',playedCount=5;
  const messages=[];
  const context=vm.createContext({document,Date:{now:()=>now},setInterval:fn=>{tick=fn;return 1;},clearInterval:()=>{tick=null;},
    chrome:{
      runtime:{getManifest:()=>({version:'0.3.0'})},
      permissions:{contains:async()=>true},
      storage:{session:{get:async()=>({'tab-1':record})},local:{get:async()=>({enabled:true,colorTabs:true,soundName:'PRIVATE_AUDIO',playedCount})}},
      tabs:{query:async()=>[{id:1}],get:async()=>({active:false,windowId:2,groupId:3,url:'PRIVATE_URL',title:'PRIVATE_TITLE'}),
        sendMessage:async(id,msg)=>{messages.push(msg.type);return {ok:true,compatibility,trace:[{text:'PRIVATE_PROSE'}]};}},
      windows:{get:async()=>({focused:false})},tabGroups:{get:async()=>({color,title:'PRIVATE_TITLE'})}
    }});
  for (const file of ['compatibility.js','canary-model.js','canary.js']) vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
  const click=id=>document.getElementById(id).dispatchEvent(new window.Event('click'));
  click('start');await flush();
  const result=()=>JSON.parse(document.getElementById('result').value);
  assert.equal(result().reason,'WAITING_FOR_GENERATION');
  record={...record,state:'generating',owner:{groupId:3}};color='yellow';now=100;await tick();
  record.visibility='hidden';now=200;await tick();
  record.state='complete';color='blue';playedCount++;now=300;await tick();
  now=5300;await tick();assert.equal(result().status,'pending');
  document.getElementById('heard').checked=true;
  document.getElementById('heard').dispatchEvent(new window.Event('change'));
  now=5800;await tick();assert.equal(result().status,'pass');
  assert.equal(JSON.stringify(result()).includes('PRIVATE'),false);
  assert.ok(messages.every(type=>type==='GET_DIAGNOSTICS'));
  click('stop');assert.equal(tick,null);
});

test('Canary selects only the single live ChatGPT tab and keeps that target during sampling',async t=>{
  const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
  const {parseHTML}=require('linkedom');
  const root=path.join(__dirname,'../extension');
  for (const scenario of [
    {name:'one live tab plus stale record',ids:[42],version:'0.3.0'},
    {name:'zero live tabs',ids:[],version:'0.3.0',fail:true},
    {name:'two live tabs',ids:[42,43],version:'0.3.0',fail:true},
    {name:'missing live record',ids:[42],fail:true},
    {name:'old live record',ids:[42],version:'0.2.0',fail:true},
    {name:'target closes',ids:[42],version:'0.3.0',loss:'closed'},
    {name:'target record disappears',ids:[42],version:'0.3.0',loss:'missing'},
    {name:'target record becomes old',ids:[42],version:'0.3.0',loss:'old'}
  ]) await t.test(scenario.name,async()=>{
    const {document,window}=parseHTML(fs.readFileSync(path.join(root,'canary.html'),'utf8'));
    const record={version:'0.3.0',state:'waiting',visibility:'visible'};
    const entries={'tab-99':{...record}};
    if (scenario.version) entries['tab-42']={...record,version:scenario.version};
    let tick,closed=false,queries=0;
    const targets=[],messages=[];
    const context=vm.createContext({document,Date:{now:()=>0},
      setInterval:fn=>{tick=fn;return 1;},clearInterval:()=>{tick=null;},
      chrome:{
        runtime:{getManifest:()=>({version:'0.3.0'})},permissions:{contains:async()=>true},
        storage:{session:{get:async()=>entries},local:{get:async()=>({enabled:true,colorTabs:true,soundName:'PRIVATE_AUDIO',playedCount:5})}},
        tabs:{
          query:async query=>{queries++;assert.equal(JSON.stringify(query),JSON.stringify({url:'https://chatgpt.com/*'}));
            return scenario.ids.map(id=>({id,url:'https://chatgpt.com/PRIVATE_URL',title:'PRIVATE_TITLE'}));},
          get:async id=>{targets.push(id);if (closed) throw Error('Tab closed');return {active:false,windowId:2,groupId:-1};},
          sendMessage:async id=>{messages.push(id);return {ok:true,compatibility};}
        },windows:{get:async()=>({focused:false})}
      }});
    for (const file of ['compatibility.js','canary-model.js','canary.js']) vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
    document.getElementById('start').dispatchEvent(new window.Event('click'));
    await new Promise(setImmediate);
    const result=()=>JSON.parse(document.getElementById('result').value);
    assert.equal(result().reason,scenario.fail?'PRECONDITION_REQUIRED':'WAITING_FOR_GENERATION');
    if (scenario.fail) {assert.equal(result().status,'fail');assert.equal(tick,null);assert.deepEqual(targets,[]);assert.deepEqual(messages,[]);}
    else {
      // A changed live-tab inventory must never retarget an active run.
      scenario.ids.splice(0,scenario.ids.length,99);
      if (scenario.loss === 'closed') closed=true;
      if (scenario.loss === 'missing') delete entries['tab-42'];
      if (scenario.loss === 'old') entries['tab-42'].version='0.2.0';
      await tick();
      assert.deepEqual(targets,[42,42]);assert.deepEqual(messages,[42,42]);
      assert.equal(result().reason,scenario.loss?'OBSERVATION_UNAVAILABLE':'WAITING_FOR_GENERATION');
      if (scenario.loss) {assert.equal(result().status,'fail');assert.equal(tick,null);}
    }
    assert.equal(queries,1);
    assert.equal(JSON.stringify(result()).includes('PRIVATE'),false);
    assert.doesNotMatch(JSON.stringify(result()),/"(?:url|title|tabId|targetId|id)":/);
  });
});
