<script lang="ts">
  import { packs } from '../lib/dictionaries';
  import { score } from '../lib/game';
  import type { Controller } from '../lib/controller.svelte';
  import Icon from './Icon.svelte';
  let {
    controller: c,
    requestStart,
  }: { controller: Controller; requestStart: () => void } = $props();
</script>

<div class="setup-view">
  <div class="page-title">
    <h1>Новая игра</h1>
    <span class="count-note"
      >{c.config.names.length}
      {c.config.names.length <= 4 ? 'игрока' : 'игроков'}</span
    >
  </div>
  {#if c.game && c.game.phase !== 'finished'}
    <button class="resume-card" onclick={c.resume}>
      <span class="resume-icon"><Icon name="play" size={24} /></span>
      <span
        ><strong>Продолжить игру</strong><small
          >{c.game.players
            .map((p) => `${p.name}: ${score(p.scoreUnits)}`)
            .join(' · ')}</small
        ></span
      >
      <Icon name="arrow" />
    </button>
  {/if}
  <div class="setup-grid">
    <section class="panel players-panel">
      <div class="section-heading">
        <h2>Игроки</h2>
      </div>
      <div class="players-list">
        {#each c.config.names as name, index}
          <div class="player-input">
            <span class="avatar color-{index % 4}" aria-hidden="true"
              >{name.slice(0, 1).toUpperCase() || index + 1}</span
            >
            <input
              aria-label={`Имя игрока ${index + 1}`}
              maxlength="24"
              bind:value={c.config.names[index]}
              onchange={c.savePreferences}
            />
            <button
              class="icon-button"
              aria-label={`Удалить игрока ${index + 1}`}
              disabled={c.config.names.length <= 2}
              onclick={() => {
                c.config.names.splice(index, 1);
                c.savePreferences();
              }}><Icon name="trash" size={18} /></button
            >
          </div>
        {/each}
      </div>
      <button
        class="add-player"
        disabled={c.config.names.length >= 12}
        onclick={() => {
          c.config.names.push(`Игрок ${c.config.names.length + 1}`);
          c.savePreferences();
        }}><Icon name="plus" />Добавить игрока</button
      >
      <div class="scoring-note">
        <div><strong>+1</strong><span>Угадавшему</span></div>
        <div><strong>+0,5</strong><span>Объясняющему</span></div>
        <div><strong>−1</strong><span>За пропуск</span></div>
      </div>
    </section>
    <section class="panel settings-panel">
      <div class="section-heading">
        <h2>Словари</h2>
      </div>
      <div class="packs">
        {#each packs as pack}
          <label class="pack" class:selected={c.config.packs.includes(pack.id)}>
            <input
              type="checkbox"
              value={pack.id}
              bind:group={c.config.packs}
              onchange={c.savePreferences}
            />
            <span class="pack-content"
              ><strong>{pack.name}</strong><small>{pack.detail}</small><span
                class="pack-count"
                >{c.dictionaries?.[pack.id].length.toLocaleString('ru-RU') ??
                  '…'} слов</span
              ></span
            >
            <span class="pack-check"><Icon name="check" size={14} /></span>
          </label>
        {/each}
      </div>
      <div class="option-row">
        <h3>Время на ход</h3>
        <div class="segments">
          {#each [30, 60, 90, 120] as seconds}<button
              aria-pressed={c.config.seconds === seconds}
              onclick={() => {
                c.config.seconds = seconds;
                c.savePreferences();
              }}>{seconds}<span>с</span></button
            >{/each}
        </div>
      </div>
      <div class="option-row">
        <h3>Играем до</h3>
        <div class="segments">
          {#each [30, 60, 100] as target}<button
              aria-pressed={c.config.target === target}
              onclick={() => {
                c.config.target = target;
                c.savePreferences();
              }}>{target}<span>очков</span></button
            >{/each}
        </div>
      </div>
    </section>
  </div>
  <div class="setup-action">
    <button
      class="primary"
      disabled={c.loading || !c.dictionaries}
      onclick={requestStart}
      >{c.loading ? 'Загружаем слова…' : 'Начать игру'}<Icon
        name="arrow"
      /></button
    >
  </div>
</div>
