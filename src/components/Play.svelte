<script lang="ts">
  import { touchActivation } from '../lib/touch-attachment';
  import { untrack } from 'svelte';
  import { explainer, guessers, isActive, type GameState } from '../lib/game';
  import { formatTime } from '../lib/presentation';
  import { WordGesture } from '../lib/word-gesture';
  import { TouchTap, touchClicks } from '../lib/touch-activation';
  import type { Controller } from '../lib/controller.svelte';
  import Scoreboard from './Scoreboard.svelte';
  import Icon from './Icon.svelte';
  import WordHistory from './WordHistory.svelte';
  import ActionButton from './ActionButton.svelte';
  let {
    controller,
    game,
    requestEnd,
  }: {
    controller: Controller;
    game: GameState;
    requestEnd: () => void;
  } = $props();
  const explaining = $derived(explainer(game));
  const eligiblePlayers = $derived(guessers(game));
  let paused = $derived(game.phase === 'paused');
  let lastWord = $derived(
    game.phase === 'lastword' || (paused && game.resumePhase === 'lastword'),
  );
  let seconds = $derived(Math.ceil(game.remainingMs / 1000));
  let historyOpen = $state(false);
  $effect(() => {
    if (historyOpen) {
      untrack(() => controller.hold('history'));
      return () => controller.release('history');
    }
    return undefined;
  });
  const gesture = new WordGesture();
  const cardTap = new TouchTap();

  function beginSwipe(event: PointerEvent) {
    if (!isActive(game) || !gesture.begin(event)) {
      return;
    }
    cardTap.begin(event);
    (event.currentTarget as HTMLButtonElement).setPointerCapture(
      event.pointerId,
    );
  }

  function finishSwipe(event: PointerEvent) {
    if (!isActive(game)) {
      cancelSwipe(event);
      return;
    }
    const accepted = cardTap.end(
      event,
      (event.currentTarget as HTMLButtonElement).getBoundingClientRect(),
    );
    if (accepted !== null) {
      touchClicks.arm(event.pointerId);
    }
    const direction = gesture.end(event);
    if (direction === 'up' || (direction === null && accepted)) {
      controller.openPicker();
    }
    if (direction === 'down') {
      controller.dispatch({ type: 'skip' });
    }
  }

  function cancelSwipe(event: PointerEvent) {
    gesture.cancel(event.pointerId);
    if (cardTap.cancel(event.pointerId)) {
      touchClicks.arm(event.pointerId);
    }
  }

  function chooseGuesser(event: MouseEvent) {
    if (!gesture.consumeClick(event)) {
      controller.openPicker();
    }
  }
</script>

<div class="play-view" class:history-open={historyOpen}>
  <div class="turn-heading">
    <div>
      <span class="eyebrow">
        Круг {Math.floor(game.turn / game.players.length) + 1} · до {game.config
          .target}
      </span>
      <h1>
        {explaining.name}
        <span>объясняет</span>
      </h1>
    </div>
    <div class="timer-controls">
      <span
        class="timer"
        class:urgent={seconds <= 10 && !paused}
        aria-label="Оставшееся время"
      >
        {formatTime(game.remainingMs)}
      </span>
      <ActionButton
        class="icon-button pause-button"
        aria-label={paused ? 'Продолжить' : 'Пауза'}
        aria-pressed={paused}
        activate={() =>
          controller.dispatch({ type: paused ? 'resume' : 'pause' })}
      >
        <Icon name={paused ? 'play' : 'pause'} size={22} />
      </ActionButton>
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
  <div class="turn-scores"><Scoreboard {game} /></div>
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
      onpointermove={(event) => cardTap.move(event)}
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
    <div
      class="guesser-panel"
      class:many-players={eligiblePlayers.length > 6}
      class:compact-picker={eligiblePlayers.length > 4}
      class:short-picker={eligiblePlayers.length > 2}
    >
      <h2>Кто угадал?</h2>
      <ActionButton
        class="primary mobile-picker"
        disabled={paused}
        activate={controller.openPicker}
      >
        Угадали<Icon name="up" />
      </ActionButton>
      <div class="guessers">
        {#each eligiblePlayers as player (player.id)}
          <ActionButton
            class="guesser"
            disabled={paused}
            activate={() =>
              controller.dispatch({ type: 'guess', player: player.id })}
          >
            <span class="avatar color-{player.id % 4}">
              {player.name.slice(0, 1).toUpperCase()}
            </span>
            <span>{player.name}</span>
            <strong>+1</strong>
          </ActionButton>
        {/each}
      </div>
      {#if lastWord}
        <p class="functional-note">Доиграйте это слово без таймера.</p>
      {/if}
    </div>
  </div>
  <div class="turn-tools">
    {#if game.config.hints}
      <ActionButton
        class="secondary hint-button"
        disabled={paused || !controller.hintAvailable}
        title={controller.hintAvailable
          ? undefined
          : 'В локальном словаре нет определения'}
        activate={controller.openHint}
      >
        {!controller.hintAvailable
          ? 'Нет подсказки'
          : game.hintUsed
            ? 'Подсказка · +0'
            : 'Подсказка'}
      </ActionButton>
    {/if}
    <details class="round-history" bind:open={historyOpen}>
      <summary {@attach touchActivation}>
        Слова хода · {game.entries.length}
      </summary>
      <WordHistory {game} entries={game.entries} />
    </details>
  </div>
  <div class="play-actions">
    <ActionButton
      class="secondary"
      disabled={paused}
      activate={() => controller.dispatch({ type: 'skip' })}
    >
      <Icon name="down" />Пропустить
      <span>−1</span>
    </ActionButton>
    <ActionButton
      class="secondary"
      disabled={paused || !game.entries.length}
      activate={() => controller.dispatch({ type: 'undo' })}
    >
      <Icon name="undo" />Отменить
    </ActionButton>
    <ActionButton class="text-button" activate={requestEnd}>
      Закончить ход
    </ActionButton>
  </div>
  <div class="feedback" role="status">{controller.message}</div>
</div>
