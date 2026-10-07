import { afterEach, describe, expect, it, vi } from 'vitest';
import { createController } from '../lib/controller.svelte';
import { SAVE_KEY, type LocalStorage } from '../lib/persistence';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function harness() {
  let now = 0;
  const records = new Map<string, string>();
  const storage: LocalStorage = {
    getItem: (key) => records.get(key) ?? null,
    setItem: vi.fn((key, value) => {
      records.set(key, value);
    }),
    removeItem: vi.fn((key) => {
      records.delete(key);
    }),
  };
  const controller = createController({
    storage,
    now: () => now,
    loadWords: async () => ({
      fresh: ['кот', 'дом', 'лес'],
      hard: ['море'],
      normal: ['река'],
      easy: ['луна'],
    }),
  });
  return {
    controller,
    storage,
    records,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('controller lifecycle and storage', () => {
  it('recovers when the browser denies access to localStorage itself', () => {
    vi.stubGlobal('window', {
      get localStorage() {
        throw new Error('SecurityError');
      },
    });
    const controller = createController();
    expect(controller.game).toBeNull();
    expect(controller.error).toMatch(/Хранилище недоступно/);
    expect(controller.config.names).toHaveLength(3);
  });

  it('backs off failed periodic writes and stops background work after detach', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'document',
      Object.assign(new EventTarget(), { hidden: false }),
    );
    vi.stubGlobal('window', new EventTarget());
    const { controller, storage, advance } = harness();
    await controller.initialize();
    controller.start();
    controller.dispatch({ type: 'begin' });
    vi.mocked(storage.setItem)
      .mockClear()
      .mockImplementation(() => {
        throw new Error('QuotaExceeded');
      });
    const detach = controller.attach();
    advance(5000);
    vi.advanceTimersByTime(5000);
    expect(storage.setItem).toHaveBeenCalledOnce();
    advance(1000);
    vi.advanceTimersByTime(1000);
    expect(storage.setItem).toHaveBeenCalledOnce();
    detach();
    advance(10000);
    vi.advanceTimersByTime(10000);
    expect(storage.setItem).toHaveBeenCalledOnce();
  });
  it('preserves a modal hold after backgrounding and resume; inputs do not stick', async () => {
    const { controller, advance } = harness();
    await controller.initialize();
    controller.start();
    controller.dispatch({ type: 'begin' });
    advance(1000);
    controller.hold('modal');
    controller.hold('pointer:1');
    const remaining = controller.game?.remainingMs;
    controller.pauseForBackground();
    expect(controller.game?.phase).toBe('paused');
    controller.resume();
    advance(10000);
    controller.checkpoint();
    expect(controller.game?.remainingMs).toBe(remaining);
    controller.release('modal');
    advance(1000);
    controller.checkpoint();
    expect(controller.game?.remainingMs).toBe(59000 - 1000);
  });

  it('does not rewrite unchanged snapshots or preferences, and reports a failed checkpoint', async () => {
    const { controller, storage, records } = harness();
    await controller.initialize();
    controller.start();
    expect(records.has(SAVE_KEY)).toBe(true);
    const writes = vi.mocked(storage.setItem).mock.calls.length;
    controller.checkpoint();
    controller.checkpoint();
    expect(vi.mocked(storage.setItem).mock.calls).toHaveLength(writes);
    vi.mocked(storage.setItem).mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });
    controller.dispatch({ type: 'begin' });
    expect(controller.error).toMatch(/сохранить/);
    expect(controller.pauseForBackground()).toBe(false);
    expect(controller.game?.word).toBeTruthy();
  });

  it('keeps dictionary loading retryable and clears its error after success', async () => {
    const { controller } = harness();
    const first = createController({
      storage: { getItem: () => null, setItem() {}, removeItem() {} },
      loadWords: vi
        .fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({ fresh: ['кот'] }),
    });
    await first.initialize();
    expect(first.loading).toBe(false);
    expect(first.error).toMatch(/загрузить слова/);
    await first.initialize();
    expect(first.error).toBe('');
    expect(controller.game).toBeNull();
  });
});
