import { isRecord, isWord } from './validation';

export interface Definition {
  word: string;
  meanings: string[];
}
export type Definitions = Record<string, Definition>;
export const normalizeWord = (word: string) =>
  word
    .normalize('NFC')
    .replaceAll('\u0301', '')
    .toLocaleLowerCase('ru')
    .replaceAll('ё', 'е')
    .trim();

export function isDefinitions(value: unknown): value is Definitions {
  return (
    isRecord(value) &&
    Object.entries(value).every(
      ([key, entry]) =>
        isWord(key) &&
        isRecord(entry) &&
        isWord(entry.word) &&
        Array.isArray(entry.meanings) &&
        entry.meanings.length > 0 &&
        entry.meanings.length <= 3 &&
        entry.meanings.every(
          (meaning) =>
            typeof meaning === 'string' &&
            meaning.trim().length > 0 &&
            meaning.length <= 10000,
        ),
    )
  );
}

/** A single bundled asset, cached by the PWA. Showing a hint never fetches a word. */
export async function loadDefinitions(): Promise<Definitions> {
  const response = await fetch(`${import.meta.env.BASE_URL}definitions.json`);
  if (!response.ok) {
    throw new Error('Не удалось загрузить определения.');
  }
  const value: unknown = await response.json();
  if (!isDefinitions(value)) {
    throw new Error('Словарь определений повреждён.');
  }
  return value;
}
