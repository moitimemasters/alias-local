import { expect, it } from 'vitest';
import {
  createGame,
  reduceGame,
  type Action,
  type GameState,
} from '../lib/game';
import { decodeGame, encodeGame } from '../lib/persistence';
import { createController } from '../lib/controller.svelte';
import { isDefinitions, normalizeWord } from '../lib/definitions';
import { readFileSync } from 'node:fs';

const make = () =>
  reduceGame(
    createGame(
      {
        names: ['Аня', 'Борис', 'Вера'],
        packs: ['fresh'],
        seconds: 30,
        target: 60,
      },
      ['кот', 'дом', 'лес', 'море'],
      () => 0.5,
    ),
    { type: 'begin' },
  );
const act = (game: GameState, action: Action) => reduceGame(game, action);

it('keeps the guesser point, removes only the current-word bonus and restores that choice on undo and reload', () => {
  const initial = make();
  const hinted = act(initial, { type: 'hint' });
  expect(hinted.players).toEqual(initial.players);
  expect(act(hinted, { type: 'hint' })).toBe(hinted);
  const restored = act(decodeGame(encodeGame(hinted)), { type: 'resume' });
  expect(restored.hintUsed).toBe(true);
  const guessed = act(restored, { type: 'guess', player: 1 });
  expect(guessed.players.map((p) => p.scoreUnits)).toEqual([0, 2, 0]);
  expect(guessed.entries[0]).toMatchObject({ hinted: true, bonusUnits: 0 });
  expect(guessed.hintUsed).toBe(false);
  const undone = act(guessed, { type: 'undo' });
  expect(undone.word).toBe(initial.word);
  expect(undone.hintUsed).toBe(true);
  expect(undone.players).toEqual(initial.players);
  const skipped = act(undone, { type: 'skip' });
  expect(skipped.players[0]?.scoreUnits).toBe(-2);
  const normal = act(skipped, { type: 'guess', player: 2 });
  expect(normal.players.map((p) => p.scoreUnits)).toEqual([-1, 0, 2]);
});

it('supports a hint on the untimed last word and rejects it while paused', () => {
  const last = act(make(), { type: 'elapse', ms: 30000 });
  const summary = act(act(last, { type: 'hint' }), {
    type: 'guess',
    player: 2,
  });
  expect(summary.phase).toBe('summary');
  expect(summary.players.map((p) => p.scoreUnits)).toEqual([0, 0, 2]);
  expect(() => act(act(make(), { type: 'pause' }), { type: 'hint' })).toThrow();
});

it('moves points between guessers exactly once and reversibly corrects guesses to skips and back', () => {
  const hinted = act(make(), { type: 'hint' });
  let game = act(
    act(act(hinted, { type: 'guess', player: 1 }), { type: 'skip' }),
    { type: 'end' },
  );
  const before = JSON.stringify(game);
  const reassigned = act(game, { type: 'assign', index: 0, player: 2 });
  expect(JSON.stringify(game)).toBe(before);
  expect(reassigned.players.map((p) => p.scoreUnits)).toEqual([-2, 0, 2]);
  expect(act(reassigned, { type: 'assign', index: 0, player: 2 })).toBe(
    reassigned,
  );
  game = act(reassigned, { type: 'assign', index: 1, player: 1 });
  expect(game.players.map((p) => p.scoreUnits)).toEqual([1, 2, 2]);
  game = act(game, { type: 'assign', index: 0, player: null });
  expect(game.players.map((p) => p.scoreUnits)).toEqual([-1, 2, 0]);
  game = act(game, { type: 'assign', index: 0, player: 1 });
  expect(game.players.map((p) => p.scoreUnits)).toEqual([1, 4, 0]); // hint remains in effect
  expect(game.entries).toEqual(game.lastEntries);
  expect(decodeGame(encodeGame(game)).players).toEqual(game.players);
});

it('reopens the final round when a correction removes the winning score, without skipping an explainer', () => {
  let game = make();
  game = {
    ...game,
    players: game.players.map((p) => ({
      ...p,
      scoreUnits: p.id === 1 ? 118 : 0,
    })),
  };
  game = act(act(game, { type: 'guess', player: 1 }), { type: 'next' });
  expect(game.phase).toBe('finished');
  game = act(game, { type: 'assign', index: 0, player: 2 });
  expect(game.phase).toBe('summary');
  expect(game.turn).toBe(0);
  expect(act(game, { type: 'next' })).toMatchObject({
    phase: 'ready',
    turn: 1,
  });
});

it('rejects edits of active turns, invalid indexes and assigning the explainer', () => {
  const active = make();
  expect(() => act(active, { type: 'assign', index: 0, player: 1 })).toThrow();
  const summary = act(act(active, { type: 'guess', player: 1 }), {
    type: 'end',
  });
  for (const action of [
    { type: 'assign', index: -1, player: 1 },
    { type: 'assign', index: 0.5, player: 1 },
    { type: 'assign', index: 0, player: 0 },
    { type: 'assign', index: 0, player: 99 },
  ] as const) {
    expect(() => act(summary, action)).toThrow();
  }
});

it('migrates old snapshots without hints, but rejects corrupt new hint flags', () => {
  const record: { version: number; game: Record<string, unknown> } = JSON.parse(
    encodeGame(make()),
  ) as { version: number; game: Record<string, unknown> };
  delete record.game.hintUsed;
  expect(decodeGame(JSON.stringify(record)).hintUsed).toBe(false);
  record.game.hintUsed = 'yes';
  expect(() => decodeGame(JSON.stringify(record))).toThrow();
});

it('allows per-word hints in an old saved party with its global hint setting off', () => {
  const record = JSON.parse(encodeGame(make())) as {
    version: number;
    game: GameState & { config: GameState['config'] & { hints?: boolean } };
  };
  record.game.config.hints = false;
  const restored = act(decodeGame(JSON.stringify(record)), { type: 'resume' });
  expect('hints' in restored.config).toBe(false);
  const hinted = act(restored, { type: 'hint' });
  expect(decodeGame(encodeGame(hinted)).hintUsed).toBe(true);
  const guessed = act(hinted, { type: 'guess', player: 1 });
  expect(guessed.players.map((p) => p.scoreUnits)).toEqual([0, 2, 0]);
  const next = act(guessed, { type: 'guess', player: 2 });
  expect(next.players.map((p) => p.scoreUnits)).toEqual([1, 2, 2]);
});

it('ships real Russian definitions matching game words, with accent and ё normalization', () => {
  const definitions: unknown = JSON.parse(
    readFileSync(
      new URL('../../public/definitions.json', import.meta.url),
      'utf8',
    ),
  );
  expect(isDefinitions(definitions)).toBe(true);
  expect(normalizeWord(' Ёлка́ ')).toBe('елка');
  if (!isDefinitions(definitions)) {
    throw new Error('Invalid bundled definitions');
  }
  expect(definitions['идеология']?.meanings[0]).toMatch(/система взглядов/);
  expect(Object.keys(definitions).length).toBeGreaterThan(17000);
});

it('shows only local available hints, freezes reading time and checkpoints the used hint', async () => {
  let now = 0;
  const records = new Map<string, string>();
  const controller = createController({
    storage: {
      getItem: (key) => records.get(key) ?? null,
      setItem: (key, value) => {
        records.set(key, value);
      },
      removeItem: (key) => {
        records.delete(key);
      },
    },
    now: () => now,
    loadWords: () =>
      Promise.resolve({
        fresh: ['кот'],
        hard: ['кот'],
        normal: ['кот'],
        easy: ['кот'],
      }),
    loadHints: () =>
      Promise.resolve({ кот: { word: 'кот', meanings: ['Самец кошки.'] } }),
  });
  await controller.initialize();
  controller.start();
  controller.dispatch({ type: 'begin' });
  now = 1000;
  controller.openHint();
  expect(controller.hint?.word).toBe('кот');
  expect(controller.game?.hintUsed).toBe(true);
  expect(controller.held).toBe(true);
  now = 90000;
  controller.checkpoint();
  expect(controller.game?.remainingMs).toBe(59000);
  controller.closeHint();
  expect(controller.held).toBe(false);
  controller.dispatch({ type: 'guess', player: 1 });
  expect(controller.message).not.toContain('+0,5');
  controller.dispatch({ type: 'next' });
  expect(controller.game?.phase).toBe('finished');
  controller.dispatch({ type: 'assign', index: 0, player: 2 });
  const restored = createController({
    storage: {
      getItem: (key) => records.get(key) ?? null,
      setItem() {},
      removeItem() {},
    },
  });
  expect(restored.game?.players.map((p) => p.scoreUnits)).toEqual([0, 0, 2]);
});

it('does not charge for a missing definition or hold the clock', async () => {
  const controller = createController({
    storage: { getItem: () => null, setItem() {}, removeItem() {} },
    loadWords: () =>
      Promise.resolve({
        fresh: ['нет определения'],
        hard: [],
        normal: [],
        easy: [],
      }),
    loadHints: () => Promise.resolve({}),
  });
  await controller.initialize();
  controller.start();
  controller.dispatch({ type: 'begin' });
  controller.openHint();
  expect(controller.hint).toBeNull();
  expect(controller.game?.hintUsed).toBe(false);
  expect(controller.held).toBe(false);
});

it('preserves historic zero bonuses when moving a legacy guess to another player', () => {
  const guessed = act(make(), { type: 'guess', player: 1 });
  const entries = guessed.entries.map((entry) => ({
    ...entry,
    hinted: undefined,
    bonusUnits: 0,
  }));
  const legacy = {
    ...act(guessed, { type: 'end' }),
    entries,
    lastEntries: entries,
    players: guessed.players.map((player) =>
      player.id === 0 ? { ...player, scoreUnits: 0 } : player,
    ),
  };
  const corrected = act(legacy, { type: 'assign', index: 0, player: 2 });
  expect(corrected.players.map((player) => player.scoreUnits)).toEqual([
    0, 0, 2,
  ]);
});
