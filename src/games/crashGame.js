import { continuousCrash, activeCrashFlights } from './continuousCrash.js';

export const activeCrashGames = activeCrashFlights;

export async function startCrashGame(interaction, betAmount = 100) {
  return continuousCrash.handleBet(interaction, betAmount);
}

export async function handleCrashButton(interaction) {
  return continuousCrash.handleCashout(interaction);
}
