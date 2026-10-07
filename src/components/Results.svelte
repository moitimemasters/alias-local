<script lang="ts">
  import {
    explainerId,
    ranked,
    reachedGoal,
    score,
    type GameState,
  } from '../lib/game';
  import type { Controller } from '../lib/controller.svelte';
  import Scoreboard from './Scoreboard.svelte';
  import Icon from './Icon.svelte';
  let { controller: c, game }: { controller: Controller; game: GameState } =
    $props();
  let finished = $derived(game.phase === 'finished');
  let leaders = $derived(ranked(game));
  let winners = $derived(
    leaders.filter((p) => p.scoreUnits === leaders[0].scoreUnits),
  );
  let guessed = $derived(
    game.lastEntries.filter((e) => e.guesser !== null).length,
  );
</script>

<section class="results-view">
  <span class="eyebrow"
    >{finished
      ? 'Игра завершена'
      : `${game.players[explainerId(game)].name} · ход завершён`}</span
  >
  <h1>
    {finished
      ? winners.length > 1
        ? 'Ничья'
        : winners[0].name
      : 'Результаты хода'}
  </h1>
  {#if finished}<p class="result-caption">
      {winners.map((p) => p.name).join(', ')} · {score(winners[0].scoreUnits)} очков
    </p>{:else}<div class="result-counts">
      <div><strong>{guessed}</strong><span>Угадано</span></div>
      <div>
        <strong>{game.lastEntries.length - guessed}</strong><span
          >Пропущено</span
        >
      </div>
    </div>{/if}
  <Scoreboard {game} full />
  {#if !finished && game.lastEntries.length}<details>
      <summary>Слова этого хода</summary>
      <div class="turn-log">
        {#each game.lastEntries as entry}<div>
            <span>{entry.word}</span><small
              >{entry.guesser === null
                ? `${game.players[entry.explainer].name} −1`
                : `${game.players[entry.guesser].name} +1${entry.bonusUnits ? ` · ${game.players[entry.explainer].name} +0,5` : ''}`}</small
            >
          </div>{/each}
      </div>
    </details>{/if}
  {#if game.exhausted}<p class="functional-note">
      Слова в выбранных словарях закончились.
    </p>{/if}
  <button
    class="primary"
    onclick={() => (finished ? c.menu() : c.dispatch({ type: 'next' }))}
    >{finished
      ? 'Новая игра'
      : reachedGoal(game) || game.exhausted
        ? 'Итоги игры'
        : 'Следующий игрок'}<Icon name="arrow" /></button
  >
</section>
