const {test}=require('node:test');const assert=require('node:assert/strict');
const TabColors=require('../extension/tab-colors.js');const fixture=require('./chrome-fixture.cjs');
function setup(config){const f=fixture(config);return {...f,manager:new TabColors(f.api)};}
test('yellow then blue uses one group in the tab own window, without focusing',async()=>{
 const f=setup();await f.manager.set(2,'generating');const id=f.tabs.get(2).groupId;
 assert.equal(f.groups.get(id).color,'yellow');assert.equal(f.edits[0][1].createProperties.windowId,4);
 await f.manager.set(2,'complete');assert.equal(f.tabs.get(2).groupId,id);assert.equal(f.groups.get(id).color,'blue');assert.equal(f.edits.filter(e=>e[0]==='group').length,1);
});
test('separate tabs retain independent colors',async()=>{const f=setup();await Promise.all([f.manager.set(1,'generating'),f.manager.set(2,'complete')]);assert.equal(f.groups.get(f.tabs.get(1).groupId).color,'yellow');assert.equal(f.groups.get(f.tabs.get(2).groupId).color,'blue');});
test('settled blue persists on heartbeat and turns yellow on next task',async()=>{const f=setup();await f.manager.set(1,'complete');const count=f.edits.length;await f.manager.set(1,'complete');assert.equal(f.edits.length,count);await f.manager.set(1,'generating');assert.equal(f.groups.get(f.tabs.get(1).groupId).color,'yellow');});
test('optional permission denial creates no groups',async()=>{const f=setup();f.permit(false);await f.manager.set(1,'generating');assert.equal(f.edits.length,0);assert.equal(f.session['tab-1'].colorSkipped,'permission');});
test('disabled sound or color settings create no groups',async()=>{for(const c of [{enabled:false},{colorTabs:false}]){const f=setup(c);await f.manager.set(1,'generating');assert.equal(f.edits.length,0);}});
test('pinned, existing group and split tabs are preserved',async()=>{for(const flags of [{pinned:true},{groupId:99},{splitViewId:5}]){const f=setup();Object.assign(f.tabs.get(1),flags);await f.manager.set(1,'generating');assert.equal(f.edits.length,0);assert.ok(f.session['tab-1'].colorSkipped);}});
test('cancel, navigation, error and waiting remove owned color groups',async()=>{for(const state of ['watching','error','waiting','off']){const f=setup();await f.manager.set(1,'generating');await f.manager.set(1,state);assert.equal(f.tabs.get(1).groupId,-1);assert.equal(f.session['tab-1'].owner,undefined);}});
test('turning off colors releases all unchanged owned groups',async()=>{const f=setup();await f.manager.set(1,'complete');await f.manager.set(2,'generating');f.local.colorTabs=false;await f.manager.refresh();assert.equal(f.tabs.get(1).groupId,-1);assert.equal(f.tabs.get(2).groupId,-1);});
test('manual rename, recolor, share or extra members prevents modifying a group',async()=>{
 for(const change of ['title','color','shared','members']){const f=setup();await f.manager.set(1,'generating');const id=f.tabs.get(1).groupId;
 if(change==='members')f.tabs.get(2).groupId=id;else f.groups.get(id)[change]=change==='shared'?true:change==='title'?'My work':'red';
 const count=f.edits.length;await f.manager.set(1,'complete');f.local.colorTabs=false;await f.manager.refresh();assert.equal(f.edits.length,count);assert.equal(f.tabs.get(1).groupId,id);}
});
test('manual ungrouping stays ungrouped until user toggles the setting',async()=>{const f=setup();await f.manager.set(1,'generating');f.tabs.get(1).groupId=-1;await f.manager.set(1,'complete');await f.manager.set(1,'complete');assert.equal(f.tabs.get(1).groupId,-1);await f.manager.refresh(true);assert.notEqual(f.tabs.get(1).groupId,-1);});
test('service-worker restart retains ownership through session storage',async()=>{const f=setup();await f.manager.set(1,'generating');const id=f.tabs.get(1).groupId;const restarted=new TabColors(f.api);await restarted.set(1,'complete');assert.equal(f.tabs.get(1).groupId,id);assert.equal(f.groups.get(id).color,'blue');});
test('extension reload recovers only its persisted singleton group',async()=>{const f=setup();await f.manager.set(1,'generating');const id=f.tabs.get(1).groupId;delete f.session['tab-1'];const restarted=new TabColors(f.api);await restarted.set(1,'complete');assert.equal(f.tabs.get(1).groupId,id);assert.equal(f.groups.get(id).color,'blue');assert.equal(f.session['tab-1'].colorSkipped,'');});
test('persisted ownership is abandoned if the user changed the group',async()=>{const f=setup();await f.manager.set(1,'generating');const id=f.tabs.get(1).groupId;delete f.session['tab-1'];f.groups.get(id).title='My work';const count=f.edits.length;const restarted=new TabColors(f.api);await restarted.set(1,'complete');assert.equal(f.edits.length,count);assert.equal(f.session['tab-1'].colorSkipped,'grouped');assert.equal(f.local['_chappy-owner-1'],undefined);});
test('browser-restored unknown group is never adopted from its title',async()=>{const f=setup();await f.manager.set(1,'generating');delete f.session['tab-1'];delete f.local['_chappy-owner-1'];const count=f.edits.length;await f.manager.set(1,'complete');assert.equal(f.edits.length,count);assert.equal(f.session['tab-1'].colorSkipped,'grouped');});
test('closing a tab during an update does not leave stale session state',async()=>{const f=setup();f.tabs.delete(1);await f.manager.set(1,'generating');assert.equal(f.session['tab-1'],undefined);});
test('navigation in unrelated tabs does not register or modify them',async()=>{const f=setup();await f.manager.reset(2);assert.deepEqual(f.session,{});assert.equal(f.edits.length,0);});
test('group API failure is recorded and a later update can recover',async()=>{const f=setup();const original=f.api.tabGroups.update;f.api.tabGroups.update=async()=>{throw new Error('dragging tab');};await f.manager.set(1,'generating');assert.match(f.session['tab-1'].colorError,/dragging/);f.api.tabGroups.update=original;await f.manager.set(1,'complete');assert.equal(f.session['tab-1'].colorError,'');assert.equal(f.groups.get(f.tabs.get(1).groupId).color,'blue');});
test('unnamed groups with an omitted optional title can turn yellow and blue',async()=>{
 const f=setup();const originalGet=f.api.tabGroups.get;
 f.api.tabGroups.get=async id=>{const group=await originalGet(id);if(group.title==='')delete group.title;return group;};
 await f.manager.set(1,'generating');const groupId=f.tabs.get(1).groupId;
 assert.equal(f.groups.get(groupId).color,'yellow');assert.equal(f.session['tab-1'].userOverride,undefined);
 await f.manager.set(1,'complete');assert.equal(f.groups.get(groupId).color,'blue');
 await f.manager.set(1,'off');assert.equal(f.tabs.get(1).groupId,-1);
});
test('v0.2.4 migration adopts a canonical legacy singleton and immediately applies current state',async()=>{
 const f=setup();f.tabs.get(1).groupId=77;f.groups.set(77,{id:77,title:'チャッピー · 完了',color:'blue',shared:false});
 f.session['tab-1']={state:'generating',version:'0.2.3',visibility:'visible',colorSkipped:'grouped'};
 const migrated=await f.manager.migrateLegacyOwners();
 assert.equal(migrated,1);assert.equal(f.groups.get(77).color,'yellow');assert.equal(f.groups.get(77).title,'チャッピー · 作業中');
 assert.equal(f.local['_chappy-owner-1'].groupId,77);assert.equal(f.session['tab-1'].colorSkipped,'');
});
test('v0.2.4 migration never adopts a legacy-looking group with extra members',async()=>{
 const f=setup();f.tabs.get(1).groupId=77;f.tabs.get(2).groupId=77;f.groups.set(77,{id:77,title:'チャッピー · 完了',color:'blue',shared:false});
 f.session['tab-1']={state:'generating',version:'0.2.3',visibility:'visible',colorSkipped:'grouped'};
 assert.equal(await f.manager.migrateLegacyOwners(),0);assert.equal(f.groups.get(77).color,'blue');assert.equal(f.local['_chappy-owner-1'],undefined);
});
test('v0.2.4 migration respects renamed recolored shared and ordinary existing groups',async()=>{
 for(const group of [
  {id:77,title:'My work',color:'blue',shared:false},
  {id:77,title:'チャッピー · 完了',color:'red',shared:false},
  {id:77,title:'チャッピー · 完了',color:'blue',shared:true},
  {id:77,title:'Project',color:'grey',shared:false}
 ]) {
  const f=setup();f.tabs.get(1).groupId=77;f.groups.set(77,group);f.session['tab-1']={state:'generating',version:'0.2.3',visibility:'visible'};
  assert.equal(await f.manager.migrateLegacyOwners(),0);assert.equal(f.local['_chappy-owner-1'],undefined);assert.equal(f.tabs.get(1).groupId,77);
 }
});
test('v0.2.4 legacy migration is one-time after legacy evidence is checked',async()=>{
 const f=setup();f.tabs.get(1).groupId=77;f.groups.set(77,{id:77,title:'チャッピー · 完了',color:'blue',shared:false});
 f.session['tab-1']={state:'complete',version:'0.2.3',visibility:'visible'};assert.equal(await f.manager.migrateLegacyOwners(),1);
 f.tabs.get(2).groupId=88;f.groups.set(88,{id:88,title:'チャッピー · 完了',color:'blue',shared:false});f.session['tab-2']={state:'generating',version:'0.2.3',visibility:'visible'};
 assert.equal(await f.manager.migrateLegacyOwners(),0);assert.equal(f.local['_chappy-owner-2'],undefined);assert.equal(f.groups.get(88).color,'blue');
});

test('v0.2.8 migration adopts a v0.2.5 canonical singleton even after earlier migration markers',async()=>{
 const f=setup();f.local['_chappy-legacy-owner-migration-0.2.4']=true;f.local['_chappy-legacy-owner-migration-0.2.5']=true;
 f.tabs.get(1).groupId=91;f.groups.set(91,{id:91,title:'チャッピー · 完了',color:'blue',shared:false});
 f.session['tab-1']={state:'generating',version:'0.2.5',visibility:'visible',colorSkipped:'grouped'};
 assert.equal(await f.manager.migrateLegacyOwners(),1);assert.equal(f.groups.get(91).color,'yellow');
 assert.equal(f.local['_chappy-owner-1'].groupId,91);assert.equal(f.local['_chappy-legacy-owner-migration-0.2.9'],true);
});

test('v0.2.8 recovers a canonical singleton from persistent migration history without session evidence',async()=>{const f=setup();f.local['_chappy-legacy-owner-migration-0.2.7']=true;f.tabs.get(1).groupId=77;f.groups.set(77,{id:77,title:'チャッピー · 完了',color:'blue',shared:false});assert.equal(await f.manager.migrateLegacyOwners(),1);assert.equal(f.local['_chappy-owner-1'].groupId,77);});
test('v0.2.8 history recovery still respects ordinary groups',async()=>{const f=setup();f.local['_chappy-legacy-owner-migration-0.2.7']=true;f.tabs.get(1).groupId=77;f.groups.set(77,{id:77,title:'Project',color:'blue',shared:false});assert.equal(await f.manager.migrateLegacyOwners(),0);assert.equal(f.local['_chappy-owner-1'],undefined);});
test('v0.2.8 does not adopt a canonical-looking group without Chappy history',async()=>{const f=setup();f.tabs.get(1).groupId=77;f.groups.set(77,{id:77,title:'チャッピー · 完了',color:'blue',shared:false});assert.equal(await f.manager.migrateLegacyOwners(),0);assert.equal(f.local['_chappy-owner-1'],undefined);});

test('manual stop neutralizes owned group before ungroup to avoid stale blue UI',async()=>{
 const f=setup();await f.manager.set(1,'complete');const id=f.tabs.get(1).groupId;
 await f.manager.set(1,'watching');
 const neutral=f.edits.find(e=>e[0]==='update'&&e[1]===id&&e[2]?.color==='grey'&&e[2]?.title==='');
 assert.ok(neutral);assert.equal(f.tabs.get(1).groupId,-1);
});
