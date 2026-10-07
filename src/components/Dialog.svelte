<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  let {
    title,
    close,
    children,
    initialFocus = 'heading',
  }: {
    title: string;
    close: () => void;
    children: Snippet;
    initialFocus?: 'heading' | 'action';
  } = $props();
  const headingId = $props.id();
  let dialog: HTMLDialogElement;
  let heading: HTMLHeadingElement;

  function keepFocus(event: KeyboardEvent) {
    if (event.key !== 'Tab') {
      return;
    }
    const actions = dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], [tabindex="0"]',
    );
    const first = actions[0];
    const last = actions[actions.length - 1];
    if (!first || !last) {
      return;
    }
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === heading)
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  onMount(() => {
    // Finish pointerup, implicit capture release and compatibility click first.
    const opening = setTimeout(() => {
      dialog.showModal();
      const action = dialog.querySelector<HTMLElement>(
        '[data-initial-focus], .dialog-content button',
      );
      if (initialFocus === 'action' && action) {
        action.focus({ preventScroll: true });
      } else {
        heading.focus({ preventScroll: true });
      }
    }, 0);
    return () => clearTimeout(opening);
  });
</script>

<dialog
  bind:this={dialog}
  aria-labelledby={headingId}
  onkeydown={keepFocus}
  onclose={close}
  onclick={(e) => {
    if (e.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      ) {
        dialog.close();
      }
    }
  }}
>
  <div class="dialog-heading">
    <h2 bind:this={heading} id={headingId} tabindex="-1">{title}</h2>
    <button
      class="icon-button"
      aria-label="Закрыть"
      onclick={() => dialog.close()}
    >
      <Icon name="close" />
    </button>
  </div>
  <div class="dialog-content">
    {@render children()}
  </div>
</dialog>
