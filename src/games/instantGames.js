import { randomInt } from 'node:crypto';

export const MAX_INSTANT_WAGER = 1_000_000;
const profiles = {
  low: {
    8:[5.6,2.1,1.1,1,.5],9:[5.6,2,1.6,1,.7],10:[8.9,3,1.4,1.1,1,.5],
    11:[8.4,3,1.9,1.3,1,.7],12:[10,3,1.6,1.4,1.1,1,.5],13:[8.1,4,3,1.9,1.2,.9,.7],
    14:[7.1,4,1.9,1.4,1.3,1.1,1,.5],15:[15,8,3,2,1.5,1.1,1,.7],16:[16,9,2,1.4,1.4,1.2,1.1,1,.5],
  },
  medium: {
    8:[13,3,1.3,.7,.4],9:[18,4,1.7,.9,.5],10:[22,5,2,1.4,.6,.4],
    11:[24,6,3,1.8,.7,.5],12:[33,11,4,2,1.1,.5,.3],13:[43,13,6,3,1.3,.7,.4],
    14:[58,15,7,4,1.9,1,.5,.2],15:[88,18,11,5,3,1.3,.5,.3],16:[110,41,10,5,3,1.5,1,.5,.3],
  },
  high: {
    8:[29,4,1.5,.3,.2],9:[43,7,2,.6,.2],10:[76,10,3,.9,.3,.2],
    11:[120,14,5.2,1.4,.4,.2],12:[170,24,8.1,2,.7,.2,.2],13:[260,37,11,4,1,.2,.2],
    14:[420,56,18,5,1.9,.3,.2,.2],15:[620,83,27,8,3,.5,.2,.2],16:[1000,130,26,9,4,2,.2,.2,.2],
  },
};
export function plinkoMultipliers(rows, risk) {
  const half = profiles[risk]?.[rows];
  if (!half) throw new Error('Invalid Plinko settings');
  const base = [...half, ...half.slice(0, rows % 2 ? half.length : -1).reverse()];
  let combinations=1, expected=0;
  for(let k=0;k<=rows;k++) { if(k) combinations=combinations*(rows-k+1)/k; expected+=combinations/(2**rows)*base[k]; }
  // Quantize down: rounding must never turn the configured edge into a player advantage.
  return base.map(value=>Math.floor(value*.99/expected*1e6)/1e6);
}
export function validateInstantBet(game, body) {
  const {wager}=body || {};
  if(!Number.isSafeInteger(wager) || wager<10 || wager>MAX_INSTANT_WAGER) throw new Error('Wager must be a whole number from 10 to 1,000,000 tokens');
  if(game==='coinflip') {
    if(!['heads','tails'].includes(body.choice)) throw new Error('Choose heads or tails');
    return {wager,options:{choice:body.choice}};
  }
  if(game==='plinko') {
    if(!Number.isInteger(body.rows) || body.rows<8 || body.rows>16 || !['low','medium','high'].includes(body.risk)) throw new Error('Choose 8–16 rows and low, medium or high risk');
    return {wager,options:{rows:body.rows,risk:body.risk}};
  }
  throw new Error('Unknown game');
}
export function resolveInstantGame(game,wager,options,bit=()=>randomInt(2)) {
  validateInstantBet(game,{wager,...options});
  if(game==='coinflip') {
    const outcome=bit()===0?'heads':'tails';
    return {choice:options.choice,outcome,multiplier:outcome===options.choice?1.92:0,payout:outcome===options.choice?Math.floor(wager*192/100):0};
  }
  const path=Array.from({length:options.rows},()=>bit());
  const bucket=path.reduce((sum,v)=>sum+v,0);
  const multipliers=plinkoMultipliers(options.rows,options.risk);
  const multiplier=multipliers[bucket];
  // Integer arithmetic keeps payout identical to the displayed six-decimal rate.
  const payout=Number(BigInt(wager)*BigInt(Math.round(multiplier*1e6))/1000000n);
  return {...options,path,bucket,multiplier,multipliers,payout};
}
