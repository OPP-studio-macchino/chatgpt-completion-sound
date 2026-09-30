(() => {
  'use strict';
  const el=id=>document.getElementById(id);
  let canary, timer, targetId, baseline, sampling=false;
  function render() {
    el('status').textContent=canary.result.status.toUpperCase()+' — '+canary.result.reason;
    el('result').value=JSON.stringify(canary.result,null,2);
    el('heard').disabled=!timer || canary.result.stages.length !== 4 || canary.result.status === 'fail';
    el('heard').checked=canary.result.humanHeardOnce;
  }
  function stop() {clearInterval(timer);timer=null;el('start').disabled=false;el('stop').disabled=true;el('heard').disabled=true;}
  async function sample() {
    if (sampling || !timer) return;
    sampling=true;
    const run=canary;
    try {
      const [tab,entries,config,diagnostic]=await Promise.all([
        chrome.tabs.get(targetId),chrome.storage.session.get(null),
        chrome.storage.local.get({playedCount:0}),chrome.tabs.sendMessage(targetId,{type:'GET_DIAGNOSTICS'})
      ]);
      if (!timer || run !== canary) return;
      const record=entries['tab-'+targetId];
      if (record?.version !== '0.3.0' || !diagnostic?.ok) throw Error();
      const window=await chrome.windows.get(tab.windowId);
      const group=tab.groupId >= 0 ? await chrome.tabGroups.get(tab.groupId) : null;
      if (!timer || run !== canary) return;
      const color=group && record.owner?.groupId === tab.groupId ? group.color : 'none';
      canary.observe({at:Date.now(),state:record.state,visibility:record.visibility,
        unfocused:!tab.active || !window.focused,color:['yellow','blue','none'].includes(color)?color:'other',
        playbackDelta:config.playedCount-baseline,compatibility:diagnostic.compatibility});
      render();if (canary.result.status === 'fail') stop();
    } catch {if (timer && run === canary) {canary.fail('OBSERVATION_UNAVAILABLE');render();stop();}}
    finally {sampling=false;}
  }
  el('start').addEventListener('click',async()=>{
    el('start').disabled=true;
    canary=new ChappyCanary.Canary(Date.now());el('heard').checked=false;
    try {
      const [tabs,entries,config,permitted]=await Promise.all([
        chrome.tabs.query({url:'https://chatgpt.com/*'}),chrome.storage.session.get(null),
        chrome.storage.local.get({enabled:false,colorTabs:false,playedCount:0,soundName:''}),
        chrome.permissions.contains({permissions:['tabGroups']})]);
      if (tabs.length !== 1 || !Number.isInteger(tabs[0].id) || tabs[0].id < 0 ||
          entries['tab-'+tabs[0].id]?.version !== '0.3.0' ||
          !config.enabled || !config.colorTabs || !config.soundName || !permitted ||
          chrome.runtime.getManifest().version !== '0.3.0') throw Error();
      targetId=tabs[0].id;baseline=config.playedCount;
      timer=setInterval(sample,500);el('stop').disabled=false;el('heard').disabled=false;
      await sample();
    } catch {canary.fail('PRECONDITION_REQUIRED');stop();}
    render();
  });
  el('heard').addEventListener('change',()=>{canary?.confirmAudio(el('heard').checked);if (canary) render();});
  el('stop').addEventListener('click',()=>{stop();if (canary.result.status === 'pending') canary.result.reason='STOPPED_PENDING';render();});
})();
