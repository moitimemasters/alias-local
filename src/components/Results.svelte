<script lang="ts">
  import { touchActivation } from '../lib/touch-attachment';
  import ActionButton from './ActionButton.svelte';
  import {
    explainer,
    ranked,
    reachedGoal,
    type GameState,
    type GuesserSelection,
  } from '../lib/game';
  import { formatScore } from '../lib/presentation';
  import type { Controller } from '../lib/controller.svelte';
  import Scoreboard from './Scoreboard.svelte';
  import Icon from './Icon.svelte';
  import WordHistory from './WordHistory.svelte';
  import Dialog from './Dialog.svelte';
  import GuesserPicker from './GuesserPicker.svelte';
  let editing = $state<number | null>(null);
  function assign(selection: GuesserSelection) {
    if (editing !== null) {
      controller.dispatch({ type: 'assign', index: editing, ...selection });
      editing = null;
    }
  }
  let { controller, game }: { controller: Controller; game: GameState } =
    $props();
  const selectedEntry = $derived(
    editing === null ? undefined : game.lastEntries[editing],
  );
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
  {#if game.lastEntries.length}
    <details class="results-history" open>
      <summary {@attach touchActivation}>Слова этого хода</summary>
      <WordHistory
        {game}
        entries={game.lastEntries}
        edit={(index: number) => {
          editing = index;
        }}
      />
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

{#if selectedEntry && editing !== null}
  <Dialog
    title={`Кто угадал «${selectedEntry.word}»?`}
    close={() => (editing = null)}
    initialFocus="action"
  >
    <GuesserPicker
      players={game.players.filter(
        (player) => player.id !== selectedEntry.explainer,
      )}
      selected={selectedEntry}
      allowSkip
      choose={assign}
    />
  </Dialog>
{/if}
