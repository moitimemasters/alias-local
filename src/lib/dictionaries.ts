import type { PackId } from './game';
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
export async function loadDictionaries(): Promise<Dictionaries> {
  const response = await fetch(`${import.meta.env.BASE_URL}dictionaries.json`);
  if (!response.ok) throw Error('Не удалось загрузить словари.');
  const data = (await response.json()) as Dictionaries;
  if (
    packs.some(
      ({ id }) =>
        !Array.isArray(data[id]) ||
        !data[id].length ||
        data[id].some((w) => typeof w !== 'string' || !w),
    )
  )
    throw Error('Словари повреждены.');
  return data;
}
export const collectWords = (data: Dictionaries, selected: PackId[]) => [
  ...new Set(selected.flatMap((id) => data[id])),
];
