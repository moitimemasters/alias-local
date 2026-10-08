"""Filter a local Kaikki Russian-edition JSONL.gz dump; no runtime/API access.

Usage: python3 scripts/build-definitions.py /path/to/ru-extract.jsonl.gz
Source content: Wiktionary contributors, CC BY-SA 4.0 (see metadata).
"""
import gzip
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def normalize(word):
    return unicodedata.normalize('NFC', word).replace('\u0301', '').lower().replace('ё', 'е').strip()


def build(source):
    packs = json.loads((ROOT / 'public/dictionaries.json').read_text())
    wanted = {normalize(word) for words in packs.values() for word in words}
    definitions = {}
    forms = {}
    with gzip.open(source, 'rt', encoding='utf-8') as stream:
        for line in stream:
            record = json.loads(line)
            if record.get('lang_code') != 'ru':
                continue
            word = record.get('word', '')
            key = normalize(word)
            for sense in record.get('senses', []):
                if sense.get('form_of'):
                    forms.setdefault(key, []).extend(normalize(item['word']) for item in sense['form_of'])
                    continue
                if 'no-gloss' in sense.get('tags', []):
                    continue
                for gloss in sense.get('glosses', []):
                    # Omit missing definitions and grammatical descriptions of forms.
                    text = re.sub(r'\s+', ' ', gloss.replace('◆', '')).strip()
                    if not text or text.lower().startswith(('значение отсутствует', 'форма ', 'множественное число', 'родительный падеж')):
                        continue
                    entry = definitions.setdefault(key, {'word': word, 'meanings': []})
                    if text not in entry['meanings'] and len(entry['meanings']) < 3:
                        entry['meanings'].append(text)
    selected = {}
    for key in sorted(wanted):
        entry = definitions.get(key)
        if not entry:
            entry = next((definitions[lemma] for lemma in forms.get(key, []) if lemma in definitions), None)
        if entry:
            selected[key] = entry
    target = ROOT / 'public/definitions.json'
    target.write_text(json.dumps(selected, ensure_ascii=False, separators=(',', ':')) + '\n')
    with source.open('rb') as compressed:
        checksum = hashlib.file_digest(compressed, 'sha256').hexdigest()
    metadata = {
        'source': 'https://kaikki.org/ruwiktionary/',
        'download': 'https://kaikki.org/dictionary/downloads/ru/ru-extract.jsonl.gz',
        'contributors': 'Russian Wiktionary contributors; extraction by Kaikki / Wiktextract',
        'license': 'CC BY-SA 4.0',
        'licenseUrl': 'https://creativecommons.org/licenses/by-sa/4.0/',
        'attribution': 'https://ru.wiktionary.org/wiki/{word}',
        'changes': 'Russian entries only; matched game words, accents removed from lookup keys, ё/е normalized; up to three senses; form-of references resolved; examples and other metadata omitted; whitespace normalized.',
        'snapshotDate': '2026-10-08',
        'compressedSha256': checksum,
        'entries': len(selected),
        'gameWords': len(wanted),
        'coverageByPack': {pack: {'defined': sum(normalize(word) in selected for word in words), 'total': len(words)} for pack, words in packs.items()},
        'missing': sorted(wanted - selected.keys()),
    }
    (ROOT / 'public/definition-sources.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'entries': len(selected), 'bytes': target.stat().st_size, 'coverageByPack': metadata['coverageByPack']}, ensure_ascii=False))


if __name__ == '__main__':
    build(Path(sys.argv[1]))
