import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../src/web/public/play/app.js', import.meta.url), 'utf8');
const start = source.indexOf('  let sseSource = null;');
const end = source.indexOf('  async function fetchCrashState()', start);
let ticketCalls = 0; const streams = []; const timers = [];
const ctx = { URLSearchParams, API_BASE:'/api/play', guestId:'guest', playToken:'secret', document:{hidden:false},
 console:{warn(){}}, fetchCrashState(){}, setTimeout(fn){timers.push(fn);return timers.length},clearTimeout(){},
 async fetch(){ticketCalls++; if(ticketCalls===1)return {ok:false}; return {ok:true,async json(){return {ticket:'ticket'+ticketCalls}}}},
 EventSource:class { constructor(url){this.url=url;streams.push(this)} addEventListener(){} close(){this.closed=true} }
};
vm.createContext(ctx); vm.runInContext(source.slice(start,end)+'\nthis.connect = connectRealtimeStream;',ctx);
await ctx.connect();
assert.equal(streams.length,0,'failed ticket must not connect as guest');
assert.equal(timers.length,1,'failed ticket must schedule retry');
await timers.shift()(); await new Promise(r=>setImmediate(r));
assert.match(streams[0].url,/ticket=ticket2/);
streams[0].onerror(); assert.equal(streams[0].closed,true); await timers.shift()(); await new Promise(r=>setImmediate(r));
assert.match(streams[1].url,/ticket=ticket3/,'reconnect must use a fresh ticket');
console.log('Authenticated stream reconnect passed');
