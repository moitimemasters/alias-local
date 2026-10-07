<script lang="ts">
  import ActionButton from './ActionButton.svelte';
  import { explainer, ranked, reachedGoal, type GameState } from '../lib/game';
  import { formatScore, describeEntry } from '../lib/presentation';
  import type { Controller } from '../lib/controller.svelte';
  import Scoreboard from './Scoreboard.svelte';
  import Icon from './Icon.svelte';
  let { controller, game }: { controller: Controller; game: GameState } =
    $props();
  let finished = $derived(game.phase === 'finished');
  let leaders = $derived(ranked(game));
  const leader = $derived(leaders[0]);
  let winners = $derived(
    leaders.filter((p) => p.scoreUnits === leader.scoreUnits),
  );
  let guessed = $derived(
    game.lastEntries.filter((e) => e.guesser !== null).length,
  );
</script>

<section class="results-view">
  <span class="eyebrow">
    {finished ? 'Игра завершена' : `${explainer(game).name} · ход завершён`}
  </span>
  <h1>
    {finished
      ? winners.length > 1
        ? 'Ничья'
        : leader.name
      : 'Результаты хода'}
  </h1>
  {#if finished}
    <p class="result-caption">
      {winners.map((p) => p.name).join(', ')} · {formatScore(leader.scoreUnits)} очков
    </p>
  {:else}
    <div class="result-counts">
      <div>
        <strong>{guessed}</strong>
        <span>Угадано</span>
      </div>
      <div>
        <strong>{game.lastEntries.length - guessed}</strong>
        <span>Пропущено</span>
      </div>
    </div>
  {/if}
  <Scoreboard {game} full />
  {#if !finished && game.lastEntries.length}
    <details>
      <summary>Слова этого хода</summary>
      <div class="turn-log">
        {#each game.lastEntries as entry, index (index)}
          <div>
            <span>{entry.word}</span>
            <small>
              {describeEntry(game, entry)}
            </small>
          </div>
        {/each}
      </div>
    </details>
  {/if}
  {#if game.exhausted}
    <p class="functional-note">Слова в выбранных словарях закончились.</p>
  {/if}
  <ActionButton
    class="primary"
    activate={() =>
      finished ? controller.menu() : controller.dispatch({ type: 'next' })}
  >
    {finished
      ? 'Новая игра'
      : reachedGoal(game) || game.exhausted
        ? 'Итоги игры'
        : 'Следующий игрок'}<Icon name="arrow" />
  </ActionButton>
</section>
