const player = document.getElementById('player');
const heard = new Set();
chrome.runtime.onMessage.addListener((msg,sender,reply) => {
  if (msg?.target !== 'offscreen' || msg.type !== 'PLAY' || sender.id !== chrome.runtime.id) return false;
  if (heard.has(msg.key)) {reply({ok:true,duplicate:true});return false;}
  if (typeof msg.data !== 'string' || !msg.data.startsWith('data:audio/')) {reply({ok:false,error:'音声データが無効です。'});return false;}
  heard.add(msg.key);
  if (heard.size > 300) heard.delete(heard.values().next().value);
  player.src = msg.data;
  player.volume = Math.min(1,Math.max(0,Number(msg.volume)||0));
  let done = false;
  const finish = result => {if(done)return;done=true;clearTimeout(timeout);player.onended=null;player.onerror=null;player.pause();player.removeAttribute('src');player.load();reply(result);};
  const timeout = setTimeout(()=>finish({ok:false,error:'音声再生が60秒以内に終了しませんでした。'}),60000);
  player.onended = () => finish({ok:true});
  player.onerror = () => finish({ok:false,error:'この音声を再生できません。WAVファイルを選び直してください。'});
  player.play().catch(()=>finish({ok:false,error:'ブラウザが音声再生を拒否しました。設定画面の再生テストをお試しください。'}));
  return true;
});
