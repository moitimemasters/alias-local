<script lang="ts">
  import type { Entry, GuesserSelection, Player } from '../lib/game';
  import ActionButton from './ActionButton.svelte';
  import { untrack } from 'svelte';
  let {
    players,
    selected,
    allowSkip = false,
    choose,
  }: {
    players: Player[];
    selected?: Entry;
    allowSkip?: boolean;
    choose: (selection: GuesserSelection) => void;
  } = $props();
  let tie = $state(untrack(() => selected?.sharedWith !== undefined));
  let picks = $state<number[]>(
    untrack(() =>
      selected?.sharedWith !== undefined && selected.guesser !== null
        ? [selected.guesser, selected.sharedWith]
        : [],
    ),
  );

  function pick(id: number) {
    if (!tie) {
      choose({ player: id });
      return;
    }
    if (picks.includes(id)) {
      picks = picks.filter((pick) => pick !== id);
    } else if (picks.length < 2) {
      picks = [...picks, id];
    }
  }
  function confirmTie() {
    const [player, sharedWith] = picks;
    if (
      picks.length === 2 &&
      player !== undefined &&
      sharedWith !== undefined
    ) {
      choose({ player, sharedWith });
    }
  }
</script>

{#if tie}<p class="tie-caption">Выберите двух · каждому +0,5</p>{/if}
<div class="guessers picker">
  {#each players as player (player.id)}
    <ActionButton
      class={tie && picks.includes(player.id) ? 'guesser selected' : 'guesser'}
      aria-pressed={tie
        ? picks.includes(player.id)
        : selected?.guesser === player.id}
      disabled={tie && picks.length === 2 && !picks.includes(player.id)}
      activate={() => pick(player.id)}
    >
      <span class="avatar color-{player.id % 4}">
        {player.name.slice(0, 1).toUpperCase()}
      </span>
      <span>{player.name}</span>
      <strong>{tie ? (picks.includes(player.id) ? '✓' : '+0,5') : '+1'}</strong>
    </ActionButton>
  {/each}
</div>
{#if tie}
  <div class="tie-actions">
    <ActionButton
      class="secondary"
      activate={() => {
        tie = false;
        picks = [];
      }}
    >
      Один угадал
    </ActionButton>
    <ActionButton
      class="primary"
      disabled={picks.length !== 2}
      activate={confirmTie}
    >
      Засчитать ничью
    </ActionButton>
  </div>
{:else if players.length >= 2}
  <ActionButton
    class="secondary tie-toggle"
    activate={() => {
      tie = true;
      picks = [];
    }}
  >
    Ничья
  </ActionButton>
{/if}
{#if allowSkip}
  <ActionButton
    class="secondary correction-skip"
    aria-pressed={selected?.guesser === null}
    activate={() => choose({ player: null })}
  >
    Пропущено · −1 объясняющему
  </ActionButton>
{/if}
