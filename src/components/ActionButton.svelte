<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import { TouchTap, touchClicks } from '../lib/touch-activation';

  type Props = Omit<
    HTMLButtonAttributes,
    | 'onclick'
    | 'onpointerdown'
    | 'onpointermove'
    | 'onpointerup'
    | 'onpointercancel'
    | 'onlostpointercapture'
  > & { activate: () => void; children?: Snippet };

  let { activate, children, ...attributes }: Props = $props();
  const tap = new TouchTap();

  function finishTouch(event: PointerEvent) {
    const button = event.currentTarget as HTMLButtonElement;
    const accepted = tap.end(event, button.getBoundingClientRect());
    if (accepted !== null) {
      touchClicks.arm(event.pointerId);
      if (accepted && !attributes.disabled) {
        activate();
      }
    }
  }

  function cancelTouch(event: PointerEvent) {
    if (tap.cancel(event.pointerId)) {
      touchClicks.arm(event.pointerId);
    }
  }
</script>

<button
  {...attributes}
  type={attributes.type ?? 'button'}
  onpointerdown={(event) => tap.begin(event)}
  onpointermove={(event) => tap.move(event)}
  onpointerup={finishTouch}
  onpointercancel={cancelTouch}
  onlostpointercapture={cancelTouch}
  onclick={activate}
>
  {@render children?.()}
</button>
