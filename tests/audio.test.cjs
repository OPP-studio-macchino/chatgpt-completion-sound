const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
function harness(mode='ended'){
 let listener,plays=0,cleaned=false;const player={volume:0,src:'',pause(){},removeAttribute(){cleaned=true;},load(){},play(){plays++;if(mode==='reject')return Promise.reject(Error('blocked'));queueMicrotask(()=>mode==='error'?player.onerror():player.onended());return Promise.resolve();}};
 const chrome={runtime:{id:'fixture',onMessage:{addListener:f=>listener=f}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../extension/offscreen.js'),'utf8'),{chrome,document:{getElementById:()=>player},setTimeout,clearTimeout,console});
 function send(overrides={}){return new Promise(resolve=>listener({target:'offscreen',type:'PLAY',key:'k',data:'data:audio/wav;base64,fixture',volume:.8,...overrides},{id:'fixture'},resolve));}
 return {send,player,plays:()=>plays,cleaned:()=>cleaned};
}
test('audio acknowledgement waits for ended and releases media',async()=>{const h=harness();const r=await h.send();assert.equal(r.ok,true);assert.equal(h.cleaned(),true);assert.equal(h.player.volume,.8);});
test('offscreen document deduplicates event after worker reconnect',async()=>{const h=harness();await h.send();const r=await h.send();assert.equal(r.duplicate,true);assert.equal(h.plays(),1);});
test('browser audio rejection reports failure',async()=>{const h=harness('reject');assert.equal((await h.send()).ok,false);assert.equal(h.cleaned(),true);});
test('invalid audio produces an error',async()=>{const h=harness('error');assert.equal((await h.send()).ok,false);});
test('network URLs are never played',async()=>{const h=harness();assert.equal((await h.send({data:'https://example.com/sound.wav'})).ok,false);assert.equal(h.plays(),0);});
test('volume is clamped',async()=>{const h=harness();await h.send({volume:20});assert.equal(h.player.volume,1);});
