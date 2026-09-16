const $ = id => document.getElementById(id);
function status(text,error=false) {$('status').textContent=text;$('status').className=error?'error':'success';}
async function render() {
  const c = await chrome.storage.local.get({enabled:false,soundName:'',volume:.8,colorTabs:false});
  $('enabled').checked=c.enabled;$('enabled').disabled=!c.soundName;
  $('filename').textContent=c.soundName || '音声未設定';$('test').disabled=!c.soundName;
  $('match').textContent=c.soundName?'選択した音声をブラウザ内に保存しています。':'';
  $('colorTabs').checked=c.colorTabs;
  $('volume').value=Math.round(c.volume*100);$('volumeValue').value=Math.round(c.volume*100)+'%';
}
$('sound').addEventListener('change', async () => {
  const file = $('sound').files[0]; if(!file)return;
  try {
    if(file.size>5*1024*1024)throw new Error('5MB以下のWAVファイルを選んでください。');
    const bytes=await file.arrayBuffer();const view=new Uint8Array(bytes);
    if(String.fromCharCode(...view.slice(0,4))!=='RIFF'||String.fromCharCode(...view.slice(8,12))!=='WAVE')throw new Error('WAV形式を確認できませんでした。');
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    const blob=new Blob([bytes],{type:'audio/wav'});
    const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
    await chrome.storage.local.set({soundData:data,soundName:file.name,soundHash:hash,lastError:''});
    await render();status('音声を保存しました。再生テストのあと、自動通知を有効にしてください。');
  } catch(e) {status(e.message||'音声を保存できませんでした。',true);}
});
$('volume').addEventListener('input',()=>{$('volumeValue').value=$('volume').value+'%';});
$('volume').addEventListener('change',()=>{void chrome.storage.local.set({volume:Number($('volume').value)/100});});
$('enabled').addEventListener('change',async()=>{await chrome.storage.local.set({enabled:$('enabled').checked});status($('enabled').checked?'自動通知を有効にしました。ChatGPTのタブを一度再読み込みしてください。':'自動通知を停止しました。');});
$('colorTabs').addEventListener('change',async()=>{
  const wanted=$('colorTabs').checked;
  $('colorTabs').disabled=true;
  try {
    // Request directly from this user gesture, never during background work.
    const granted=!wanted || await chrome.permissions.request({permissions:['tabGroups']});
    await chrome.storage.local.set({colorTabs:wanted && granted});
    status(!granted?'タブの色はオフです。音声通知はそのまま使えます。':wanted?'色の通知を有効にしました。自動通知がオンのとき、作業中は黄色、完了は青色になります。':'色の通知を停止し、専用グループを解除しています。');
  }catch(e){status(e.message||'設定を変更できませんでした。',true);}
  finally{$('colorTabs').disabled=false;await render();}
});
$('test').addEventListener('click',async()=>{
  $('test').disabled=true;status('再生しています…');
  try {const r=await chrome.runtime.sendMessage({target:'background',type:'TEST'});status(r?.ok?'再生が終了しました。音が聞こえたことを確認してください。':r?.error||'再生できませんでした。',!r?.ok);}catch(e){status(e.message,true);}
  finally {await render();}
});
render().catch(e=>status(e.message,true));
