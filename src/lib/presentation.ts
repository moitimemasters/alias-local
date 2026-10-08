import { getPlayer, type Entry, type GameState } from './game';

export const formatScore = (units: number) =>
  (units / 2).toLocaleString('ru-RU');

export function formatTime(remainingMs: number): string {
  const seconds = Math.ceil(remainingMs / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function describeEntry(game: GameState, entry: Entry): string {
  const explaining = getPlayer(game, entry.explainer).name;
  if (entry.guesser === null) {
    return `${explaining} −1`;
  }
  const answer =
    entry.sharedWith === undefined
      ? `${getPlayer(game, entry.guesser).name} +1`
      : `${getPlayer(game, entry.guesser).name} +0,5 · ${getPlayer(game, entry.sharedWith).name} +0,5`;
  return entry.bonusUnits
    ? `${answer} · ${explaining} +${formatScore(entry.bonusUnits)}`
    : answer;
}
