import assert from 'node:assert/strict';
import { PermissionFlagsBits } from 'discord.js';
import { createWebServer } from '../src/web/server.js';
import { shutdownWebCrash } from '../src/web/playApi.js';
if (process.env.MOONFLIP_ISOLATED_TEST !== '1' || process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN) throw new Error('Run only in an isolated copy without Discord credentials');
process.env.DASHBOARD_PASSWORD='test-password';
let everyoneUpdated=0, roleUpdated=0;
const everyone={id:'everyone',async setPermissions(){everyoneUpdated++}};
const dangerous={id:'role',name:'Member',managed:false,permissions:{has:p=>p===PermissionFlagsBits.Administrator,remove(){return this}},async setPermissions(){roleUpdated++}};
const guild={roles:{everyone,async fetch(){return new Map([['everyone',everyone],['role',dangerous]])}}};
const server=createWebServer({fetchGuildFn:async()=>guild}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
try {
 const res=await fetch(`http://127.0.0.1:${server.address().port}/api/roles/fix-permissions`,{method:'POST',headers:{authorization:'Basic '+Buffer.from('admin:test-password').toString('base64'),'content-type':'application/json'},body:'{}'});
 assert.equal(res.status,200,await res.text());assert.equal(everyoneUpdated,1);assert.equal(roleUpdated,1);
} finally {await shutdownWebCrash();server.closeAllConnections();await new Promise(r=>server.close(r));}
console.log('Dashboard role hardening passed');
process.exit(0);
