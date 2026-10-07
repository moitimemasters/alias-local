import { describe, expect, it } from 'vitest';
import {
  createGame,
  reduceGame,
  type GameState,
  type Action,
} from '../lib/game';
import { TurnClock } from '../lib/clock';
import { decodeGame, encodeGame, loadLocal } from '../lib/persistence';
const words = Array.from({ length: 300 }, (_, i) => `слово ${i}`);
const make = (names = ['Аня', 'Борис', 'Вера']) =>
  createGame(
    { names, packs: ['fresh'], seconds: 30, target: 60 },
    words,
    () => 0.5,
  );
const act = (game: GameState, action: Action) => reduceGame(game, action);

describe('personal scores and turn transitions', () => {
  it('gives +1 to the guesser and +0.5 to the explainer, without mutating the previous state', () => {
    const game = act(make(), { type: 'begin' });
    const next = act(game, { type: 'guess', player: 1 });
    expect(next.players.map((p) => p.scoreUnits)).toEqual([1, 2, 0]);
    expect(game.players.map((p) => p.scoreUnits)).toEqual([0, 0, 0]);
    expect(() => act(game, { type: 'guess', player: 0 })).toThrow();
    expect(next.word).not.toBe(game.word);
  });
  it('allows negative half-points and undoes both awards and skips', () => {
    const initial = act(make(), { type: 'begin' });
    const guessed = act(initial, { type: 'guess', player: 1 });
    const skipped = act(guessed, { type: 'skip' });
    expect(skipped.players.map((p) => p.scoreUnits)).toEqual([-1, 2, 0]);
    const undoSkip = act(skipped, { type: 'undo' });
    expect(undoSkip.word).toBe(guessed.word);
    const undone = act(undoSkip, { type: 'undo' });
    expect(undone.players).toEqual(initial.players);
    expect(undone.deck).toEqual(initial.deck);
    expect(undone.word).toBe(initial.word);
  });
  it.each(['guess', 'skip'] as const)(
    'keeps the last word untimed until %s resolves it',
    (type) => {
      const initial = act(make(), { type: 'begin' });
      let game = act(initial, { type: 'elapse', ms: 60000 });
      expect(game.phase).toBe('lastword');
      expect(game.word).toBe(initial.word);
      game = act(game, { type: 'elapse', ms: 999999 });
      expect(game.word).toBe(initial.word);
      game = act(game, type === 'guess' ? { type, player: 2 } : { type });
      expect(game.phase).toBe('summary');
      expect(game.lastEntries).toHaveLength(1);
      game = act(game, { type: 'next' });
      expect(game.phase).toBe('ready');
      expect(game.turn).toBe(1);
    },
  );
  it('does not advance or accept guesses while paused, and resumes the same word', () => {
    const initial = act(make(), { type: 'begin' });
    const paused = act(initial, { type: 'pause' });
    expect(act(paused, { type: 'elapse', ms: 999999 })).toEqual(paused);
    expect(() => act(paused, { type: 'guess', player: 1 })).toThrow();
    const resumed = act(paused, { type: 'resume' });
    expect(resumed.phase).toBe('playing');
    expect(resumed.word).toBe(initial.word);
    expect(act(paused, { type: 'pause' })).toEqual(paused);
  });
  it('finishes at 60 personal points, including the explainer half-point', () => {
    let game = act(make(), { type: 'begin' });
    for (let i = 0; i < 60; i++) game = act(game, { type: 'guess', player: 1 });
    expect(game.phase).toBe('summary');
    expect(game.players.map((p) => p.scoreUnits)).toEqual([60, 120, 0]);
    expect(act(game, { type: 'next' }).phase).toBe('finished');
    let explaining = act(make(), { type: 'begin' });
    explaining = {
      ...explaining,
      players: explaining.players.map((p, i) => ({
        ...p,
        scoreUnits: i === 0 ? 119 : 0,
      })),
    };
    expect(act(explaining, { type: 'guess', player: 1 }).phase).toBe('summary');
  });
  it('never repeats words across turns and ends when the deck is exhausted', () => {
    let game = createGame(
      { names: ['Аня', 'Борис'], packs: ['easy'], seconds: 30, target: 60 },
      ['кот', 'кот', 'лес'],
    );
    game = act(game, { type: 'begin' });
    const seen = game.word;
    game = act(game, { type: 'skip' });
    expect(game.word).not.toBe(seen);
    game = act(game, { type: 'skip' });
    expect(game.exhausted).toBe(true);
    expect(act(game, { type: 'next' }).phase).toBe('finished');
  });
  it('rejects invalid setup, IDs and elapsed time', () => {
    expect(() => make(['Аня', 'аня'])).toThrow();
    expect(() => make(['Аня'])).toThrow();
    const game = act(make(), { type: 'begin' });
    expect(() => act(game, { type: 'guess', player: -1 })).toThrow();
    expect(() => act(game, { type: 'elapse', ms: NaN })).toThrow();
  });
});
describe('clock interactions', () => {
  it('excludes overlapping pointers, dialogs and manual pause, then resumes without a time jump', () => {
    let now = 0;
    let game = act(make(), { type: 'begin' });
    const clock = new TurnClock(
      () => game.phase === 'playing',
      (ms) => {
        game = act(game, { type: 'elapse', ms });
      },
      () => now,
    );
    now = 1000;
    clock.hold('pointer');
    expect(game.remainingMs).toBe(29000);
    now = 2000;
    clock.hold('picker');
    now = 3000;
    clock.release('pointer');
    now = 90000;
    clock.flush();
    expect(game.remainingMs).toBe(29000);
    clock.release('picker');
    now = 91000;
    clock.flush();
    expect(game.remainingMs).toBe(28000);
    game = act(game, { type: 'pause' });
    now = 1000000;
    clock.flush();
    expect(game.remainingMs).toBe(28000);
    game = act(game, { type: 'resume' });
    clock.reset();
    now += 1000;
    clock.flush();
    expect(game.remainingMs).toBe(27000);
  });
});
describe('local persistence', () => {
  it('round-trips exact deck, current word, negative fractional score and undo with a paused clock', () => {
    let game = act(make(), { type: 'begin' });
    game = act(game, { type: 'guess', player: 1 });
    game = act(game, { type: 'skip' });
    game = act(game, { type: 'elapse', ms: 3456 });
    const restored = decodeGame(encodeGame(game));
    expect(restored.phase).toBe('paused');
    expect(restored.deck).toEqual(game.deck);
    expect(restored.word).toBe(game.word);
    expect(restored.players).toEqual(game.players);
    const resumed = act(restored, { type: 'resume' });
    expect(act(resumed, { type: 'undo' }).players[0].scoreUnits).toBe(1);
  });
  it('preserves ready, summary and last-word stages', () => {
    expect(decodeGame(encodeGame(make())).phase).toBe('ready');
    const last = act(act(make(), { type: 'begin' }), {
      type: 'elapse',
      ms: 30000,
    });
    const saved = decodeGame(encodeGame(last));
    expect(act(saved, { type: 'resume' }).phase).toBe('lastword');
    const summary = act(last, { type: 'guess', player: 1 });
    expect(decodeGame(encodeGame(summary)).phase).toBe('summary');
  });
  it('migrates 1.4 half-points and pre-1.4 entries without inventing past bonuses', () => {
    const legacy = {
      version: 1,
      selected: ['fresh'],
      game: {
        version: 1,
        players: [
          { id: 0, name: 'Аня', score: -0.5 },
          { id: 1, name: 'Борис', score: 1 },
        ],
        deck: ['лес'],
        seconds: 30,
        target: 60,
        turn: 0,
        status: 'paused',
        beforePause: 'playing',
        remaining: 12345,
        current: 'море',
        log: [
          { word: 'кот', player: 1, explainer: 0, bonus: 0.5 },
          { word: 'дом', player: null, explainer: 0 },
        ],
        lastLog: [],
        exhausted: false,
      },
    };
    let game = decodeGame(JSON.stringify(legacy));
    expect(game.players[0].scoreUnits).toBe(-1);
    game = act(game, { type: 'resume' });
    game = act(game, { type: 'undo' });
    game = act(game, { type: 'undo' });
    expect(game.players.map((p) => p.scoreUnits)).toEqual([0, 0]);
    legacy.game.players[0].score = -1;
    delete (legacy.game.log[0] as { bonus?: number }).bonus;
    expect(decodeGame(JSON.stringify(legacy)).entries[0].bonusUnits).toBe(0);
  });
  it('rejects corrupted saves and keeps an error recoverable', () => {
    const record = JSON.parse(encodeGame(make()));
    record.game.players[0].scoreUnits = 0.5;
    expect(() => decodeGame(JSON.stringify(record))).toThrow();
    expect(() => decodeGame('{broken')).toThrow();
    const loaded = loadLocal({
      getItem: () => '{broken',
      setItem() {},
      removeItem() {},
    });
    expect(loaded.game).toBeNull();
    expect(loaded.error).toBeTruthy();
  });
});
