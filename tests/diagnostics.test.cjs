const {test}=require('node:test');const assert=require('node:assert/strict');
const {describe}=require('../extension/diagnostics.js');
const base={config:{enabled:true,colorTabs:true,soundName:'example.wav'},record:{version:'0.2.1',state:'generating',owner:{color:'yellow'}},permitted:true,version:'0.2.1',now:10000};
test('ownership uncertainty never claims a manual edit',()=>{
  assert.equal(describe({...base,record:{...base.record,colorSkipped:'changed'}}).color,
    'グループの管理状態を確認できないため、色を変更していません。');
});
test('color enabled does not hide that automatic notifications are off',()=>{
  const r=describe({...base,config:{...base.config,enabled:false}});assert.match(r.status,/オフ/);assert.equal(r.color,'');
});
test('old content scripts prompt a safe reload after the current answer finishes',()=>{
  const r=describe({...base,record:{...base.record,version:'0.2.0'}});assert.match(r.status,/更新が必要/);assert.match(r.detail,/応答が終わってから/);
});
test('a color permission problem is distinct from active detection',()=>{
  const r=describe({...base,permitted:false});assert.match(r.status,/作業中を検知/);assert.match(r.color,/権限がありません/);
});
test('group errors and existing groups are shown as a reason, not a colored tab',()=>{
  assert.match(describe({...base,record:{...base.record,owner:undefined,colorSkipped:'grouped'}}).color,/既存のグループ/);
  assert.match(describe({...base,record:{...base.record,colorError:'API error'}}).color,/API error/);
});
test('no reply and a stale check are not displayed as healthy background monitoring',()=>{
  assert.match(describe({...base,probe:{issue:'no-reply',at:9000}}).status,/応答がありません/);
  assert.match(describe({...base,now:30000,probe:{issue:'',at:9000}}).status,/遅れています/);
});
test('frozen tab and healthy hidden tab show distinct diagnostic states',()=>{
  assert.match(describe({...base,probe:{issue:'frozen',at:9000}}).status,/休止/);
  const r=describe({...base,probe:{issue:'',at:9000,visibility:'hidden'}});
  assert.match(r.status,/作業中を検知/);assert.match(r.probe,/非表示タブ/);
});
