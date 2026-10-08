import { expect, it } from 'vitest';
import {
  createGame,
  reduceGame,
  type Action,
  type GameState,
} from '../lib/game';
import { decodeGame, encodeGame } from '../lib/persistence';
import { describeEntry } from '../lib/presentation';
import { createController } from '../lib/controller.svelte';

const make = () =>
  reduceGame(
    createGame(
      {
        names: ['Аня', 'Борис', 'Вера', 'Глеб'],
        packs: ['easy'],
        seconds: 30,
        target: 60,
      },
      ['кот', 'дом', 'лес', 'море'],
      () => 0.5,
    ),
    { type: 'begin' },
  );
const act = (game: GameState, action: Action) => reduceGame(game, action);

it('splits one point, gives the explainer one bonus and undoes all awards together', () => {
  const initial = make();
  const tied = act(initial, { type: 'tie', players: [1, 2] });
  expect(tied.players.map((p) => p.scoreUnits)).toEqual([1, 1, 1, 0]);
  expect(tied.entries).toHaveLength(1);
  expect(tied.word).not.toBe(initial.word);
  const entry = tied.entries[0]!;
  expect(describeEntry(tied, entry)).toBe('Борис +0,5 · Вера +0,5 · Аня +0,5');
  const restored = act(decodeGame(encodeGame(tied)), { type: 'resume' });
  expect(restored.entries).toEqual(tied.entries);
  const undone = act(restored, { type: 'undo' });
  expect(undone.players).toEqual(initial.players);
  expect(undone.word).toBe(initial.word);
  expect(undone.deck).toEqual(initial.deck);
});

it('keeps hint costs and resolves a simultaneous answer to the untimed final word', () => {
  const last = act(act(make(), { type: 'hint' }), {
    type: 'elapse',
    ms: 30000,
  });
  const result = act(last, { type: 'tie', players: [1, 3] });
  expect(result.phase).toBe('summary');
  expect(result.players.map((p) => p.scoreUnits)).toEqual([0, 1, 0, 1]);
  expect(result.lastEntries[0]).toMatchObject({
    hinted: true,
    bonusUnits: 0,
    sharedWith: 3,
  });
});

it('corrects single answers, ties and skips reversibly without double awards', () => {
  let game = act(act(make(), { type: 'guess', player: 1 }), { type: 'end' });
  game = act(game, { type: 'assign', index: 0, player: 2, sharedWith: 3 });
  expect(game.players.map((p) => p.scoreUnits)).toEqual([1, 0, 1, 1]);
  expect(
    act(game, { type: 'assign', index: 0, player: 3, sharedWith: 2 }),
  ).toBe(game);
  game = act(game, { type: 'assign', index: 0, player: 1 });
  expect(game.players.map((p) => p.scoreUnits)).toEqual([1, 2, 0, 0]);
  expect(game.lastEntries[0]?.sharedWith).toBeUndefined();
  game = act(game, { type: 'assign', index: 0, player: null });
  expect(game.players.map((p) => p.scoreUnits)).toEqual([-2, 0, 0, 0]);
  game = act(game, { type: 'assign', index: 0, player: 1, sharedWith: 2 });
  expect(game.players.map((p) => p.scoreUnits)).toEqual([1, 1, 1, 0]);
  expect(game.entries).toEqual(game.lastEntries);
  expect(decodeGame(encodeGame(game))).toEqual(game);
});

it('reopens a finished game if splitting a winning answer removes the winning point', () => {
  let game = make();
  game = {
    ...game,
    players: game.players.map((p) =>
      p.id === 1 ? { ...p, scoreUnits: 118 } : p,
    ),
  };
  game = act(act(game, { type: 'guess', player: 1 }), { type: 'next' });
  expect(game.phase).toBe('finished');
  game = act(game, { type: 'assign', index: 0, player: 1, sharedWith: 2 });
  expect(game.players[1]?.scoreUnits).toBe(119);
  expect(game).toMatchObject({ phase: 'summary', turn: 0 });
  expect(act(game, { type: 'next' })).toMatchObject({
    phase: 'ready',
    turn: 1,
  });
});

it.each([
  [1, 1],
  [0, 1],
  [1, 0],
  [1, 99],
  [1, 2.5],
])('rejects invalid simultaneous answer %j', (first, second) => {
  const game = make();
  expect(() => act(game, { type: 'tie', players: [first, second] })).toThrow();
  const summary = act(act(game, { type: 'guess', player: 1 }), { type: 'end' });
  expect(() =>
    act(summary, {
      type: 'assign',
      index: 0,
      player: first,
      sharedWith: second,
    }),
  ).toThrow();
});

it('rejects corrupt saved ties while preserving previous single-answer snapshots', () => {
  const game = act(act(make(), { type: 'tie', players: [1, 2] }), {
    type: 'end',
  });
  for (const sharedWith of [null, '2', 0, 1, 99]) {
    const corrupt = {
      ...game,
      entries: game.entries.map((entry) => ({ ...entry, sharedWith })),
    };
    expect(() =>
      decodeGame(JSON.stringify({ version: 2, game: corrupt })),
    ).toThrow();
  }
  const single = act(act(make(), { type: 'guess', player: 1 }), {
    type: 'end',
  });
  expect(decodeGame(encodeGame(single))).toEqual(single);
});

it('holds time while choosing, saves both recipients and reports their half-points', async () => {
  let now = 0;
  const records = new Map<string, string>();
  const storage = {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => {
      records.set(key, value);
    },
    removeItem() {},
  };
  const controller = createController({
    storage,
    now: () => now,
    loadHints: () => Promise.resolve({}),
    loadWords: () =>
      Promise.resolve({
        easy: ['кот', 'дом', 'лес'],
        fresh: [],
        normal: [],
        hard: [],
      }),
  });
  await controller.initialize();
  controller.start({
    ...controller.config,
    names: ['Аня', 'Борис', 'Вера'],
    packs: ['easy'],
  });
  controller.dispatch({ type: 'begin' });
  controller.openPicker();
  now = 90000;
  controller.checkpoint();
  expect(controller.game?.remainingMs).toBe(60000);
  controller.dispatch({ type: 'tie', players: [1, 2] });
  controller.closePicker();
  expect(controller.held).toBe(false);
  expect(controller.message).toBe('Борис +0,5 · Вера +0,5 · Аня +0,5');
  expect(
    createController({ storage }).game?.players.map((p) => p.scoreUnits),
  ).toEqual([1, 1, 1]);
});
