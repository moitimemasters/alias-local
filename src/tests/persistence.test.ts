import { describe, expect, it } from 'vitest';
import { createGame, reduceGame } from '../lib/game';
import {
  CONFIG_KEY,
  SAVE_KEY,
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
    version: 2,
    game: reduceGame(reduceGame(ready, { type: 'begin' }), { type: 'pause' }),
  };
}

describe('snapshot boundary invariants', () => {
  it.each([
    [
      'duplicate deck',
      (record: ReturnType<typeof makeRecord>) => {
        record.game.deck.push(record.game.deck[0]);
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

it.each([[''], ['кот', ' '], ['кот', 'x'.repeat(101)]])(
  'rejects invalid words before a party is created: %j',
  (...words) => {
    expect(() => createGame(makeRecord().game.config, words)).toThrow(
      /словар|слов/i,
    );
  },
);
