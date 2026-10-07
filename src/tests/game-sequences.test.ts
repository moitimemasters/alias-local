import { expect, it } from 'vitest';
import {
  createGame,
  explainerId,
  getPlayer,
  reduceGame,
  type GameState,
} from '../lib/game';
import { decodeGame, encodeGame } from '../lib/persistence';

function freeze(game: GameState) {
  game.players.forEach(Object.freeze);
  game.entries.forEach(Object.freeze);
  Object.freeze(game.players);
  Object.freeze(game.deck);
  Object.freeze(game.entries);
  return Object.freeze(game);
}

it('keeps every reachable phase serializable through a complete deterministic game', () => {
  let game = createGame(
    {
      names: ['Аня', 'Борис', 'Вера'],
      packs: ['fresh'],
      seconds: 30,
      target: 30,
    },
    Array.from({ length: 80 }, (_, index) => `слово ${index}`),
    () => 0.3,
  );
  const seen = new Set<string>();
  for (let index = 0; index < 400 && game.phase !== 'finished'; index++) {
    const before = JSON.stringify(game);
    const restored = decodeGame(encodeGame(game));
    expect(restored.players).toEqual(game.players);
    expect(restored.deck).toEqual(game.deck);
    expect(restored.word).toBe(game.word);
    freeze(game);
    const previous = game;
    switch (game.phase) {
      case 'ready':
        game = reduceGame(game, { type: 'begin' });
        break;
      case 'playing':
        if (index % 7 === 0) game = reduceGame(game, { type: 'pause' });
        else if (index % 5 === 0)
          game = reduceGame(game, { type: 'elapse', ms: 30000 });
        else {
          const word = game.word;
          if (!word) throw new Error('Active phase must have a word');
          expect(seen.has(word)).toBe(false);
          seen.add(word);
          game = reduceGame(game, {
            type: 'guess',
            player: (explainerId(game) + 1) % game.players.length,
          });
        }
        break;
      case 'paused':
        game = reduceGame(game, { type: 'resume' });
        break;
      case 'lastword':
        if (!game.word) throw new Error('Last-word phase must have a word');
        expect(seen.has(game.word)).toBe(false);
        seen.add(game.word);
        game = reduceGame(game, { type: 'skip' });
        break;
      case 'summary':
        game = reduceGame(game, { type: 'next' });
        break;
    }
    expect(JSON.stringify(previous)).toBe(before);
  }
  expect(game.phase).toBe('finished');
  expect(
    game.players.every((player) => Number.isSafeInteger(player.scoreUnits)),
  ).toBe(true);
  expect(() => getPlayer(game, 99)).toThrow();
});

it.each([() => 1, () => -1, () => NaN])(
  'rejects a shuffle source that would introduce missing words',
  (random) => {
    expect(() =>
      createGame(
        { names: ['Аня', 'Борис'], packs: ['easy'], seconds: 30, target: 60 },
        ['кот', 'дом'],
        random,
      ),
    ).toThrow(/случайных/);
  },
);
