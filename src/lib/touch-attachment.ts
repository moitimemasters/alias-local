import type { Attachment } from 'svelte/attachments';
import { TouchTap, touchClicks } from './touch-activation';

/** Use native activation for touch releases, including <summary> disclosure. */
export const touchActivation: Attachment<HTMLElement> = (element) => {
  const tap = new TouchTap();
  const down = (event: PointerEvent) => tap.begin(event);
  const move = (event: PointerEvent) => tap.move(event);
  const up = (event: PointerEvent) => {
    const accepted = tap.end(event, element.getBoundingClientRect());
    if (accepted !== null) {
      touchClicks.arm(event.pointerId);
      if (accepted) {
        element.click(); // detail=0: native semantics, one action; compatibility click is guarded
      }
    }
  };
  const cancel = (event: PointerEvent) => {
    if (tap.cancel(event.pointerId)) {
      touchClicks.arm(event.pointerId);
    }
  };
  element.addEventListener('pointerdown', down);
  element.addEventListener('pointermove', move);
  element.addEventListener('pointerup', up);
  element.addEventListener('pointercancel', cancel);
  element.addEventListener('lostpointercapture', cancel);
  return () => {
    element.removeEventListener('pointerdown', down);
    element.removeEventListener('pointermove', move);
    element.removeEventListener('pointerup', up);
    element.removeEventListener('pointercancel', cancel);
    element.removeEventListener('lostpointercapture', cancel);
  };
};
