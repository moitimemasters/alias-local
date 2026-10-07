import { afterEach, expect, it, vi } from 'vitest';
import { TurnClock } from '../lib/clock';
import { attachInteractionEvents } from '../lib/interaction-events';

afterEach(() => vi.useRealTimers());

it('defers native activation, cancels stale releases and cleans up its callbacks', () => {
  vi.useFakeTimers();
  let now = 0;
  let elapsed = 0;
  const clock = new TurnClock(
    () => true,
    (ms) => {
      elapsed += ms;
    },
    () => now,
  );
  const documentTarget = Object.assign(new EventTarget(), { hidden: false });
  const windowTarget = new EventTarget();
  const background = vi.fn();
  const detach = attachInteractionEvents(
    clock,
    background,
    documentTarget,
    windowTarget,
  );
  const send = (type: string) =>
    documentTarget.dispatchEvent(
      Object.assign(new Event(type), { code: 'Space' }),
    );
  send('keydown');
  now = 1000;
  send('keyup');
  expect(clock.held).toBe(true);
  send('keydown');
  vi.runOnlyPendingTimers();
  expect(clock.held).toBe(true);
  expect(elapsed).toBe(0);
  send('keyup');
  clock.hold('modal');
  windowTarget.dispatchEvent(new Event('blur'));
  vi.runOnlyPendingTimers();
  expect(background).toHaveBeenCalledOnce();
  expect(clock.held).toBe(true);
  detach();
  clock.release('modal');
  send('keydown');
  expect(clock.held).toBe(false);
});
