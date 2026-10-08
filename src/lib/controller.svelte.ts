import {
  createGame,
  reduceGame,
  explainer,
  guessers,
  type Action,
  type Config,
  type GameState,
} from './game';
import { TurnClock } from './clock';
import { describeEntry } from './presentation';
import { attachInteractionEvents } from './interaction-events';
import {
  loadLocal,
  encodeGame,
  SAVE_KEY,
  CONFIG_KEY,
  type LocalStorage,
} from './persistence';
import {
  loadDefinitions,
  normalizeWord,
  type Definitions,
  type Definition,
} from './definitions';
import { defaultConfig, MIN_PLAYERS, MAX_PLAYERS } from './config';
import {
  collectWords,
  loadDictionaries,
  type Dictionaries,
} from './dictionaries';

interface ControllerOptions {
  storage?: LocalStorage;
  now?: () => number;
  loadWords?: typeof loadDictionaries;
  loadHints?: typeof loadDefinitions;
}

export function createController(options: ControllerOptions = {}) {
  const now = options.now ?? (() => performance.now());
  const loadWords = options.loadWords ?? loadDictionaries;
  const loadHints = options.loadHints ?? loadDefinitions;
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
  let definitions = $state.raw<Definitions | null>(null);
  let hint = $state.raw<Definition | null>(null);
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
        storage.setItem(SAVE_KEY, encodeGame(game));
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
      if (action.type === 'guess' || action.type === 'tie') {
        const entry = game.entries.at(-1);
        message = entry ? describeEntry(game, entry) : '';
      } else if (action.type === 'skip') {
        message = `${explainer(game).name} −1`;
      } else if (action.type === 'undo') {
        message = 'Действие отменено';
      } else {
        message = '';
      }
      if (action.type !== 'hint') {
        closeHint();
      }
      if (game.phase === 'summary' || game.phase === 'finished') {
        closePicker();
      }
      save();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Не удалось выполнить действие.';
    }
  }

  function closeHint() {
    hint = null;
    clock.release('hint');
  }

  function openHint() {
    if (!game?.word || !['playing', 'lastword'].includes(game.phase)) {
      return;
    }
    const definition = definitions?.[normalizeWord(game.word)];
    if (!definition) {
      return;
    }
    clock.hold('hint');
    dispatch({ type: 'hint' });
    hint = definition;
  }

  function closePicker() {
    picker = false;
    clock.release('picker');
  }

  function start(proposed: Config = config) {
    try {
      if (!dictionaries) {
        throw new Error('Словари ещё загружаются.');
      }
      const next = createGame(
        proposed,
        collectWords(dictionaries, proposed.packs),
      );
      Object.assign(config, {
        ...next.config,
        names: [...next.config.names],
        packs: [...next.config.packs],
      });
      game = next;
      view = 'game';
      error = '';
      message = '';
      closePicker();
      closeHint();
      clock.clearInputHolds();
      save();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Не удалось начать игру.';
    }
  }

  function addPlayer() {
    if (config.names.length >= MAX_PLAYERS) {
      return;
    }
    const existing = config.names.map((name) =>
      name.trim().toLocaleLowerCase('ru'),
    );
    let number = config.names.length + 1;
    while (existing.includes(`игрок ${number}`)) {
      number++;
    }
    config.names.push(`Игрок ${number}`);
    save();
  }

  function removePlayer(index: number) {
    if (
      config.names.length <= MIN_PLAYERS ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= config.names.length
    ) {
      return;
    }
    config.names.splice(index, 1);
    save();
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
    closeHint();
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
      const [words, hints] = await Promise.allSettled([
        loadWords(),
        loadHints(),
      ]);
      if (words.status === 'rejected') {
        throw words.reason;
      }
      dictionaries = words.value;
      definitions = hints.status === 'fulfilled' ? hints.value : null;
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
    get definitions() {
      return definitions;
    },
    get hint() {
      return hint;
    },
    get hintAvailable() {
      return !!game?.word && !!definitions?.[normalizeWord(game.word)];
    },
    get picker() {
      return picker;
    },
    get held() {
      return clock.held;
    },
    start,
    addPlayer,
    removePlayer,
    resume,
    menu,
    dispatch,
    openHint,
    closeHint,
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
