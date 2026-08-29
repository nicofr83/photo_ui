#!/usr/bin/env python3
"""Extract the TypeScript blocks from docs/api-contract.md.

The contract is ~96 KB of prose and types. Implementation agents re-read it on
every resume, which is where a large share of the token budget went. This pulls
the 12 code blocks into one file, keeping each block under the heading it came
from so a reader can find its prose again.

The contract stays the source of truth: the extract carries no amendment
history, no error semantics, no filter rules.

Usage: python3 tools/extract-contract-types.py
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'docs' / 'api-contract.md'
DST = ROOT / 'src' / 'shared' / 'contract' / 'types-extrait.ts'

HEADER = """// Types du contrat photo_ui — EXTRAIT AUTOMATIQUE de docs/api-contract.md
//
// Ce fichier est une COMMODITÉ DE LECTURE pour les agents d'implémentation :
// il rassemble les blocs TypeScript du contrat, sans la prose qui les entoure.
//
// LA SOURCE DE VÉRITÉ RESTE docs/api-contract.md. En cas de doute, ou pour
// comprendre POURQUOI un type est fait ainsi, ouvrir le contrat — notamment
// ses amendements datés en tête, et ses règles de comportement (filtres,
// erreurs, natures) que le typage seul ne porte pas.
//
// Régénérer : python3 tools/extract-contract-types.py
"""


def main() -> None:
    heading = ''
    in_block = False
    buf: list[str] = []
    blocks: list[tuple[str, str]] = []

    for line in SRC.read_text(encoding='utf-8').split('\n'):
        if line.startswith('#'):
            heading = line.lstrip('#').strip()
        if re.match(r'^```(ts|typescript)$', line):
            in_block, buf = True, []
            continue
        if in_block and line.strip() == '```':
            in_block = False
            blocks.append((heading, '\n'.join(buf)))
            continue
        if in_block:
            buf.append(line)

    DST.parent.mkdir(parents=True, exist_ok=True)
    with DST.open('w', encoding='utf-8') as f:
        f.write(HEADER)
        for head, body in blocks:
            f.write(f"\n\n// ─── {head} " + "─" * max(0, 60 - len(head)) + "\n\n")
            f.write(body.rstrip() + '\n')

    print(f"{len(blocks)} blocks -> {DST.relative_to(ROOT)}")


if __name__ == '__main__':
    main()
