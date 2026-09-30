const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const {parseHTML} = require(require.resolve('linkedom', {paths:[process.env.CHAPPY_DOM_DEPENDENCIES || __dirname]}));

test('popup reads only GET_DIAGNOSTICS, displays unitLifecycleHistory first and preserves current diagnostics with fixed failure text', async () => {
  const root = path.join(__dirname, '../extension');
  const {document} = parseHTML(fs.readFileSync(path.join(root, 'popup.html'), 'utf8'));
  const requests = [];
  const unitLifecycleHistory = [{sequence:1, route:'project-conversation', units:[{keyHash:'012345abcdef', parentDescendantCounts:{button:3}}]}];
  const structureHistory = [
    {sequence:1, counts:{'[data-chatgpt-search-unit-key]':0, '[data-content-search-unit-key]':0}},
    {sequence:3, counts:{'[data-chatgpt-search-unit-key]':1, '[data-content-search-unit-key]':1}}
  ];
  const unitSummaries = {
    'data-chatgpt-search-unit-key':[{keyHash:'012345abcdef', descendantCounts:{button:2}}],
    'data-content-search-unit-key':[{keyHash:'fedcba543210', descendantCounts:{button:1}}]
  };
  let fail = false;
  const context = vm.createContext({document, chrome:{
    storage:{local:{get:async () => ({})}, session:{get:async () => ({})}, onChanged:{addListener() {}}},
    permissions:{contains:async () => false},
    runtime:{getManifest:() => ({version:'0.3.0'})},
    tabs:{query:async () => [{id:17}], sendMessage:async (id, message) => {
      requests.push({id, message});
      if (fail) throw Error('synthetic private exception');
      return {ok:true, unitLifecycleHistory, structureHistory, unitSummaries, trace:Array.from({length:12}, (_, sequence) => ({sequence,
        ...(sequence === 1 ? {source:'mutation', mutationNodes:[{tag:'form'}]} : {}),
        dom:{census:{button:sequence}}}))};
    }}
  }});
  for (const file of ['diagnostics.js','popup.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
  await new Promise(setImmediate);
  // Opening the popup now also reads compatibility health without a probe/mutation.
  assert.equal(JSON.stringify(requests), JSON.stringify([{id:17, message:{type:'GET_DIAGNOSTICS'}}]));
  const text = document.getElementById('diagnosticTrace').textContent;
  assert.match(text, /"sequence": 4/);
  assert.match(text, /"sequence": 11/);
  const payload = JSON.parse(text);
  assert.equal(Object.keys(payload)[0], 'unitLifecycleHistory');
  assert.deepEqual(payload.unitLifecycleHistory, unitLifecycleHistory);
  assert.deepEqual(payload.structureHistory, structureHistory);
  assert.deepEqual(payload.unitSummaries, unitSummaries);
  assert.deepEqual(payload.latestMutationNodes, [{tag:'form'}]);
  assert.deepEqual(payload.trace.map(event => event.sequence), [4, 5, 6, 7, 8, 9, 10, 11]);
  assert.equal(payload.trace.at(-1).dom.census.button, 11);
  assert.match(document.getElementById('tabHeading').textContent, /保存済み STATUS/);
  fail = true;
  await context.renderDiagnostics();
  assert.equal(document.getElementById('diagnosticTrace').textContent, '診断を取得できません');
  assert.equal(JSON.stringify(requests), JSON.stringify(Array.from({length:2}, () => ({id:17, message:{type:'GET_DIAGNOSTICS'}}))));
});
