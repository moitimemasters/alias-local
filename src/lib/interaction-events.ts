import type { TurnClock } from './clock';
import { touchClicks } from './touch-activation';

/** Capture input before controls act; release after native click/keyboard activation. */
export function attachInteractionEvents(
  clock: TurnClock,
  pauseForBackground: () => void,
  documentTarget: EventTarget & { hidden: boolean } = document,
  windowTarget: EventTarget = window,
) {
  const pending = new Map<string, ReturnType<typeof setTimeout>>();

  function hold(reason: string) {
    clearTimeout(pending.get(reason));
    pending.delete(reason);
    clock.hold(reason);
  }

  function release(reason: string) {
    clearTimeout(pending.get(reason));
    pending.set(
      reason,
      setTimeout(() => {
        pending.delete(reason);
        clock.release(reason);
      }, 0),
    );
  }

  function clearInputs() {
    for (const timeout of pending.values()) {
      clearTimeout(timeout);
    }
    pending.clear();
    clock.clearInputHolds();
  }

  function background() {
    pauseForBackground();
    clearInputs();
  }

  function visibility() {
    if (documentTarget.hidden) {
      background();
    }
  }

  const pointerDown = (event: Event) => {
    touchClicks.reset();
    hold(`pointer:${(event as PointerEvent).pointerId}`);
  };
  const pointerUp = (event: Event) =>
    release(`pointer:${(event as PointerEvent).pointerId}`);
  const keyDown = (event: Event) =>
    hold(`key:${(event as KeyboardEvent).code}`);
  const keyUp = (event: Event) =>
    release(`key:${(event as KeyboardEvent).code}`);
  const click = (event: Event) => {
    if (touchClicks.consume(event as MouseEvent)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  const listeners: [EventTarget, string, EventListener, boolean][] = [
    [documentTarget, 'pointerdown', pointerDown, true],
    [documentTarget, 'pointerup', pointerUp, true],
    [documentTarget, 'pointercancel', pointerUp, true],
    [documentTarget, 'lostpointercapture', pointerUp, true],
    [documentTarget, 'click', click, true],
    [documentTarget, 'keydown', keyDown, true],
    [documentTarget, 'keyup', keyUp, true],
    [documentTarget, 'visibilitychange', visibility, false],
    [windowTarget, 'pagehide', background, false],
    [windowTarget, 'blur', background, false],
  ];

  for (const [target, type, handler, capture] of listeners) {
    target.addEventListener(type, handler, { capture });
  }

  return () => {
    for (const [target, type, handler, capture] of listeners) {
      target.removeEventListener(type, handler, { capture });
    }
    clearInputs();
    touchClicks.reset();
  };
}
