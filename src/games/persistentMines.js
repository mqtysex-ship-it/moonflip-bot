import { calculateMinesMultiplier, generateMinesBombs } from './rng.js';

// Round contents stay server-side. Callers may only send the public results.
export class PersistentMines {
  constructor(store, draw = generateMinesBombs) { this.store = store; this.draw = draw; }
  async start(roundId, userId, wager, bombs) {
    if (!Number.isSafeInteger(wager) || wager < 10) throw new Error('invalid wager');
    if (!Number.isInteger(bombs) || bombs < 1 || bombs > 24) throw new Error('invalid bombs');
    const existing = await this.store.loadRound(roundId, userId);
    if (existing) {
      if (existing.game !== 'mines' || existing.wager !== wager || existing.state.bombs !== bombs) throw new Error('round id reused');
      return { gameId: roundId, wager, bombs, balance: existing.balanceAfterWager, multiplier: 1 };
    }
    const state = { bombs, bombIndices: [...this.draw(25, bombs)], revealed: [], multiplier: 1, lastAction: { type: 'start' } };
    try {
      const result = await this.store.startRound(roundId, userId, 'mines', wager, state);
      return { gameId: roundId, wager, bombs, balance: result.balance, multiplier: 1 };
    } catch (err) {
      if (err.message !== 'round id already used with different parameters') throw err;
      const concurrent = await this.store.loadRound(roundId, userId);
      if (!concurrent || concurrent.game !== 'mines' || concurrent.wager !== wager || concurrent.state.bombs !== bombs) throw err;
      return { gameId: roundId, wager, bombs, balance: concurrent.balanceAfterWager, multiplier: 1 };
    }
  }
  async reveal(operationId, roundId, userId, tile) {
    if (!Number.isInteger(tile) || tile < 0 || tile > 24) throw new Error('invalid tile');
    const prior = await this.store.loadTransition(operationId, roundId, userId);
    if (prior) {
      if (prior.state.lastAction?.type !== 'reveal' || prior.state.lastAction.tile !== tile) throw new Error('operation id reused');
      return this.revealResult(roundId, prior.state, prior.balance, prior.payout);
    }
    const round = await this.store.loadRound(roundId, userId);
    if (!round || round.game !== 'mines') throw new Error('round not found');
    if (round.status !== 'active' || round.state.revealed.includes(tile)) {
      const completed = await this.store.loadTransition(operationId, roundId, userId);
      if (completed && completed.state.lastAction?.type === 'reveal' && completed.state.lastAction.tile === tile) {
        return this.revealResult(roundId, completed.state, completed.balance, completed.payout);
      }
      throw new Error(round.status !== 'active' ? 'round already settled' : 'tile already revealed');
    }
    const hitBomb = round.state.bombIndices.includes(tile);
    const revealed = hitBomb ? round.state.revealed : [...round.state.revealed, tile];
    const multiplier = hitBomb ? round.state.multiplier : calculateMinesMultiplier(25, round.state.bombs, revealed.length);
    const clear = !hitBomb && revealed.length === 25 - round.state.bombs;
    const payout = hitBomb ? 0 : clear ? Math.floor(round.wager * multiplier) : null;
    const state = { ...round.state, revealed, multiplier, lastAction: { type: 'reveal', tile, hitBomb } };
    const result = await this.store.advanceRound(operationId, roundId, userId, round.version, state, payout);
    return this.revealResult(roundId, state, result.balance, payout);
  }
  revealResult(gameId, state, balance, payout) {
    const gameOver = payout !== null;
    const result = { gameId, gameOver, hitBomb: state.lastAction.hitBomb, tileIdx: state.lastAction.tile,
      multiplier: state.multiplier, revealed: state.revealed, balance };
    if (gameOver) { result.payout = payout; result.allBombs = state.bombIndices; }
    return result;
  }
  async cashout(operationId, roundId, userId) {
    const prior = await this.store.loadTransition(operationId, roundId, userId);
    if (prior) {
      if (prior.state.lastAction?.type !== 'cashout') throw new Error('operation id reused');
      return { gameId: roundId, payout: prior.payout, balance: prior.balance, multiplier: prior.state.multiplier, allBombs: prior.state.bombIndices };
    }
    const round = await this.store.loadRound(roundId, userId);
    if (!round || round.game !== 'mines') throw new Error('round not found');
    if (round.status !== 'active') {
      const completed = await this.store.loadTransition(operationId, roundId, userId);
      if (completed && completed.state.lastAction?.type === 'cashout') {
        return { gameId: roundId, payout: completed.payout, balance: completed.balance,
          multiplier: completed.state.multiplier, allBombs: completed.state.bombIndices };
      }
      throw new Error('round already settled');
    }
    if (!round.state.revealed.length) throw new Error('reveal at least one tile');
    const payout = Math.floor(round.wager * round.state.multiplier);
    const state = { ...round.state, lastAction: { type: 'cashout' } };
    const result = await this.store.advanceRound(operationId, roundId, userId, round.version, state, payout);
    return { gameId: roundId, payout, balance: result.balance, multiplier: state.multiplier, allBombs: state.bombIndices };
  }
}
