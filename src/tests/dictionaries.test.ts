import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { isDictionaries } from '../lib/dictionaries';
const parsed: unknown = JSON.parse(
  readFileSync('public/dictionaries.json', 'utf8'),
);
if (!isDictionaries(parsed)) throw new Error('Invalid dictionary fixture');
const data = parsed;
it('ships all four complete Russian dictionaries and excludes Brainstorm from the fresh set', () => {
  expect(
    Object.fromEntries(
      Object.entries(data).map(([id, words]) => [id, words.length]),
    ),
  ).toEqual({ easy: 2049, normal: 3106, hard: 2410, fresh: 12700 });
  const normalize = (word: string) =>
    word.toLocaleLowerCase('ru').replaceAll('ё', 'е');
  const old = new Set(data.hard.map(normalize));
  expect(data.fresh.some((word) => old.has(normalize(word)))).toBe(false);
});

it.each([
  null,
  [],
  {},
  { ...data, fresh: [] },
  { ...data, easy: [' '] },
  { ...data, hard: [42] },
])('rejects malformed dictionary data: %j', (value) => {
  expect(isDictionaries(value)).toBe(false);
});
