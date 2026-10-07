import {
  createGame,
  reduceGame,
  explainerId,
  type Action,
  type Config,
  type GameState,
} from './game';
import { TurnClock } from './clock';
import { loadLocal, encodeGame, SAVE_KEY, CONFIG_KEY } from './persistence';
import {
  collectWords,
  loadDictionaries,
  type Dictionaries,
} from './dictionaries';

export function createController() {
  const initial = loadLocal(localStorage);
  let game = $state.raw<GameState | null>(initial.game);
  let config = $state<Config>(initial.config);
  let view = $state<'setup' | 'game'>('setup');
  let dictionaries = $state.raw<Dictionaries | null>(null);
  let error = $state(initial.error);
  let message = $state('');
  let loading = $state(true);
  let picker = $state(false);
  const clock = new TurnClock(
    () => view === 'game' && game?.phase === 'playing',
    (ms) => {
      if (game) game = reduceGame(game, { type: 'elapse', ms });
    },
  );
  let savedAt = 0;
  function save() {
    try {
      if (game) {
        if (game.phase === 'finished') {
          localStorage.removeItem(SAVE_KEY);
          localStorage.removeItem('alias-personal-game-v1');
        } else localStorage.setItem(SAVE_KEY, encodeGame(game));
      }
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
      savedAt = performance.now();
      return true;
    } catch {
      error =
        'Не удалось сохранить игру. Проверьте свободное место на устройстве.';
      return false;
    }
  }
  function dispatch(action: Action) {
    try {
      clock.flush();
      if (!game) throw Error('Сначала начните игру.');
      game = reduceGame(game, action);
      clock.reset();
      error = '';
      if (action.type === 'guess')
        message = `${game.players[action.player].name} +1 · ${game.players[explainerId(game)].name} +0,5`;
      else if (action.type === 'skip')
        message = `${game.players[explainerId(game)].name} −1`;
      else if (action.type === 'undo') message = 'Действие отменено';
      else message = '';
      if (game.phase === 'summary' || game.phase === 'finished') closePicker();
      save();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Не удалось выполнить действие.';
    }
  }
  function closePicker() {
    picker = false;
    clock.release('picker');
  }
  function start() {
    try {
      if (!dictionaries) throw Error('Словари ещё загружаются.');
      game = createGame(config, collectWords(dictionaries, config.packs));
      view = 'game';
      error = '';
      message = '';
      clock.clear();
      save();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Не удалось начать игру.';
    }
  }
  function resume() {
    if (!game) return;
    view = 'game';
    if (game.phase === 'paused') game = reduceGame(game, { type: 'resume' });
    clock.clear();
    error = '';
    message = '';
    save();
  }
  function pauseForBackground() {
    clock.flush();
    if (game) game = reduceGame(game, { type: 'pause' });
    closePicker();
    clock.clear();
    return save();
  }
  function menu() {
    if (pauseForBackground()) view = 'setup';
  }
  function openPicker() {
    if (!game || !['playing', 'lastword'].includes(game.phase)) return;
    const eligible = game.players.filter((p) => p.id !== explainerId(game!));
    if (eligible.length === 1) {
      dispatch({ type: 'guess', player: eligible[0].id });
      return;
    }
    clock.hold('picker');
    picker = true;
  }
  async function initialize() {
    loading = true;
    try {
      dictionaries = await loadDictionaries();
    } catch {
      error =
        'Не удалось загрузить слова. Откройте приложение с интернетом и попробуйте снова.';
    }
    loading = false;
  }
  function attach() {
    const tick = setInterval(() => {
      clock.flush();
      if (performance.now() - savedAt > 5000) save();
    }, 100);
    const holdPointer = (e: PointerEvent) =>
      clock.hold(`pointer:${e.pointerId}`);
    const releasePointer = (e: PointerEvent) => {
      setTimeout(() => clock.release(`pointer:${e.pointerId}`), 0);
    };
    const holdKey = (e: KeyboardEvent) => clock.hold(`key:${e.code}`);
    const releaseKey = (e: KeyboardEvent) => {
      setTimeout(() => clock.release(`key:${e.code}`), 0);
    };
    const visibility = () => {
      if (document.hidden) pauseForBackground();
    };
    document.addEventListener('pointerdown', holdPointer, true);
    document.addEventListener('pointerup', releasePointer, true);
    document.addEventListener('pointercancel', releasePointer, true);
    document.addEventListener('keydown', holdKey, true);
    document.addEventListener('keyup', releaseKey, true);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', pauseForBackground);
    window.addEventListener('blur', pauseForBackground);
    return () => {
      clearInterval(tick);
      document.removeEventListener('pointerdown', holdPointer, true);
      document.removeEventListener('pointerup', releasePointer, true);
      document.removeEventListener('pointercancel', releasePointer, true);
      document.removeEventListener('keydown', holdKey, true);
      document.removeEventListener('keyup', releaseKey, true);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', pauseForBackground);
      window.removeEventListener('blur', pauseForBackground);
    };
  }
  return {
    get game() {
      return game;
    },
    get config() {
      return config;
    },
    get view() {
      return view;
    },
    get dictionaries() {
      return dictionaries;
    },
    get error() {
      return error;
    },
    get message() {
      return message;
    },
    get loading() {
      return loading;
    },
    get picker() {
      return picker;
    },
    get held() {
      return clock.held;
    },
    start,
    resume,
    menu,
    dispatch,
    openPicker,
    closePicker,
    pauseForBackground,
    initialize,
    attach,
    hold: (reason: string) => clock.hold(reason),
    release: (reason: string) => clock.release(reason),
    savePreferences: save,
    clearError: () => {
      error = '';
    },
  };
}
export type Controller = ReturnType<typeof createController>;
