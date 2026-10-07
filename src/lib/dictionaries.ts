import type { PackId } from './config';
import { isRecord, isWord } from './validation';
export const packs: { id: PackId; name: string; detail: string }[] = [
  {
    id: 'fresh',
    name: 'Новые сложные',
    detail: 'Без слов из «Мозгового штурма»',
  },
  { id: 'hard', name: 'Мозговой штурм', detail: 'Сложные слова' },
  { id: 'normal', name: 'Оптимус', detail: 'Средняя сложность' },
  { id: 'easy', name: 'Лёгкий', detail: 'Для первой игры' },
];
export type Dictionaries = Record<PackId, string[]>;

export function isDictionaries(value: unknown): value is Dictionaries {
  return (
    isRecord(value) &&
    packs.every(({ id }) => {
      const words = value[id];
      return Array.isArray(words) && words.length > 0 && words.every(isWord);
    })
  );
}

export async function loadDictionaries(): Promise<Dictionaries> {
  const response = await fetch(`${import.meta.env.BASE_URL}dictionaries.json`);
  if (!response.ok) {
    throw Error('Не удалось загрузить словари.');
  }
  const data: unknown = await response.json();
  if (!isDictionaries(data)) {
    throw new Error('Словари повреждены.');
  }
  return data;
}
export const collectWords = (data: Dictionaries, selected: PackId[]) => [
  ...new Set(selected.flatMap((id) => data[id])),
];
