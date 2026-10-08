import { reduceGame, type Entry, type GameState, type Player } from './game';
import {
  MAX_NAME_LENGTH,
  defaultConfig,
  validConfig,
  validateGameConfig,
  type Config,
} from './config';
import { isRecord, isWord } from './validation';

export { defaultConfig, validConfig } from './config';
export const SAVE_KEY = 'alias-local-game-v3';
export const PREVIOUS_SAVE_KEY = 'alias-local-game-v2';
export const CONFIG_KEY = 'alias-local-config-v2';
export const LEGACY_KEY = 'alias-personal-game-v1';
const MAX_SAVED_WORDS = 100_000;

function isPlayer(value: unknown, index: number): value is Player {
  return (
    isRecord(value) &&
    value.id === index &&
    typeof value.name === 'string' &&
    value.name.trim().length > 0 &&
    value.name.length <= MAX_NAME_LENGTH &&
    Number.isSafeInteger(value.scoreUnits)
  );
}

function isEntries(value: unknown, playerCount: number): value is Entry[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_SAVED_WORDS &&
    value.every((entry) => {
      if (!isRecord(entry)) {
        return false;
      }
      const { word, explainer, guesser, sharedWith, bonusUnits, hinted } =
        entry;
      return (
        (hinted === undefined || typeof hinted === 'boolean') &&
        (!hinted || bonusUnits === 0) &&
        isWord(word) &&
        typeof explainer === 'number' &&
        Number.isInteger(explainer) &&
        explainer >= 0 &&
        explainer < playerCount &&
        (guesser === null ||
          (typeof guesser === 'number' &&
            Number.isInteger(guesser) &&
            guesser >= 0 &&
            guesser < playerCount &&
            guesser !== explainer)) &&
        (sharedWith === undefined ||
          (guesser !== null &&
            Array.isArray(sharedWith) &&
            sharedWith.length > 0 &&
            sharedWith.length < playerCount &&
            new Set(sharedWith).size === sharedWith.length &&
            sharedWith.every(
              (id: unknown) =>
                typeof id === 'number' &&
                Number.isInteger(id) &&
                id >= 0 &&
                id < playerCount &&
                id !== guesser &&
                id !== explainer,
            ))) &&
        (bonusUnits === 0 || bonusUnits === 50) &&
        (guesser !== null || bonusUnits === 0)
      );
    })
  );
}

function validate(value: unknown): GameState {
  if (!isRecord(value) || value.version !== 3) {
    throw new Error('Сохранение повреждено.');
  }

  let config: Config;
  try {
    config = validateGameConfig(value.config);
  } catch {
    throw new Error('Настройки сохранения повреждены.');
  }

  const {
    players,
    deck,
    word,
    turn,
    phase,
    resumePhase,
    remainingMs,
    entries,
    lastEntries,
    exhausted,
  } = value;
  const hintUsed = value.hintUsed === undefined ? false : value.hintUsed;
  if (
    !Array.isArray(players) ||
    players.length !== config.names.length ||
    !players.every(isPlayer) ||
    players.some((player, index) => player.name !== config.names[index]) ||
    !Array.isArray(deck) ||
    deck.length > MAX_SAVED_WORDS ||
    !deck.every(isWord) ||
    new Set(deck).size !== deck.length ||
    (word !== null && !isWord(word)) ||
    (word !== null && deck.includes(word)) ||
    typeof turn !== 'number' ||
    !Number.isSafeInteger(turn) ||
    turn < 0 ||
    typeof remainingMs !== 'number' ||
    !Number.isFinite(remainingMs) ||
    remainingMs < 0 ||
    remainingMs > config.seconds * 1000 ||
    typeof exhausted !== 'boolean' ||
    typeof hintUsed !== 'boolean' ||
    (hintUsed && phase !== 'paused') ||
    (resumePhase !== 'playing' && resumePhase !== 'lastword') ||
    (phase !== 'ready' &&
      phase !== 'paused' &&
      phase !== 'summary' &&
      phase !== 'finished') ||
    !isEntries(entries, players.length) ||
    !isEntries(lastEntries, players.length)
  ) {
    throw new Error('Сохранение повреждено.');
  }

  if (phase === 'paused') {
    if (
      word === null ||
      exhausted ||
      (resumePhase === 'playing' ? remainingMs === 0 : remainingMs !== 0)
    ) {
      throw new Error('Сохранённый ход поврежден.');
    }
  } else if (word !== null || (exhausted && phase === 'ready')) {
    throw new Error('Сохранённый ход поврежден.');
  }

  return {
    version: 3,
    config,
    players,
    deck,
    word,
    hintUsed,
    turn,
    phase,
    resumePhase,
    remainingMs,
    entries,
    lastEntries,
    exhausted,
  };
}

function migrateLegacy(record: Record<string, unknown>): GameState {
  const old = record.game;
  if (!isRecord(old) || old.version !== 1 || !Array.isArray(old.players)) {
    throw new Error('Старое сохранение повреждено.');
  }

  const players = old.players.map((player) => {
    if (!isRecord(player) || typeof player.score !== 'number') {
      throw new Error('Старое сохранение повреждено.');
    }
    return { id: player.id, name: player.name, scoreUnits: player.score * 100 };
  });
  function migrateEntries(value: unknown) {
    if (!Array.isArray(value)) {
      throw new Error('Старое сохранение повреждено.');
    }
    return value.map((entry) => {
      if (
        !isRecord(entry) ||
        (entry.bonus !== undefined && typeof entry.bonus !== 'number')
      ) {
        throw new Error('Старое сохранение повреждено.');
      }
      return {
        word: entry.word,
        guesser: entry.player,
        explainer: entry.explainer,
        bonusUnits: (entry.bonus ?? 0) * 100,
      };
    });
  }

  return validate({
    version: 3,
    config: {
      names: players.map((player) => player.name),
      packs: record.selected,
      seconds: old.seconds,
      target: old.target,
    },
    players,
    deck: old.deck,
    turn: old.turn,
    phase: old.status,
    resumePhase: old.beforePause ?? 'playing',
    remainingMs: old.remaining,
    word: old.current,
    entries: migrateEntries(old.log),
    lastEntries: migrateEntries(old.lastLog),
    exhausted: old.exhausted,
  });
}

function migrateHalfPoints(value: unknown): GameState {
  if (
    !isRecord(value) ||
    value.version !== 2 ||
    !Array.isArray(value.players)
  ) {
    throw new Error('Старое сохранение повреждено.');
  }
  const players = value.players.map((player) => {
    if (
      !isRecord(player) ||
      typeof player.scoreUnits !== 'number' ||
      !Number.isSafeInteger(player.scoreUnits)
    ) {
      throw new Error('Старое сохранение повреждено.');
    }
    return { ...player, scoreUnits: player.scoreUnits * 50 };
  });
  function migrateEntries(entries: unknown) {
    if (!Array.isArray(entries)) {
      throw new Error('Старое сохранение повреждено.');
    }
    return entries.map((entry) => {
      if (
        !isRecord(entry) ||
        (entry.bonusUnits !== 0 && entry.bonusUnits !== 1)
      ) {
        throw new Error('Старое сохранение повреждено.');
      }
      return {
        ...entry,
        bonusUnits: entry.bonusUnits * 50,
        sharedWith:
          entry.sharedWith === undefined ? undefined : [entry.sharedWith],
      };
    });
  }
  return validate({
    ...value,
    version: 3,
    players,
    entries: migrateEntries(value.entries),
    lastEntries: migrateEntries(value.lastEntries),
  });
}

export function decodeGame(raw: string): GameState {
  const record: unknown = JSON.parse(raw);
  if (!isRecord(record)) {
    throw new Error('Неизвестный формат сохранения.');
  }
  if (record.version === 3) {
    return validate(record.game);
  }
  if (record.version === 2) {
    return migrateHalfPoints(record.game);
  }
  if (record.version === 1) {
    return migrateLegacy(record);
  }
  throw new Error('Неизвестный формат сохранения.');
}

export function encodeGame(game: GameState): string {
  return JSON.stringify({
    version: 3,
    game: reduceGame(game, { type: 'pause' }),
  });
}

export interface LocalStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export function loadLocal(storage: LocalStorage) {
  let game: GameState | null = null;
  let config = defaultConfig();
  const errors: string[] = [];

  try {
    const raw =
      storage.getItem(SAVE_KEY) ??
      storage.getItem(PREVIOUS_SAVE_KEY) ??
      storage.getItem(LEGACY_KEY);
    if (raw) {
      game = decodeGame(raw);
      config = {
        ...game.config,
        names: [...game.config.names],
        packs: [...game.config.packs],
      };
    }
  } catch {
    errors.push('Не удалось прочитать сохранение. Можно начать новую игру.');
  }

  try {
    const raw = storage.getItem(CONFIG_KEY);
    if (raw) {
      const value: unknown = JSON.parse(raw);
      if (!validConfig(value)) {
        throw new Error('Настройки повреждены.');
      }
      config = value;
    }
  } catch {
    errors.push('Не удалось прочитать настройки.');
  }

  return { game, config, error: errors.join(' ') };
}
