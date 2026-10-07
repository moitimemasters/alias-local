import {
  createGame,
  reduceGame,
  explainer,
  getPlayer,
  guessers,
  type Action,
  type Config,
  type GameState,
} from './game';
import { TurnClock } from './clock';
import { attachInteractionEvents } from './interaction-events';
import {
  loadLocal,
  encodeGame,
  SAVE_KEY,
  CONFIG_KEY,
  LEGACY_KEY,
  type LocalStorage,
} from './persistence';
import { defaultConfig } from './config';
import {
  collectWords,
  loadDictionaries,
  type Dictionaries,
} from './dictionaries';

interface ControllerOptions {
  storage?: LocalStorage;
  now?: () => number;
  loadWords?: typeof loadDictionaries;
}

export function createController(options: ControllerOptions = {}) {
  const now = options.now ?? (() => performance.now());
  const loadWords = options.loadWords ?? loadDictionaries;
  let storage: LocalStorage | undefined;
  let storageError = '';
  try {
    storage = options.storage ?? window.localStorage;
  } catch {
    storageError = 'Хранилище недоступно. Игра не сохранится после закрытия.';
  }
  const initial = storage
    ? loadLocal(storage)
    : { game: null, config: defaultConfig(), error: storageError };
  let game = $state.raw<GameState | null>(initial.game);
  const config = $state<Config>(initial.config);
  let view = $state<'setup' | 'game'>('setup');
  let dictionaries = $state.raw<Dictionaries | null>(null);
  let error = $state(initial.error);
  let message = $state('');
  let loading = $state(true);
  let picker = $state(false);
  const clock = new TurnClock(
    () => view === 'game' && game?.phase === 'playing',
    (ms) => {
      if (game) {
        game = reduceGame(game, { type: 'elapse', ms });
      }
    },
    now,
  );
  let savedAt = now();
  let savedGame = initial.game;
  let savedConfig = JSON.stringify(initial.config);
  function save() {
    savedAt = now();
    try {
      if (!storage) {
        throw new Error('Хранилище недоступно.');
      }
      if (game && game !== savedGame) {
        if (game.phase === 'finished') {
          storage.removeItem(SAVE_KEY);
          storage.removeItem(LEGACY_KEY);
        } else {
          storage.setItem(SAVE_KEY, encodeGame(game));
        }
        savedGame = game;
      }
      const preferences = JSON.stringify(config);
      if (preferences !== savedConfig) {
        storage.setItem(CONFIG_KEY, preferences);
        savedConfig = preferences;
      }
      return true;
    } catch {
      error =
        'Не удалось сохранить игру. Проверьте свободное место и доступ к хранилищу.';
      return false;
    }
  }

  function dispatch(action: Action) {
    try {
      clock.flush();
      if (!game) {
        throw new Error('Сначала начните игру.');
      }
      game = reduceGame(game, action);
      clock.reset();
      error = '';
      if (action.type === 'guess') {
        message = `${getPlayer(game, action.player).name} +1 · ${explainer(game).name} +0,5`;
      } else if (action.type === 'skip') {
        message = `${explainer(game).name} −1`;
      } else if (action.type === 'undo') {
        message = 'Действие отменено';
      } else {
        message = '';
      }
      if (game.phase === 'summary' || game.phase === 'finished') {
        closePicker();
      }
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
      if (!dictionaries) {
        throw new Error('Словари ещё загружаются.');
      }
      game = createGame(config, collectWords(dictionaries, config.packs));
      view = 'game';
      error = '';
      message = '';
      closePicker();
      clock.clearInputHolds();
      save();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Не удалось начать игру.';
    }
  }

  function resume() {
    if (!game) {
      return;
    }
    view = 'game';
    if (game.phase === 'paused') {
      game = reduceGame(game, { type: 'resume' });
    }
    clock.clearInputHolds();
    error = '';
    message = '';
    save();
  }

  function pauseForBackground() {
    clock.flush();
    if (game) {
      game = reduceGame(game, { type: 'pause' });
    }
    closePicker();
    clock.clearInputHolds();
    return save();
  }

  function menu() {
    if (pauseForBackground()) {
      view = 'setup';
    }
  }

  function openPicker() {
    if (!game || !['playing', 'lastword'].includes(game.phase)) {
      return;
    }
    const eligible = guessers(game);
    const [onlyGuesser] = eligible;
    if (eligible.length === 1 && onlyGuesser) {
      dispatch({ type: 'guess', player: onlyGuesser.id });
      return;
    }
    clock.hold('picker');
    picker = true;
  }

  async function initialize() {
    loading = true;
    try {
      dictionaries = await loadWords();
      if (error.startsWith('Не удалось загрузить слова.')) {
        error = '';
      }
    } catch {
      error =
        'Не удалось загрузить слова. Откройте приложение с интернетом и попробуйте снова.';
    }
    loading = false;
  }

  function attach() {
    const tick = setInterval(() => {
      const wasPlaying = game?.phase === 'playing';
      clock.flush();
      if (
        wasPlaying &&
        (game?.phase !== 'playing' || now() - savedAt >= 5000)
      ) {
        save();
      }
    }, 100);
    const detachInteractions = attachInteractionEvents(
      clock,
      pauseForBackground,
    );
    return () => {
      clearInterval(tick);
      detachInteractions();
      clock.clear();
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
    checkpoint: () => {
      clock.flush();
      return save();
    },
    reportError: (message: string) => {
      error = message;
    },
    clearError: () => {
      error = '';
    },
  };
}
export type Controller = ReturnType<typeof createController>;
