const flush = async () => {await new Promise(setImmediate);await new Promise(setImmediate);};
function fakeClock() {
  let time=0, id=0;
  const jobs=new Map();
  return {
    now:()=>time,
    setTimeout:(fn,delay=0)=>{jobs.set(++id,{fn,at:time+delay});return id;},
    clearTimeout:key=>jobs.delete(key),
    clearAll:()=>jobs.clear(),
    pending:()=>jobs.size,
    async advance(ms) {
      const end=time+ms;
      for(let count=0;;count++) {
        if(count>1000)throw new Error('Runaway timer');
        const due=[...jobs].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
        if(!due)break;
        time=due[1].at;jobs.delete(due[0]);due[1].fn();await flush();
      }
      time=end;await flush();
    }
  };
}
module.exports={fakeClock,flush};
