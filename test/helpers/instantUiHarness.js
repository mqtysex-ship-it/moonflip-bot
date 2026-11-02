import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
export class Element {
  constructor(tag='div'){this.tagName=tag;this.value='';this.hidden=false;this.children=[];this.attrs={};this.handlers={};this.style={};this._text='';this.classList={toggle(){},add(){},remove(){}};}
  addEventListener(name,handler){this.handlers[name]=handler;}
  querySelectorAll(selector){
    const result=[];
    for(const child of this.children){
      if(selector==='rect'&&child.tagName==='rect'||selector==='[data-plinko-ball]'&&'data-plinko-ball' in child.attrs)result.push(child);
      result.push(...child.querySelectorAll(selector));
    }return result;
  }
  querySelector(selector){
    const match=selector.match(/\[data-bucket="(\d+)"\]/);
    if(match){const group=this.children.find(n=>n.attrs['data-bucket']===String(match[1]));return group?.querySelector('rect');}
    return this.querySelectorAll(selector)[0] || new Element();
  }
  setAttribute(key,value){this.attrs[key]=String(value);}
  getAttribute(key){return this.attrs[key];}
  appendChild(node){node.parent=this;this.children.push(node);return node;}
  append(...nodes){nodes.forEach(n=>this.appendChild(n));}
  replaceChildren(...nodes){this.children=[];this._text='';this.append(...nodes);}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
  get lastChild(){return this.children.at(-1);}
  set textContent(value){this._text=String(value);this.children=[];}
  get textContent(){return this._text+this.children.map(n=>n.textContent).join('');}
}
export function uiHarness({onPlay,pending,history=[]}={}){
  const nodes=new Map(),store=new Map(),frames=new Map();let time=0,nextFrame=0;
  const node=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
  node('instantForm').elements={coinSide:{value:'heads'}};node('instantWager').value='100';node('plinkoRows').value='8';node('plinkoRisk').value='high';
  const key='moonflip_pending_instant_123_plinko';if(pending)store.set(key,JSON.stringify(pending));
  const context={AbortController,window:{},document:{getElementById:node,createElement:tag=>new Element(tag),createElementNS:(_ns,tag)=>new Element(tag)},crypto:{randomUUID},
    localStorage:{get length(){return store.size;},key:index=>[...store.keys()][index],getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
    matchMedia:()=>({matches:false}),performance:{now:()=>time},requestAnimationFrame:cb=>{frames.set(++nextFrame,cb);return nextFrame;},cancelAnimationFrame:id=>frames.delete(id),console,setTimeout,clearTimeout};
  vm.runInNewContext(readFileSync(new URL('../../src/web/public/play/instant-games.js',import.meta.url),'utf8'),context);
  const calls=[],state={userId:'123',authenticated:true,balance:1000};
  const controller=context.window.createInstantGamesUI({state,updateBalance(){},refreshProfile(){},
    async api(path,method,request){
      if(path.endsWith('/config'))return {plinko:{8:{high:Array(9).fill(.2)},16:{medium:Array(17).fill(.3)}}};
      if(path.endsWith('/history'))return {rounds:history};
      if(path.endsWith('/play')){calls.push(request);return onPlay(request);}
      throw new Error('Unexpected path '+path);
    }});
  return {node,store,key,calls,controller,history,submit:()=>node('instantForm').handlers.submit({preventDefault(){}}),
    async flush(){await new Promise(r=>setImmediate(r));},step(ms){time+=ms;const batch=[...frames.values()];frames.clear();batch.forEach(cb=>cb(time));}};
}
