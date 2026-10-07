import { isRecord } from './validation';

export const PACK_IDS = ['fresh', 'hard', 'normal', 'easy'] as const;
export const TURN_SECONDS = [30, 60, 90, 120] as const;
export const TARGET_SCORES = [30, 60, 100] as const;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 12;
export const MAX_NAME_LENGTH = 24;

export type PackId = (typeof PACK_IDS)[number];
export interface Config {
  names: string[];
  packs: PackId[];
  seconds: (typeof TURN_SECONDS)[number];
  target: (typeof TARGET_SCORES)[number];
}

export function defaultConfig(): Config {
  return {
    names: ['Игрок 1', 'Игрок 2', 'Игрок 3'],
    packs: ['fresh'],
    seconds: 60,
    target: 60,
  };
}

export function isPackId(value: unknown): value is PackId {
  return PACK_IDS.some((id) => id === value);
}

/** Preferences may contain unfinished names or an empty pack selection. */
export function validConfig(value: unknown): value is Config {
  if (!isRecord(value)) {
    return false;
  }

  return (
    Array.isArray(value.names) &&
    value.names.length >= MIN_PLAYERS &&
    value.names.length <= MAX_PLAYERS &&
    value.names.every(
      (name) => typeof name === 'string' && name.length <= MAX_NAME_LENGTH,
    ) &&
    Array.isArray(value.packs) &&
    value.packs.every(isPackId) &&
    new Set(value.packs).size === value.packs.length &&
    TURN_SECONDS.some((seconds) => seconds === value.seconds) &&
    TARGET_SCORES.some((target) => target === value.target)
  );
}

export function validateGameConfig(value: unknown): Config {
  if (!validConfig(value)) {
    throw new Error('Проверьте настройки игры.');
  }

  const names = value.names.map((name) => name.trim());
  if (names.some((name) => !name)) {
    throw new Error('Введите имена игроков.');
  }
  if (
    new Set(names.map((name) => name.toLocaleLowerCase('ru'))).size !==
    names.length
  ) {
    throw new Error('Имена игроков должны отличаться.');
  }
  if (!value.packs.length) {
    throw new Error('Выберите хотя бы один словарь.');
  }

  return { ...value, names, packs: [...value.packs] };
}
