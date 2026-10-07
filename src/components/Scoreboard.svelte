<script lang="ts">
  import { explainerId, ranked, type GameState } from '../lib/game';
  import { formatScore } from '../lib/presentation';
  let { game, full = false }: { game: GameState; full?: boolean } = $props();
  let players = $derived(full ? ranked(game) : game.players);
</script>

<div class:full class="scoreboard" aria-label="Счёт игроков">
  {#each players as player, index (player.id)}
    <div
      class="score-player"
      class:explainer={!full && player.id === explainerId(game)}
    >
      {#if full}
        <span class="place">{index + 1}</span>
      {/if}
      <span class="avatar color-{player.id % 4}">
        {player.name.slice(0, 1).toUpperCase()}
      </span>
      <span class="player-name">{player.name}</span>
      <strong>{formatScore(player.scoreUnits)}</strong>
    </div>
  {/each}
</div>
