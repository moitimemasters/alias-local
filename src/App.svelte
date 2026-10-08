<script lang="ts">
  import { onMount } from 'svelte';
  import { useRegisterSW } from 'virtual:pwa-register/svelte';
  import { createController } from './lib/controller.svelte';
  import { registerGameTools } from './lib/webmcp';
  import { guessers, type GuesserSelection } from './lib/game';
  import Setup from './components/Setup.svelte';
  import Play from './components/Play.svelte';
  import Results from './components/Results.svelte';
  import Ready from './components/Ready.svelte';
  import Rules from './components/Rules.svelte';
  import Icon from './components/Icon.svelte';
  import Scoreboard from './components/Scoreboard.svelte';
  import ActionButton from './components/ActionButton.svelte';
  import Dialog from './components/Dialog.svelte';
  import GuesserPicker from './components/GuesserPicker.svelte';
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
  function chooseGuesser({ player, sharedWith }: GuesserSelection) {
    if (player === null) {
      return;
    }
    controller.dispatch(
      sharedWith === undefined
        ? { type: 'guess', player }
        : { type: 'tie', players: [player, sharedWith] },
    );
    controller.closePicker();
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
    <ActionButton
      class="brand"
      aria-label="Алиас — меню"
      activate={controller.menu}
    >
      <img
        src={`${import.meta.env.BASE_URL}icon.svg`}
        alt=""
        width="32"
        height="32"
      />
      <span>Алиас</span>
    </ActionButton>
    <nav aria-label="Навигация">
      {#if controller.view === 'game'}
        <ActionButton
          class="text-button menu-button"
          activate={controller.menu}
        >
          <Icon name="back" size={16} />В меню
        </ActionButton>
        <ActionButton class="text-button" activate={() => openModal('scores')}>
          Счёт
        </ActionButton>
      {/if}
      {#if installPrompt && !standalone}
        <ActionButton
          class="icon-button"
          aria-label="Установить приложение"
          activate={installApplication}
        >
          <Icon name="download" />
        </ActionButton>
      {/if}
      <ActionButton
        class="icon-button"
        aria-label="Правила"
        activate={() => openModal('rules')}
      >
        <Icon name="help" />
      </ActionButton>
    </nav>
  </header>
  <main>
    {#if controller.error}
      <div class="error-banner" role="alert">
        <span>{controller.error}</span>
        {#if !controller.dictionaries && !controller.loading}
          <ActionButton
            class="text-button"
            activate={() => controller.initialize()}
          >
            Повторить
          </ActionButton>
        {/if}
        <ActionButton
          class="icon-button"
          disabled={!controller.dictionaries && !controller.loading}
          aria-label="Закрыть ошибку"
          activate={controller.clearError}
        >
          <Icon name="close" size={18} />
        </ActionButton>
      </div>
    {/if}
    {#if $needRefresh}
      <div class="update-banner">
        <span>Доступна новая версия.</span>
        <ActionButton class="text-button" activate={updateApplication}>
          Обновить
        </ActionButton>
        <ActionButton
          class="icon-button"
          aria-label="Позже"
          activate={() => ($needRefresh = false)}
        >
          <Icon name="close" size={18} />
        </ActionButton>
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
        <ActionButton
          class="secondary"
          data-initial-focus
          activate={closeModal}
        >
          Отмена
        </ActionButton>
        <ActionButton
          class="primary"
          activate={() => {
            closeModal();
            controller.start();
          }}
        >
          Начать
        </ActionButton>
      </div>
    {:else}
      <p>Текущее слово останется без ответа.</p>
      <div class="dialog-actions">
        <ActionButton
          class="secondary"
          data-initial-focus
          activate={closeModal}
        >
          Продолжить
        </ActionButton>
        <ActionButton
          class="primary"
          activate={() => {
            controller.dispatch({ type: 'end' });
            closeModal();
          }}
        >
          Закончить
        </ActionButton>
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
    <GuesserPicker players={guessers(controller.game)} choose={chooseGuesser} />
  </Dialog>
{/if}

{#if controller.hint && controller.game}
  <Dialog
    title={controller.game.word ?? 'Подсказка'}
    close={controller.closeHint}
  >
    <ol class="hint-meanings">
      {#each controller.hint.meanings as meaning (meaning)}
        <li>{meaning}</li>
      {/each}
    </ol>
    <p class="functional-note">За это слово объясняющему +0, угадавшему +1.</p>
    <p class="source-link">
      <a
        href={`https://ru.wiktionary.org/wiki/${encodeURIComponent(controller.hint.word)}`}
        target="_blank"
        rel="noreferrer"
      >
        Викисловарь
      </a>
      ·
      <a
        href="https://creativecommons.org/licenses/by-sa/4.0/"
        target="_blank"
        rel="noreferrer"
      >
        CC BY-SA 4.0
      </a>
    </p>
    <ActionButton class="primary hint-continue" activate={controller.closeHint}>
      Продолжить
    </ActionButton>
  </Dialog>
{/if}
