import { afterEach, expect, it, vi } from 'vitest';
import { createController } from '../lib/controller.svelte';
import { registerGameTools } from '../lib/webmcp';

afterEach(() => vi.unstubAllGlobals());

it('accepts two or more distinct eligible players for a tie through the browser tool', async () => {
  const tools = new Map<
    string,
    { execute: (input: Record<string, unknown>) => unknown }
  >();
  vi.stubGlobal('document', {
    modelContext: {
      registerTool: (tool: {
        name: string;
        execute: (input: Record<string, unknown>) => unknown;
      }) => tools.set(tool.name, tool),
    },
  });
  const controller = createController({
    storage: { getItem: () => null, setItem() {}, removeItem() {} },
    loadHints: () => Promise.resolve({}),
    loadWords: () =>
      Promise.resolve({
        fresh: ['кот', 'дом'],
        easy: [],
        hard: [],
        normal: [],
      }),
  });
  await controller.initialize();
  controller.start({
    ...controller.config,
    names: ['Аня', 'Борис', 'Вера', 'Глеб'],
  });
  controller.dispatch({ type: 'begin' });
  const cleanup = registerGameTools(controller);
  await Promise.resolve();
  const play = tools.get('play_alias')!;
  for (const players of [undefined, [1], [1, 2, 2], [1, '2'], [1, 1], [0, 2]]) {
    expect(() => play.execute({ action: 'tie', players })).toThrow();
    expect(controller.game?.entries).toHaveLength(0);
  }
  expect(play.execute({ action: 'tie', players: [1, 2] })).toMatchObject({
    game: {
      players: [{ score: 0.5 }, { score: 0.5 }, { score: 0.5 }, { score: 0 }],
    },
  });
  expect(play.execute({ action: 'tie', players: [1, 2, 3] })).toMatchObject({
    game: {
      players: [
        { score: 1 },
        { score: 0.83 },
        { score: 0.83 },
        { score: 0.33 },
      ],
    },
  });
  cleanup();
});

it.each([false, true])(
  'cleans up optional browser tools when unregisterTool is present: %s',
  async (supportsCleanup) => {
    const unregisterTool = vi.fn();
    const registerTool = vi.fn();
    vi.stubGlobal('document', {
      modelContext: {
        registerTool,
        ...(supportsCleanup ? { unregisterTool } : {}),
      },
    });
    const controller = createController({
      loadHints: () => Promise.resolve({}),
      storage: { getItem: () => null, setItem() {}, removeItem() {} },
    });
    const cleanup = registerGameTools(controller);
    await Promise.resolve();
    expect(registerTool).toHaveBeenCalledTimes(3);
    expect(cleanup).not.toThrow();
    expect(unregisterTool).toHaveBeenCalledTimes(supportsCleanup ? 3 : 0);
  },
);

it('reuses registered tools after remount and forwards them to the current party', async () => {
  const tools = new Map<
    string,
    { execute: (input: Record<string, unknown>) => unknown }
  >();
  const registerTool = vi.fn(
    (tool: {
      name: string;
      execute: (input: Record<string, unknown>) => unknown;
    }) => {
      if (tools.has(tool.name)) {
        throw new Error('Duplicate tool name');
      }
      tools.set(tool.name, tool);
    },
  );
  vi.stubGlobal('document', { modelContext: { registerTool } });
  const makeController = () =>
    createController({
      loadHints: () => Promise.resolve({}),
      storage: { getItem: () => null, setItem() {}, removeItem() {} },
      loadWords: () =>
        Promise.resolve({
          fresh: ['кот', 'дом'],
          hard: [],
          normal: [],
          easy: [],
        }),
    });
  const first = makeController();
  const detachFirst = registerGameTools(first);
  await Promise.resolve();
  detachFirst();
  const next = makeController();
  await next.initialize();
  next.start({ ...next.config, names: ['Борис', 'Вера'] });
  const detachNext = registerGameTools(next);
  await Promise.resolve();
  expect(registerTool).toHaveBeenCalledTimes(3);
  const read = tools.get('read_alias_game');
  if (!read) {
    throw new Error('Read tool was not registered');
  }
  detachFirst(); // a stale owner must not detach the new party
  expect(read.execute({})).toMatchObject({
    game: { players: [{ name: 'Борис' }, { name: 'Вера' }] },
  });
  detachNext();
  expect(() => read.execute({})).toThrow(/недоступна/);
});
