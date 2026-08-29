/**
 * Classe un nom de tag IA en `place | descriptive | unknown` — la première
 * passe de `ref.tag_kind`, corrigeable à la main ensuite. Le classifieur
 * d'images voit des ruines de pierre et sort un nom de pays : `italy` frappe
 * 18 photos de Tikal, `egypt` 30 du Maroc. Ce module ne juge PAS si un tag
 * est vrai sur une photo donnée — il dit seulement si le MOT lui-même nomme
 * un lieu, ce qui suffit à l'écarter de l'axe lieu (spec, commit `af2a65b`).
 *
 * Comparaison EXACTE, jamais une recherche de sous-chaîne : `turkey vulture`
 * (un oiseau) ne doit pas devenir un lieu parce qu'il contient `turkey`.
 */
export type TagKind = 'place' | 'descriptive' | 'unknown';

const COUNTRIES = new Set([
  'afghanistan', 'albania', 'algeria', 'andorra', 'angola', 'argentina', 'armenia', 'australia',
  'austria', 'azerbaijan', 'bahamas', 'bahrain', 'bangladesh', 'barbados', 'belarus', 'belgium',
  'belize', 'benin', 'bhutan', 'bolivia', 'bosnia', 'botswana', 'brazil', 'brunei', 'bulgaria',
  'burkina faso', 'burundi', 'cambodia', 'cameroon', 'canada', 'chad', 'chile', 'china', 'colombia',
  'comoros', 'congo', 'costa rica', 'croatia', 'cuba', 'cyprus', 'denmark', 'djibouti', 'dominica',
  'ecuador', 'egypt', 'el salvador', 'eritrea', 'estonia', 'ethiopia', 'fiji', 'finland', 'france',
  'gabon', 'gambia', 'georgia', 'germany', 'ghana', 'gibraltar', 'greece', 'grenada', 'guatemala',
  'guinea', 'guyana', 'haiti', 'honduras', 'hungary', 'iceland', 'india', 'indonesia', 'iran',
  'iraq', 'ireland', 'israel', 'italy', 'jamaica', 'japan', 'jordan', 'kazakhstan', 'kenya',
  'kuwait', 'laos', 'latvia', 'lebanon', 'lesotho', 'liberia', 'libya', 'liechtenstein',
  'lithuania', 'luxembourg', 'madagascar', 'malawi', 'malaysia', 'maldives', 'mali', 'malta',
  'mauritania', 'mauritius', 'mexico', 'moldova', 'monaco', 'mongolia', 'montenegro', 'morocco',
  'mozambique', 'myanmar', 'namibia', 'nepal', 'netherlands', 'nicaragua', 'niger', 'nigeria',
  'norway', 'oman', 'pakistan', 'panama', 'paraguay', 'peru', 'philippines', 'poland', 'portugal',
  'qatar', 'romania', 'russia', 'rwanda', 'samoa', 'senegal', 'serbia', 'seychelles', 'singapore',
  'slovakia', 'slovenia', 'somalia', 'spain', 'sudan', 'suriname', 'swaziland', 'sweden',
  'switzerland', 'syria', 'taiwan', 'tanzania', 'thailand', 'togo', 'tonga', 'trinidad', 'tunisia', 'turkey',
  'turkmenistan', 'tuvalu', 'uganda', 'ukraine', 'uruguay', 'uzbekistan', 'vanuatu', 'venezuela',
  'vietnam', 'yemen', 'zambia', 'zimbabwe',
]);

/** Continents, régions et étendues d'eau — le vocabulaire du corpus en porte plusieurs. */
const REGIONS = new Set([
  'africa', 'asia', 'europe', 'antarctica', 'oceania', 'north america', 'south america',
  'central america', 'middle east', 'caribbean', 'scandinavia', 'polynesia', 'micronesia',
  'atlantic', 'pacific', 'indian ocean', 'mediterranean', 'red sea', 'north sea', 'baltic sea',
  'english channel', 'gulf of mexico', 'sahara',
]);

/** Sites et villes précis, confirmés dans le vocabulaire réel du corpus. */
const NAMED_PLACES = new Set([
  'tikal', 'athens', 'lisbon', 'lisbonne', 'paris', 'rome', 'venice', 'azores', 'madeira',
]);

/**
 * Un mot qui nomme À LA FOIS un lieu réel et quelque chose d'entièrement
 * différent, aussi plausible sur une photo de famille : `turkey` (pays ou
 * dinde), `china` (pays ou vaisselle), `jordan` (pays ou prénom), `nice`
 * (ville ou adjectif), `monaco` (pays ou marque automobile/horlogère),
 * `chad` (pays ou prénom), `georgia` (pays, état américain, ou prénom).
 * Aucune des deux lectures ne l'emporte sans regarder la photo — exactement
 * ce que « corrigeable à la main » existe pour trancher.
 */
const AMBIGUOUS = new Set(['turkey', 'china', 'jordan', 'nice', 'monaco', 'chad', 'georgia']);

export function classifyTagName(name: string): TagKind {
  const normalized = name.trim().toLowerCase();
  if (AMBIGUOUS.has(normalized)) return 'unknown';
  if (COUNTRIES.has(normalized) || REGIONS.has(normalized) || NAMED_PLACES.has(normalized)) {
    return 'place';
  }
  return 'descriptive';
}
