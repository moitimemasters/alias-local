<script lang="ts">
  import { explainer, type GameState } from '../lib/game';
  import Scoreboard from './Scoreboard.svelte';
  import Icon from './Icon.svelte';
  let { game, begin }: { game: GameState; begin: () => void } = $props();
  const explaining = $derived(explainer(game));
</script>

<section class="ready-view">
  <span class="eyebrow">
    Круг {Math.floor(game.turn / game.players.length) + 1} · до {game.config
      .target}
  </span>
  <span class="avatar large color-{explaining.id % 4}">
    {explaining.name.slice(0, 1).toUpperCase()}
  </span>
  <h1>{explaining.name}</h1>
  <p>Передайте телефон объясняющему.</p>
  <button class="primary" onclick={begin}>
    Начать ход<Icon name="play" />
  </button>
  <span class="functional-note">{game.config.seconds} секунд</span>
  <Scoreboard {game} />
</section>
