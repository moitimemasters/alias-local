<script lang="ts">
  import { onMount } from 'svelte';
  import { useRegisterSW } from 'virtual:pwa-register/svelte';
  import { createController } from './lib/controller.svelte';
  import { registerGameTools } from './lib/webmcp';
  import { guessers } from './lib/game';
  import Setup from './components/Setup.svelte';
  import Play from './components/Play.svelte';
  import Results from './components/Results.svelte';
  import Ready from './components/Ready.svelte';
  import Rules from './components/Rules.svelte';
  import Icon from './components/Icon.svelte';
  import Scoreboard from './components/Scoreboard.svelte';
  import Dialog from './components/Dialog.svelte';
  const controller = createController();
  const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW({
    onRegisterError: () =>
      controller.reportError(
        'Не удалось подготовить офлайн-режим. Проверьте интернет и перезагрузите страницу.',
      ),
  });
  let modal = $state<'rules' | 'scores' | 'replace' | 'end' | null>(null);
  const playing = $derived(
    controller.view === 'game' &&
      !!controller.game &&
      ['playing', 'lastword', 'paused'].includes(controller.game.phase),
  );
  let installPrompt = $state<BeforeInstallPromptEvent | null>(null);
  let standalone = $state(false);
  interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: string }>;
  }
  function openModal(kind: typeof modal) {
    controller.hold('modal');
    modal = kind;
  }
  function closeModal() {
    modal = null;
    controller.release('modal');
  }
  function requestStart() {
    if (controller.game && controller.game.phase !== 'finished') {
      openModal('replace');
    } else {
      controller.start();
    }
  }
  async function installApplication() {
    try {
      await installPrompt?.prompt();
      installPrompt = null;
    } catch {
      controller.reportError(
        'Не удалось открыть установку. Попробуйте через меню браузера.',
      );
    }
  }

  async function updateApplication() {
    if (!controller.pauseForBackground()) {
      return;
    }
    try {
      await updateServiceWorker(true);
    } catch {
      controller.reportError(
        'Не удалось применить обновление. Партия сохранена; попробуйте снова.',
      );
    }
  }

  onMount(() => {
    void controller.initialize();
    const detach = controller.attach();
    const unregister = registerGameTools(controller);
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
    const flushPreferences = () => controller.savePreferences();
    return () => {
      detach();
      unregister();
      flushPreferences();
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', installed);
    };
  });
</script>

<div class="app-shell" class:playing class:in-game={controller.view === 'game'}>
  <header>
    <button class="brand" aria-label="Алиас — меню" onclick={controller.menu}>
      <img
        src={`${import.meta.env.BASE_URL}icon.svg`}
        alt=""
        width="32"
        height="32"
      />
      <span>Алиас</span>
    </button>
    <nav aria-label="Навигация">
      {#if controller.view === 'game'}
        <button class="text-button menu-button" onclick={controller.menu}>
          <Icon name="back" size={16} />В меню
        </button>
        <button class="text-button" onclick={() => openModal('scores')}>
          Счёт
        </button>
      {/if}
      {#if installPrompt && !standalone}
        <button
          class="icon-button"
          aria-label="Установить приложение"
          onclick={installApplication}
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
    {#if controller.error}
      <div class="error-banner" role="alert">
        <span>{controller.error}</span>
        {#if !controller.dictionaries && !controller.loading}
          <button class="text-button" onclick={() => controller.initialize()}>
            Повторить
          </button>
        {/if}
        <button
          class="icon-button"
          disabled={!controller.dictionaries && !controller.loading}
          aria-label="Закрыть ошибку"
          onclick={controller.clearError}
        >
          <Icon name="close" size={18} />
        </button>
      </div>
    {/if}
    {#if $needRefresh}
      <div class="update-banner">
        <span>Доступна новая версия.</span>
        <button class="text-button" onclick={updateApplication}>
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
    {#if controller.view === 'setup'}
      <Setup {controller} {requestStart} />
    {:else if controller.game}
      {#if controller.game.phase === 'ready'}
        <Ready
          game={controller.game}
          begin={() => controller.dispatch({ type: 'begin' })}
        />
      {:else if ['playing', 'lastword', 'paused'].includes(controller.game.phase)}
        <Play
          {controller}
          game={controller.game}
          requestEnd={() => openModal('end')}
        />
      {:else}
        <Results {controller} game={controller.game} />
      {/if}
    {/if}
  </main>
</div>
{#if modal}
  <Dialog
    title={modal === 'rules'
      ? 'Правила'
      : modal === 'scores'
        ? 'Счёт игроков'
        : modal === 'replace'
          ? 'Начать новую игру?'
          : 'Закончить ход?'}
    close={closeModal}
    initialFocus={modal === 'rules' ? 'heading' : 'action'}
  >
    {#if modal === 'rules'}
      <Rules offlineReady={$offlineReady} />
    {:else if modal === 'scores' && controller.game}
      <Scoreboard game={controller.game} full />
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
            controller.start();
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
            controller.dispatch({ type: 'end' });
            closeModal();
          }}
        >
          Закончить
        </button>
      </div>
    {/if}
  </Dialog>
{/if}
{#if controller.picker && controller.game}
  <Dialog
    title="Кто угадал?"
    close={controller.closePicker}
    initialFocus="action"
  >
    <div class="guessers picker">
      {#each guessers(controller.game) as player (player.id)}
        <button
          class="guesser"
          onclick={() => {
            controller.dispatch({ type: 'guess', player: player.id });
            controller.closePicker();
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
