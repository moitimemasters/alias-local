import { afterEach, expect, it, vi } from 'vitest';
import { createController } from '../lib/controller.svelte';
import { registerGameTools } from '../lib/webmcp';

afterEach(() => vi.unstubAllGlobals());

it.each([false, true])(
  'cleans up optional browser tools when unregisterTool is present: %s',
  (supportsCleanup) => {
    const unregisterTool = vi.fn();
    const registerTool = vi.fn();
    vi.stubGlobal('document', {
      modelContext: {
        registerTool,
        ...(supportsCleanup ? { unregisterTool } : {}),
      },
    });
    const controller = createController({
      storage: { getItem: () => null, setItem() {}, removeItem() {} },
    });
    const cleanup = registerGameTools(controller);
    expect(registerTool).toHaveBeenCalledTimes(3);
    expect(cleanup).not.toThrow();
    expect(unregisterTool).toHaveBeenCalledTimes(supportsCleanup ? 3 : 0);
  },
);
