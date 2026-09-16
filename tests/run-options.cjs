const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {parseHTML}=require(require.resolve('linkedom',{paths:[process.env.CHAPPY_DOM_DEPENDENCIES||__dirname]}));
(async()=>{
 const {document,window}=parseHTML(fs.readFileSync(require.resolve('../extension/options.html'),'utf8'));
 const local={enabled:true,soundName:'example.wav',volume:.8,colorTabs:false};let granted=false,requests=0,inGesture=false;
 const chrome={storage:{local:{get:async d=>({...d,...local}),set:async o=>Object.assign(local,o)}},permissions:{request:async p=>{assert.ok(inGesture);assert.equal(JSON.stringify(p),JSON.stringify({permissions:['tabGroups']}));requests++;return granted;}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../extension/options.js'),'utf8'),{document,chrome,console});
 const wait=()=>new Promise(setImmediate);await wait();assert.equal(requests,0);console.log('PASS 設定を開くだけでは権限を要求しない');
 const checkbox=document.getElementById('colorTabs');
 async function toggle(value){checkbox.checked=value;inGesture=true;checkbox.dispatchEvent(new window.Event('change'));inGesture=false;await wait();}
 await toggle(true);assert.equal(local.colorTabs,false);assert.equal(local.enabled,true);assert.equal(checkbox.checked,false);console.log('PASS 権限拒否時は色のみオフで音声設定を保持');
 granted=true;await toggle(true);assert.equal(local.colorTabs,true);assert.equal(checkbox.checked,true);console.log('PASS ユーザー操作中に権限を取得して色を有効化');
 const count=requests;await toggle(false);assert.equal(local.colorTabs,false);assert.equal(requests,count);assert.equal(checkbox.disabled,false);console.log('PASS 色の停止では権限要求を繰り返さない');
 console.log('TOTAL 4 / FAIL 0');
})().catch(e=>{console.error(e);process.exitCode=1;});
