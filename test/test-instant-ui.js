import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
// Minimal DOM boundary; execute the production controller, including its real retry flow.
const nodes=new Map(), store=new Map();
class Node {
  constructor(){this.value='';this.hidden=false;this.textContent='';this.classList={toggle(){}};this.handlers={};this.children=[];}
  addEventListener(name,handler){this.handlers[name]=handler;}
  querySelectorAll(){return [];}
  querySelector(){return new Node();}
  setAttribute(){}
  appendChild(node){this.children.push(node);return node;}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
}
const node=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);};
node('instantForm').elements={coinSide:{value:'heads'}};
node('plinkoRows').value='16';node('plinkoRisk').value='medium';
const key='moonflip_pending_instant_123_plinko';
const request={roundId:'00000000-0000-4000-8000-000000000123',wager:30,rows:8,risk:'high'};
store.set(key,JSON.stringify(request));
const context={window:{},document:{getElementById:node,createElement:()=>new Node(),createElementNS:()=>new Node()},
  localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
  matchMedia:()=>({matches:true}),console};
vm.runInNewContext(readFileSync(new URL('../src/web/public/play/instant-games.js',import.meta.url),'utf8'),context);
const state={userId:'123',authenticated:true,balance:1000};
const controller=context.window.createInstantGamesUI({state,updateBalance(){},refreshProfile(){},
  async api(path){if(path.endsWith('/config'))return {plinko:{8:{high:Array(9).fill(.2)},16:{medium:Array(17).fill(.3)}}};
    if(path.endsWith('/history'))return {rounds:[]};
    if(path.endsWith('/play')){const error=new Error('Session expired');error.status=401;throw error;}
    throw new Error('Unexpected API path');}});
await controller.show('plinko');
assert.equal(Number(node('instantWager').value),30);
assert.equal(Number(node('plinkoRows').value),8);
assert.equal(node('plinkoRisk').value,'high');
await node('instantForm').handlers.submit({preventDefault(){}});
assert.equal(store.get(key),JSON.stringify(request),'401 must preserve recovery ID and exact request');
assert.match(node('instantMessage').textContent,/Reconnect/);
console.log('Pending Plinko settings and expired-session recovery regressions passed');
