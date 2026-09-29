import './tab-colors.js';
import './background-watch.js';

const DEFAULTS = {enabled:false, soundName:'', volume:0.8, playedCount:0, lastError:''};
const tabColors = new globalThis.ChappyTabColors(chrome);
const backgroundWatch = new globalThis.ChappyBackgroundWatch(chrome, {setTimeout,clearTimeout});
let creating, queue = Promise.resolve();
let hydrationStarted = false;
const NETWORK_COMPLETION_PATHS = new Set([
  '/backend-api/f/conversation',
  '/backend-api/conversation',
  '/backend-api/codex/responses'
]);
function candidateNetworkCompletion(details) {
  if (!Number.isInteger(details?.tabId) || details.tabId < 0 || details.frameId !== 0 ||
      details.method !== 'POST' || details.statusCode < 200 || details.statusCode >= 300) return false;
  try {
    const url = new URL(details.url);
    return url.origin === 'https://chatgpt.com' && NETWORK_COMPLETION_PATHS.has(url.pathname);
  } catch { return false; }
}
async function hydrateOpenChats() {
  if (hydrationStarted) return;
  hydrationStarted = true;
  if (chrome.scripting?.executeScript) {
    // Do not request the broad `tabs` permission just to read tab URLs. Try every
    // tab id; host_permissions lets injection succeed only on chatgpt.com.
    const tabs = await chrome.tabs.query({});
    await Promise.all(tabs.filter(t=>Number.isInteger(t.id)).map(async t => {
      try {await chrome.scripting.executeScript({target:{tabId:t.id,frameIds:[0]},files:['detector.js','dom-reader.js','content.js']});}
      catch {}
    }));
  }
  // Extension reload can clear storage.session. Hydrate first so legacy tab
  // evidence exists before adopting canonical singleton groups.
  await tabColors.migrateLegacyOwners();
}
function ownPage(sender) {
  return sender.id === chrome.runtime.id && typeof sender.url === 'string' &&
    ['options.html','popup.html'].some(p => sender.url === chrome.runtime.getURL(p));
}
function chatPage(sender) {
  try {return sender.id === chrome.runtime.id && Number.isInteger(sender.tab?.id) &&
    sender.frameId === 0 && new URL(sender.url).origin === 'https://chatgpt.com';} catch {return false;}
}
async function offscreen() {
  if (!chrome.offscreen) throw new Error('このブラウザはバックグラウンド音声再生に対応していません。Chrome 120以降を使用してください。');
  if (creating) return creating;
  creating = (async () => {
    const contexts = await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT'],documentUrls:[chrome.runtime.getURL('offscreen.html')]});
    if (!contexts.length) await chrome.offscreen.createDocument({url:'offscreen.html', reasons:['AUDIO_PLAYBACK'], justification:'Play the user-selected sound after a ChatGPT response ends.'});
  })();
  try {await creating;} finally {creating = null;}
}
async function play(key) {
  const c = await chrome.storage.local.get({...DEFAULTS, soundData:''});
  if (!c.soundData) throw new Error('設定画面で完了音声のWAVファイルを選んでください。');
  await offscreen();
  const result = await chrome.runtime.sendMessage({target:'offscreen', type:'PLAY', key, data:c.soundData, volume:c.volume});
  if (!result?.ok) throw new Error(result?.error || '音声を再生できませんでした。');
  await chrome.storage.local.set({lastError:'', lastPlayed:Date.now(), playedCount:c.playedCount + 1});
  return result;
}
async function complete(key) {
  if (!/^[a-f0-9]{64}$/.test(key || '')) throw new Error('Invalid event');
  const {enabled} = await chrome.storage.local.get(DEFAULTS);
  if (!enabled) return {ok:true, ignored:'disabled'};
  const {seen = []} = await chrome.storage.session.get('seen');
  if (seen.includes(key)) return {ok:true, ignored:'duplicate'};
  // Reserve before playback: worker restarts must not repeat a notification.
  await chrome.storage.session.set({seen:[...seen,key].slice(-300)});
  return play(key);
}
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.target !== 'background') return false;
  if (msg.type === 'STATUS' && chatPage(sender)) {
    const allowed = ['off','waiting','error','generating','complete','watching'];
    if (!allowed.includes(msg.state)) {reply({ok:false,error:'Invalid state'}); return false;}
    const id = sender.tab.id;
    const metadata = {version:/^\d+\.\d+\.\d+$/.test(msg.version || '') ? msg.version : '',visibility:msg.visibility === 'hidden' ? 'hidden' : 'visible'};
    Promise.all([tabColors.set(id, msg.state, metadata),backgroundWatch.track(id, msg.state, sender.documentId)])
      .then(() => reply({ok:true})).catch(() => reply({ok:false}));
    return true;
  }
  if (msg.type === 'CANCEL' && chatPage(sender)) {
    const id = sender.tab.id;
    Promise.all([
      tabColors.set(id, 'watching', {version:/^\d+\.\d+\.\d+$/.test(msg.version || '') ? msg.version : '',visibility:msg.visibility === 'hidden' ? 'hidden' : 'visible'}),
      backgroundWatch.track(id, 'watching', sender.documentId)
    ]).then(() => reply({ok:true})).catch(() => reply({ok:false}));
    return true;
  }
  let action;
  if (msg.type === 'COMPLETE' && chatPage(sender)) action = () => complete(msg.key);
  else if (msg.type === 'TEST' && ownPage(sender)) action = () => play('test-'+crypto.randomUUID());
  else {reply({ok:false,error:'Unsupported request'});return false;}
  const job = queue.then(action);
  queue = job.catch(() => {});
  job.then(reply).catch(async e => {
    const error = e.message || '音声再生に失敗しました。';
    await chrome.storage.local.set({lastError:error});
    reply({ok:false,error});
  });
  return true;
});
chrome.tabs.onRemoved.addListener(id => {void tabColors.remove(id);void backgroundWatch.remove(id);});
chrome.tabs.onUpdated.addListener((id, changes) => {
  if (changes.status === 'loading') {void tabColors.reset(id);void backgroundWatch.remove(id);}
});
// Transport completion only prompts a DOM check; it is not task completion.
chrome.webRequest?.onCompleted?.addListener(details => {
  if (candidateNetworkCompletion(details)) void backgroundWatch.probe(details.tabId).catch(() => {});
},
  {urls:['https://chatgpt.com/backend-api/*']});
chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'}).catch(() => {});
  void hydrateOpenChats().catch(() => {});
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.enabled || changes.colorTabs) void tabColors.refresh(!!changes.colorTabs);
  if (!changes.enabled) return;
  void backgroundWatch.restore();
  void chrome.storage.session.get(null).then(entries => {
    for (const key of Object.keys(entries)) if (key.startsWith('tab-')) {
      void chrome.tabs.sendMessage(Number(key.slice(4)),{type:'SET_ENABLED',enabled:changes.enabled.newValue === true}).catch(()=>{});
    }
  });
});
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === globalThis.ChappyBackgroundWatch.ALARM) void backgroundWatch.restore();
});
void (async () => {
  await backgroundWatch.restore();
  await hydrateOpenChats();
})().catch(() => {});
chrome.permissions.onRemoved.addListener(permissions => {
  if (permissions.permissions?.includes('tabGroups')) void chrome.storage.local.set({colorTabs:false});
});
// Only expose the monitoring boolean to content scripts. No audio or other settings.
chrome.runtime.onMessage.addListener((msg,sender,reply) => {
  if (msg?.target === 'settings' && msg.type === 'GET_ENABLED' && chatPage(sender)) {
    chrome.storage.local.get({enabled:false}).then(c=>reply({enabled:c.enabled})); return true;
  }
  return false;
});
