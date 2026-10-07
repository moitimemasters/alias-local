<script lang="ts">
  import { onMount } from 'svelte';
  import { useRegisterSW } from 'virtual:pwa-register/svelte';
  import { createController } from './lib/controller.svelte';
  import { registerGameTools } from './lib/webmcp';
  import { explainerId } from './lib/game';
  import Setup from './components/Setup.svelte';
  import Play from './components/Play.svelte';
  import Results from './components/Results.svelte';
  import Scoreboard from './components/Scoreboard.svelte';
  import Icon from './components/Icon.svelte';
  import Dialog from './components/Dialog.svelte';
  const c = createController();
  const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW({
    onRegisterError: () =>
      c.reportError(
        'Не удалось подготовить офлайн-режим. Проверьте интернет и перезагрузите страницу.',
      ),
  });
  let modal = $state<'rules' | 'replace' | 'end' | null>(null);
  let installPrompt = $state<BeforeInstallPromptEvent | null>(null);
  let standalone = $state(false);
  interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: string }>;
  }
  function openModal(kind: typeof modal) {
    c.hold('modal');
    modal = kind;
  }
  function closeModal() {
    modal = null;
    c.release('modal');
  }
  function requestStart() {
    if (c.game && c.game.phase !== 'finished') openModal('replace');
    else c.start();
  }
  onMount(() => {
    void c.initialize();
    const detach = c.attach();
    const unregister = registerGameTools(c);
    standalone = matchMedia('(display-mode: standalone)').matches;
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      installPrompt = event as BeforeInstallPromptEvent;
    };
    const installed = () => {
      standalone = true;
      installPrompt = null;
    };
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', installed);
    const flushPreferences = () => c.savePreferences();
    return () => {
      detach();
      unregister();
      flushPreferences();
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', installed);
    };
  });
</script>

<div class="app-shell">
  <header>
    <button class="brand" aria-label="Алиас — меню" onclick={c.menu}>
      <img
        src={`${import.meta.env.BASE_URL}icon.svg`}
        alt=""
        width="32"
        height="32"
      />
      <span>Алиас</span>
    </button>
    <nav aria-label="Навигация">
      {#if c.view === 'game'}
        <button class="text-button" onclick={c.menu}>
          <Icon name="back" size={16} />В меню
        </button>
      {/if}
      {#if installPrompt && !standalone}
        <button
          class="icon-button"
          aria-label="Установить приложение"
          onclick={async () => {
            await installPrompt?.prompt();
            installPrompt = null;
          }}
        >
          <Icon name="download" />
        </button>
      {/if}
      <button
        class="icon-button"
        aria-label="Правила"
        onclick={() => openModal('rules')}
      >
        <Icon name="help" />
      </button>
    </nav>
  </header>
  <main>
    {#if c.error}
      <div class="error-banner" role="alert">
        <span>{c.error}</span>
        {#if !c.dictionaries && !c.loading}
          <button class="text-button" onclick={() => c.initialize()}>
            Повторить
          </button>
        {/if}
        <button
          class="icon-button"
          disabled={!c.dictionaries && !c.loading}
          aria-label="Закрыть ошибку"
          onclick={c.clearError}
        >
          <Icon name="close" size={18} />
        </button>
      </div>
    {/if}
    {#if $needRefresh}
      <div class="update-banner">
        <span>Доступна новая версия.</span>
        <button
          class="text-button"
          onclick={async () => {
            if (c.pauseForBackground()) await updateServiceWorker(true);
          }}
        >
          Обновить
        </button>
        <button
          class="icon-button"
          aria-label="Позже"
          onclick={() => ($needRefresh = false)}
        >
          <Icon name="close" size={18} />
        </button>
      </div>
    {/if}
    {#if c.view === 'setup'}
      <Setup controller={c} {requestStart} />
    {:else if c.game}
      {#if c.game.phase === 'ready'}
        <section class="ready-view">
          <span class="eyebrow">
            Круг {Math.floor(c.game.turn / c.game.players.length) + 1} · до {c
              .game.config.target}
          </span>
          <span class="avatar large color-{explainerId(c.game) % 4}">
            {c.game.players[explainerId(c.game)].name.slice(0, 1).toUpperCase()}
          </span>
          <h1>{c.game.players[explainerId(c.game)].name}</h1>
          <p>Передайте телефон объясняющему.</p>
          <button class="primary" onclick={() => c.dispatch({ type: 'begin' })}>
            Начать ход<Icon name="play" />
          </button>
          <span class="functional-note">{c.game.config.seconds} секунд</span>
          <Scoreboard game={c.game} />
        </section>
      {:else if ['playing', 'lastword', 'paused'].includes(c.game.phase)}
        <Play
          controller={c}
          game={c.game}
          requestEnd={() => openModal('end')}
        />
      {:else}
        <Results controller={c} game={c.game} />
      {/if}
    {/if}
  </main>
</div>
{#if modal}
  <Dialog
    title={modal === 'rules'
      ? 'Правила'
      : modal === 'replace'
        ? 'Начать новую игру?'
        : 'Закончить ход?'}
    close={closeModal}
    initialFocus={modal === 'rules' ? 'heading' : 'action'}
  >
    {#if modal === 'rules'}
      <ol class="rules-list">
        <li>
          Один игрок объясняет слово, остальные угадывают. Слово и однокоренные
          называть нельзя.
        </li>
        <li>
          Угадавшему — <b>+1</b>
          , объясняющему —
          <b>+0,5</b>
          . За пропуск объясняющему —
          <b>−1</b>
          .
        </li>
        <li>
          Нажмите на имя угадавшего. Свайп вверх по слову открывает выбор
          игрока, вниз — пропускает слово.
        </li>
        <li>
          Во время нажатий и выбора игрока таймер остановлен. «Пауза» скрывает
          слово и останавливает ход.
        </li>
        <li>
          После таймера доиграйте последнее слово без ограничения времени.
        </li>
        <li>
          Объясняйте по очереди. Побеждает первый, кто набрал выбранное число
          очков.
        </li>
      </ol>
      <div class="rules-offline">
        <strong>Игра сохраняется на этом устройстве.</strong>
        {#if $offlineReady}<p>Офлайн-режим готов.</p>{/if}
        <p>
          Для работы офлайн сначала откройте приложение с интернетом. На iPhone:
          «Поделиться» → «На экран “Домой”». На Android: меню браузера →
          «Установить приложение».
        </p>
      </div>
      <p class="source-link">
        Словари: <a
          href="https://github.com/Roman-/dicts"
          target="_blank"
          rel="noreferrer"
        >
          Roman-/dicts
        </a>
      </p>
    {:else if modal === 'replace'}
      <p>Текущая сохранённая партия будет заменена.</p>
      <div class="dialog-actions">
        <button class="secondary" data-initial-focus onclick={closeModal}>
          Отмена
        </button>
        <button
          class="primary"
          onclick={() => {
            closeModal();
            c.start();
          }}
        >
          Начать
        </button>
      </div>
    {:else}
      <p>Текущее слово останется без ответа.</p>
      <div class="dialog-actions">
        <button class="secondary" data-initial-focus onclick={closeModal}>
          Продолжить
        </button>
        <button
          class="primary"
          onclick={() => {
            c.dispatch({ type: 'end' });
            closeModal();
          }}
        >
          Закончить
        </button>
      </div>
    {/if}
  </Dialog>
{/if}
{#if c.picker && c.game}
  <Dialog title="Кто угадал?" close={c.closePicker} initialFocus="action">
    <div class="guessers picker">
      {#each c.game.players.filter((p) => p.id !== explainerId(c.game!)) as player}
        <button
          class="guesser"
          onclick={() => {
            c.dispatch({ type: 'guess', player: player.id });
            c.closePicker();
          }}
        >
          <span class="avatar color-{player.id % 4}">
            {player.name.slice(0, 1).toUpperCase()}
          </span>
          <span>{player.name}</span>
          <strong>+1</strong>
        </button>
      {/each}
    </div>
  </Dialog>
{/if}
