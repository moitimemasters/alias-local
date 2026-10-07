<script lang="ts">
  let { name, size = 20 }: { name: keyof typeof paths; size?: number } =
    $props();
  const paths = {
    arrow: 'M7 17 17 7M7 7h10v10',
    back: 'm15 18-6-6 6-6',
    pause: 'M9 5v14M15 5v14',
    play: 'm8 5 11 7-11 7V5Z',
    plus: 'M12 5v14M5 12h14',
    close: 'm6 6 12 12M6 18 18 6',
    undo: 'M8 5 3 10l5 5M3 10h11a7 7 0 0 1 0 14',
    check: 'm5 12 4 4L19 6',
    down: 'M12 4v16m-6-6 6 6 6-6',
    up: 'M12 20V4m-6 6 6-6 6 6',
    help: 'M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 3M12 17h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    download: 'M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5',
    trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7',
  };
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"><path d={paths[name]} /></svg
>
