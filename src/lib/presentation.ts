import {
  POINT_UNITS,
  entryGuessers,
  guessAwardUnits,
  getPlayer,
  type Entry,
  type GameState,
} from './game';

export const formatScore = (units: number) =>
  (units / POINT_UNITS).toLocaleString('ru-RU');

export function formatTime(remainingMs: number): string {
  const seconds = Math.ceil(remainingMs / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function describeEntry(game: GameState, entry: Entry): string {
  const explaining = getPlayer(game, entry.explainer).name;
  if (entry.guesser === null) {
    return `${explaining} −1`;
  }
  const recipients = entryGuessers(entry);
  const award = formatScore(guessAwardUnits(recipients.length));
  const answer = recipients
    .map((id) => `${getPlayer(game, id).name} +${award}`)
    .join(' · ');

  return entry.bonusUnits
    ? `${answer} · ${explaining} +${formatScore(entry.bonusUnits)}`
    : answer;
}
