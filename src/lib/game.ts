import { validateGameConfig, type Config } from './config';
import { isWord } from './validation';

export type { Config, PackId } from './config';

export interface Player {
  id: number;
  name: string;
  scoreUnits: number;
}
export interface Entry {
  word: string;
  guesser: number | null;
  explainer: number;
  bonusUnits: number;
}
export type Phase =
  'ready' | 'playing' | 'lastword' | 'paused' | 'summary' | 'finished';
export interface GameState {
  version: 2;
  config: Config;
  players: Player[];
  deck: string[];
  turn: number;
  phase: Phase;
  resumePhase: 'playing' | 'lastword';
  remainingMs: number;
  word: string | null;
  entries: Entry[];
  lastEntries: Entry[];
  exhausted: boolean;
}
export type Action =
  | { type: 'begin' | 'pause' | 'resume' | 'skip' | 'undo' | 'end' | 'next' }
  | { type: 'guess'; player: number }
  | { type: 'elapse'; ms: number };
export const explainerId = (game: GameState) => game.turn % game.players.length;
export const isActive = (game: GameState) =>
  game.phase === 'playing' || game.phase === 'lastword';
export const reachedGoal = (game: GameState) =>
  game.players.some((p) => p.scoreUnits >= game.config.target * 2);
export const ranked = (game: GameState) =>
  [...game.players].sort((a, b) => b.scoreUnits - a.scoreUnits || a.id - b.id);
export const score = (units: number) => (units / 2).toLocaleString('ru-RU');

export function createGame(
  config: Config,
  words: string[],
  random = Math.random,
): GameState {
  const validated = validateGameConfig(config);
  const names = validated.names;
  if (!words.length || !words.every(isWord))
    throw new Error('Словарь пуст или повреждён.');
  const deck = [...new Set(words)];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return {
    version: 2,
    config: validated,
    players: names.map((name, id) => ({ id, name, scoreUnits: 0 })),
    deck,
    turn: 0,
    phase: 'ready',
    resumePhase: 'playing',
    remainingMs: config.seconds * 1000,
    word: null,
    entries: [],
    lastEntries: [],
    exhausted: false,
  };
}

function finish(game: GameState): GameState {
  return {
    ...game,
    phase: 'summary',
    word: null,
    lastEntries: [...game.entries],
  };
}
function draw(game: GameState): GameState {
  const word = game.deck.at(-1) ?? null;
  const next = { ...game, word, deck: game.deck.slice(0, -1) };
  return word ? next : finish({ ...next, exhausted: true });
}
function requirePhase(game: GameState, ...phases: Phase[]) {
  if (!phases.includes(game.phase))
    throw Error('Это действие сейчас недоступно.');
}
function changedScores(
  game: GameState,
  entry: Entry,
  direction: 1 | -1,
): Player[] {
  return game.players.map((p) => ({
    ...p,
    scoreUnits:
      p.scoreUnits +
      direction *
        (entry.guesser === null
          ? p.id === entry.explainer
            ? -2
            : 0
          : p.id === entry.guesser
            ? 2
            : p.id === entry.explainer
              ? entry.bonusUnits
              : 0),
  }));
}
export function reduceGame(game: GameState, action: Action): GameState {
  switch (action.type) {
    case 'begin':
      requirePhase(game, 'ready');
      return draw({
        ...game,
        phase: 'playing',
        entries: [],
        remainingMs: game.config.seconds * 1000,
      });
    case 'elapse': {
      if (game.phase !== 'playing') return game;
      if (!Number.isFinite(action.ms) || action.ms < 0)
        throw Error('Неверное время.');
      const remainingMs = Math.max(0, game.remainingMs - action.ms);
      return {
        ...game,
        remainingMs,
        phase: remainingMs ? 'playing' : 'lastword',
      };
    }
    case 'pause':
      if (!isActive(game)) return game;
      return {
        ...game,
        phase: 'paused',
        resumePhase: game.phase as 'playing' | 'lastword',
      };
    case 'resume':
      requirePhase(game, 'paused');
      return { ...game, phase: game.resumePhase };
    case 'guess':
    case 'skip': {
      requirePhase(game, 'playing', 'lastword');
      const guesser = action.type === 'guess' ? action.player : null;
      const explainer = explainerId(game);
      if (
        guesser !== null &&
        (!Number.isInteger(guesser) ||
          !game.players[guesser] ||
          guesser === explainer)
      )
        throw Error('Выберите угадавшего игрока.');
      const entry: Entry = {
        word: game.word!,
        guesser,
        explainer,
        bonusUnits: guesser === null ? 0 : 1,
      };
      const next = {
        ...game,
        players: changedScores(game, entry, 1),
        entries: [...game.entries, entry],
      };
      return game.phase === 'lastword' || reachedGoal(next)
        ? finish(next)
        : draw(next);
    }
    case 'undo': {
      requirePhase(game, 'playing', 'lastword');
      const entry = game.entries.at(-1);
      if (!entry) throw Error('Нечего отменять.');
      return {
        ...game,
        players: changedScores(game, entry, -1),
        entries: game.entries.slice(0, -1),
        word: entry.word,
        deck: game.word ? [...game.deck, game.word] : game.deck,
      };
    }
    case 'end':
      requirePhase(game, 'playing', 'lastword', 'paused');
      return finish(game);
    case 'next':
      requirePhase(game, 'summary');
      return {
        ...game,
        turn: game.turn + 1,
        phase: game.exhausted || reachedGoal(game) ? 'finished' : 'ready',
      };
  }
}
