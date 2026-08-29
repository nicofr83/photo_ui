/**
 * Garde-fou de la suite d'intégration.
 *
 * Elle applique des migrations et écrit dans les trois schémas. La pointer sur
 * `photo_ui` détruirait un import de plusieurs minutes et, pire, le travail
 * humain de `app` — que rien d'autre ne protège puisqu'il n'y a délibérément
 * aucune clé étrangère entrante.
 */
const url = process.env.DATABASE_URL_TEST;

if (url === undefined || url.trim() === '') {
  throw new Error(
    "DATABASE_URL_TEST est requis pour la suite d'intégration " +
    '(ex. postgres://nico:Funiculi@localhost:5432/photo_ui_test)',
  );
}

if (!/\/photo_ui_test(\?|$)/.test(url)) {
  throw new Error(
    `DATABASE_URL_TEST doit viser la base photo_ui_test, reçu ${url} — ` +
    'refus de lancer la suite contre la base de travail',
  );
}
