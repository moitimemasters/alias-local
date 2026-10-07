import { expect, it } from 'vitest';
import { WordGesture } from '../lib/word-gesture';
const pointer = {
  pointerId: 1,
  clientX: 150,
  clientY: 250,
  isPrimary: true,
  button: 0,
};

it.each([
  ['up', 100],
  ['down', 400],
] as const)(
  'resolves %s once and suppresses only its compatibility click',
  (direction, y) => {
    const gesture = new WordGesture();
    expect(gesture.begin(pointer)).toBe(true);
    expect(gesture.end({ ...pointer, clientY: y })).toBe(direction);
    gesture.cancel(pointer.pointerId); // automatic lostpointercapture follows pointerup
    expect(gesture.consumeClick({ detail: 1, pointerId: 1 })).toBe(true);
    expect(gesture.consumeClick({ detail: 1, pointerId: 1 })).toBe(false);
    expect(gesture.end({ ...pointer, clientY: y })).toBeNull();
  },
);

it('keeps a later tap and keyboard activation when a swipe did not produce a click', () => {
  const gesture = new WordGesture();
  gesture.begin(pointer);
  gesture.end({ ...pointer, clientY: 100 });
  expect(gesture.consumeClick({ detail: 0 })).toBe(false);
  gesture.begin(pointer);
  expect(gesture.end(pointer)).toBeNull();
  expect(gesture.consumeClick({ detail: 1, pointerId: 1 })).toBe(false);
});

it('does not resolve cancellation, foreign pointers, short or diagonal movements, or right click', () => {
  const gesture = new WordGesture();
  expect(gesture.begin({ ...pointer, button: 2 })).toBe(false);
  expect(gesture.begin({ ...pointer, isPrimary: false })).toBe(false);
  gesture.begin(pointer);
  expect(gesture.end({ ...pointer, pointerId: 2, clientY: 400 })).toBeNull();
  gesture.cancel(1);
  expect(gesture.end({ ...pointer, clientY: 400 })).toBeNull();
  gesture.begin(pointer);
  expect(gesture.end({ ...pointer, clientY: 270 })).toBeNull();
  gesture.begin(pointer);
  expect(gesture.end({ ...pointer, clientX: 300, clientY: 350 })).toBeNull();
});
