import type { Controller } from './controller.svelte';
import { explainerId } from './game';
import { formatScore } from './presentation';
import {
  validateGameConfig,
  PACK_IDS,
  TURN_SECONDS,
  TARGET_SCORES,
  MIN_PLAYERS,
  MAX_PLAYERS,
  MAX_NAME_LENGTH,
} from './config';
interface Tool {
  name: string;
  description: string;
  inputSchema: object;
  annotations: object;
  execute: (input: Record<string, unknown>) => unknown;
}
interface ModelContext {
  registerTool: (tool: Tool) => void | Promise<void>;
  unregisterTool?: (name: string) => void;
}
const registrations = new WeakMap<
  ModelContext,
  { controller: Controller | null }
>();
/** Optional browser-native tools; the app does not require an agent or network service. */
export function registerGameTools(initialController: Controller): () => void {
  const context = (document as Document & { modelContext?: ModelContext })
    .modelContext;
  if (!context) {
    return () => {};
  }
  const existing = registrations.get(context);
  const registration = existing ?? { controller: initialController };
  registration.controller = initialController;
  registrations.set(context, registration);
  function activeController() {
    if (!registration.controller) {
      throw new Error('Игра сейчас недоступна.');
    }
    return registration.controller;
  }
  const read = () => {
    const controller = activeController();
    return {
      view: controller.view,
      game: controller.game
        ? {
            phase: controller.game.phase,
            word:
              controller.game.phase === 'paused' ? null : controller.game.word,
            players: controller.game.players.map((p) => ({
              id: p.id,
              name: p.name,
              score: p.scoreUnits / 2,
              displayScore: formatScore(p.scoreUnits),
            })),
            explainer: explainerId(controller.game),
            remainingMs: controller.game.remainingMs,
            remainingWords: controller.game.deck.length,
            target: controller.game.config.target,
            turn: controller.game.turn,
            interactionPaused: controller.held,
            hintUsed: controller.game.hintUsed,
            hintAvailable: controller.hintAvailable,
          }
        : null,
    };
  };
  const tools: Tool[] = [
    {
      name: 'new_alias_game',
      description:
        'Start a new local Alias game, replacing the saved party. Names identify players, selected dictionaries and settings are optional.',
      inputSchema: {
        type: 'object',
        properties: {
          hints: { type: 'boolean' },
          names: {
            type: 'array',
            items: { type: 'string', minLength: 1, maxLength: MAX_NAME_LENGTH },
            minItems: MIN_PLAYERS,
            maxItems: MAX_PLAYERS,
          },
          packs: {
            type: 'array',
            items: {
              type: 'string',
              enum: PACK_IDS,
            },
          },
          seconds: { type: 'integer', enum: TURN_SECONDS },
          target: { type: 'integer', enum: TARGET_SCORES },
        },
        required: ['names'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
      execute: (input) => {
        const controller = activeController();
        const config = validateGameConfig({
          hints: input.hints ?? controller.config.hints ?? false,
          names: input.names,
          packs: input.packs ?? controller.config.packs,
          seconds: input.seconds ?? controller.config.seconds,
          target: input.target ?? controller.config.target,
        });
        controller.start(config);
        if (controller.error) {
          throw new Error(controller.error);
        }
        return read();
      },
    },
    {
      name: 'read_alias_game',
      description:
        'Read the local Alias game, timer and personal scores. Paused words are hidden.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: read,
    },
    {
      name: 'play_alias',
      description:
        'Play the local game: begin a turn, pause/resume, guess (+1 guesser, +0.5 explainer), skip (−1 explainer), undo, end or next. These tools operate only this device.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: [
              'begin',
              'pause',
              'resume',
              'guess',
              'skip',
              'undo',
              'end',
              'next',
            ],
          },
          player: { type: 'integer' },
        },
        required: ['action'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: (input) => {
        const controller = activeController();
        const actions = [
          'begin',
          'pause',
          'resume',
          'guess',
          'skip',
          'undo',
          'end',
          'next',
        ] as const;
        const action = actions.find((a) => a === input.action);
        if (!action) {
          throw new Error('Неизвестное действие.');
        }
        if (action === 'guess') {
          if (
            typeof input.player !== 'number' ||
            !Number.isInteger(input.player)
          ) {
            throw new Error('Нужен player.');
          }
          controller.dispatch({
            type: 'guess',
            player: input.player,
          });
        } else if (action === 'resume' && controller.view === 'setup') {
          controller.resume();
        } else {
          if (action === 'begin' && controller.view === 'setup') {
            controller.resume();
          }
          controller.dispatch({ type: action });
        }
        if (controller.error) {
          throw new Error(controller.error);
        }
        return read();
      },
    },
  ];
  if (!existing) {
    for (const tool of tools) {
      void Promise.resolve()
        .then(() => {
          if (
            registrations.get(context) !== registration ||
            !registration.controller
          ) {
            return;
          }
          return context.registerTool(tool);
        })
        .catch((error: unknown) => {
          console.warn('Could not register optional game tools.', error);
        });
    }
  }
  return () => {
    if (registration.controller !== initialController) {
      return;
    }
    registration.controller = null;
    if (!context.unregisterTool) {
      return;
    }
    for (const tool of tools) {
      context.unregisterTool(tool.name);
    }
    registrations.delete(context);
  };
}
if (import.meta.hot) {
  // Tool descriptors cannot be replaced in browsers without unregisterTool.
  import.meta.hot.accept(() => window.location.reload());
}
