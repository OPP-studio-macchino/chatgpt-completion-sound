// Candidate regressions for storage recovery, isolation, and build hydration.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const fixture = require('./chrome-fixture.cjs');
const TabColors = require('../extension/tab-colors.js');
const Diagnostics = require('../extension/diagnostics.js');

function snapshot(f, id) {
  return structuredClone({tab:f.tabs.get(id), group:f.groups.get(f.tabs.get(id).groupId),
    session:f.session['tab-'+id], local:f.local['_chappy-owner-'+id],
    watch:f.session['watch-'+id], probe:f.session['probe-'+id]});
}

// Arm only after yellow is established. Reject before committing exactly one
// owner write, and assert the real group mutation has already finished.
function failBlueOwnerWrite(f, area, id) {
  const groupId = f.tabs.get(id).groupId;
  const events = [];
  let failures = 0;
  const update = f.api.tabGroups.update;
  f.api.tabGroups.update = async (gid, look) => {
    const result = await update(gid, look);
    if (gid === groupId && look.color === 'blue') events.push('group:blue');
    return result;
  };
  for (const storageArea of ['local', 'session']) {
    const set = f.api.storage[storageArea].set;
    const key = storageArea === 'local' ? '_chappy-owner-'+id : 'tab-'+id;
    f.api.storage[storageArea].set = async values => {
      const owner = storageArea === 'local' ? values[key] : values[key]?.owner;
      if (owner?.color !== 'blue') return set(values);
      if (storageArea === area && failures === 0) {
        assert.equal(f.groups.get(groupId).color, 'blue');
        assert.equal(f.session['tab-'+id].owner.color, 'yellow');
        assert.deepEqual(events, area === 'session' ? ['group:blue','local:blue'] : ['group:blue']);
        assert.equal(f.local['_chappy-owner-'+id].color, area === 'session' ? 'blue' : 'yellow');
        failures++;
        events.push(storageArea+':FAIL');
        throw new Error('injected '+storageArea+' owner write failure');
      }
      await set(values);
      events.push(storageArea+':blue');
    };
  }
  return {events, failures:() => failures};
}

async function worker(contentListener) {
  const f = fixture();
  const chrome = f.api, listeners = [], requests = [], injections = [], timers = new Map();
  let nextTimer = 0;
  chrome.runtime = {id:'fixture',getManifest:() => ({version:'0.3.0'}),
    getURL:path => 'chrome-extension://fixture/'+path,
    onMessage:{addListener:fn => listeners.push(fn)},onInstalled:{addListener() {}}};
  chrome.tabs.sendMessage = async (id, message, options) => {
    requests.push(structuredClone({id,message,options}));
    let response;
    contentListener(message, {id:'fixture'}, reply => {response=structuredClone(reply);});
    return response;
  };
  chrome.scripting = {executeScript:async spec => {injections.push(structuredClone(spec));return [];}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../extension/background.js'),'utf8')
    .replace(/^import '\.\/[^']+';\s*/gm,''), {
      chrome, ChappyCompatibility:require('../extension/compatibility.js'), ChappyTabColors:TabColors, ChappyBackgroundWatch:require('../extension/background-watch.js'),
      setTimeout:(fn,delay) => {timers.set(++nextTimer,{fn,delay});return nextTimer;},
      clearTimeout:id => timers.delete(id), URL, console
    });
  await new Promise(setImmediate);
  assert.equal(requests.length, 2);
  assert.equal(timers.size, 0);
  async function status(id, state) {
    return new Promise(resolve => {
      const message = {target:'background',type:'STATUS',state,version:'0.3.0',visibility:'hidden'};
      const sender = {id:'fixture',tab:{id},frameId:0,url:'https://chatgpt.com/c/synthetic-'+id,documentId:'document-'+id};
      assert.equal(listeners[0](message, sender, resolve), true);
    });
  }
  return {...f,requests,injections,timers,status};
}

// Synthetic old-build protocol endpoint, not an archived historical bundle.
// It answers version and diagnostics but implements no Compatibility Shield.
function oldContent(version = '0.3.0') {
  return (message, sender, reply) => {
    if (sender.id !== 'fixture') return false;
    if (message.type === 'GET_CONTENT_VERSION') reply({ok:true,version});
    if (message.type === 'GET_DIAGNOSTICS') reply({ok:true,trace:[]});
    return false;
  };
}

test('fixture storage clones both reads and writes in local and session', async () => {
  const f = fixture();
  for (const area of ['local','session']) {
    const values = {synthetic:{owner:{color:'yellow'}}};
    await f.api.storage[area].set(values);
    values.synthetic.owner.color = 'red';
    const first = await f.api.storage[area].get('synthetic');
    assert.equal(first.synthetic.owner.color, 'yellow');
    first.synthetic.owner.color = 'blue';
    assert.equal((await f.api.storage[area].get('synthetic')).synthetic.owner.color, 'yellow');
  }
});

test('A/session: stale yellow session recovers from the validated blue persistent owner', async t => {
  const f = fixture(), manager = new TabColors(f.api);
  await manager.set(1,'generating',{version:'0.3.0'});
  assert.equal(snapshot(f,1).group.color,'yellow');
  const fault = failBlueOwnerWrite(f,'session',1);
  await assert.rejects(manager.set(1,'complete'), {message:'injected session owner write failure'});
  const failed = snapshot(f,1);
  assert.equal(fault.failures(),1);
  assert.deepEqual(fault.events,['group:blue','local:blue','session:FAIL']);
  assert.equal(failed.group.color,'blue');
  assert.equal(failed.local.color,'blue');
  assert.equal(failed.session.owner.color,'yellow');
  assert.equal(failed.session.state,'generating');
  const editCount = f.edits.length;
  await manager.set(1,'generating');
  const next = snapshot(f,1);
  assert.equal(next.group.color,'yellow');
  assert.equal(next.session.state,'generating');
  assert.equal(next.session.userOverride,undefined);
  assert.equal(next.session.colorSkipped,'');
  assert.equal(next.session.owner.color,'yellow');
  assert.deepEqual(next.session.owner,next.local);
  assert.equal(f.edits.length,editCount+1);
  const wording = Diagnostics.describe({config:{enabled:true,colorTabs:true,soundName:'synthetic'},
    record:next.session,permitted:true,version:'0.3.0'}).color;
  assert.equal(wording,'黄色のグループを設定済みです。');
  t.diagnostic(JSON.stringify({result:'RECOVERED',ordering:fault.events,
    afterFailure:{group:failed.group.color,local:failed.local.color,session:failed.session.owner.color},
    next:{group:next.group.color,userOverride:next.session.userOverride,colorSkipped:next.session.colorSkipped},wording}));
});

test('A/local: failed local owner write is caught, session advances, next yellow recovers', async t => {
  const f = fixture(), manager = new TabColors(f.api);
  await manager.set(1,'generating');
  const fault = failBlueOwnerWrite(f,'local',1);
  const completed = await manager.set(1,'complete');
  const failed = snapshot(f,1);
  assert.equal(fault.failures(),1);
  assert.deepEqual(fault.events,['group:blue','local:FAIL','session:blue']);
  assert.equal(failed.group.color,'blue');
  assert.equal(failed.local.color,'yellow');
  assert.equal(failed.session.owner.color,'blue');
  assert.equal(completed.colorError,'injected local owner write failure');
  await manager.set(1,'generating');
  const next = snapshot(f,1);
  assert.equal(next.group.color,'yellow');
  assert.equal(next.local.color,'yellow');
  assert.equal(next.session.owner.color,'yellow');
  assert.equal(next.session.userOverride,undefined);
  assert.equal(next.session.colorSkipped,'');
  assert.equal(next.session.colorError,'');
  t.diagnostic(JSON.stringify({result:'NO stuck-blue reproduction in local-only failure window',ordering:fault.events,
    afterFailure:{group:failed.group.color,local:failed.local.color,session:failed.session.owner.color,error:completed.colorError},
    next:{group:next.group.color,colorSkipped:next.session.colorSkipped}}));
});

test('B: actual background STATUS routing isolates singleton groups, including a B-only mismatch', async t => {
  const f = await worker(oldContent());
  assert.equal((await f.status(1,'generating')).ok,true);
  assert.equal((await f.status(2,'generating')).ok,true);
  const aGroup = f.tabs.get(1).groupId, bGroup = f.tabs.get(2).groupId;
  assert.notEqual(aGroup,bGroup);
  assert.deepEqual((await f.api.tabs.query({groupId:aGroup})).map(tab=>tab.id),[1]);
  assert.deepEqual((await f.api.tabs.query({groupId:bGroup})).map(tab=>tab.id),[2]);
  const bYellow = snapshot(f,2), baselineEdits = f.edits.length;
  await f.status(1,'complete');
  assert.equal(f.groups.get(aGroup).color,'blue');
  assert.deepEqual(snapshot(f,2),bYellow);
  assert.deepEqual(f.edits.slice(baselineEdits).map(edit=>[edit[0],edit[1]]),[['update',aGroup]]);
  const aBlue = snapshot(f,1);
  const fault = failBlueOwnerWrite(f,'session',2);
  assert.equal((await f.status(2,'complete')).ok,false);
  assert.equal(fault.failures(),1);
  assert.equal(f.session['tab-2'].owner.color,'yellow');
  assert.equal(f.local['_chappy-owner-2'].color,'blue');
  assert.equal(f.groups.get(bGroup).color,'blue');
  assert.deepEqual(snapshot(f,1),aBlue);
  const mismatchedB = snapshot(f,2), mismatchEdits = f.edits.length;
  await f.status(1,'generating');
  await f.status(1,'complete');
  assert.deepEqual(snapshot(f,2),mismatchedB);
  assert.ok(f.edits.slice(mismatchEdits).every(edit=>edit[0]==='update' && edit[1]===aGroup));
  assert.equal((await f.status(2,'generating')).ok,true);
  assert.equal(f.session['tab-2'].colorSkipped,'');
  assert.equal(f.session['tab-2'].userOverride,undefined);
  assert.equal(f.groups.get(bGroup).color,'yellow');
  const recoveredB = snapshot(f,2), recoveredEdits = f.edits.length;
  await f.status(1,'generating');
  await f.status(1,'complete');
  assert.deepEqual(snapshot(f,2),recoveredB);
  assert.ok(f.edits.slice(recoveredEdits).every(edit=>edit[0]==='update' && edit[1]===aGroup));
  t.diagnostic(JSON.stringify({baseline:{A:'blue',B:'yellow'},mismatchOnB:'A never changes B',
    afterBRetry:{A:f.groups.get(aGroup).color,B:f.groups.get(bGroup).color,BColorSkipped:f.session['tab-2'].colorSkipped},
    observedCrossTabProblem:'NOT EXPLAINED by this deterministic test'}));
});

test('D: old 0.3.0 endpoint without protocol now triggers reinjection', async t => {
  const endpoint = oldContent();
  let diagnostics;
  endpoint({type:'GET_DIAGNOSTICS'},{id:'fixture'}, reply=>{diagnostics=reply;});
  assert.equal(Object.hasOwn(diagnostics,'compatibility'),false);
  const f = await worker(endpoint);
  assert.deepEqual(f.injections.map(spec=>spec.target.tabId),[1,2]);
  assert.deepEqual(f.requests.map(request=>request.message),[
    {type:'GET_CONTENT_VERSION'},{type:'GET_CONTENT_VERSION'}]);
  assert.ok(f.requests.every(request=>request.options.frameId===0));
  t.diagnostic(JSON.stringify({result:'REINJECTED',syntheticOldVersion:'0.3.0',healthAbsent:true,
    versionRequests:f.requests.length,injections:f.injections.length,classification:'separate lifecycle/diagnostics defect'}));
});

test('D/control: different semantic version does trigger the current script bundle', async () => {
  const f = await worker(oldContent('0.2.12'));
  assert.deepEqual(f.injections.map(spec=>spec.target.tabId),[1,2]);
  for (const spec of f.injections) assert.deepEqual(spec.files,
    ['compatibility.js','detector.js','dom-reader.js','content.js']);
});

test('D: exact current protocol and version preserve content across hydration', async () => {
  const f = await worker((message, sender, reply) => {
    if (sender.id === 'fixture' && message.type === 'GET_CONTENT_VERSION') {
      reply({ok:true,version:'0.3.0',protocol:require('../extension/compatibility.js').CONTENT_PROTOCOL});
    }
  });
  assert.equal(f.injections.length,0);
});

test('A/release: validated persistent owner safely releases after a stale session save', async () => {
  const f = fixture(), manager = new TabColors(f.api);
  await manager.set(1,'generating');
  failBlueOwnerWrite(f,'session',1);
  await assert.rejects(manager.set(1,'complete'),/injected session owner write failure/);
  await manager.set(1,'watching');
  assert.equal(f.tabs.get(1).groupId,-1);
  assert.equal(f.session['tab-1'].userOverride,undefined);
  assert.equal(f.session['tab-1'].owner,undefined);
  assert.equal(f.local['_chappy-owner-1'],undefined);
  assert.equal(f.edits.at(-2)[2].color,'grey');
  assert.deepEqual(f.edits.at(-1),['ungroup',1]);
});

test('A/safety: stale session recovery cannot overwrite actual group changes', async t => {
  for (const state of ['generating','watching']) {
    for (const change of ['rename','recolor','shared','extra-member','different-group','no-persisted-owner']) {
      await t.test(state+'/'+change, async () => {
        const f = fixture(), manager = new TabColors(f.api);
        await manager.set(1,'generating');
        failBlueOwnerWrite(f,'session',1);
        await assert.rejects(manager.set(1,'complete'),/injected session owner write failure/);
        const groupId = f.tabs.get(1).groupId;
        const group = f.groups.get(groupId);
        if (change === 'rename') group.title = 'Synthetic user group';
        if (change === 'recolor') group.color = 'red';
        if (change === 'shared') group.shared = true;
        if (change === 'extra-member') f.tabs.get(2).groupId = groupId;
        if (change === 'different-group') {
          f.groups.set(900,{...group,id:900});
          f.tabs.get(1).groupId = 900;
        }
        if (change === 'no-persisted-owner') delete f.local['_chappy-owner-1'];
        const before = structuredClone({tabs:[...f.tabs],groups:[...f.groups],edits:f.edits});
        await manager.set(1,state);
        assert.deepEqual({tabs:[...f.tabs],groups:[...f.groups],edits:f.edits},before);
        assert.equal(f.session['tab-1'].userOverride,true);
        assert.equal(f.session['tab-1'].owner,undefined);
        assert.equal(f.local['_chappy-owner-1'],undefined);
        if (state === 'generating') assert.equal(f.session['tab-1'].colorSkipped,'changed');
      });
    }
  }
});
