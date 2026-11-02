/* The server owns run progress. This scheduler only issues explicitly authorized bets. */
window.createPlinkoAutobet = function ({api,onDrop,onChange,onError}) {
  let run=null,running=false,busy=false,timer=null,generation=0;
  const state=()=>({run,running,busy});
  const notify=()=>onChange(state());
  async function load(){
    if(running||busy)return run;
    const version=generation;
    const data=await api('/plinko/auto');
    if(version===generation&&!running&&!busy){run=data.run;notify();}
    return run;
  }
  async function tick(version){
    if(!running||version!==generation)return;
    try{
      const result=await onDrop({...run.settings,autoRunId:run.runId,autoIndex:run.nextIndex});
      if(version!==generation||!running)return;
      if(!result?.autoRun)throw new Error('Could not confirm autobet progress. Recover the round first.');
      run={...run,...result.autoRun};
      if(run.status!=='running')running=false;
      notify();
      if(running)timer=setTimeout(()=>tick(version),run.settings.intervalMs);
    }catch(error){
      if(version!==generation)return;
      running=false;clearTimeout(timer);notify();onError(error);
    }
  }
  async function start(settings){
    if(busy||running)return;
    busy=true;notify();
    const version=++generation;
    try{
      if(run?.status!=='running'){
        const data=await api('/plinko/auto/start','POST',{runId:crypto.randomUUID(),...settings});
        if(version!==generation)return;
        run=data.run;
      }
      if(run.status!=='running'){busy=false;notify();return;}
      running=true;busy=false;notify();tick(version);
    }catch(error){busy=false;notify();onError(error);load().catch(()=>{});}
  }
  async function stop(){
    running=false;clearTimeout(timer);++generation;
    if(!run||run.status!=='running'){notify();return;}
    busy=true;notify();
    try{run=(await api('/plinko/auto/stop','POST',{runId:run.runId})).run;}
    catch(error){onError(error);}
    finally{busy=false;notify();}
  }
  return {start,stop,load,state};
};
