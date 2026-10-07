<script lang="ts">
  import { explainerId, ranked, score, type GameState } from '../lib/game';
  let { game, full = false }: { game: GameState; full?: boolean } = $props();
  let players = $derived(full ? ranked(game) : game.players);
</script>

<div class:full class="scoreboard" aria-label="Счёт игроков">
  {#each players as player (player.id)}
    <div
      class="score-player"
      class:explainer={!full && player.id === explainerId(game)}
    >
      {#if full}
        <span class="place">{players.indexOf(player) + 1}</span>
      {/if}
      <span class="avatar color-{player.id % 4}">
        {player.name.slice(0, 1).toUpperCase()}
      </span>
      <span class="player-name">{player.name}</span>
      <strong>{score(player.scoreUnits)}</strong>
    </div>
  {/each}
</div>
