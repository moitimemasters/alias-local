<script lang="ts">
  import { packs } from '../lib/dictionaries';
  import {
    TURN_SECONDS,
    TARGET_SCORES,
    MIN_PLAYERS,
    MAX_PLAYERS,
    MAX_NAME_LENGTH,
  } from '../lib/config';
  import { formatScore } from '../lib/presentation';
  import type { Controller } from '../lib/controller.svelte';
  import Icon from './Icon.svelte';
  let {
    controller,
    requestStart,
  }: { controller: Controller; requestStart: () => void } = $props();
</script>

<div class="setup-view">
  <div class="page-title">
    <h1>Новая игра</h1>
    <span class="count-note">
      {controller.config.names.length}
      {controller.config.names.length <= 4 ? 'игрока' : 'игроков'}
    </span>
  </div>
  {#if controller.game && controller.game.phase !== 'finished'}
    <button class="resume-card" onclick={controller.resume}>
      <span class="resume-icon"><Icon name="play" size={24} /></span>
      <span>
        <strong>Продолжить игру</strong>
        <small>
          {controller.game.players
            .map((p) => `${p.name}: ${formatScore(p.scoreUnits)}`)
            .join(' · ')}
        </small>
      </span>
      <Icon name="arrow" />
    </button>
  {/if}
  <div class="setup-grid">
    <section class="panel players-panel">
      <div class="section-heading">
        <h2>Игроки</h2>
      </div>
      <div class="players-list">
        {#each controller.config.names as name, index (index)}
          <div class="player-input">
            <span class="avatar color-{index % 4}" aria-hidden="true">
              {name.slice(0, 1).toUpperCase() || index + 1}
            </span>
            <input
              aria-label={`Имя игрока ${index + 1}`}
              maxlength={MAX_NAME_LENGTH}
              bind:value={controller.config.names[index]}
              onchange={controller.savePreferences}
            />
            <button
              class="icon-button"
              aria-label={`Удалить игрока ${index + 1}`}
              disabled={controller.config.names.length <= MIN_PLAYERS}
              onclick={() => controller.removePlayer(index)}
            >
              <Icon name="trash" size={18} />
            </button>
          </div>
        {/each}
      </div>
      <button
        class="add-player"
        disabled={controller.config.names.length >= MAX_PLAYERS}
        onclick={controller.addPlayer}
      >
        <Icon name="plus" />Добавить игрока
      </button>
      <div class="scoring-note">
        <div>
          <strong>+1</strong>
          <span>Угадавшему</span>
        </div>
        <div>
          <strong>+0,5</strong>
          <span>Объясняющему</span>
        </div>
        <div>
          <strong>−1</strong>
          <span>За пропуск</span>
        </div>
      </div>
    </section>
    <section class="panel settings-panel">
      <div class="section-heading">
        <h2>Словари</h2>
      </div>
      <div class="packs">
        {#each packs as pack (pack.id)}
          <label
            class="pack"
            class:selected={controller.config.packs.includes(pack.id)}
          >
            <input
              type="checkbox"
              value={pack.id}
              bind:group={controller.config.packs}
              onchange={controller.savePreferences}
            />
            <span class="pack-content">
              <strong>{pack.name}</strong>
              <small>{pack.detail}</small>
              <span class="pack-count">
                {controller.dictionaries?.[pack.id].length.toLocaleString(
                  'ru-RU',
                ) ?? '…'} слов
              </span>
            </span>
            <span class="pack-check"><Icon name="check" size={14} /></span>
          </label>
        {/each}
      </div>
      <div class="option-row">
        <h3>Время на ход</h3>
        <div class="segments">
          {#each TURN_SECONDS as seconds (seconds)}
            <button
              aria-pressed={controller.config.seconds === seconds}
              onclick={() => {
                controller.config.seconds = seconds;
                controller.savePreferences();
              }}
            >
              {seconds}
              <span>с</span>
            </button>
          {/each}
        </div>
      </div>
      <div class="option-row">
        <h3>Играем до</h3>
        <div class="segments">
          {#each TARGET_SCORES as target (target)}
            <button
              aria-pressed={controller.config.target === target}
              onclick={() => {
                controller.config.target = target;
                controller.savePreferences();
              }}
            >
              {target}
              <span>очков</span>
            </button>
          {/each}
        </div>
      </div>
    </section>
  </div>
  <div class="setup-action">
    <button
      class="primary"
      disabled={controller.loading || !controller.dictionaries}
      onclick={requestStart}
    >
      {controller.loading ? 'Загружаем слова…' : 'Начать игру'}<Icon
        name="arrow"
      />
    </button>
  </div>
</div>
