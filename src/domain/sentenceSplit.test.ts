import { splitSentences } from './sentenceSplit';

describe('V1.7, "Ma vie" — une phrase par ligne', () => {
  test('splits on a simple terminal punctuation followed by a capital', () => {
    expect(splitSentences('Il est parti. Elle est restée.')).toEqual([
      'Il est parti.', 'Elle est restée.',
    ]);
  });

  test('splits on ! and ?, not only on .', () => {
    expect(splitSentences('Il pleut ! On rentre ? Oui.')).toEqual([
      'Il pleut !', 'On rentre ?', 'Oui.',
    ]);
  });

  test('a closing quote or bracket after the terminal punctuation is included in the same sentence', () => {
    expect(splitSentences('Il a dit "Attends." Puis il est parti.')).toEqual([
      'Il a dit "Attends."', 'Puis il est parti.',
    ]);
  });

  test('a text with no terminal punctuation stays one block — never split on length or comma', () => {
    expect(splitSentences('Le ciel était gris, la mer agitée, le vent fort')).toEqual([
      'Le ciel était gris, la mer agitée, le vent fort',
    ]);
  });

  test('splits before a digit too, not only a capital letter', () => {
    expect(splitSentences('On est arrivés. 3 jours de mer.')).toEqual([
      'On est arrivés.', '3 jours de mer.',
    ]);
  });
});

describe('V1.7 — les abréviations connues ne coupent jamais', () => {
  test.each([
    ['M. Cuvillier est arrivé.', ['M. Cuvillier est arrivé.']],
    ['Mme Dupont était là. Elle est repartie.', ['Mme Dupont était là.', 'Elle est repartie.']],
    ['cf. le journal de bord. Rien à ajouter.', ['cf. le journal de bord.', 'Rien à ajouter.']],
    ['etc. Voilà tout.', ['etc. Voilà tout.']],
  ])('%s', (input, expected) => {
    expect(splitSentences(input)).toEqual(expected);
  });

  test('a period after a known abbreviation is not a split point, even mid-sentence', () => {
    expect(splitSentences('On a vu le Dr. Martin ce matin. Tout va bien.')).toEqual([
      'On a vu le Dr. Martin ce matin.', 'Tout va bien.',
    ]);
  });
});

describe('V1.7 — une initiale ne coupe jamais', () => {
  test('a single capital letter followed by a period is an initial, not a sentence end', () => {
    expect(splitSentences('J. Cuvillier est arrivé. Il pleut.')).toEqual([
      'J. Cuvillier est arrivé.', 'Il pleut.',
    ]);
  });
});

describe('V1.7 — un nombre décimal ou une coordonnée ne coupe jamais sur son point', () => {
  test('a decimal number', () => {
    expect(splitSentences('Il faisait 12.5 degrés. Le vent forcissait.')).toEqual([
      'Il faisait 12.5 degrés.', 'Le vent forcissait.',
    ]);
  });

  test('a coordinate, and the real sentence end right after it still splits', () => {
    expect(splitSentences('Position 15.32N. On a mouillé.')).toEqual([
      'Position 15.32N.', 'On a mouillé.',
    ]);
  });
});

describe('V1.7 — des points de suspension suivis d\'une minuscule prolongent la phrase', () => {
  test('an ellipsis followed by a lowercase letter does not split', () => {
    expect(splitSentences('Il hésitait... puis se décida.')).toEqual([
      'Il hésitait... puis se décida.',
    ]);
  });

  test('an ellipsis followed by a capital DOES split', () => {
    expect(splitSentences('Il hésitait... Puis il partit.')).toEqual([
      'Il hésitait...', 'Puis il partit.',
    ]);
  });
});

describe('V1.7 — le découpage est un affichage, jamais une donnée', () => {
  test('no word is dropped or duplicated — normalized, the pieces reconstruct the original', () => {
    const text = 'Il est parti. Elle est restée. On verra bien.';
    const sentences = splitSentences(text);
    expect(sentences.join(' ').replace(/\s+/g, ' ').trim()).toBe(text.replace(/\s+/g, ' ').trim());
  });
});
