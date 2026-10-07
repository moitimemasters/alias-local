<script lang="ts">
  import { explainerId, isActive, type GameState } from '../lib/game';
  import { WordGesture } from '../lib/word-gesture';
  import type { Controller } from '../lib/controller.svelte';
  import Scoreboard from './Scoreboard.svelte';
  import Icon from './Icon.svelte';
  let {
    controller: c,
    game,
    requestEnd,
  }: {
    controller: Controller;
    game: GameState;
    requestEnd: () => void;
  } = $props();
  let paused = $derived(game.phase === 'paused');
  let lastWord = $derived(
    game.phase === 'lastword' || (paused && game.resumePhase === 'lastword'),
  );
  let seconds = $derived(Math.ceil(game.remainingMs / 1000));
  const gesture = new WordGesture();

  function beginSwipe(event: PointerEvent) {
    if (!isActive(game) || !gesture.begin(event)) return;
    (event.currentTarget as HTMLButtonElement).setPointerCapture(
      event.pointerId,
    );
  }

  function finishSwipe(event: PointerEvent) {
    if (!isActive(game)) {
      gesture.cancel(event.pointerId);
      return;
    }
    const direction = gesture.end(event);
    if (direction === 'up') c.openPicker();
    if (direction === 'down') c.dispatch({ type: 'skip' });
  }

  function cancelSwipe(event: PointerEvent) {
    gesture.cancel(event.pointerId);
  }

  function chooseGuesser(event: MouseEvent) {
    if (!gesture.consumeClick(event)) c.openPicker();
  }
</script>

<div class="play-view">
  <div class="turn-heading">
    <div>
      <span class="eyebrow">
        Круг {Math.floor(game.turn / game.players.length) + 1} · до {game.config
          .target}
      </span>
      <h1>
        {game.players[explainerId(game)].name}
        <span>объясняет</span>
      </h1>
    </div>
    <div class="timer-controls">
      <span
        class="timer"
        class:urgent={seconds <= 10 && !paused}
        aria-label="Оставшееся время"
      >
        {String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(
          seconds % 60,
        ).padStart(2, '0')}
      </span>
      <button
        class="icon-button pause-button"
        aria-label={paused ? 'Продолжить' : 'Пауза'}
        aria-pressed={paused}
        onclick={() => c.dispatch({ type: paused ? 'resume' : 'pause' })}
      >
        <Icon name={paused ? 'play' : 'pause'} size={22} />
      </button>
    </div>
  </div>
  <div
    class="turn-progress"
    role="progressbar"
    aria-label="Время хода"
    aria-valuemin="0"
    aria-valuemax={game.config.seconds}
    aria-valuenow={seconds}
  >
    <span
      style:width={`${(game.remainingMs / (game.config.seconds * 1000)) * 100}%`}
    ></span>
  </div>
  <Scoreboard {game} />
  <div class="play-grid">
    <button
      class="word-card"
      class:paused
      class:last-word={lastWord}
      disabled={paused}
      aria-label={paused
        ? 'Игра на паузе'
        : `Слово: ${game.word}. Выбрать угадавшего`}
      onpointerdown={beginSwipe}
      onpointerup={finishSwipe}
      onpointercancel={cancelSwipe}
      onlostpointercapture={cancelSwipe}
      onclick={chooseGuesser}
    >
      <span class="word-label">
        {paused ? 'Пауза' : lastWord ? 'Последнее слово' : 'Слово'}
      </span>
      <span class="word">{paused ? 'Слово скрыто' : game.word}</span>
      <span class="card-gesture">
        {#if paused}
          <Icon name="pause" size={32} />{:else}
          <span><Icon name="down" size={16} />Пропустить</span>
          <span><Icon name="up" size={16} />Угадали</span>
        {/if}
      </span>
    </button>
    <div class="guesser-panel">
      <h2>Кто угадал?</h2>
      <div class="guessers">
        {#each game.players.filter((p) => p.id !== explainerId(game)) as player (player.id)}
          <button
            class="guesser"
            disabled={paused}
            onclick={() => c.dispatch({ type: 'guess', player: player.id })}
          >
            <span class="avatar color-{player.id % 4}">
              {player.name.slice(0, 1).toUpperCase()}
            </span>
            <span>{player.name}</span>
            <strong>+1</strong>
          </button>
        {/each}
      </div>
      {#if lastWord}
        <p class="functional-note">Доиграйте это слово без таймера.</p>
      {/if}
    </div>
  </div>
  <div class="play-actions">
    <button
      class="secondary"
      disabled={paused}
      onclick={() => c.dispatch({ type: 'skip' })}
    >
      <Icon name="down" />Пропустить
      <span>−1</span>
    </button>
    <button
      class="secondary"
      disabled={paused || !game.entries.length}
      onclick={() => c.dispatch({ type: 'undo' })}
    >
      <Icon name="undo" />Отменить
    </button>
    <button class="text-button" onclick={requestEnd}>Закончить ход</button>
  </div>
  <div class="feedback" role="status">{c.message}</div>
</div>
