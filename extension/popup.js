const el=id=>document.getElementById(id);
let rendering = false, pending = false;
async function render() {
  if (rendering) {pending=true;return;}
  rendering=true;
  try {
    const [c,entries,active,permitted] = await Promise.all([
      chrome.storage.local.get({enabled:false,soundName:'',playedCount:0,lastError:'',colorTabs:false}),
      chrome.storage.session.get(null),chrome.tabs.query({active:true,currentWindow:true}),
      chrome.permissions.contains({permissions:['tabGroups']})
    ]);
    const version = chrome.runtime.getManifest().version;
    const id = active[0]?.id;
    const d = ChappyDiagnostics.describe({config:c,record:entries['tab-'+id],probe:entries['probe-'+id],permitted,version});
    el('tabHeading').textContent='このタブの状態（保存済み STATUS）';
    el('enabled').checked=c.enabled;el('enabled').disabled=!c.soundName;
    el('summary').textContent=!c.soundName?'最初に完了音声を選んでください。':c.enabled?'自動通知は有効です。':'自動通知は停止中です。';
    el('tabStatus').textContent=d.status;el('tabDetail').textContent=d.detail;
    el('tabProbe').textContent=d.probe;el('tabColor').textContent=d.color;
    const others=document.createDocumentFragment();
    for (const [key,record] of Object.entries(entries)) {
      if (!/^tab-\d+$/.test(key) || key === 'tab-'+id) continue;
      const otherId=key.slice(4);
      const other=ChappyDiagnostics.describe({config:c,record,probe:entries['probe-'+otherId],permitted,version});
      const row=document.createElement('p');
      row.textContent='タブ '+otherId+'：'+[other.status,other.detail,other.probe,other.color].filter(Boolean).join(' ');
      others.append(row);
    }
    el('otherTabs').replaceChildren(others);
    if (!el('otherTabs').childNodes.length) el('otherTabs').textContent='ほかに接続済みのタブはありません。';
    const connected=Object.keys(entries).filter(k=>/^tab-\d+$/.test(k)).length;
    el('stats').textContent='接続済み '+connected+'タブ · 再生 '+c.playedCount+'回（テストを含む）';
    el('error').textContent=c.lastError;
    el('version').textContent='v'+version+' · Compatibility Shield / 互換性シールド';
  } catch {el('error').textContent='状態を読み込めませんでした。ポップアップを開き直してください。';}
  finally {rendering=false;if(pending){pending=false;void render();}}
}
el('settings').addEventListener('click',()=>chrome.runtime.openOptionsPage());
async function renderDiagnostics() {
  try {
    const [active] = await chrome.tabs.query({active:true,currentWindow:true});
    const result = await chrome.tabs.sendMessage(active.id, {type:'GET_DIAGNOSTICS'});
    if (!result?.ok || !Array.isArray(result.trace)) throw new Error();
    el('compatibilityHealth').textContent=ChappyDiagnostics.describeCompatibility(result.compatibility);
    const latestMutation = result.trace.findLast(event => event.source === 'mutation' && event.mutationNodes?.length);
    el('diagnosticTrace').textContent=JSON.stringify({compatibility:result.compatibility, unitLifecycleHistory:result.unitLifecycleHistory || [], structureHistory:result.structureHistory || [], unitSummaries:result.unitSummaries || {}, dotsVerifiedWorkSpinners:result.dotsVerifiedWorkSpinners || null, dotsTopStatus:result.dotsTopStatus || null, latestMutationNodes:latestMutation?.mutationNodes || [], trace:result.trace.slice(-8)}, null, 2);
  } catch {el('compatibilityHealth').textContent=ChappyDiagnostics.describeCompatibility(null);el('diagnosticTrace').textContent='診断を取得できません';}
}
el('liveDiagnostics').addEventListener('toggle',()=>{if(el('liveDiagnostics').open) void renderDiagnostics();});
el('refreshDiagnostics').addEventListener('click',()=>{void renderDiagnostics();});
el('enabled').addEventListener('change',async()=>{await chrome.storage.local.set({enabled:el('enabled').checked});await render();});
chrome.storage.onChanged.addListener(()=>{void render();});
void render();

void renderDiagnostics();
