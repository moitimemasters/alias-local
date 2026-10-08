<script lang="ts">
  import type { Entry, GameState } from '../lib/game';
  import { describeEntry } from '../lib/presentation';
  import ActionButton from './ActionButton.svelte';
  let {
    game,
    entries,
    edit,
  }: { game: GameState; entries: Entry[]; edit?: (index: number) => void } =
    $props();
</script>

<div class="turn-log">
  {#each entries as entry, index (index)}
    {#if edit}
      <ActionButton
        class="history-entry"
        aria-label={`Изменить угадавшего: ${entry.word}`}
        activate={() => edit?.(index)}
      >
        <span>{entry.word}</span>
        <small>
          {describeEntry(game, entry)}{entry.hinted ? ' · Подсказка' : ''}
        </small>
      </ActionButton>
    {:else}
      <div>
        <span>{entry.word}</span>
        <small>
          {describeEntry(game, entry)}{entry.hinted ? ' · Подсказка' : ''}
        </small>
      </div>
    {/if}
  {:else}
    <p class="functional-note">Пока нет завершённых слов.</p>
  {/each}
</div>
