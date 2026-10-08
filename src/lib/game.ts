import { validateGameConfig, type Config } from './config';
import { isWord } from './validation';

export type { Config, PackId } from './config';
export const POINT_UNITS = 100;
export const guessAwardUnits = (count: number) =>
  count > 0 ? Math.floor(POINT_UNITS / count) : 0;
export const entryGuessers = (entry: Entry): number[] =>
  entry.guesser === null ? [] : [entry.guesser, ...(entry.sharedWith ?? [])];

export interface Player {
  id: number;
  name: string;
  scoreUnits: number;
}

export interface Entry {
  word: string;
  guesser: number | null;
  sharedWith?: number[];
  explainer: number;
  bonusUnits: number;
  hinted?: boolean;
}

export type Phase =
  'ready' | 'playing' | 'lastword' | 'paused' | 'summary' | 'finished';
export interface GameState {
  version: 3;
  config: Config;
  players: Player[];
  deck: string[];
  turn: number;
  phase: Phase;
  resumePhase: 'playing' | 'lastword';
  remainingMs: number;
  word: string | null;
  hintUsed: boolean;
  entries: Entry[];
  lastEntries: Entry[];
  exhausted: boolean;
}

export type Action =
  | {
      type:
        | 'begin'
        | 'pause'
        | 'resume'
        | 'skip'
        | 'undo'
        | 'end'
        | 'next'
        | 'hint';
    }
  | { type: 'guess'; player: number }
  | { type: 'tie'; players: number[] }
  | { type: 'elapse'; ms: number }
  | ({ type: 'assign'; index: number } & GuesserSelection);
export interface GuesserSelection {
  player: number | null;
  sharedWith?: number[];
}
export const explainerId = (game: GameState) => game.turn % game.players.length;
export function isActive(
  game: GameState,
): game is GameState & { phase: 'playing' | 'lastword' } {
  return game.phase === 'playing' || game.phase === 'lastword';
}

export const reachedGoal = (game: GameState) =>
  game.players.some((p) => p.scoreUnits >= game.config.target * POINT_UNITS);
export function getPlayer(game: GameState, id: number): Player {
  const player = game.players[id];
  if (!player) {
    throw new Error('Игрок не найден.');
  }
  return player;
}

export const explainer = (game: GameState) =>
  getPlayer(game, explainerId(game));
export const guessers = (game: GameState) =>
  game.players.filter((player) => player.id !== explainerId(game));

export function ranked(game: GameState): [Player, ...Player[]] {
  const [leader, ...others] = [...game.players].sort(
    (a, b) => b.scoreUnits - a.scoreUnits || a.id - b.id,
  );
  if (!leader) {
    throw new Error('В игре нет игроков.');
  }
  return [leader, ...others];
}

export function createGame(
  config: Config,
  words: string[],
  random = Math.random,
): GameState {
  const validated = validateGameConfig(config);
  const names = validated.names;
  if (!words.length || !words.every(isWord)) {
    throw new Error('Словарь пуст или повреждён.');
  }
  const deck = [...new Set(words)];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const current = deck[i];
    const selected = deck[j];
    if (current === undefined || selected === undefined) {
      throw new Error('Неверный источник случайных чисел.');
    }
    deck[i] = selected;
    deck[j] = current;
  }
  return {
    version: 3,
    config: validated,
    players: names.map((name, id) => ({ id, name, scoreUnits: 0 })),
    deck,
    turn: 0,
    phase: 'ready',
    resumePhase: 'playing',
    remainingMs: config.seconds * 1000,
    word: null,
    hintUsed: false,
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
    hintUsed: false,
    lastEntries: [...game.entries],
  };
}

function draw(game: GameState): GameState {
  const word = game.deck.at(-1) ?? null;
  const next = { ...game, word, hintUsed: false, deck: game.deck.slice(0, -1) };
  return word ? next : finish({ ...next, exhausted: true });
}

function requirePhase(game: GameState, ...phases: Phase[]) {
  if (!phases.includes(game.phase)) {
    throw new Error('Это действие сейчас недоступно.');
  }
}

function changedScores(
  game: GameState,
  entry: Entry,
  direction: 1 | -1,
): Player[] {
  const recipients = entryGuessers(entry);
  const award = guessAwardUnits(recipients.length);
  return game.players.map((player) => {
    let delta = 0;
    if (entry.guesser === null) {
      if (player.id === entry.explainer) {
        delta = -POINT_UNITS;
      }
    } else if (recipients.includes(player.id)) {
      delta = award;
    } else if (player.id === entry.explainer) {
      delta = entry.bonusUnits;
    }
    return delta === 0
      ? player
      : { ...player, scoreUnits: player.scoreUnits + direction * delta };
  });
}

function validSelection(
  game: GameState,
  selection: GuesserSelection,
  explainer: number,
) {
  const eligible = (id: number) =>
    Number.isInteger(id) && !!game.players[id] && id !== explainer;
  if (selection.player === null) {
    return selection.sharedWith === undefined;
  }
  if (selection.sharedWith?.length === 0) {
    return false;
  }
  const ids = [selection.player, ...(selection.sharedWith ?? [])];
  return ids.every(eligible) && new Set(ids).size === ids.length;
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
      if (game.phase !== 'playing') {
        return game;
      }
      if (!Number.isFinite(action.ms) || action.ms < 0) {
        throw new Error('Неверное время.');
      }
      if (action.ms === 0) {
        return game;
      }
      const remainingMs = Math.max(0, game.remainingMs - action.ms);
      return {
        ...game,
        remainingMs,
        phase: remainingMs ? 'playing' : 'lastword',
      };
    }
    case 'pause':
      if (!isActive(game)) {
        return game;
      }
      return {
        ...game,
        phase: 'paused',
        resumePhase: game.phase,
      };
    case 'resume':
      requirePhase(game, 'paused');
      return { ...game, phase: game.resumePhase };
    case 'hint':
      requirePhase(game, 'playing', 'lastword');
      if (!game.word) {
        throw new Error('Подсказки недоступны.');
      }
      return game.hintUsed ? game : { ...game, hintUsed: true };
    case 'guess':
    case 'tie':
    case 'skip': {
      requirePhase(game, 'playing', 'lastword');
      const guesser =
        action.type === 'guess'
          ? action.player
          : action.type === 'tie'
            ? (action.players[0] ?? null)
            : null;
      const sharedWith =
        action.type === 'tie' ? action.players.slice(1) : undefined;
      const explainer = explainerId(game);
      if (
        !validSelection(game, { player: guesser, sharedWith }, explainer) ||
        (action.type === 'tie' && action.players.length < 2)
      ) {
        throw new Error('Выберите угадавшего игрока.');
      }
      if (game.word === null) {
        throw new Error('Нет текущего слова.');
      }
      const entry: Entry = {
        word: game.word,
        guesser,
        sharedWith,
        explainer,
        bonusUnits: guesser === null || game.hintUsed ? 0 : 50,
        hinted: game.hintUsed,
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
      if (!entry) {
        throw new Error('Нечего отменять.');
      }
      return {
        ...game,
        players: changedScores(game, entry, -1),
        entries: game.entries.slice(0, -1),
        word: entry.word,
        hintUsed: entry.hinted ?? false,
        deck: game.word ? [...game.deck, game.word] : game.deck,
      };
    }
    case 'assign': {
      requirePhase(game, 'summary', 'finished');
      const entry = game.lastEntries[action.index];
      if (
        !Number.isInteger(action.index) ||
        !entry ||
        !validSelection(game, action, entry.explainer)
      ) {
        throw new Error('Выберите угадавшего игрока.');
      }
      const previous = entryGuessers(entry);
      const recipients =
        action.player === null
          ? []
          : [action.player, ...(action.sharedWith ?? [])];
      if (
        previous.length === recipients.length &&
        previous.every((id) => recipients.includes(id))
      ) {
        return game;
      }
      const corrected: Entry = {
        ...entry,
        guesser: action.player,
        sharedWith: action.sharedWith ? [...action.sharedWith] : undefined,
        bonusUnits:
          action.player === null || entry.hinted
            ? 0
            : entry.guesser === null
              ? 50
              : entry.bonusUnits,
      };
      const reversed = { ...game, players: changedScores(game, entry, -1) };
      const entries = game.lastEntries.map((item, index) =>
        index === action.index ? corrected : item,
      );
      const next = {
        ...game,
        players: changedScores(reversed, corrected, 1),
        entries,
        lastEntries: entries,
      };
      return game.phase === 'finished' && !game.exhausted && !reachedGoal(next)
        ? { ...next, phase: 'summary', turn: game.turn - 1 }
        : next;
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
    default:
      action satisfies never;
      throw new Error('Неизвестное игровое действие.');
  }
}
