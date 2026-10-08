<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import { touchActivation } from '../lib/touch-attachment';

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
</script>

<button
  {...attributes}
  type={attributes.type ?? 'button'}
  {@attach touchActivation}
  onclick={activate}
>
  {@render children?.()}
</button>
