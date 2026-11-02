window.createAppearanceUI = function ({api,state}) {
  const dialog=document.getElementById('appearanceDialog');
  const status=document.getElementById('appearanceStatus');
  const choices=[...document.querySelectorAll('[data-theme-choice]')];
  const themes=['obsidian','midnight','forest'];
  let theme='obsidian',loadedUser=null,saving=false,loading=false,version=0;
  function apply(value){
    theme=themes.includes(value)?value:'obsidian';
    document.documentElement.setAttribute('data-theme',theme);
    choices.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.themeChoice===theme)));
  }
  function lock(value){choices.forEach(button=>button.disabled=value);}
  async function profile(){
    if(!state.authenticated){loadedUser=null;return;}
    if(loadedUser===state.userId||saving||loading)return;
    loading=true;lock(true);const userId=state.userId,revision=++version;
    try{
      const preference=await api('/preferences');
      if(state.userId===userId&&revision===version){apply(preference.theme);loadedUser=userId;status.textContent='Saved to your account.';}
    }catch{status.textContent='Could not load your theme. Reopen to retry.';}
    finally{loading=false;lock(false);}
  }
  choices.forEach(button=>button.addEventListener('click',async()=>{
    if(saving||loading)return;
    const value=button.dataset.themeChoice;
    if(!state.authenticated){apply(value);status.textContent='Preview for this visit. Link your wallet to save.';return;}
    saving=true;lock(true);status.textContent='Saving…';
    try{const result=await api('/preferences','PUT',{theme:value});apply(result.theme);status.textContent='Saved to your account.';}
    catch{status.textContent='Theme was not saved. Please try again.';}
    finally{saving=false;lock(false);}
  }));
  document.getElementById('closeAppearance').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  document.querySelectorAll('[data-open-appearance]').forEach(button=>button.addEventListener('click',()=>{
    dialog.showModal();status.textContent=state.authenticated?'Choose your look.':'Preview for this visit. Link your wallet to save.';profile();
  }));
  apply(theme);
  return {profile};
};
