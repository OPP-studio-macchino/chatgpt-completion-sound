const clone = value => structuredClone(value);
function fixture(config = {}) {
  const local = {enabled:true, colorTabs:true, ...config}, session = {}, edits = [];
  const tabs = new Map([[1,{id:1,groupId:-1,pinned:false,windowId:3}],[2,{id:2,groupId:-1,pinned:false,windowId:4}]]);
  const groups = new Map(), alarms = new Map(); let nextGroup = 100, permitted = true;
  const events = {};
  const event = name => ({addListener:fn => (events[name] ||= []).push(fn)});
  const store = data => ({
    get:async q => q === null ? clone(data) : typeof q === 'string' ? clone({[q]:data[q]}) : clone(Object.fromEntries(Object.entries(q).map(([k,v])=>[k,k in data?data[k]:v]))),
    set:async values => {Object.assign(data,clone(values));},
    remove:async key => {delete data[key];}, setAccessLevel:async()=>{}
  });
  const api = {
    storage:{local:store(local),session:store(session),onChanged:event('storage')},
    permissions:{contains:async()=>permitted, onRemoved:event('permissions')},
    alarms:{get:async name=>clone(alarms.get(name)),create:async(name,info)=>{alarms.set(name,{name,...info});},clear:async name=>alarms.delete(name),onAlarm:event('alarm')},
    tabs:{
      get:async id=>{if(!tabs.has(id))throw new Error('No tab');return clone(tabs.get(id));},
      query:async q=>clone(q.groupId===undefined?[...tabs.values()]:[...tabs.values()].filter(t=>t.groupId===q.groupId)),
      group:async q=>{const id=nextGroup++;for(const tabId of q.tabIds)tabs.get(tabId).groupId=id;groups.set(id,{id,title:'',color:'grey',shared:false});edits.push(['group',clone(q)]);return id;},
      ungroup:async id=>{const tab=tabs.get(id);const groupId=tab.groupId;tab.groupId=-1;groups.delete(groupId);edits.push(['ungroup',id]);},
      sendMessage:async()=>{},onRemoved:event('removed'),onUpdated:event('updated')
    },
    tabGroups:{
      get:async id=>{if(!groups.has(id))throw new Error('No group');return clone(groups.get(id));},
      update:async(id,look)=>{Object.assign(groups.get(id),clone(look));edits.push(['update',id,clone(look)]);return clone(groups.get(id));}
    }
  };
  return {api,local,session,tabs,groups,alarms,edits,events,permit:value=>{permitted=value;}};
}
module.exports = fixture;
