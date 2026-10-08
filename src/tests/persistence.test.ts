import { describe, expect, it } from 'vitest';
import { createGame, reduceGame } from '../lib/game';
import {
  CONFIG_KEY,
  SAVE_KEY,
  PREVIOUS_SAVE_KEY,
  decodeGame,
  encodeGame,
  loadLocal,
} from '../lib/persistence';

function makeRecord() {
  const ready = createGame(
    { names: ['Аня', 'Борис'], packs: ['easy'], seconds: 30, target: 60 },
    ['кот', 'дом', 'лес'],
    () => 0.5,
  );
  return {
    version: 3,
    game: reduceGame(reduceGame(ready, { type: 'begin' }), { type: 'pause' }),
  };
}

describe('snapshot boundary invariants', () => {
  it.each([
    [
      'duplicate deck',
      (record: ReturnType<typeof makeRecord>) => {
        record.game.deck.push('кот', 'кот');
      },
    ],
    [
      'current word in deck',
      (record: ReturnType<typeof makeRecord>) => {
        record.game.deck.push(record.game.word!);
      },
    ],
    [
      'zero timed turn',
      (record: ReturnType<typeof makeRecord>) => {
        record.game.remainingMs = 0;
      },
    ],
    [
      'word in ready phase',
      (record: ReturnType<typeof makeRecord>) => {
        record.game.phase = 'ready';
      },
    ],
    [
      'mismatched player names',
      (record: ReturnType<typeof makeRecord>) => {
        record.game.config.names[0] = 'Вера';
      },
    ],
    [
      'duplicate packs',
      (record: ReturnType<typeof makeRecord>) => {
        record.game.config.packs.push('easy');
      },
    ],
  ])('rejects %s instead of resuming an impossible party', (_, corrupt) => {
    const record = makeRecord();
    corrupt(record);
    expect(() => decodeGame(JSON.stringify(record))).toThrow(/поврежден/);
  });

  it.each([null, [], 42, { version: 2 }, { version: 1, game: { version: 1 } }])(
    'reports a controlled format error for %j',
    (value) => {
      expect(() => decodeGame(JSON.stringify(value))).toThrow(
        /сохранени|формат/i,
      );
    },
  );

  it('restores valid preferences independently of a corrupt party', () => {
    const config = makeRecord().game.config;
    const loaded = loadLocal({
      getItem: (key) =>
        key === SAVE_KEY
          ? '{broken'
          : key === CONFIG_KEY
            ? JSON.stringify(config)
            : null,
      setItem() {},
      removeItem() {},
    });
    expect(loaded.game).toBeNull();
    expect(loaded.config).toEqual(config);
    expect(loaded.error).toBeTruthy();
  });

  it('keeps a valid party when preferences cannot be decoded', () => {
    const game = makeRecord().game;
    const loaded = loadLocal({
      getItem: (key) =>
        key === SAVE_KEY
          ? encodeGame(game)
          : key === CONFIG_KEY
            ? '{broken'
            : null,
      setItem() {},
      removeItem() {},
    });
    expect(loaded.game).toEqual(game);
    expect(loaded.config).toEqual(game.config);
    expect(loaded.error).toBeTruthy();
  });
});

function halfPointRecord() {
  const entries = [
    { word: 'кот', guesser: 1, sharedWith: 2, explainer: 0, bonusUnits: 1 },
    { word: 'дом', guesser: null, explainer: 0, bonusUnits: 0 },
  ];
  return {
    version: 2,
    game: {
      version: 2,
      config: {
        names: ['Аня', 'Борис', 'Вера'],
        packs: ['easy'],
        seconds: 30,
        target: 60,
      },
      players: [
        { id: 0, name: 'Аня', scoreUnits: -1 },
        { id: 1, name: 'Борис', scoreUnits: 1 },
        { id: 2, name: 'Вера', scoreUnits: 1 },
      ],
      deck: ['лес'],
      word: 'море',
      turn: 0,
      phase: 'paused',
      resumePhase: 'playing',
      remainingMs: 15000,
      entries,
      lastEntries: [],
      exhausted: false,
    },
  };
}

it('migrates half-point scores and old two-player ties once, keeping undo reversible', () => {
  const raw = JSON.stringify(halfPointRecord());
  const migrated = decodeGame(raw);
  expect(migrated.version).toBe(3);
  expect(migrated.players.map((p) => p.scoreUnits)).toEqual([-50, 50, 50]);
  expect(migrated.entries[0]).toMatchObject({
    sharedWith: [2],
    bonusUnits: 50,
  });
  expect(decodeGame(encodeGame(migrated))).toEqual(migrated);
  let game = reduceGame(migrated, { type: 'resume' });
  game = reduceGame(game, { type: 'undo' });
  expect(game.players.map((p) => p.scoreUnits)).toEqual([50, 50, 50]);
  game = reduceGame(game, { type: 'undo' });
  expect(game.players.map((p) => p.scoreUnits)).toEqual([0, 0, 0]);
  expect(game.word).toBe('кот');
  const loaded = loadLocal({
    getItem: (key) => (key === PREVIOUS_SAVE_KEY ? raw : null),
    setItem() {},
    removeItem() {},
  });
  expect(loaded.game).toEqual(migrated);
  expect(loaded.error).toBe('');
});

it('prefers the current cents snapshot when the old half-point save remains', () => {
  const migrated = decodeGame(JSON.stringify(halfPointRecord()));
  const current = reduceGame(reduceGame(migrated, { type: 'resume' }), {
    type: 'tie',
    players: [1, 2],
  });
  const raw = encodeGame(current);
  const loaded = loadLocal({
    getItem: (key) =>
      key === SAVE_KEY
        ? raw
        : key === PREVIOUS_SAVE_KEY
          ? JSON.stringify(halfPointRecord())
          : null,
    setItem() {},
    removeItem() {},
  });
  expect(loaded.game?.players.map((p) => p.scoreUnits)).toEqual([0, 100, 100]);
  expect(loaded.game).toEqual(decodeGame(raw));
});

it('does not accept fractional half-point units in an old snapshot during migration', () => {
  const record = halfPointRecord();
  record.game.players[0]!.scoreUnits = 0.5;
  expect(() => decodeGame(JSON.stringify(record))).toThrow(/поврежден/);
});

it.each([[''], ['кот', ' '], ['кот', 'x'.repeat(101)]])(
  'rejects invalid words before a party is created: %j',
  (...words) => {
    expect(() => createGame(makeRecord().game.config, words)).toThrow(
      /словар|слов/i,
    );
  },
);
