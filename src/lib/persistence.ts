import { reduceGame, type Config, type GameState, type PackId } from './game';
export const SAVE_KEY = 'alias-local-game-v2';
export const CONFIG_KEY = 'alias-local-config-v2';
const LEGACY_KEY = 'alias-personal-game-v1';
const PACKS = ['fresh', 'hard', 'normal', 'easy'];
const PHASES = ['ready', 'paused', 'summary', 'finished'];
export const defaultConfig = (): Config => ({
  names: ['Игрок 1', 'Игрок 2', 'Игрок 3'],
  packs: ['fresh'],
  seconds: 60,
  target: 60,
});
export function validConfig(value: unknown): value is Config {
  if (!value || typeof value !== 'object') return false;
  const c = value as Config;
  return (
    Array.isArray(c.names) &&
    c.names.length >= 2 &&
    c.names.length <= 12 &&
    c.names.every((n) => typeof n === 'string' && n.length <= 24) &&
    Array.isArray(c.packs) &&
    c.packs.every((p) => PACKS.includes(p)) &&
    [30, 60, 90, 120].includes(c.seconds) &&
    [30, 60, 100].includes(c.target)
  );
}
function validate(value: unknown): GameState {
  const g = value as GameState;
  if (
    !g ||
    g.version !== 2 ||
    !validConfig(g.config) ||
    !g.config.packs.length ||
    !PHASES.includes(g.phase) ||
    !Number.isSafeInteger(g.turn) ||
    g.turn < 0 ||
    !Number.isFinite(g.remainingMs) ||
    g.remainingMs < 0 ||
    g.remainingMs > g.config.seconds * 1000 ||
    !['playing', 'lastword'].includes(g.resumePhase) ||
    typeof g.exhausted !== 'boolean' ||
    !Array.isArray(g.players) ||
    g.players.length !== g.config.names.length ||
    g.players.some(
      (p, id) =>
        !p ||
        p.id !== id ||
        typeof p.name !== 'string' ||
        !p.name.trim() ||
        p.name.length > 24 ||
        !Number.isSafeInteger(p.scoreUnits),
    ) ||
    new Set(g.players.map((p) => p.name.toLocaleLowerCase('ru'))).size !==
      g.players.length ||
    !Array.isArray(g.deck) ||
    g.deck.length > 100000 ||
    g.deck.some((w) => typeof w !== 'string' || !w || w.length > 100) ||
    !(
      g.word === null ||
      (typeof g.word === 'string' && g.word.length > 0 && g.word.length <= 100)
    )
  )
    throw Error('Сохранение повреждено.');
  const validEntries = (list: GameState['entries']) =>
    Array.isArray(list) &&
    list.every(
      (e) =>
        e &&
        typeof e.word === 'string' &&
        e.word.length > 0 &&
        Number.isInteger(e.explainer) &&
        e.explainer >= 0 &&
        e.explainer < g.players.length &&
        (e.guesser === null ||
          (Number.isInteger(e.guesser) &&
            e.guesser >= 0 &&
            e.guesser < g.players.length &&
            e.guesser !== e.explainer)) &&
        [0, 1].includes(e.bonusUnits) &&
        (e.guesser !== null || e.bonusUnits === 0),
    );
  if (
    !validEntries(g.entries) ||
    !validEntries(g.lastEntries) ||
    (g.phase === 'paused' &&
      (!g.word || (g.resumePhase === 'lastword' && g.remainingMs !== 0)))
  )
    throw Error('Сохранённый ход повреждён.');
  return g;
}
export function decodeGame(raw: string): GameState {
  const record = JSON.parse(raw);
  if (record.version === 2) return validate(record.game);
  if (record.version !== 1 || record.game?.version !== 1)
    throw Error('Неизвестный формат сохранения.');
  const old = record.game;
  const entries = (
    list: {
      word: string;
      player: number | null;
      explainer: number;
      bonus?: number;
    }[],
  ) =>
    list.map((e) => ({
      word: e.word,
      guesser: e.player,
      explainer: e.explainer,
      bonusUnits: (e.bonus ?? 0) * 2,
    }));
  return validate({
    version: 2,
    config: {
      names: old.players.map((p: { name: string }) => p.name),
      packs: record.selected as PackId[],
      seconds: old.seconds,
      target: old.target,
    },
    players: old.players.map(
      (p: { id: number; name: string; score: number }) => ({
        id: p.id,
        name: p.name,
        scoreUnits: p.score * 2,
      }),
    ),
    deck: old.deck,
    turn: old.turn,
    phase: old.status,
    resumePhase: old.beforePause ?? 'playing',
    remainingMs: old.remaining,
    word: old.current,
    entries: entries(old.log),
    lastEntries: entries(old.lastLog),
    exhausted: old.exhausted,
  });
}
export function encodeGame(game: GameState): string {
  return JSON.stringify({
    version: 2,
    game: reduceGame(game, { type: 'pause' }),
  });
}
export interface LocalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export function loadLocal(storage: LocalStorage) {
  let game: GameState | null = null,
    config = defaultConfig(),
    error = '';
  try {
    const raw = storage.getItem(SAVE_KEY) ?? storage.getItem(LEGACY_KEY);
    if (raw) {
      game = decodeGame(raw);
      config = {
        ...game.config,
        names: [...game.config.names],
        packs: [...game.config.packs],
      };
    }
    const preferences = storage.getItem(CONFIG_KEY);
    if (preferences) {
      const value: unknown = JSON.parse(preferences);
      if (validConfig(value)) config = value;
    }
  } catch {
    error = 'Не удалось прочитать сохранение. Можно начать новую игру.';
  }
  return { game, config, error };
}
