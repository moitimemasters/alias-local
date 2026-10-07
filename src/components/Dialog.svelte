<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  let {
    title,
    close,
    children,
  }: { title: string; close: () => void; children: Snippet } = $props();
  let dialog: HTMLDialogElement;
  onMount(() => {
    dialog.showModal();
  });
</script>

<dialog
  bind:this={dialog}
  onclose={close}
  onclick={(e) => {
    if (e.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        dialog.close();
    }
  }}
>
  <div class="dialog-heading">
    <h2>{title}</h2>
    <button
      class="icon-button"
      aria-label="Закрыть"
      onclick={() => dialog.close()}><Icon name="close" /></button
    >
  </div>
  {@render children()}
</dialog>
