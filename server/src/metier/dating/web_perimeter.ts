export interface WebPerimeterCandidate {
  readonly documentId: string;
  readonly passageCount: number;
  /** `WebDateProposal.date`, ou `null` si aucune photo n'est liée. */
  readonly proposalDate: string | null;
}

const FOUR_DIGIT_YEAR = /\d{4}/g;
const PLAUSIBLE_YEAR_MIN = 1900;
const PLAUSIBLE_YEAR_MAX = 2100;
/** Sous ce compte, un document est un rebut (`bidon`, `test/map`) ou une vérification technique (Google) — jamais du contenu. */
const MIN_PASSAGE_COUNT = 2;

/** Toute suite de 4 chiffres dans l'id qui ressemble à une année — un id comme `googlea0ccc7e24963cc5e` en contient (`2496`), hors de toute plage plausible : filtrée, jamais confondue avec une vraie année de chemin. */
function pathYears(documentId: string): readonly number[] {
  return [...documentId.matchAll(FOUR_DIGIT_YEAR)]
    .map((m) => Number(m[0]))
    .filter((year) => year >= PLAUSIBLE_YEAR_MIN && year <= PLAUSIBLE_YEAR_MAX);
}

/**
 * Le périmètre du site (`config.periodFrom`…`periodTo`, v1.5 Task 11) : un
 * document dont le CHEMIN **ou** la PROPOSITION (Task 10) tombe dans la
 * période, avec au moins deux passages. Les deux sont des indices
 * INDÉPENDANTS — `web/2005/images/2005_4` est classé sous `2005/` mais ses
 * photos datent de 2003 : il reste dans le périmètre, mesuré, pas deviné.
 * Le seuil de deux passages écarte `bidon`, `test/map` et la vérification
 * Google SANS nommer aucun fichier en dur — un filtre par liste de noms se
 * périmerait au premier réimport.
 */
export function isInWebPerimeter(
  candidate: WebPerimeterCandidate, periodFromYear: number, periodToYear: number,
): boolean {
  if (candidate.passageCount < MIN_PASSAGE_COUNT) return false;

  const inPeriod = (year: number): boolean => year >= periodFromYear && year <= periodToYear;

  if (pathYears(candidate.documentId).some(inPeriod)) return true;
  if (candidate.proposalDate === null) return false;
  return inPeriod(Number(candidate.proposalDate.slice(0, 4)));
}
