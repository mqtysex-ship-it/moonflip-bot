import assert from 'node:assert/strict';
import { PostgresEconomy } from '../src/games/postgresEconomy.js';
const rows = [
  {round_id:'1', discord_user_id:'1', wager:'100', game_state:{engine:'web-global-v1',phase:'IN_FLIGHT',crashPoint:2,autoCashout:1.5,flightStartTime:Date.now()-2000000,flightDurationMs:12000}},
  {round_id:'2', discord_user_id:'2', wager:'100', game_state:{engine:'web-global-v1',phase:'IN_FLIGHT',crashPoint:2,autoCashout:3,flightStartTime:Date.now()-2000000,flightDurationMs:12000}},
];
const payouts=[];
const client={async query(sql,p){if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'||sql.includes('advisory'))return {rows:[]};if(sql.includes('FROM moonflip_private.game_rounds')&&sql.includes("status = 'active'"))return {rows};if(sql.includes('UPDATE moonflip_private.wallets'))return {rows:[{balance:'1000'}]};if(sql.includes('SELECT balance FROM moonflip_private.wallets'))return {rows:[{balance:'900'}]};if(sql.includes('UPDATE moonflip_private.game_rounds')){payouts.push(p[1]);return {rows:[]};}throw Error(sql)},release(){}};
await new PostgresEconomy({query(){},async connect(){return client}}).recoverInterruptedRounds('crash',true,0);
assert.deepEqual(payouts,['150','0'],'recovery must settle persisted flight according to its crash and auto cashout');
console.log('Crash persisted flight recovery passed');
