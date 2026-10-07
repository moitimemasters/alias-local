import type { Controller } from './controller.svelte';
import { explainerId, score } from './game';
import { validateGameConfig } from './config';
interface Tool {
  name: string;
  description: string;
  inputSchema: object;
  annotations: object;
  execute: (input: Record<string, unknown>) => unknown;
}
interface ModelContext {
  registerTool: (tool: Tool) => void;
  unregisterTool: (name: string) => void;
}
/** Optional browser-native tools; the app does not require an agent or network service. */
export function registerGameTools(c: Controller): () => void {
  const context = (document as Document & { modelContext?: ModelContext })
    .modelContext;
  if (!context) return () => {};
  const read = () => ({
    view: c.view,
    game: c.game
      ? {
          phase: c.game.phase,
          word: c.game.phase === 'paused' ? null : c.game.word,
          players: c.game.players.map((p) => ({
            id: p.id,
            name: p.name,
            score: p.scoreUnits / 2,
            displayScore: score(p.scoreUnits),
          })),
          explainer: explainerId(c.game),
          remainingMs: c.game.remainingMs,
          remainingWords: c.game.deck.length,
          target: c.game.config.target,
          turn: c.game.turn,
          interactionPaused: c.held,
        }
      : null,
  });
  const tools: Tool[] = [
    {
      name: 'new_alias_game',
      description:
        'Start a new local Alias game, replacing the saved party. Names identify players, selected dictionaries and settings are optional.',
      inputSchema: {
        type: 'object',
        properties: {
          names: {
            type: 'array',
            items: { type: 'string' },
            minItems: 2,
            maxItems: 12,
          },
          packs: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['fresh', 'hard', 'normal', 'easy'],
            },
          },
          seconds: { type: 'integer', enum: [30, 60, 90, 120] },
          target: { type: 'integer', enum: [30, 60, 100] },
        },
        required: ['names'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
      execute: (input) => {
        const config = validateGameConfig({
          names: input.names,
          packs: input.packs ?? c.config.packs,
          seconds: input.seconds ?? c.config.seconds,
          target: input.target ?? c.config.target,
        });
        Object.assign(c.config, config);
        c.start();
        if (c.error) throw Error(c.error);
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
        if (!action) throw Error('Неизвестное действие.');
        if (action === 'guess') {
          if (!Number.isInteger(input.player)) throw Error('Нужен player.');
          c.dispatch({ type: 'guess', player: input.player as number });
        } else if (action === 'resume' && c.view === 'setup') c.resume();
        else {
          if (action === 'begin' && c.view === 'setup') c.resume();
          c.dispatch({ type: action });
        }
        if (c.error) throw Error(c.error);
        return read();
      },
    },
  ];
  for (const tool of tools) context.registerTool(tool);
  return () => {
    for (const tool of tools) context.unregisterTool(tool.name);
  };
}
