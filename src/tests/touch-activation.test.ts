import { afterEach, expect, it, vi } from 'vitest';
import {
  TouchTap,
  TouchClickGuard,
  touchClicks,
} from '../lib/touch-activation';
import { TurnClock } from '../lib/clock';
import { attachInteractionEvents } from '../lib/interaction-events';

const pointer = {
  pointerId: 7,
  clientX: 50,
  clientY: 30,
  pointerType: 'touch',
  isPrimary: true,
  button: 0,
};
const bounds = { left: 0, right: 100, top: 0, bottom: 60 };
afterEach(() => {
  touchClicks.reset();
  vi.useRealTimers();
});

it.each(['touch', 'pen'])(
  'accepts a single %s release anywhere inside the button',
  (pointerType) => {
    const tap = new TouchTap();
    tap.begin({ ...pointer, pointerType });
    expect(tap.end({ ...pointer, clientX: 56 }, bounds)).toBe(true);
    expect(tap.end(pointer, bounds)).toBeNull();
  },
);

it.each([{ pointerType: 'mouse' }, { isPrimary: false }, { button: 2 }])(
  'leaves ordinary click activation for unsupported input: %j',
  (change) => {
    const tap = new TouchTap();
    tap.begin({ ...pointer, ...change });
    expect(tap.end(pointer, bounds)).toBeNull();
  },
);

it('rejects scrolling even if the finger returns to its origin, and ignores foreign releases', () => {
  const tap = new TouchTap();
  tap.begin(pointer);
  expect(tap.end({ ...pointer, pointerId: 9 }, bounds)).toBeNull();
  tap.move({ ...pointer, clientY: 50 });
  expect(tap.end(pointer, bounds)).toBe(false);
  tap.begin({ ...pointer, clientX: 98 });
  expect(tap.end({ ...pointer, clientX: 101 }, bounds)).toBe(false);
  tap.begin(pointer);
  expect(tap.cancel(9)).toBe(false);
  expect(tap.cancel(7)).toBe(true);
  expect(tap.cancel(7)).toBe(false);
  expect(tap.end(pointer, bounds)).toBeNull();
});

it.each([7, undefined, -1, 0])(
  'suppresses one compatibility click, including legacy mouse click %s',
  (pointerId) => {
    const guard = new TouchClickGuard();
    guard.arm(7);
    expect(guard.consume({ detail: 0 })).toBe(false); // keyboard and accessibility
    expect(guard.consume({ detail: 1, pointerId: 9 })).toBe(false);
    expect(
      guard.consume({
        detail: 1,
        ...(pointerId === undefined ? {} : { pointerId }),
      }),
    ).toBe(true);
    expect(guard.consume({ detail: 1, pointerId: 7 })).toBe(false);
  },
);

it('intercepts a retargeted compatibility click and never eats the next genuine tap', () => {
  vi.useFakeTimers();
  const documentTarget = Object.assign(new EventTarget(), { hidden: false });
  const clock = new TurnClock(
    () => true,
    () => {},
  );
  const detach = attachInteractionEvents(
    clock,
    () => {},
    documentTarget,
    new EventTarget(),
  );
  const send = (type: string, detail = 1) =>
    documentTarget.dispatchEvent(
      Object.assign(new Event(type, { cancelable: true }), {
        pointerId: 7,
        detail,
      }),
    );
  send('pointerdown');
  send('pointerup');
  touchClicks.arm(7); // button action closes and removes its modal
  expect(send('click')).toBe(false); // may target a different button underneath
  expect(send('click')).toBe(true);
  touchClicks.arm(7); // previous touch produced no compatibility click
  send('pointerdown');
  expect(send('click')).toBe(true); // new physical tap resets the guard
  touchClicks.arm(7);
  expect(send('click', 0)).toBe(true);
  detach();
  expect(send('click')).toBe(true);
  expect(clock.held).toBe(false);
});
