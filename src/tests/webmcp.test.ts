import { afterEach, expect, it, vi } from 'vitest';
import { createController } from '../lib/controller.svelte';
import { registerGameTools } from '../lib/webmcp';

afterEach(() => vi.unstubAllGlobals());

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
