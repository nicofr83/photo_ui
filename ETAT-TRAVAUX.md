# État des travaux — point de reprise

**Établi le 2026-08-28 à 18:57**, demande de Nicolas, pour que épuisement crédits n'entraîne aucune perte.

Pas une spécification. Document qu'on lit **froid** pour reprendre. Écrit par `contrat-api` faisant fonction de coordinateur.

---

## Ce qu'il faut savoir d'abord

**Aucun agent détecte épuisement crédits, ni se réveille quand ils reviennent.** Aucun outil rapporte le quota. Crédits tombent → appel échoue au milieu du tour, agent s'arrête net. Pas de fin de tour propre, donc pas de « mise en attente » exécutable au dernier moment.

**Conséquence, et c'est tout le protocole :** mise en attente ne peut pas être comportement d'exécution, seulement **état durable écrit d'avance**. Travail seulement dans contexte d'agent = perdu si tour meurt. Travail commité = pas perdu.

Reprise = action de Nicolas — relancer session. Ce qu'on contrôle : qu'elle soit sans perte et sans re-décision.

---

## Où en est chaque chantier

| Chantier | Agent | État | Durabilité |
|:---|:---|:---|:---|
| Contrat d'API | `contrat-api` | **GELÉ** sur forme des types | **commité** — `docs/api-contract.md` |
| Spécification backend | `contrat-api` | **terminée** | **commité** — `docs/backend-spec.md` |
| Spécification frontend | `spec-frontend` | vivante, amendée en continu | **commité** — `docs/frontend-spec.md` |
| Plan frontend | `impl-frontend` | établi | **commité** — `docs/superpowers/plans/2026-08-28-frontend.md` |
| Implémentation frontend T1 | `impl-frontend` | tâches 1.0 à 1.6 **faites** — socle, domaine, rendu, client, fixtures, MSW | **tout commité** (`d193a1a`) — 232 tests verts, rien en vol |
| Échantillon de légendes | *(agent non nommé)* | en cours | `docs/echantillon-legendes.html` est commité |
| Plan d'implémentation backend | `impl-backend` | **terminé** — 26 tâches, plan de tests, 11 décisions d'architecture | **commité** (`e349da7`) — `docs/superpowers/plans/2026-08-28-backend.md` |
| Implémentation backend | `impl-backend` | **en cours** — tranche 0, tâche 1 | *(voir plan pour état tâche par tâche)* |

Dernier commit : `c107907 feat: the resolved-date domain and the capital rule`, 2026-08-28 18:56, branche `test_dev`.

**Rien à risque côté frontend.** Fichiers `src/ui/` listés ici comme non suivis sont commités depuis `08e71e5` — instantané précédent datait de `c107907`. `impl-frontend` a zéro travail hors git.

**Décisions frontend qui vivent nulle part ailleurs**, écrites ici pour survivre à coupure :

1. **TypeScript 6.0.3, pas 7.0.2** — aucune version typescript-eslint supporte TS 7 (`latest` et `canary` plafonnent à `typescript <6.1.0`). Garder `strictTypeChecked` compte plus que compilateur le plus neuf : lui qui fait respecter règle « pas de `any` ». Pas « moderniser » ce choix sans vérifier d'abord peer range du linter.
2. **« Aucune date nue » tenu à trois couches, faut les trois.**
   *(a)* Type marqué `IsoDate` se propage à travers Zod — `.refine()` avec prédicat de type narrowe sortie du schéma — donc **compilateur** refuse qu'une chaîne littérale serve de date nulle part dans contrat.
   *(b)* `ResolvedDateSchema` refuse **à l'analyse de réponse HTTP** date dont `kind` contredit sa `source` : devient jamais objet JavaScript, donc aucun composant peut en recevoir une.
   *(c)* `ResolvedDateView` = seul composant autorisé à transformer date en texte, et `src/ui/date/noBareDateRendering.test.ts` fait échouer suite si fichier de `src/ui/` ou `src/screens/` formate date lui-même.
   Successeur casserait (a) sans le savoir en remplaçant `.refine(guard)` par `.regex()` : même contrôle, mais perd type marqué.

2 bis. **Quatre formes d'affichage de date, pas trois** (spec §3.6) :
   `1999-10-14`, `octobre 1999`, `2000`, et **« entre février 1998 et juin 1999 »** quand intervalle plus large que sa précision. `precision` qualifie **chaque borne**, jamais largeur — largeur se calcule.
3. **`web_span` est une `inference`** — divergence close le 2026-08-28 dans sens de spec, trois documents disent maintenant même chose.
   Critère retenu, vaut pour toute source future : ce qui sépare `decision` d'`inference` n'est pas *qui* a agi mais **ce que geste établit**. Annotation de datation **arbitre** — quelqu'un a vu EXIF affiché et tapé autre chose. Plage de `ref.web_span` **comble vide** : aucun des 569 passages du site porte date. `source` dit qu'humain a saisi, `kind` dit ce que ça vaut. **`annotation` = seule source `decision`.** Conséquence de rendu voulue : ~25 plages web saisies main s'affichent ambre italique `≈`, pas violet gras `✓`.
4. **Tags de lieu mentent — règle pour facette de T3, pas oublier.** 901 photos du périmètre portent tag IA nommant pays faux : `italy` frappe 18 photos de Tikal et 16 de Chichen Itza, `egypt` 30 du Maroc. Classifieur voit ruines de pierre, sort nom de pays. Trois règles (spec, commit `af2a65b`) : **jamais dans axe lieu** — lieu vient du nom d'album et du journal ; **hors du vocabulaire proposé** — offrir « italy (141) » dans liste triée par sélectivité fait croire qu'existe 141 photos d'Italie ; **mais cherchables**, et alors **marqués comme supposition de machine**. Pas proposer ≠ exclure : §7.3 porte sur résultats, pas sur ce qu'on met en avant.
   **Filtrage par confiance marche pas** — tags de lieu à 60 de moyenne, descriptifs à 69, les deux au-dessus du plancher de 48. Pas retenter.
   **Jamais coder liste de tags de lieu côté client** : prédicat vient du backend, table `ref.tag_kind`, corrigeable à la main.

5. **§7.1 s'étend à tout ce qu'une machine dit d'une image.** Après dates et textes, troisième extension : machine **lit** ce qui est écrit dans image — enseigne, date sur écran de navigation — et c'est lecture, vérifiable ; elle **déduit** à partir de l'apparence — lieu, époque, identité — et c'est conjecture, souvent fausse. Rien dans sa sortie les sépare : `ruins` = lecture d'apparence honnête, `italy` = déduction fausse. À l'interface de les séparer.

6. **`server/` à la racine, pas sous `src/`** — accord avec `impl-backend`. Raison mécanique : `tsconfig.json` et couverture du frontend portent sur `src/**`, code serveur là-dedans casserait son `typecheck` et son seuil de couverture à chaque écriture en cours.

---

## Le protocole de mise en attente

Tient en une règle : **jamais laisser décision vivre uniquement dans contexte d'agent.**

1. **Commiter ce qui compile ou se lit.** Sur `test_dev`, jamais sur `main`, jamais de push. Commit intermédiaire nommé `wip:` vaut mieux que contexte perdu.
2. **Écrire décisions, pas seulement code.** Décision prise et non écrite = à refaire — et sera refaite différemment.
3. **Ce qui est en négociation entre agents va dans document**, pas dans fil de messages : messages survivent pas.
4. **Mettre à jour ligne de ce tableau qui vous concerne** avant de vous arrêter, si temps. Sinon commit suffit.

---

## Reprendre — dans cet ordre

1. `git log --oneline -5` et `git status` sur `test_dev` : voir ce qui a été laissé en vol.
2. Lire ce fichier, puis document du chantier concerné.
3. **Pas rouvrir ce qui est gelé.** Contrat stable sur forme des types ; `impl-frontend` a écrit son client contre lui. Questions encore ouvertes listées en §11 du contrat, portent seulement sur comportement serveur.
4. Reprendre à première ligne non faite du plan concerné.

---

## Ce qui reste ouvert et qui bloquerait une reprise

Rien bloque. Questions ouvertes documentées à leur place, chacune porte défaut appliqué en attendant :

- **Contrat, §11** — 11 questions, toutes de comportement serveur. Aucune change interface. N° 1, 3, 4, 5, 6 et 7 tranchées.
- **Spec backend, §16** — 7 questions. N° 1 (PostgreSQL 17.6 ou 18) seule à trancher **avant première migration**, parce que revenir en arrière sur base peuplée coûte plus cher que contraire.
- **Légendage VLM** — décision de Nicolas : échantillon de 50 à 100 photos d'abord. Champs restent dans contrat, passe complète pas engagée, aucune UI en V1.
- **`GET /tasks/:slug/review` : tranché, il reste.** `impl-frontend` s'était trompé en annonçant tout dériver côté client. Chronologie = rendu, reste au frontend ; **comptes** du bandeau restent au serveur, parce que « N images qu'aucun texte ne recouvre » applique prédicat de recouvrement. Le calculer côté client créerait seconde implémentation du recouvrement, qui finirait par contredire `GET /photos?overlapsText…` — chiffre qui contredit reste de l'application est pire qu'un endpoint de plus.

---

## Ce qu'on ne fait pas

**Pas de tâche planifiée (`cron`) pour reprendre automatiquement.** Tâche déclenchée pendant crédits épuisés échoue ; tâche déclenchée quand ils reviennent ferait tourner du travail de spécification **sans personne pour le relire**, et ce travail-là se juge. Reprise reste geste de Nicolas.

---

## Les décisions de Nicolas, dans l'ordre où il les a prises

*Ajouté par session pilote. Ce fil existait que dans son contexte de conversation : aucun document le portait. Chaque ligne = décision tranchée par Nicolas lui-même, pas inférence d'agent.*

| Décision | Ce qu'il a choisi | Pourquoi ça compte |
|:---|:---|:---|
| Topologie | Backend sur son Mac pour dev, déplaçable en fin de projet | Impose : aucun chemin en dur, tout par variables d'environnement |
| Périmètre fonctionnel | Navigateur complet **et** revue de datation, d'un bloc — puis **pivot complet** vers atelier de composition de BD | Spec antérieure au pivot est morte ; seule règle des trois dates a survécu |
| Store | Postgres local plutôt que SQLite lecture seule | Pipeline reconstruit tout à zéro : correction écrite dans ses bases meurt à passe suivante |
| Retour vers `adobe_mcp` | Export explicite, à la main, jamais automatique, derrière drapeau désactivé | Il a vu deux écrivains sur `annotations.jsonl` à même minute |
| Stack | React + Vite + TypeScript strict | Web d'abord, iOS et macOS différés via Capacitor — différé coûte rien si web fait correctement |
| Périmètre de travail | Les **82 albums** (3 930 photos), pas `photos.year` (3 558) | Hiérarchie rangée à la main fait foi ; `photos.year` se trompe 745 fois |
| Plafond de fourchette | **Aucun** | Dates faillibles → plafond calculé dessus écarterait autant de vrai que de bruit |
| Galeries web ↔ photothèque | Investiguer avant de coder écran texte | Spike fait : exploitable, 108 liens sur 2003-2004 |
| Légendage VLM | **Échantillon d'abord**, 50-100 photos, avant d'engager les 3 930 | Ni spec ni contrat peuvent trancher par raisonnement si légendes valent quelque chose |
| Reprise automatique | **Refusée** — pas de tâche planifiée | Spécification qui tourne sans relecteur vaut rien |

### La règle des dates, telle qu'il l'a énoncée

Mécanisme central, vient de lui, mot pour mot :

> Quand il y a une date de capture dans l'EXIF qui ne diffère pas de plus de
> 6 mois avec la date dans le dernier niveau de hiérarchie, c'est cette date qui
> est bonne. Sinon prendre la date du dernier niveau de la hiérarchie, ou celle
> modifiée dans l'UI de la pipeline. Si besoin et si possible faire un
> rapprochement du lieu avec le contenu du journal de bord / « Ma vie », leurs
> dates sont exactes. Sinon on garde la date modifiée par l'UI du pipeline, ou
> année/mois du dernier niveau de la hiérarchie.

Et sa mise en garde, qui gouverne tout le reste : **« sur les photos récentes le datage est correct, mais sur les anciennes il a été fait à la main, et des fois comporte des erreurs. »** 40,2 % des dates du périmètre sont pas des mesures.

---

## Les agents, nommément

*Complète tableau plus haut, qui en désignait deux comme « non nommés ».*

| Agent | Mandat | Joignable par `SendMessage` |
|:---|:---|:---|
| `spec-frontend` | Spécification fonctionnelle, vivante | oui |
| `contrat-api` | Contrat d'API **et** spec backend — mandat terminé, **toujours joignable** | oui |
| `impl-frontend` | Plan **et** implémentation du frontend | oui |
| `impl-backend` | Plan puis implémentation du backend | oui |
| `spike-legendes` | Échantillon de légendes | oui |
| `inventaire-schemas`, `digest-specs`, `spike-dhash`, `skill-dossier-bd` | Mandats terminés, livrables commités | oui |

`ListAgents` pas dispo dans toutes les sessions : passer par session pilote pour relais.

---

## Deux choses acquises hors dépôt

- **Base `photo_ui` existe** : PostgreSQL **17.6** (client `psql` en 18.6), `localhost:5432`, conteneur Docker `timescaledb`, utilisateur `nico`, collation ICU `fr-FR`, extensions `postgis` 3.5.3, `pg_trgm`, `unaccent` installées. Vide de schéma applicatif.
- **Skill `bd_dossier` actif globalement** : symlink créé par Nicolas depuis `~/.claude/skills/bd_dossier` vers `photo_ui/skills/bd_dossier`. Le modifier = changement du dépôt.

**Clé API Anthropic de la machine sans crédit.** Spike des légendes s'en passe : agent Claude Code voit images qu'il ouvre. À savoir avant de planifier quoi que ce soit appelant l'API directement.

---

## La coupure du 2026-08-28, 19h00, et ce qu'elle a appris

Cinq agents morts en quelques secondes, en plein tour, sur `You've hit your monthly spend limit` — limite réinitialisée à 19h50. Aucun a pu finir sa phrase ni sauvegarder quoi que ce soit.

**Ce qui a survécu :** tout ce qui était commité, plus présent document.
**Ce qui a été perdu :** les cinq contextes, entièrement.

Reprise sans perte de travail — mais uniquement parce que état écrit **avant** coupure. Aucun mécanisme de mise en attente existe : aucun agent détecte épuisement, appel échoue au milieu du tour, sans fin propre.

**Règle qui en découle, pour tout agent de ce projet :** commiter tôt et souvent, `wip:` compris, jamais plus d'une étape de travail non commitée. Et écrire ses décisions dans fichiers et messages de commit, jamais seulement dans rapport à session pilote.

**Fausse alerte sur les noms.** Session pilote a cru agents perdus et en a relancé quatre sous noms suffixés `-2`. Originaux étaient en fait seulement suspendus et ont repris **avec tout leur contexte** à réinitialisation de 19h50. Pendant quelques minutes, deux agents par mandat ont donc écrit sur même branche. Doublons `-2` arrêtés ; aucun conflit résulté, mais c'était chance autant que rapidité.

**Noms d'origine sont les bons** — ceux du tableau ci-dessus. Pas recréer d'agent portant mandat déjà tenu sans avoir vérifié `ListAgents` d'abord : limite de dépense suspend les agents, elle les tue pas.

---

## Décisions closes par Nicolas — ne pas rouvrir

### `ref.web_span` est une **inférence**, pas une décision *(2026-08-29)*

Plage saisie main sur document du site web, qui porte aucune date, se rend en **ambre italique avec glyphe `≈`**.

**Tranché par Nicolas lui-même**, après trois allers-retours entre agents dans deux sens opposés. C'est son geste que la règle classe : il a lu les deux raisonnements et retenu celui-ci.

Raisonnement retenu : **ce qui distingue décision d'inférence n'est pas qui a agi mais ce que geste établit.** Corriger date d'une photo = *arbitrage* — quelqu'un a vu EXIF à l'écran et tapé autre chose. Poser plage sur document sans date *comble vide* : conjecture. Champ `source` dit déjà qu'humain l'a tapée ; `kind` dit ce qu'elle vaut.

`annotation` = donc **seule** source de nature `decision`.

État d'application — **tout conforme au 2026-08-29** :
- `src/domain/dateKind.ts` — conforme (commit `be819a2`)
- `docs/api-contract.md` — conforme (§2.1, §4.8, amendement A2)
- `docs/frontend-spec.md` §9.4 — corrigé par `contrat-api`, sur mandat du lead, `spec-frontend` étant tombé juste après l'avoir retourné en `decision`

Tout agent qui trouve désaccord sur ce point corrige le document, il rouvre pas la question.

---

## Amendements au contrat gelé

Contrat gelé sur forme des types depuis 2026-08-28. Gel protège de dérive, pas de correction d'erreur — mais **tout amendement daté dans `docs/api-contract.md` et annoncé aux deux agents d'implémentation avant d'être écrit.** Contrat gelé qui change en silence est pire que contrat jamais gelé.

Trois à ce jour, tous documentés en tête du contrat sous « Amendements depuis le gel » :

| # | Objet | Type modifié ? |
|:---|:---|:---|
| **A1** | `TextUnit.pageSpanSource` ajouté — `carried` doit se voir dans résultat où page pas chargée | oui, champ ajouté |
| **A2** | `web_span` : `decision` → `inference` *(décision de Nicolas)* | non, valeur émise seulement |
| **A3** | `TextUnit.date` est `null` quand texte n'affirme rien — 1 031 unités sur 2 871 | non, `date` était déjà nullable |

**A3 en une phrase**, parce que celui qui change le plus de données : passage placé par fenêtre de sa page porte plus de date héritée, fenêtre vit dans `overlap`, et **toute date de texte du système est désormais lecture** — garanti par trois contraintes PostgreSQL, pas par relecture.

## Une faute corrigée dans `backend-spec.md` *(2026-08-28)*

`CONSTRAINT photo_month_is_whole_month` testait **largeur** de l'intervalle alors que contrat définit `precision` comme propriété de **chaque borne**. Rejetait exemple phare de la spécification — `1998-02-Maison rose Algès`, dix-sept mois — et offrait aucune précision jouable pour les 421 photos concernées : `month` et `year` refusés par base, `day` faisant afficher jour inventé.

Trouvée et mesurée par `impl-backend`, corrigée en testant alignement des bornes. Cas `[2004-09-14, 2004-09-14]` en `precision: 'month'` reste rejeté : rien de ce qui était protégé est perdu.

---

## Protocole d'échange entre agents — obligatoire

Échanges entre agents ont consommé part majeure du budget de ce projet. Message coûte **deux fois** : émetteur l'écrit, récepteur recharge son contexte entier pour le lire. Ligne écrite ici coûte une fois, lue que par qui en a besoin.

### Règle 1 — n'envoie pas de message

Par défaut, **écris ici**. Message se justifie que si autre agent **bloqué maintenant** par ce que tu as à dire.

| Situation | Où |
|:---|:---|
| Avancement, décision d'archi, ce qui reste | **ici**, jamais message |
| Faute trouvée dans document | **ici** + corrige document |
| Question dont réponse débloque ton prochain commit | message |
| Décision qui appartient à Nicolas | message à session pilote |

### Règle 2 — format fixe, pas de prose

```
RE: <sujet en 3 mots>
ASK|TELL|BLOCK|DONE: <une ligne>
DETAIL: <3 lignes maximum, seulement si indispensable>
```

Pas de salutation, pas de reformulation du contexte que l'autre a déjà, pas de justification sauf si elle change la réponse. Référence fichiers par `chemin:ligne` — **jamais recopier leur contenu**, destinataire peut les ouvrir.

Exemple réel de ce qui suffit :

```
RE: api légendes galerie
ASK: forme de GET /gallery-captions ?
DETAIL: besoin pour T2.4. Attendu: {caption, page, distance, margin, verified}[]
```

### Règle 3 — la session pilote se tait aussi

Elle relaie plus. Écrit qu'une décision de Nicolas ou un arrêt. Ses messages suivent même format.

---

## Avancement — impl-frontend, T2 (2026-08-29)

RE: écran texte, T2 terminée
DONE: 4 sources (légendes de galerie en sous-section web, contrat §11 Q11 (a) proposé à `back`, non figé), PageViewer zoom/pan sans surbrillance, correction de transcription (PUT/POST corrections), recouvrement dans les deux sens (GET /photos/:id/texts + overlapsTextKind), manifeste réordonnable (ReviewScreen), notes libres avec brouillon localStorage (NotesPanel). 481 tests verts, tsc/lint propres, couverture domain 100%.
DETAIL: commits `876b494`..`63080f4` sur `test_dev`. Bug fixture corrigé au passage (INVARIANT_PAGES.window gardait kind: reading après PAGE_WINDOW — capital rule le rejetait, jamais testé avant usePages). tsconfig/eslint excluent désormais `types-extrait.ts` (cassait `tsc --noEmit` depuis `f29032c`, sans rapport avec T2).
ASK: aucun — je continue sur T3.

Non fait, volontairement : « sélection de passages » (roadmap §5, pas dans le mandat T2 reçu) — ajouter un TextRef au manifeste d'une tâche (`POST /tasks/:slug/texts`). Pas de UI, pas de `TaskDetail.texts`. À trancher si T5 en a besoin plus tôt que prévu.

---

## Avancement — impl-frontend, T3 (2026-08-29)

RE: chercher, T3 cœur terminé
DONE: `PhotoFacetsSchema`/`usePhotoFacets` (appel séparé de `/photos`, mêmes paramètres). FilterState + FilterPanel : tags par sélectivité (42 > 500 photos non mis en avant, jamais masqués), personnes, lieu avec repli sur album/groupe (`matchedOn` recalculé pour dire quel champ a répondu), lieu désactivé + raison quand `positionedCount === 0`, hasPosition/hasOcr/hasCaption, plein texte `q`. `reliableDatesOnly` — accepté depuis T1 mais jamais appliqué par le mock — corrigé au passage. 510 tests verts, tsc/lint propres.
DETAIL: commits `9dd910e`..`e0a8436`. Nouvelle fixture `fixtures/invariants/photoTags.ts` (tags/OCR par photo — absent de `PhotoListItem`, nécessaire pour facettes/recherche réalistes) ; porte le cas mesuré `italy` sur Tikal, exclu du vocabulaire proposé (`PLACE_TAG_NAMES` dans `mocks/handlers.ts`, jamais côté client) mais cherchable. Même bug de routage MSW que deux fois déjà (`/photos/facets` avalé par `/photos/:cloudAssetId` — réordonné).
ASK: aucun.

Non fait, volontairement : compte des écartés ventilé par axe (déjà tranché non, §11 Q4) — le global existant (`SelectionHeader`, T1) couvre les nouveaux axes sans travail supplémentaire. Pas de debounce sur la recherche plein texte. `tagMinConfidence` accepté par le contrat mais aucun contrôle UI (ETAT-TRAVAUX : « le filtrage par confiance ne marche pas — ne pas retenter »).

Reste ouvert pour T4/T5 : `ref.album_span` (25 albums), `ref.web_span`, chronologie de revue, bandeau à 5 compteurs, gestion complète des tâches (dupliquer/supprimer).

---

## Avancement — impl-frontend, T4 (2026-08-29)

RE: écrire, T4 terminé
DONE: écran « Réglages » (`/reglages`, contrat §4.8) — `PUT`/`DELETE /ref/album-span` (25 albums, avertissements accepted-non-refusés `outside_prefix_year`/`overlaps_album`, hints jamais pré-remplis, « Effacer » retourne au présumé dérivé du préfixe — jamais juste le flag inversé sur la plage saisie), `/ref/web-documents` + `PUT`/`DELETE /ref/web-span` (rendu `kind: inference` systématiquement, vérifié par la règle capitale au parse). La correction de transcription (l'autre volet de T4) était déjà livrée en T2. 532 tests verts, tsc/lint propres, couverture domaine 100%.
DETAIL: commits `563ac74`..`d0973c9`. `store.albums`/`store.documents` rejoignent le store mutable (même migration que `store.texts` pour les corrections). `client.ts` : `apiDeleteWithBody` (un DELETE qui porte un corps ET en reçoit un — différent du DELETE 204 des notes).
ASK: aucun.

Non fait, volontairement : `ref.country-aliases` (pas dans le mandat T4 reçu ni dans le contrat cité par team-lead).

Reste pour T5 : chronologie de revue (`GET /tasks/:slug/review`), bandeau de contrôle, dupliquer/supprimer une tâche, bannière volume démonté.

---

## Avancement — impl-backend (2026-08-29)

RE: correctifs + tâches 6-11 + légendes de galerie
DONE:
- **Les deux correctifs demandés** — lint `server/**` : 56 erreurs → 0, `npx eslint .` propre dépôt entier (convergé avec `front` sur `eslint.config.js`, même contenu indépendamment). `dating_proposal.date_source`/`.confidence` portés verbatim (`2bbf663`), rang 3 gaté sur `'logbook-bracket'` dans `cascade.ts` (`9706be6`).
- **Tâches 6-11 du plan (Tranche 1) — cascade et import, complets.** `album_span.ts`, `arbitration.ts`, `capture_date.ts`, `cascade.ts` (100 % couverture dating/**), `covers.ts` (100 % overlap/**), 4 lecteurs SQLite + `annotations.jsonl`, `import_service.ts` (une transaction, COPY streamé, cascade calculée en ligne). **Import réel lancé sur `photo_ui`** : 42 911 photos, 675 albums, 1 859 passages, 1 012 entrées, 728 annotations. Rang 3 confirmé sur données réelles : 521 propositions `manual`, 0 `logbook-bracket` — 0 photo au rang `logbook_bracket`, exactement ce que corrige le gate.
- **Légendes de galerie, bout en bout, données réelles écrites.** `docs/spike-dhash-galeries.md` : dHash « moyenne de surface » recalculé en TS (jamais dans `adobe_mcp` — `sips` + décodeur BMP maison, pas le pipeline Swift), extraction HTML `cp1252` du dump FrontPage (`WEB_GALLERY_ROOT`, nouvelle config), appariement `d≤6 marge≥4`. `npm run gallery:match` : **227 liens écrits dans `app.web_gallery_link`** (188 avec légende), 103 sur 2003-2004 seul — le spike en mesurait 108, écart attendu (pages en plus ratissées par le scan récursif). Cross-check exact sur l'exemple cité par le spike (`Long Bogue-021.JPG`, distance 0, légende mot pour mot).
- 4 vrais bugs trouvés seulement à l'échelle réelle, tous corrigés : `pipeline.album.span_from/to/presumed` étaient `NOT NULL` — 27 albums réels sur 675 sans préfixe exploitable (`all pics`, `test`…) le contredisaient ; `readPhotoAlbumLinks`/`readPhotoPersonLinks` — SQLite rend `0/1` pas un booléen, et `photo_people` porte une ligne par visage détecté (33 doublons réels sur 13 612) ; les 3 `UPDATE photo_count` corrélés (un `count(*)` par tag) ont expiré sur les ~971 000 lignes réelles de `photo_tag`, remplacés par un `GROUP BY` unique ; `app.web_gallery_link` unique sur `(sha256, image_path)` **sans** `page` — deux pages peuvent référencer le même chemin relatif, `dedupeByLinkKey` garde la meilleure distance.
- 349 tests (unit + integration), 100 % `metier/dating/**` et `metier/overlap/**`, `npx eslint .` et `tsc --noEmit` propres partout.

DETAIL: commits `38e5103`..`d3b0469` sur `test_dev`. Nouveau : `server/src/metier/gallery/` (dhash, cp1252, extraction HTML, appariement), `server/src/io/` (bmp_decode, sips, concurrency), config `WEB_GALLERY_ROOT` (lecture seule). `server/src/contract/job_interface.ts` créé avec `ImportReport` — un correctif dessus, voir ASK.

ASK — deux points pour `front`/`contrat-api`, aucun ne bloque, je continue sur le prédicat de tag de lieu puis les tâches 12+ :
1. **Contrat §11 Q11(a) — `TextKind.WEB_CAPTION`/`GalleryCaptionFields`, vu dans `src/shared/enums.ts` et `src/api/contract/text.ts`.** Le design (légende de galerie comme troisième `TextKind`, réutilisant `texts[]`/`OverlapInfo`) est cohérent avec `app.web_gallery_link` — je le prends comme validé côté forme des champs (`sha256`, `page`, `imagePath`, `distance`, `margin`, `verified` : exactement mes colonnes). Ce qui reste ouvert et que je n'ai pas encore tranché : la synthèse de `TextRef.id`/`documentId` pour un `web_gallery_link` (pas de ligne `pipeline.text_unit` ni `pipeline.document` — jamais écrit là, TRUNCATE à chaque import tuerait la relecture humaine `verified`). Je m'en occupe à l'endpoint `/texts` (tâches 20-21), pas avant — dites si `front` a besoin de la forme exacte plus tôt.
2. **`ImportReport.orphanedTextSelections` du contrat gelé n'a pas `textKind`**, seulement `{taskSlug, textId}` — contredit la propre règle du contrat juste au-dessus de `TextRef` (jamais un `TextId` seul). Corrigé dans ma transcription serveur (`job_interface.ts`) en sur-ensemble, pas un renommage. À corriger dans `docs/api-contract.md` quand `contrat-api` repasse dessus.

Non fait, à savoir : **aucun endpoint HTTP n'existe encore** — pas de serveur Fastify, pas de composition root (tâche 12 pas commencée). Tout ce qui précède est `import`/`metier`/`repository`, testé en intégration contre Postgres, mais rien n'écoute encore sur le réseau. Les légendes de galerie sont EN BASE, prêtes à servir dès que l'endpoint existe.

Reste, dans l'ordre où je compte l'attaquer : prédicat de tag de lieu (`ref.tag_kind`, périmètre demandé par `team-lead`), puis tâches 12 à 26 du plan (Tranche T1 à T5 — serveur, endpoints photos/textes/tâches/export/recherche/revue).

**Mise à jour la même session — prédicat de tag de lieu fait, données réelles écrites.** `ref.tag_kind` (migration `005_ref_tag_kind.sql` — table neuve, pas d'`ALTER` sur `003_ref.sql` : `photo_ui` porte déjà un import réel). `classifyTagName` — comparaison EXACTE (`turkey vulture` ne devient pas un lieu), 7 noms génuinement ambigus (pays ET mot courant : `turkey`/`china`/`jordan`/`nice`/`monaco`/`chad`/`georgia`) classés `unknown` plutôt que devinés. `npm run tags:classify` sur les 5 528 tags IA réels : **88 `place`, 5 `unknown`, 5 435 `descriptive`** — `italy` et `egypt`, les deux cas cités par `team-lead`, tombent bien en `place`. `ON CONFLICT DO NOTHING` : une correction humaine ne sera jamais écrasée par une reclassification. Commits `443992d`..`2e48716`. Même non-fait que les légendes de galerie : la donnée est en base, aucun endpoint ne la sert encore.

Je continue maintenant sur la tâche 12 du plan (serveur, composition root, `GET /system/status`) — le début des endpoints HTTP.

---

## Avancement — impl-frontend, T5 (2026-08-29) — les cinq tranches terminées

RE: la revue en entier, T5 terminé — T2 à T5 tous livrés cette session
DONE :
- **Chronologie** (`domain/chronology.layoutTimeline` + `ui/review/Chronology`) : images et textes sur un même axe, position/largeur calculées en `domain/` — jamais dans un fichier `ui`/`screens`, une entrée de chronologie n'a pas de `source` et ne peut donc jamais passer par `ResolvedDateView`. `src/ui/date/noBareDateRendering.test.ts` a mordu deux fois pendant l'écriture (une fois sur mon propre commentaire explicatif) — corrigé en reformulant, jamais en affaiblissant le garde-fou.
- **Bandeau de contrôle** (`ui/review/ControlBanner`) : les huit compteurs de `GET /tasks/:slug/review` (pas cinq — `TaskReview.warnings` en contrat en porte huit, vérifié dans `types-extrait.ts`), tous cliquables, un zéro s'affiche comme les autres. Quatre des huit se traduisent en surbrillance exacte côté client (`undatedImages`, `inferredDateImages`, `imagesOutOfPeriod`, `uncertainTexts`) ; les quatre autres (`imagesWithoutText`, `orphanedImages`, `orphanedTexts`, `textsWiderThan30Days`) resteraient faux avec les seules données de la réponse — explication textuelle seulement, jamais une surbrillance qui mentirait.
- **`GET /tasks/:slug/review`** : calculé côté mock, jamais par le client — évite une seconde implémentation du prédicat de recouvrement qui contredirait `GET /photos?overlapsText…`.
- **Sélection de texte dans une tâche** (`POST /tasks/:slug/texts`) — comblait le trou signalé en T2, nécessaire pour que la chronologie ait des textes à placer.
- **Gestion des tâches** : dupliquer (copie superficielle, brief/période conservés) et supprimer (deux clics explicites, ne touche jamais un dossier déjà exporté).
- **Bannière volume démonté** : `GET /system/status`, un seul bandeau global (jamais un par écran), spécifiquement sur la racine `originals` — vignettes/sélections déjà chargées restent utilisables, seul l'export est bloqué et le dit.
- 584 tests verts, tsc/lint propres, couverture domaine 100 %, globale ~93 %.

DETAIL : commits `b1af198`..`af942e5`. Même bug de routage MSW une troisième fois (`/tasks/:slug/review` avalé par `/tasks/:slug` — réordonné, même remède que `/photos/facets` et `/photos/:cloudAssetId/texts` en T2/T3). Deux fois où un `git commit` de `back` a absorbé mes fichiers stagés entre mon `git add` et mon `git commit` (index partagé, mêmes minutes) — rien perdu, recommité proprement, signalé à `back` par message la première fois.

ASK : aucun.

Non fait, volontairement : `ref.country-aliases` (jamais dans un mandat reçu). `POST /tasks/:slug/opened` (met à jour `lastOpenedAt`, rien ne l'appelle encore — la liste s'affiche déjà triée, l'écart est mineur). Debounce sur la recherche plein texte (T3). Sélection de passages : UI seulement dans `TextsScreen` — pas de découpage `startOffset`/`endOffset` (Q2 défaut (a), le passage entier).

**Les cinq tranches du plan frontend (T1 à T5) sont maintenant toutes livrées.** `npx tsc --noEmit`, `npx eslint .` (frontend) et `npx vitest run --coverage` propres à la racine `test_dev` au moment d'écrire ceci.

---

RE: protocole d'échange, appliqué
DONE: relu §"Protocole d'échange entre agents", format RE/ASK|TELL|BLOCK|DONE adopté à partir d'ici.
DETAIL: A4 (`ImportReport.orphanedTextSelections.textKind`) sans effet côté moi — `ImportReport` n'est consommé par aucun code frontend (`POST /jobs/import` hors V1 côté client, contrat §4.7). Sweep d'index partagé (2×, `back`) vérifié sans perte : `b1af198` contient bien mes 3 fichiers, `git log -- src/api/contract/review.ts` le confirme, 588 tests verts après.
ASK: aucun.
---

## Avancement — impl-backend, tâches 12-14 (2026-08-29)

RE: serveur en ligne — premiers endpoints réels
DONE:
- **Tâche 12 — composition root.** `bootstrap.ts` : config → log → pool, vérifie au démarrage `RENDER_CACHE_ROOT`/`TASKS_ROOT`/`PIPELINE_DB_ROOT`/`PAGES_ROOT` (refuse en nommant la variable), mais **pas** `ORIGINALS_ROOT`/`THUMBS_ROOT` — le volume externe se démonte en session, `GET /system/status` le signale au lieu de bloquer le démarrage. `server.ts` : `bodyLimit` 2 Mio explicite, 404/erreurs toujours l'enveloppe `ApiError`, jamais du HTML Fastify. `GET /system/status` réel : `counts.photosInHierarchy` = **3930**, exactement le périmètre de Nicolas.
- **Tâche 13 — `GET /photos`.** Tout l'allowlist du contrat câblé et VÉRIFIÉ EFFECTIF (`scope`, `dateFrom`/`dateTo` en chevauchement `&&` jamais inégalité, `reliableDatesOnly`, `albumPath`/`tag`/`tagMinConfidence`/`person`/`country`/`city` avec lecture généreuse, `hasPosition`/`hasOcr`/`hasCaption`, `q` plein texte, `overlapsTextKind`+`overlapsTextId` (les deux ensemble ou aucun), `inTask`/`notInTask`, `sort`, pagination). `matchedOn` calculé en SQL par la MÊME expression que le `WHERE`, jamais reconstruit après coup en JS (risque de dérive). Réel : `scope` par défaut → total **3930** ; `city=Belize` → 161 photos via `album_path`/`group_name` ; `tag=licorne` → `nearest` par trigramme (line, lichen, airborne).
- **Tâche 14 — `GET /photos/:id`, `GET /albums`.** `proposal` applique EXACTEMENT le gate du rang 3 (`date_source = 'logbook-bracket'`) à la couche d'affichage aussi — testé nommément. `doubt.label` via `ref.doubt_reason`, jamais cassé par une raison inédite. `GET /albums` filtré `in_perimeter` → 82 exactement ; `hints.fileNamePatterns` et `rejectedExifRange`/`Count` vérifiés réels (`Maison rose Algès` : 22 fichiers, motif `98-99` — le plan citait `19 sur 22`, mesuré cohérent).
- 3 vrais bugs trouvés à l'échelle réelle ou en test, tous corrigés : `tagMinConfidence` accepté dans l'allowlist mais jamais câblé dans la requête (silencieux — exactement ce que l'invariant 2 existe pour attraper) ; le fixture `insertPhoto` des tests posait `pipeline.photo.album_path` sans jamais insérer la ligne `pipeline.photo_album` correspondante, faisant passer trois premiers tests de portée pour la mauvaise raison (table de liens vide = tout "hors périmètre" par accident, jamais vérifié avant) ; un cast TS maladroit sur `ResolvedPosition.source` simplifié après coup.
- `classifyRenderFailure` (tâche 15, tiré en avance : `PhotoDetail.render` en avait besoin maintenant) — dénylist de formats sans pixels, jamais un allowlist.
- 370 tests, couverture globale >85 % branches partout, `npx eslint .` et `tsc --noEmit` propres. Serveur réel lancé (`npm start`) contre `photo_ui` peuplée : chaque endpoint vérifié à la main en HTTP, pas seulement en test.

DETAIL: commits `8a09a1a`..`9ed4c47`. Pas de nouveau contrat cassé cette fois.

ASK: aucun — je continue sur les tâches 15+ (images, tâches, export, recherche, revue). `front` a fini ses 5 tranches (T1-T5) : chaque endpoint réel que je pose remplace un mock MSW, dans l'ordre du plan backend.

---

## Avancement — impl-backend, tâche 15 (2026-08-29)

RE: tâche 15 — service d'images, terminée
DONE: `thumb_path.ts` (validation sha256 avant toute concaténation), `in_flight_renders.ts` (dédoublonnage par clé + sémaphore `renderConcurrency`), `image_service.ts` (`getThumb` : servi tel quel depuis `THUMBS_ROOT`, lecture seule ; `getRender` : cache-ou-rend, écriture atomique temp+`rename` via `SafeFs`, jamais `fs` en direct), `images_controller.ts` (`GET /images/:sha256/thumb`, `GET /images/:sha256/render?edge=1400`), câblé dans `bootstrap.ts` (un seul `InFlightRenders` par process). Invariant 8 : `src/invariants/never_writes_outside.itest.ts` — empreinte sha256 de `ORIGINALS_ROOT` avant/après un vrai rendu `sips`, identique dans les trois échecs comme dans le succès. 30 tests neufs, tous contre du réel (vrai `sips`, vraies vignettes de `THUMBS_ROOT`), tsc/eslint propres, 402 tests serveur au total.
DETAIL: commits `cb685ab`..`410b13f`. Écart trouvé en cours de route : le plan proposait un seul classifieur à 3 échecs partagé thumb+render, mais `docs/api-contract.md:1849-1852` (§6.1) n'en liste que 2 pour `/thumb` — `SOURCE_FILE_MISSING`/`VOLUME_UNAVAILABLE`, jamais `NOT_RENDERABLE` : une vignette pré-générée est déjà un JPEG plat, le format de la photo source n'entre pas en jeu. `getThumb()` n'a donc pas de paramètre `format`. `ETag` diffère aussi : `"<sha256>"` pour `/thumb`, `"<sha256>-1400"` pour `/render` (§6.2).

ASK pour `front`, réponse à Q11 (légendes de galerie) — ne bloque pas, je continue sur la tâche 16 :
1. `app.web_gallery_link` (`server/db/migrations/004_app.sql:125`) confirme ta forme exactement : `sha256`/`page`/`imagePath`/`caption`/`alt`/`distance`/`margin`/`verified`.
2. Correction : `verified` est booléen **nullable**, pas `false` par défaut — `NULL` = jamais relu, `true`/`false` = décision humaine explicite. Le badge « non vérifié » doit tester `verified === null`, pas `!verified`, sinon un rejet humain explicite (`false`) s'affiche à tort comme « pas encore vérifié ».
3. Le document web réutilisé (`web/2003/2003_gal_1`) n'existe pas en base : `pipeline.document.kind` n'autorise que `'handwritten'|'html'` (`002_pipeline.sql:254`), aucune ligne document/text_unit n'a jamais été créée pour une page de galerie, et le `TRUNCATE` à chaque import interdirait d'y stocker `verified` de toute façon. La synthèse `TextRef.id`/`documentId` pour `web_caption` reste à faire à l'endpoint `/texts` (tâches 20-21) — fige la forme des champs si besoin, pas encore l'`id`/`documentId` exact.
4. `OverlapRule.GALLERY_MATCH` réutilisant `overlappingPhotoCount`/les endpoints existants : aucune objection, cohérent avec l'infra en place.

Reste, dans l'ordre : tâches 16-26 (tâches CRUD, sélection par lot, export, jobs, documents/pages/textes, recouvrement, notes, recherche, corrections, référentiels restants, revue).

---

## Avancement — impl-backend, tâche 16 (2026-08-29)

RE: tâche 16 — CRUD des tâches, terminée
DONE: `deriveSlug` (translittération NFD, pas un simple drop d'accent) et `contentHash` (`server/src/metier/tasks/`), `task_repository.ts` (`listTasks`/`createTask`/`getTaskDetail`/`patchTask` — `orphaned` et `outOfPeriod` calculés en SQL, overlap `daterange &&`, jamais une inégalité), `tasks_controller.ts` : `GET`/`POST /tasks`, `GET`/`PATCH /tasks/:slug`. Corps de requête validé explicitement (même discipline que l'allowlist des query params) — forme invalide → 400 `INVALID_PARAMETER` nommé, jamais un cast aveugle sur `unknown` ni une contrainte Postgres brute qui fuite. 20 tests neufs, vérifié à la main en HTTP réel contre `photo_ui` (create/list/get/patch/slug dupliqué/slug malformé/période inversée/404), tâche de test nettoyée ensuite.
DETAIL: commits `9e73348`..`8ed66db`. Bug réel trouvé et corrigé au passage, pas spécifique aux tâches : `Promise.all` sur un même `PoolClient` connecté ne pipeline pas dans `pg` — sérialisé en interne avec avertissement de dépréciation (retiré en pg 9). Présent aussi dans `GET /photos` (`photos_controller.ts`) depuis la tâche 13, corrigé au même commit. 432 tests serveur, tsc/eslint propres.

ASK: aucun — je continue sur la tâche 17 (sélection par lot d'images).

---

## Avancement — impl-backend, tâche 17 (2026-08-29)

RE: tâche 17 — sélection par lot, terminée
DONE: `POST /tasks/:slug/images` (`mutateTaskImages` dans `task_repository.ts`) — `add`/`remove`/`update` en UNE transaction (`withTransaction`), existence et `outOfPeriod` batchés en une requête `= ANY($ids)` par catégorie, jamais un aller-retour par photo. `selectedBecause` additif (fusion, jamais écrasé). Une note sur une photo non sélectionnée la sélectionne IMPLICITEMENT (`implicitlyAdded`), jamais en silence. Rien n'échoue muet : photo inconnue ou geste sans cible → `rejected` nommé (`unknown_photo`/`not_selected`) ; période ou orphelinage → `warnings` (accepté, pas rejeté). 20 tests neufs (9 repository + 2 HTTP), vérifié à la main en HTTP réel contre `photo_ui` (ajout mixte réel/inconnu, retrait, ajout implicite par note), nettoyé ensuite. 443 tests serveur, tsc/eslint propres.
DETAIL: commits `d4c024d`..`9b9b19b`. Validation de corps toujours superficielle (forme des tableaux, pas chaque champ de chaque élément) — même niveau que `POST`/`PATCH /tasks`, pas de bibliothèque de schéma dans ce dépôt.

ASK: aucun — je continue sur la tâche 18 (export).

---

## Avancement — impl-backend, tâche 18 (2026-08-29)

RE: tâche 18 — export, terminée (sauf l'endpoint HTTP, qui attend la tâche 19)
DONE: `canonical.ts` (snake_case mécanique + tri des seuls tableaux de primitives — `images`/`texts`/`notes` restent des séquences, jamais triées), `manifest.ts` (`buildManifest`, forme annexe C), `export_repository.ts` (lectures batchées), `export_service.ts` (`exportTask` — dossier temporaire → rendus/pages/textes/README/manifest → `rename` en dernier geste, 409 `TARGET_DIRECTORY_EXISTS` sans `overwrite`). Réutilise `image_service.getRender` pour les images (même cache 1400px que `/images/:sha256/render`) — dédoublonnage et écriture atomique hérités gratuitement. Invariant 7 vérifié avec un vrai rendu `sips` partagé entre deux exports. 20 tests neufs (dont 7 en intégration réelle DB+FS+sips), 474 tests serveur au total, tsc/eslint propres.
DETAIL: commits `0818c66`..`015ecc6`. Deux écarts trouvés et corrigés avant qu'ils partent : (1) l'exemple JSON de l'annexe C donne `texts[].date` à 4 clés, mais §7.4 point 1 du contrat (la prose) exige explicitement les mêmes 6 clés que `images[].date` — suivi la prose ; (2) `overlap.span_source` vient de `page_span_source` (dénormalisé sur `text_unit`), pas de `covers_rule` (qui alimente `overlap.rule`) — deux colonnes différentes, conflaté dans mon premier jet. `overlap` est nullable (une fenêtre peut n'exister nulle part — ni date propre, ni fenêtre de page — les colonnes le permettent). Les textes/pages sont testés en réel en insérant directement dans `app.task_text` (aucun endpoint de sélection de texte n'existe encore, tâches 20-22) — même technique déjà utilisée pour `web_gallery_link`/`ref.tag_kind`.

Non fait, volontairement : `POST /tasks/:slug/export` (l'endpoint HTTP). Le contrat dit `202` + un `Job` — `exportTask()` est prêt à être appelé par le système de jobs, tâche 19, prochaine.

ASK: aucun — je continue sur la tâche 19 (opérations longues), qui expose `exportTask` en HTTP.

---

## Avancement — impl-backend, tâche 19 (2026-08-29)

RE: tâche 19 — opérations longues, terminée. Tranche T1 (serveur) complète.
DONE: `JobStore` en mémoire (jamais en base — un seul processus Mac, contrat §4.7), un seul job mutant à la fois TOUS TYPES CONFONDUS (import/export/pré-rendu se bloquent mutuellement), `cancellable` intrinsèque au type (seul le pré-rendu a un point d'arrêt sûr entre deux rendus ; annuler un import ou un export laisserait un état incertain). `runPrerender` : un rendu par `sha256` distinct (949 groupes partagés), parallèle via le pool existant. Câblé : `GET/POST /jobs*`, `POST /jobs/import`, `POST /jobs/prerender`, et **`POST /tasks/:slug/export`** (tâche 18 enfin exposée en HTTP). `images_controller` refactoré pour recevoir un `ImageServiceDeps` déjà construit plutôt qu'un `renderConcurrency` — il fabriquait son propre `InFlightRenders`, un second sémaphore non coordonné avec celui de l'export/pré-rendu. Une seule instance, construite une fois dans `bootstrap.ts`, partagée partout. 21 tests neufs, vérifié à la main en HTTP réel (export via job, poll, `GET /jobs`), nettoyé ensuite. 494 tests serveur, tsc/eslint propres.
DETAIL: commits `13e5859`..`e9ab5bf`. Vrai bug trouvé en testant à la main AVANT de commiter : `job.result` doit respecter l'union `JobResult` du contrat (`{type, report}`), jamais le rapport nu — l'export et l'import renvoyaient tous deux le rapport sans l'enveloppe, ce qui aurait cassé tout client discriminant sur `result.type`. Corrigé aux deux endroits (le pré-rendu était déjà correct, construit dans cette forme dès le départ).

Non fait, volontairement : `POST /jobs/caption` (aucune passe de légendage n'existe — « la passe ne l'est pas », contrat §4.9, aucun écran en V1) et `POST /jobs/dating-export` (écrit dans `adobe_mcp` derrière un drapeau désactivé par défaut — hors périmètre, consigne explicite de ne jamais y écrire).

**La Tranche T1 (serveur) est maintenant complète : tâches 12 à 19, tous les endpoints de base + images + tâches + export + jobs tournent en réel.**

ASK: aucun — je continue sur la Tranche T2 (le texte), tâche 20 : documents, pages, textes.

---

## Avancement — impl-backend, tâche 20 (2026-08-29)

RE: tâche 20 — documents, pages, textes, terminée
DONE: `GET /documents`, `GET /pages?documentId=`, `GET /pages/image?pageId=`, `GET /texts` (allowlist complet : `documentId`/`pageId`/`kind`/`dateFrom`/`dateTo`/`overlapsPhoto`/`confidence`/`hasCorrection`/`limit`/`offset`/`sort`). `metier/overlap/overlap_sql.ts` : LE prédicat de recouvrement (`&&`, jamais une inégalité), une seule fonction pure, réutilisée pour `overlappingPhotoCount` (sous-requête corrélée par texte) et le filtre `overlapsPhoto` — prête à resservir tâche 21. `TextDocument.span` vient de `ref.web_span`, toujours `kind: 'inference'` (comble un vide, n'arbitre pas — même règle que le rang 0 photo). `TextPage.window` toujours `inference` aussi, `carried` compris. 20 tests neufs, vérifié contre le corpus réel : **62 documents, 155 pages, 2871 textes — exactement les comptes cités par le contrat**, une vraie image de page servie (830×1282, conforme à sa ligne), le listing complet non filtré en 82 ms (l'index GiST justifie la sous-requête corrélée). 514 tests serveur, tsc/eslint propres.
DETAIL: commit `acc1ba2`. Écart avec mon hypothèse initiale, sans conséquence : je pensais `logbook` ne portait que des entrées de journal — en réalité il porte aussi 492 passages (réflexions manuscrites séparées des lignes réglées). Le code ne supposait rien de tel, donc rien à corriger.

ASK: aucun — je continue sur la tâche 21 (le recouvrement dans les deux sens, `OverlapInfo` complet et `GET /photos/:cloudAssetId/texts`).

---

## Avancement — impl-backend, tâche 21 (2026-08-29)

RE: tâche 21 — le recouvrement dans les deux sens, terminée
DONE: `computeOverlapInfo` (pur, `metier/overlap/overlap_info.ts`, couverture 100%) — `photoSpanDays`/`textSpanDays`/`totalSpanDays`/`distanceToCentreDays`, aucun plafond de largeur. `GET /photos/:cloudAssetId/texts` : même prédicat que la tâche 20 (`overlap_sql.ts`), tri par défaut = somme des largeurs croissante, photo inconnue → 404, photo sans date résolue → résultat VIDE (jamais une erreur — rien à comparer n'est pas une faute). 15 tests neufs, vérifié contre données réelles (une vraie photo d'août 2000 contre un vrai passage du journal : 30 + 0 = 30 jours, distance 5, exact).
DETAIL: commit `406ca35`. **Vrai bug trouvé en écrivant le test de la tâche 21 elle-même** (« rule C apparaît seulement une fois `ref.web_span` est saisi ») : `covers_start`/`covers_end`/`covers_rule` de `pipeline.text_unit` sont figés à l'IMPORT — un passage web sans plage saisie à ce moment-là restait NULL pour toujours, même après une saisie ultérieure dans `ref.web_span` (référentiel humain, jamais touché par l'import, éditable à tout moment). Corrigé dans `overlap_sql.ts` (déjà committé séparément, `f8c6853`) : une fenêtre EFFECTIVE calculée en base par `COALESCE` avec une jointure live sur `ref.web_span`, partout où le recouvrement se calcule — les deux sens en profitent.

**Décision documentée, non retouchée** : `GET /photos?sort=overlap` dégénère au tri par date même quand `overlapsTextKind`/`overlapsTextId` sont actifs (commentaire déjà posé tâche 13 : « pas de recouvrement matérialisé »). Je ne l'ai pas changé — aucun test de la tâche 21 ne porte sur ce sens, et le retravailler demanderait de recalculer un `OverlapInfo` par ligne dans `listPhotos`. Signalé ici au cas où Nicolas le veuille plus tard.

ASK: aucun — je continue sur la tâche 22 (notes et sélection de textes, `POST /tasks/:slug/texts` et `POST /tasks/:slug/notes`).

---

## Avancement — impl-backend, tâche 22 (2026-08-29) — Tranche T2 complète

RE: tâche 22 — notes et sélection de textes, terminée. Tranche T2 (le texte) complète.
DONE: `POST /tasks/:slug/texts` (`add`/`remove`/`reorder` par `TextRef`, jamais un id seul — clé composite `(kind, id)` partout), `POST /tasks/:slug/notes`, `PATCH`/`DELETE /tasks/:slug/notes/:noteId`. Une note sans rattachement est une note GÉNÉRALE (`attachedTo.images`/`.texts` toujours des tableaux vides, jamais `null`). Supprimer une note ne touche jamais les images/textes rattachés (`ON DELETE CASCADE` sur les lignes de rattachement seulement). Ajout idempotent d'un texte déjà sélectionné (`ON CONFLICT DO NOTHING`, pas de doublon ni de plantage sur la clé composite). 31 tests neufs, vérifié en HTTP réel contre `photo_ui` (`logbook/p003/001` ajouté à une tâche, note réelle avec un vrai ULID rattachée, détail complet relu), nettoyé ensuite. 548 tests serveur, tsc/eslint propres.
DETAIL: commits `75f315b`..`95eee0a`. `note_<ulid>` utilise le paquet `ulid` déjà présent (même que `import_id`), pas un UUID déguisé.

**Tranche T2 (le texte) est maintenant complète : tâches 20 à 22.**

ASK: aucun — je continue sur la Tranche T3 (chercher), tâche 23 : `q`, les offsets et les facettes.

---

## Avancement — impl-backend, tâche 23 (2026-08-29/30) — Tranche T3 complète

RE: tâche 23 — `q`, offsets, facettes, terminée. Tranche T3 (chercher) complète.
DONE : `highlight.ts` (pur, offsets UTF-16 — comparaison PAR POINT DE CODE, jamais un index de chaîne brut, sans quoi un emoji hors PMB décale tout ce qui suit). `q`/`sort=relevance`/`highlights` câblés sur `GET /texts`, réutilisant `app.text_search` (vue déjà matérialisée par une session antérieure) et le même `cleanSearchQuery`/`plainto_tsquery` que `GET /photos?q=` — même règle « du bruit pur rend zéro, jamais toute la bibliothèque ». `GET /photos/facets` : `buildPhotoFilter` extrait de `listPhotos` (refactor à froid, 109 tests existants inchangés) et réutilisé tel quel, pour que « accepte EXACTEMENT les mêmes paramètres » soit structurel. Tags triés par compte croissant (sélectivité décroissante), `tooBroad` au-delà de 500 ; les autres axes par compte décroissant ; `countries`/`cities`/`years` excluent `NULL`, jamais un panier « inconnu ». 44 tests neufs, vérifié contre le corpus réel (90 albums, 2729 tags dont 44 `tooBroad` — proche des 42 cités par le plan, écart probablement dû au périmètre ou à l'état du corpus au moment de cette mesure-là ; `q=belize` → 5 vrais passages avec surlignage correct sur « Bélize » accentué). 568 tests serveur, tsc/eslint propres.
DETAIL : commits `7fe52cf`..`32a68ba`. **Vrai bug trouvé en testant `q` contre le corpus réel** : `app.text_search` est une vue MATÉRIALISÉE, peuplée `WITH DATA` À LA MIGRATION — donc AVANT que le premier import ne remplisse `pipeline.text_unit`. Rien ne l'a jamais rafraîchie depuis : 0 ligne contre 2871 textes réels. Corrigé dans `import_service.ts` (`REFRESH MATERIALIZED VIEW` simple, jamais `CONCURRENTLY` — impossible dans une transaction explicite, exactement le repli que le plan anticipait lui-même pour la tâche 24) ; base réelle rafraîchie une fois à la main pour corriger l'état actuel, les imports suivants la maintiennent seuls.

**Tranche T3 (chercher) est maintenant complète : tâche 23.**

ASK: aucun — je continue sur la Tranche T4 (écrire), tâche 24 : les corrections de transcription.

---

## Avancement — impl-backend, tâche 24 (2026-08-30) — Tranche T4 complète

RE: tâche 24 — corrections de transcription, terminée. Tranche T4 (écrire) complète.
DONE : `PUT /corrections`, `POST /corrections/revert`, `GET /corrections?status=`. `original_at_correction` est le TÉMOIN — l'amont TEL QU'IL ÉTAIT à l'instant de corriger, jamais la correction précédente sur une re-correction (vérifié explicitement). `status` calculé par comparaison au corps AMONT actuel : `applied`/`needs_review`/`orphaned` — `orphaned` exige un `LEFT JOIN` DEPUIS `app.text_correction`, jamais depuis `listTexts` qui ne peut pas voir une cible disparue. Correction vide ou blanche → 422 `EMPTY_CORRECTION` avant la base. `app.text_search` rafraîchie à chaque écriture (`REFRESH` simple, même repli que la tâche 23). INVARIANT 4 vérifié : corriger un passage ne touche jamais l'entrée de journal du même id. 24 tests neufs, cycle complet vérifié en réel (`PUT` sur `logbook/p003/001`, recherche `écluse` → 5 résultats immédiatement, `GET /corrections` la liste `applied`, `revert` restaure l'amont exact, `app.text_correction` revient à 0 ligne). 583 tests serveur, tsc/eslint propres.
DETAIL : commits `d3c6eb6`..`23dbea8`. `TEXT_UNIT_SELECT` extrait de `listTexts` pour un lookup unitaire (`getTextUnit`) partagé — jamais une seconde forme de `TextUnit` qui pourrait diverger.

**Tranche T4 (écrire) est maintenant complète : tâche 24.**

ASK: aucun — je continue sur la tâche 25 (référentiels et recalcul partiel — `PUT`/`DELETE /ref/album-span`, `/ref/web-span`).

---

## Avancement — impl-backend, tâche 25 (2026-08-30)

RE: tâche 25 — référentiels et recalcul partiel, terminée
DONE : `PUT`/`DELETE /ref/album-span`, `GET /ref/web-documents`, `PUT`/`DELETE /ref/web-span`. `recompute_album.ts` : seul recalcul PARTIEL de la cascade autorisé (une saisie d'album), synchrone, réutilise `resolveCascade` sans le réimplémenter — le plus gros album fait 286 photos. `outside_prefix_year` : `daterange(annéePréfixe,'[]') @> daterange(saisie,'[]')` — CONTAINMENT, jamais une inégalité ni un `&&` (l'intervalle saisi peut largement déborder l'année du préfixe, c'est précisément le cas d'usage). `overlaps_album` : `&&`, contre les autres albums du périmètre, jamais contre lui-même. Les deux avertissements voyagent dans un `200`, jamais un refus — seule `dateTo < dateFrom` refuse (400 `INVALID_PARAMETER`, avant la base, même comparaison de chaînes que `TaskPeriod`). Album/document inconnu ou hors périmètre → 404 `NOT_FOUND`. `DELETE` repasse en `presumed`, dérivé du préfixe, et recalcule à nouveau. `ref.web_span` ne sert que la règle C (`kind: 'inference'`, jamais `decision` — comble un vide, n'arbitre rien) ; documents non-`html` refusés en 404. 18 tests neufs (6 `album_span.itest.ts`, 12 `ref_controller.itest.ts`), vérifiés contre Postgres réel. 611 tests serveur, tsc/eslint propres.
DETAIL : commits `4e9a458`, `25a72cd`. Écarté délibérément, hors mandat T4 reçu de front : `GET /ref/countries`, `PUT /ref/country-aliases`.

ASK: aucun — je continue sur la tâche 26 (revue, duplication, suppression d'une tâche).

---

## Avancement — impl-backend, tâche 26 (2026-08-30) — plan complet

RE : tâche 26 — revue, duplication, suppression, terminée. `docs/superpowers/plans/2026-08-28-backend.md` est complet : les 26 tâches, tranches T1 à T5.
DONE : `GET /tasks/:slug/review`, `POST /tasks/:slug/duplicate`, `DELETE /tasks/:slug`. Les huit compteurs du bandeau se calculent au serveur — même raison que la suppression du doublon de recouvrement tâche 21 : une seconde implémentation qui peut diverger est pire qu'un endpoint de plus. Deux compteurs ont demandé d'y réfléchir, pas une simple réutilisation :
- `textsWiderThan30Days` n'est PAS `TextUnit.date` — un texte affirme un jour ou rien, `date_start = date_end` est une CONTRAINTE du schéma (D11) — ce compteur serait perpétuellement à zéro. C'est la fenêtre EFFECTIVE `covers_*` (comblée en direct par `ref.web_span`, même expression que le prédicat de recouvrement) qui compte, et qu'aucun champ public de `TextUnit` n'expose.
- `imagesWithoutText` réutilise `overlapPredicate('p')` telle quelle, un site d'appel de plus pour LE prédicat, jamais un second.
`orphanedImages`/`orphanedTexts`/`imagesOutOfPeriod` ne coûtent aucun SQL neuf : ce sont exactement `TaskImageSelection.orphaned`/`.outOfPeriod` et `TaskTextSelection.orphaned`, déjà calculés par `loadImages`/`loadTexts` depuis la tâche 16. Une sélection orpheline est comptée, jamais listée dans `images[]`/`texts[]` (aucun `PhotoListItem`/`TextUnit` constructible pour une cible disparue). `getTaskReview` réutilise `listPhotos(inTask, scope: 'all')` pour le `PhotoListItem` complet — `scope: 'all'` délibéré, jamais le défaut `hierarchy`, pour que la sélection d'une tâche ne soit jamais masquée par un filtre de navigation. `duplicateTask` copie `brief`/`period`/images/textes/notes (ULID neuf par note, jamais l'id de la source) mais jamais `exportedAt`/`exportDirectory`/`exportedContentHash` — la copie naît `draft` par construction, pas par une remise à zéro de champ. `deleteTask` est un `DELETE ... RETURNING` unique, `ON DELETE CASCADE` fait le reste — le dossier déjà exporté, lui, n'est jamais touché. 28 tests neufs (10 dépôt, 18 HTTP), vérifié en réel contre `photo_ui` (une vraie tâche, une vraie photo 1998-02 datée par son album : `inferredDateImages`/`imagesWithoutText` à 1 comme attendu, dupliquée en `draft`, les deux tâches supprimées, confirmées disparues). 628 tests serveur, tsc/eslint propres.
DETAIL : commit `76f5653`. `POST /tasks/:slug/opened` reste non fait — déjà consigné comme un écart mineur volontaire plus haut dans ce journal, pas une régression de cette tâche.

ASK : aucun. Le plan backend est intégralement déroulé — 26 tâches, T1 à T5. Je reste disponible si Nicolas ou une autre tâche apparaît, mais il n'y a plus d'étape suivante prévue par `docs/superpowers/plans/2026-08-28-backend.md`.

---

## Avancement — impl-backend, 4 défauts remontés par front (2026-08-30)

RE : intégration réelle front — 4 défauts (1 « bloquant »), tous root-causés (`superpowers:systematic-debugging`), 3 vrais bugs corrigés, 1 faux positif expliqué.
DONE :
1. **`captureDateLocal`/`arbitration.exifDate` avaient un espace, jamais `T`** — `capture_date_local` est une vraie colonne `timestamp` (jamais convertie en `Date`, mais le driver rend l'espace du wire format Postgres). Le test unitaire existant utilisait déjà une fixture au format `T`, donc n'exerçait jamais ce que le driver rend vraiment. `toLocalDateTime()` ajouté dans `map_photo_row.ts`, fixture corrigée.
2. **`fileSize` revenait en `string`** — `file_size` est `bigint`, `pg` le rend en chaîne par défaut (perte de précision possible), et `db/pool.ts` n'avait que `DATE_OID`/`TIMESTAMP_OID`, jamais `BIGINT_OID`. Corrigé au même endroit que les deux autres — aucune colonne `bigint` du schéma n'approche `MAX_SAFE_INTEGER`.
3. **`GET /system/status` : `attention`/`features` absents, `runningJobId` figé à `null`** — pas périmé, jamais écrit : `system_controller.ts` date de la tâche 12, jamais retouché depuis les tâches 19 (jobs), 24 (corrections), 25 (référentiels). Ajoutés au contrat et câblés : `countOrphanedSelections` (global, toutes tâches), `countAlbumsWithPresumedSpan`, `countWebDocumentsWithoutSpan`, `listCorrections(status)` réutilisée pour les deux compteurs de correction. `JobStore.runningJobId()` ajouté (le champ privé que `submit()` vérifiait déjà), câblé dans `registerSystemRoutes`.
4. **PAS un bug serveur** : le « bloquant » (`POST /tasks/:slug/images` rejette tout id réel) et le TELL (`rejected[]` sans `cloudAssetId`) ont la MÊME cause — le repro de front envoyait `add: [idNu]` au lieu de `add: [{cloudAssetId, selectedBecause}]`. `item.cloudAssetId` vaut `undefined` en JS sur une chaîne nue (jamais une erreur), traverse tout jusqu'à `rejected: [{reason: 'unknown_photo'}]` — `cloudAssetId: undefined` disparaît de la sérialisation JSON avec lui. Vérifié en curl AVANT de toucher au code : la forme `{cloudAssetId, selectedBecause}` fonctionne et a toujours fonctionné. Corrigé quand même le vrai défaut sous-jacent : `parseImagesMutation`/`parseTextsMutation` avaient une validation délibérément superficielle (« un élément malformé échouerait à l'écriture SQL, jamais en silence ») — ce repro prouve cette hypothèse fausse. Ajouté une validation par élément (400 `INVALID_PARAMETER`, nommant `add[i].champ`) aux deux fonctions.
19 tests neufs/modifiés, vérifié en réel contre `photo_ui` (vraie photo avec `capture_date_local` réel, vrai `runningJobId` capturé PENDANT un vrai job de pré-rendu annulé ensuite, forme malformée → 400 réel, forme correcte → 200 réel). 642 tests serveur, tsc/eslint propres.
DETAIL : commit `dc44729`. `vite.config.ts` modifié dans l'arbre partagé (front) — jamais touché, jamais ajouté au commit.

ASK : aucun — j'ai répondu directement à front (forme correcte de `add[]`, confirmation des 3 correctifs). Je reste disponible.

---

## Avancement — front, bascule MSW → API réelle (2026-08-30)

RE : intégration réelle front — bascule faite, mesure de grille bloquée par le serveur injoignable
DONE : MSW n'a jamais été câblé dans le runtime navigateur (seulement `mocks/node.ts` pour les tests) — rien à retirer côté bascule elle-même. `.env.local` créé (`VITE_API_BASE_URL`), puis vidé : `thumbUrl`/`renderUrl` viennent du backend en chemin RELATIF et sont utilisés tels quels en `<img src>` (`PhotoTile.tsx:39`, `PhotoDetail.tsx:39`), jamais préfixés par `baseUrl()` — une base absolue aurait cassé les vignettes même une fois le CORS réglé. Deux défauts trouvés en pilotant un vrai Chromium (`playwright`, installé en local via `npm install --no-save`, jamais ajouté à `package.json`) :
1. **CORS** : le vrai backend n'envoie aucun `Access-Control-Allow-Origin` — toute requête cross-origin (5173 → 4310) est bloquée par le navigateur (curl ne le voit jamais, c'est une règle du navigateur, pas du serveur). Résolu côté front : proxy Vite (`vite.config.ts`) vers `127.0.0.1:4310` pour chaque préfixe du contrat, origine unique.
2. **Collision de route** : `/images/:slug` est À LA FOIS une route de CETTE app (l'écran images d'une tâche, `router.tsx`) ET le préfixe des actifs backend (`/images/:sha256/thumb|render`). Un proxy générique sur `/images` avalait la navigation SPA elle-même (404 `route inconnue`). Corrigé par une clé regex Vite (`^/images/[0-9a-f]{64}/(thumb|render)`) qui ne cible que la forme sha256 — mais la collision de préfixe reste réelle si un jour front et back sont servis en same-origin en production sans ce proxy taillé sur-mesure ; à garder en tête, pas bloquant aujourd'hui.
Vérifié après coup : `/images/zz-repro-bug1` (SPA) → 200, `/photos` (API) → 200 (3930 items, aucune pagination — c'est bien le cas non filtré qu'il fallait mesurer), vignette réelle → 200 `image/jpeg`.

BLOCK : le serveur réel (`127.0.0.1:4310`) a répondu normalement pendant toute la mise au point ci-dessus, puis a cessé de répondre (`ECONNREFUSED`, aucun processus correspondant en vie) juste avant que je lance la mesure de tenue de grille sur les 3930 tuiles. Rien côté front n'a changé entre les deux — je n'ai pas touché au serveur. Je ne peux pas exécuter le mandat (faire tourner l'app réelle, mesurer la grille) sans lui.

DETAIL : `vite.config.ts` commité (`cdddcc2`) ; `.env.local` gitignoré, local. Script de pilotage navigateur en scratchpad, pas dans le dépôt. `playwright` installé en local (`npm install --no-save`, jamais dans `package.json`) — pas de `chromium-cli` sur cette machine.

ASK : aucune décision Nicolas ici — j'attends que le serveur reréponde pour continuer.

---

## Avancement — impl-backend, serveur relancé (2026-08-30)

RE : serveur 4310 injoignable, signalé par front
DONE : relancé (`npm run start`, pid 7323), confirmé par team-lead — un seul écoutait, le mien, trois agents dessus sans le savoir.
DETAIL : mon fait — je le tuais après chaque vérification manuelle sans savoir que la mesure de grille de front en dépendait. Engagement pris (team-lead) : je le laisse vivre, je préviens `front` avant tout redémarrage.

ASK : aucun.

---

## Avancement — front, mesure de grille + intégration réelle (2026-08-30)

RE : intégration réelle front — mandat rempli
DONE : serveur revenu (merci `back`). Mesure faite en pilotant un vrai Chromium headless (`playwright`) sur `/images/zz-repro-bug1` (route non filtrée → les 3930 photos du périmètre, `usePhotos` n'envoie aucune limite et le serveur non plus, `PhotoGrid` n'a aucune pagination/virtualisation) :
- 3930 tuiles rendues, 48 645 nœuds DOM, grille stable en 1,56 s après navigation.
- **0 « long task »** (>50 ms) pendant un défilement programmatique du haut jusqu'au bas de la page (104 628 px, 20 paliers). Tas JS : 69 Mo utilisés / 125 Mo réservés. Aucune erreur console.
- `loading="lazy"` (déjà en place, `PhotoTile.tsx:39`) fait son travail : les vignettes hors-champ ne se chargent pas tant qu'elles n'approchent pas du viewport (confirmé par capture d'écran bas de page — cases grises, pas de requête).
**Verdict, avec les chiffres en main plutôt qu'en survalidez** : la grille tient sans virtualisation sur le périmètre réel complet, sur ce poste. Aucun palier de jank détecté. Je ne recommande pas de l'ajouter maintenant — mesure sans throttling CPU/réseau ni défilement continu à la molette, donc pas une garantie sur un poste plus modeste, mais rien dans les chiffres n'appelle une optimisation aujourd'hui. À réviser si une plainte réelle apparaît.

Deux vrais défauts d'intégration trouvés en pilotant l'app réelle (jamais visibles au `curl`), corrigés côté front :
1. **CORS** (`vite.config.ts`, commit `cdddcc2`) : le vrai serveur n'envoie aucun `Access-Control-Allow-Origin`. Proxy Vite vers `127.0.0.1:4310`, une clé regex dédiée pour `/images/:sha256/thumb|render` — `/images/:slug` est AUSSI une route de cette app (écran images d'une tâche), un préfixe générique avalait sa propre navigation.
2. **`TaskImageSelection.outOfPeriod` absent du schéma front** (commit `2f42296`) : le contrat a bougé tâche 26 côté `back`, jamais répercuté ici. `/revue/:slug` réel → `ContractError` immédiate. Corrigé, calculé en LIVE dans le mock (jamais figé à l'ajout, un changement de période ne doit jamais laisser un indicateur périmé) ; 588 tests toujours verts, tsc propre.

Tour des écrans réels (`images`, `textes`, `revue`, `réglages`, `tâches`) : quatre propres, zéro bannière d'erreur, zéro console. `revue` affiche les huit compteurs réels correctement après le correctif ci-dessus.

**Un écart confirmé, pas corrigé — pour `back`, plus sévère que prévu** : `textes` lève 63 bannières « le champ items.0.galleryCaption ne respecte pas le contrat » — et ça touche les TROIS sections (Journal de bord, Ma vie, Site web), pas seulement le registre `web_caption`. Vérifié en direct : `galleryCaption` est absent de CHAQUE item réel de `/texts`, y compris les `passage`/`log_entry` ordinaires — pas seulement non renseigné pour `web_caption`. Comme `TextUnitSchema.galleryCaption` est requis (nullable, mais présent), l'écran Textes réel est actuellement bloqué EN ENTIER, pas juste sur les légendes de galerie. Deux causes, mêmes que l'écart déjà connu (contrat §11 Q11, jamais écrit côté serveur, en attente de l'intégration front) :
- `galleryCaption` à ajouter à CHAQUE item de `/texts` — `null` pour tout ce qui n'est pas `web_caption`, jamais un champ manquant. C'est ce qui débloque déjà les deux premières sections.
- `GET /texts?kind=web_caption` → 400 `INVALID_PARAMETER`, `accepted: ["passage","log_entry"]` — `web_caption` absent de la liste serveur. Débloque la troisième section.
Forme déjà conçue et prête à implémenter telle quelle : `src/api/contract/text.ts:134-142` (`GalleryCaptionFieldsSchema` : `sha256, page, imagePath, distance, margin, verified`) et `:173` (`galleryCaption: GalleryCaptionFieldsSchema.nullable()` sur `TextUnitSchema`). `TextKind.WEB_CAPTION = 'web_caption'` déjà côté front (`src/shared/enums.ts:80`).

DETAIL : commits `cdddcc2`, `7e2138a`, `2f42296`. `playwright` reste installé en local (`npm install --no-save`, jamais dans `package.json`) faute de `chromium-cli` sur ce poste — script de pilotage en scratchpad, rien dans le dépôt.

ASK : aucune décision Nicolas. Je continue l'intégration de bout en bout (corrections, jobs, export, notes) contre le serveur réel.

---

## Avancement — front, corrections + export réels (2026-08-30)

RE : intégration de bout en bout, corrections et export contre le serveur réel
DONE : cycle `PUT /corrections` → `GET /corrections?status=applied` → `GET /texts` (reflète le texte corrigé) → `POST /corrections/revert` (restaure l'amont exact) vérifié en réel sur `logbook/p001/001`, aucune trace laissée. `GET /jobs` réel → `{items: []}` au repos, forme conforme.

**Vrai défaut trouvé — pour `back`** : `POST /tasks/:slug/export` réussit réellement (job `succeeded`, fichiers réels écrits : `manifest.json`, `README.md`, `images/`, `pages/`, `textes/`, `imagesWritten: 1`, `bytesWritten: 282529`), mais **la tâche elle-même n'est jamais mise à jour** — `GET /tasks/zz-repro-bug1` après un export réussi renvoie encore `state: "draft"`, `exportedAt: null`, `exportDirectory: null`, `updatedAt` inchangé. Vérifié deux fois (immédiat + 1 s après), pas un problème de timing. Ça contredit l'invariant déjà câblé et testé côté front (« un dossier déjà exporté n'est JAMAIS écrasé en silence », `ReviewScreen.test.tsx`) : sans `exportDirectory`/`exportedContentHash` posés sur la tâche, un second export ne peut pas être détecté comme un ré-export — risque d'écrasement silencieux d'un export réel de Nicolas. Dossier de test nettoyé (`trash`) après vérification, rien laissé dans `TASKS_ROOT`.

DETAIL : reproduction — `POST /tasks/zz-repro-bug1/export`, `{}`, attendre `succeeded` sur `GET /jobs`, puis `GET /tasks/zz-repro-bug1` : les trois champs restent à leur valeur de création.

ASK : aucune décision Nicolas. Je continue (notes, réordonnancement, revue avec vraie sélection multiple) pendant que `back` regarde l'export.

---

## Avancement — front, notes + réordonnancement réels (2026-08-30)

RE : intégration de bout en bout, notes et réordonnancement contre le serveur réel
DONE : cycle complet vérifié en réel sur `zz-repro-bug1` — création de note (`POST /tasks/:slug/notes`), modification (`PATCH`), suppression (`DELETE`, 204, confirmée absente ensuite) ; ajout d'une seconde photo réelle, permutation d'ordre (`POST /tasks/:slug/images` avec `update: [{cloudAssetId, order}, …]`, un seul appel pour les deux moitiés de la permutation — Q6), puis retrait et remise en ordre pour restaurer l'état initial (`contentHash` identique avant/après : `98e367b2…`, rien laissé).

Ceci clôt le tour d'intégration de bout en bout demandé : images (mesuré), textes (bloqué, cause connue, chez `back`), revue (corrigé), réglages, tâches, corrections (round-trip), export (bug trouvé, chez `back`), notes, réordonnancement — tous vérifiés contre le serveur réel et les vraies données, pas seulement contre MSW.

DETAIL : aucun fichier touché par cette entrée — vérification pure, aucune régression, aucun résidu dans `TASKS_ROOT` ni dans le store réel.

ASK : aucune décision Nicolas. Mandat d'intégration réelle rempli ; je reste disponible pendant que `back` regarde l'export et `galleryCaption`.

---

## Avancement — impl-backend, export + galleryCaption (2026-08-30)

RE : export et `galleryCaption`, deux défauts remontés par front
DONE :
1. **Export corrigé** — `exportTask` écrivait un vrai dossier mais ne touchait jamais `app.task` : `exported_at`/`export_directory`/`exported_content_hash` restaient `NULL` pour toujours, `computeState()` (tâche 16) lisait donc `draft` quel que soit le nombre d'exports réels. Pas périmé, jamais écrit — `export_service.ts` (tâche 18) précède la machine à états qui lit ces colonnes. `markTaskExported()` ajouté (`task_repository.ts`), appelé APRÈS le `rename` atomique, jamais avant. `exportedContentHash` persiste le `contentHash` déjà calculé par `getTaskDetail` en tête d'`exportTask`, sur l'instantané exact écrit — jamais recalculé après coup. 4 tests neufs (dépôt + HTTP bout en bout, repro exacte de front).
2. **`galleryCaption` — partiel** : le champ était absent de CHAQUE `TextUnit`, 63 bannières chez front sur les TROIS sections (le champ est requis, nullable). Ajouté `GalleryCaptionFields` au contrat et `TextUnit.galleryCaption`, toujours `null` depuis `mapTextRow` — `TEXT_UNIT_SELECT` ne lit que `pipeline.text_unit`, jamais un `web_caption` (`app.web_gallery_link`, 227 lignes réelles déjà écrites par `gallery_match_cli.ts`). Débloque Journal + Ma vie.
**Pas fait, délibérément** : servir les 227 vraies légendes de galerie (`GET /texts?kind=web_caption` reste 400). Ça demande un vrai design — `documentId` synthétique (aucun `pipeline.document` derrière une légende de galerie), sémantique de page/recouvrement, vocabulaire fermé de `kind` — pas une addition précipitée en fin de tour. Le contrat §11 Q11 recommande déjà (a) mais l'a délibérément laissé « non écrit tant que la spec frontend ne l'a pas intégré » — front a maintenant conçu cette forme (`src/api/contract/text.ts:134-142`), donc l'écrire est la suite logique, pas une invention en avance de la décision.
5 tests neufs au total, vérifié contre le corpus réel (colonnes `app.task` avant/après un export réel, `galleryCaption: null` confirmé sur un vrai item — contre le process du serveur de dev ACTUEL, qui n'a pas encore redémarré pour charger ces deux correctifs). 646 tests serveur, tsc/eslint propres.
DETAIL : commits `bfb7408`, `8195aed`. Serveur pas redémarré — j'attends un bon moment avec `front` (engagement pris plus haut dans ce journal).

ASK : aucune décision Nicolas ici. Pour front (pas bloquant, quand tu peux) : je voudrais redémarrer le serveur pour charger export+galleryCaption — dis-moi quand c'est un bon moment, ou si tu préfères que j'attende la fin de ta mesure en cours. Je m'attaque ensuite au service complet de `web_caption` (design + implémentation) si rien d'autre n'est plus urgent.

---

## Avancement — impl-backend, export + galleryCaption en ligne (2026-08-30)

RE : les deux défauts, confirmés par team-lead — déjà corrigés, maintenant vérifiés en direct
DONE : serveur redémarré (pid 11508). Vérifié contre le corpus réel : une vraie tâche `draft` → `POST /export` → `exported`, `exportedAt`/`exportDirectory` posés, `exportedContentHash === contentHash` ; un vrai item `/texts` porte `galleryCaption: null`. Dossier de test nettoyé (`trash`). 646 tests serveur, tsc/eslint propres.
DETAIL : rien de neuf côté code, cette entrée ferme la boucle de vérification demandée par team-lead sur les commits `bfb7408`/`8195aed`.

ASK : aucun — je m'attaque au service complet de `web_caption` (`GET /texts?kind=web_caption`, les 227 légendes réelles de `app.web_gallery_link`).

---

## Avancement — impl-backend, `web_caption` servi (2026-08-30) — contrat §11 Q11 écrit

RE : troisième registre du texte, `GET /texts?kind=web_caption`, terminé
DONE : 205 vraies légendes de galerie servies (227 appariements réels dans `app.web_gallery_link`, 22 sans texte — ni `caption` ni `alt` — exclus). Un appariement explicitement rejeté par un humain (`verified = false`) est exclu, jamais montré comme une légende ; `verified IS NULL` (« pas encore relu ») reste montré, non vérifié. `documentId` dérivé du chemin de page, résout vers un vrai `pipeline.document` dans 26 cas sur 27 réels — vérifié par requête directe avant d'écrire le code, pas supposé. `pageId` toujours `null` (aucune page scannée derrière une légende de galerie), `date` toujours `null` (D11 : une légende de galerie n'affirme aucune date, la sienne vient de la photo par LIEN DIRECT — `OverlapRule.GALLERY_MATCH`, déjà réservé dans `enums.ts`, jamais par recouvrement de plage). `overlappingPhotoCount` compte les vraies photos de même `sha256`. `confidence` : `reviewed` si `verified`, sinon `uncertain`. Contrat §11 Q11 écrit — option (a) retenue comme recommandé (amendement A5, `docs/api-contract.md`) : un troisième `TextKind`, jamais un champ séparé sur la photo.
**Portée délibérément réduite** : `q`/`dateFrom`/`confidence`/`hasCorrection`/`overlapsPhoto` ne s'appliquent pas encore à ce registre. Le sens inverse (`GET /photos/:id/texts`, `?overlapsTextKind=web_caption`) n'est pas câblé — `OverlapRule.GALLERY_MATCH` existe dans `enums.ts`/`galleryCaption` mais pas encore dans le prédicat de recouvrement lui-même. Aucune correction sur ce registre (`app.text_correction` ne cible que `pipeline.text_unit`).
6 tests neufs, vérifié contre le corpus réel (205 = le compte mesuré à la main, un `documentId` résout vraiment via `GET /documents`, `overlappingPhotoCount` reflète un vrai lien direct). 652 tests serveur, tsc/eslint propres.
DETAIL : commit `f3443d2`. Serveur redémarré (pid réutilisé, déjà vivant depuis la vérification précédente), vérifié en direct — pas de nouveau redémarrage nécessaire pour front.

ASK : aucune décision Nicolas ici — l'option (a) était déjà la recommandation écrite du contrat, front a conçu la forme, je l'ai suivie telle quelle. Je reste disponible ; le sens inverse du recouvrement (`GALLERY_MATCH` dans le prédicat) et les corrections sur `web_caption` restent en attente si Nicolas ou front en ont besoin.

---

## Avancement — impl-backend, `GALLERY_MATCH` dans les deux sens (2026-08-30)

RE : Nicolas tranche via team-lead — finir `web_caption` maintenant, les deux questions que j'avais différées
DONE : les deux questions que je pensais encore ouvertes étaient déjà tranchées ailleurs — team-lead m'a pointé le code déjà écrit par front plutôt que de me laisser reconcevoir :
- `enums.ts` porte déjà le commentaire de front sur `OverlapRule.GALLERY_MATCH` : « pas un recouvrement de plage — une identité — mais elle voyage dans la MÊME forme `OverlapInfo`, chaque largeur à zéro ». Exactement ce qui manquait à ma décision sur la « sémantique de page ».
- Un appariement de galerie **ne devient jamais une date** (Nicolas, confirmé) — jamais dans la cascade, jamais un `&&`.
`listOverlappingTexts` (`GET /photos/:cloudAssetId/texts`) calcule maintenant le lien de galerie INDÉPENDAMMENT de la branche datée — avant, une photo non datée court-circuitait à un résultat vide AVANT même de chercher un lien de galerie, ce qui aurait caché en silence une identité réelle n'ayant rien à voir avec une date. Les items de galerie portent `{rule:'gallery_match', photoSpanDays:0, textSpanDays:0, totalSpanDays:0, distanceToCentreDays:0}` et passent naturellement en tête sous la règle de tri existante (somme croissante) — la certitude avant la conjecture, sans cas particulier. Le filtre `overlapsTextKind`/`overlapsTextId` de `photo_repository.ts` (le sens direct) bascule sur une égalité `p.sha256 = …` pour `web_caption` au lieu du prédicat `EXISTS`/`&&` — `overlapsTextId` reste le même `ref.id` (`sha256:imagePath`) déjà rendu par `/texts?kind=web_caption`, aucun nouveau schéma d'id à apprendre côté client.
5 tests neufs, vérifié dans les deux sens contre le corpus réel : une vraie photo à 44 correspondances au total a son `gallery_match` trié en tête (0 jour) devant des recouvrements de 30+ jours ; le filtre direct retrouve exactement la seule photo appariée par identité. 657 tests serveur, tsc/eslint propres.
DETAIL : commit `645bcef`. Serveur redémarré et vérifié en direct (pid 24017).

ASK : aucun. `web_caption` est maintenant complet des deux côtés (lecture `/texts?kind=web_caption`, recouvrement dans les deux sens) — reste hors périmètre, si besoin plus tard : les corrections sur ce registre (`app.text_correction` ne cible que `pipeline.text_unit`) et `q`/`dateFrom`/`confidence` sur `/texts?kind=web_caption`.

---

## Avancement — front, repasse navigateur après export + galleryCaption + recouvrement (2026-08-30)

RE : repasse demandée par team-lead — quatre sources Textes, export re-vérifié, régressions
DONE : `galleryCaption` et l'export confirmés en direct (curl + Chromium réel) — Textes affiche ses 4 sources sans bannière (205 légendes réelles, screenshot vérifié : texte français réel, « date indéterminée », « correspondance non vérifiée », badge photo). Export : cycle complet réel (créer → job `succeeded` → `state: exported`/`exportedAt`/`exportDirectory` posés → deuxième export → job `failed`, alerte nommée avec le bon chemin). Dossiers de test nettoyés (`trash`).

**Découverte en testant l'export dans un vrai navigateur : la fonctionnalité n'avait jamais tourné contre un vrai serveur.** `JobSchema` modélisait une forme jamais envoyée (`jobId/done/total/endedAt/report` plat) — la vraie forme est `id/progress{done,total,label}/finishedAt/result{type,report}/cancellable/error`, et surtout `POST /tasks/:slug/export` répond TOUJOURS 202 avec un job `queued`/`running` (`exportTask()` tourne entièrement dans le job runner, jamais de 409 synchrone) — rien ne l'attendait, aucun sondage n'existait. Corrigé : `JobSchema` réécrit contre `server/src/contract/task_interface.ts` et `job_service.ts`, `useJob(jobId)` neuf (sonde `GET /jobs/:id` toutes les 250 ms jusqu'à un état terminal), `ReviewScreen` reconnecté dessus. `skippedImages` n'a pas de `fileName` (seulement `cloudAssetId` + raison en MAJUSCULES) — affichage et `SKIP_REASONS` corrigés en conséquence.

Deux autres vrais défauts trouvés en pilotant un vrai Chromium sur des données réelles, corrigés :
- **Clé React dupliquée** sur `PhotoDetail` : une vraie photo porte deux fois le tag littéral « construction » (rien ne garantit l'unicité en amont) — `data.tags`/`caption.keywords` n'ont pas d'id, corrigé par un index en tiebreaker.
- **`distanceToCentreDays` contraint à un entier alors qu'il ne l'est pas** : 10 des 17 textes recouvrant une vraie photo portent `6.5` — c'est une distance entre deux MILIEUX d'intervalle, jamais un compte de jours, et le serveur ne l'arrondit pas (mon propre `centreDistanceDays` côté front arrondit, mais seulement pour son usage local de tri, jamais une promesse sur ce que le serveur envoie). Corrigé, `.int()` retiré.

**Un vrai défaut trouvé, pas corrigé — pour `back`, bloquant sur deux flux réels** : l'axe de recouvrement AVANT (`GET /photos?overlapsTextKind=…&overlapsTextId=…`) ne renvoie NI `overlap` par item NI `overlapSummary` — la forme plate `PhotoListItem[]` telle quelle, testé sur les trois natures (`passage`, `log_entry`, `web_caption`, les trois vides des deux champs). Le FILTRAGE marche (le bon sous-ensemble revient, `total` varie juste comme attendu), seule la décoration manque. Ça bloque « Voir les images » depuis un texte (`TextsScreen`) en entier — bannière de contrat immédiate. Le sens INVERSE (`GET /photos/:id/texts`, testé sur une vraie légende de galerie + 16 textes recouvrants réels) renvoie bien `overlap` par item (juste le souci `distanceToCentreDays` déjà réglé plus haut) mais PAS `overlapSummary` non plus — donc « Voir les N textes » depuis une photo marche pour la liste, mais le contrat reste cassé si jamais `overlapSummary` était ajouté à cette forme sans être vraiment envoyé. Les deux endroits sont dans `src/api/contract/overlap.ts` (`PhotoOverlapEnvelopeSchema`/`TextOverlapEnvelopeSchema`, déjà écrits et documentés) — rien à changer côté front, c'est la décoration serveur qui manque.

Tour des cinq écrans (images/textes/revue/réglages/tâches) à froid : zéro bannière, zéro console. Le défaut ci-dessus ne se voit qu'en ENTRANT dans le flux de recouvrement, jamais au chargement d'un écran.

591 tests front verts, tsc et eslint propres.

DETAIL : commits `6070052` (export), `18c1505` (clé React), `d211e87` (`distanceToCentreDays`). Serveur toujours vivant, pid inchangé depuis le dernier redémarrage de `back`.

ASK : aucune décision Nicolas. J'ai écrit directement à `back` pour l'axe de recouvrement (bloquant, deux flux). Je reste disponible.

---

## Avancement — impl-backend, décoration de `GET /photos` + `overlapSummary` renommé (2026-08-30)

RE : deux défauts signalés par front — l'axe direct sans décoration, `overlapSummary` absent des deux côtés
DONE : deux vrais bugs, root-causés (`systematic-debugging`) avant tout code.
1. `GET /photos/:cloudAssetId/texts` renvoyait `summary`, jamais `overlapSummary` — le schéma zod de front (`TextOverlapEnvelopeSchema`) attend `overlapSummary` depuis toujours. Un seul champ mal nommé, le reste de la forme était déjà correct. Renommé à la frontière du contrôleur.
2. `GET /photos?overlapsTextKind=…&overlapsTextId=…` filtrait juste (le bon total revenait) mais ne décorait RIEN — enveloppe plate `PhotoListItem[]`, ni `overlap` par item ni `overlapSummary`. `listPhotosWithOverlap` ajouté (`photo_repository.ts`) : réutilise `listPhotos` telle quelle pour l'ensemble filtré/paginé (jamais une seconde implémentation du filtre), décore chaque item (`computeOverlapInfo` pour les règles datées, la même identité `gallery_match` à largeur nulle que le sens inverse pour `web_caption`), et calcule `overlapSummary` sur la POPULATION entière (jamais seulement la page — même distinction que `total`/`items.length` ailleurs) en réutilisant `buildPhotoFilter` pour UNE requête d'agrégat de plus — même clause `WHERE`, donc les autres filtres actifs (album, tag, scope…) restent respectés, jamais une condition parallèle qui pourrait diverger.
6 tests neufs, vérifié contre le corpus réel dans les trois cas : un vrai passage décore 39 vraies photos avec un `overlap` réel par item et une répartition mois/année correcte (9/30) ; une vraie légende de galerie décore sa photo avec l'identité à largeur nulle ; `GET /photos/:id/texts` porte bien `overlapSummary` maintenant. 661 tests serveur, tsc/eslint propres.
DETAIL : commit `3560c01`. Fichiers de front modifiés en parallèle dans l'arbre partagé (`src/ui/filters/FilterPanel.*`) — jamais touchés, jamais ajoutés au commit. `distanceToCentreDays` non entier (signalé par front, déjà corrigé de son côté) : vérifié côté serveur, `computeOverlapInfo` n'arrondit jamais — rien à faire ici.

ASK : aucun. Serveur redémarré et vérifié en direct.

---

## Avancement — front, deux bugs signalés en direct par Nicolas + deux demandes Réglages (2026-08-30)

RE : bugs Tâches/Images (« I can't enter a date. Also the hierarchy name can't be selected »), demandes Réglages
DONE (`superpowers:systematic-debugging` invoqué, cause avant correctif, test qui échouait sans lui) :

**« I can't enter a date » — reproduit, corrigé.** Cause : `dateFrom`/`dateTo` ne survivent à l'URL QUE TOGETHER (`toSearchParams` exige les deux non-nuls ; vérifié aussi côté serveur, un `dateFrom` seul est silencieusement ignoré, `filters.applied` reste vide). Chaque champ mois dérivait sa valeur directement de `filters`, lui-même redérivé de l'URL à chaque rendu — taper le PREMIER mois fait un aller-retour par `toSearchParams`/`fromSearchParams` avec l'autre borne encore nulle, qui le perd ; le second mois ne peut alors plus le récupérer. Structurellement impossible à remplir, dans n'importe quel ordre, pour n'importe qui. **Pourquoi 588 tests ne l'ont pas vu** : le harnais de `FilterPanel.test.tsx` stockait le `FilterState` brut au lieu de le faire passer par le même aller-retour URL que `ImagesScreen` fait réellement — corrigé (`fromSearchParams(toSearchParams(next))`), ce qui a fait échouer le test existant avant le correctif. Corrigé par un état local (brouillon) pour les deux champs mois, qui ne valide vers `onChange` qu'une fois les deux complets — même schéma déjà utilisé pour les bornes de `SettingsScreen`. Vérifié en vrai navigateur (`dateFrom=2000-06-01&dateTo=2000-12-31`, 3930→383 résultats).
Piège en creusant : `page.keyboard.press('Digit...')` sur un `<input type="month">` sous Chromium headless produit une valeur absurde même sur une page HTML nue sans aucun code de l'appli (`"62000-06"` au lieu de `"2000-06"`) — un artefact de l'automatisation clavier headless sur ce type de champ, pas un signal sur le bug réel. Vérifié via l'assignation directe de `.value` + `dispatchEvent` (une frappe complétée), qui elle est fiable.

**« le nom de hiérarchie ne peut pas être sélectionné » — NON reproduit.** Case à cocher testée : clic sur le texte du label, clic direct sur la case, Espace au clavier avec focus, persistance après 4 s et un refetch complet — tout fonctionne (coché, URL `albumPath=…`, 3930→26 résultats). J'ai demandé à team-lead de faire préciser à Nicolas quel album et quel symptôme exact.

**Réglages : tri alphabétique + recherche.** `AlbumSpans` triait « suspects d'abord » — remplacé par un tri alphabétique pur sur `path` (le préfixe `AAAA-MM` donne l'ordre chronologique gratuitement, jamais un tri de date construit pour l'usage). Champ de recherche ajouté, client seulement (82 albums en mémoire, aucun aller-retour serveur) : `matchesSearch` (`src/domain/searchFold.ts`) plie les deux côtés en NFD avant de retirer les marques combinantes — insensible à la casse ET aux accents quel que soit le sens (le contrat documente `Album.path` en NFC, mais la vraie donnée a été vue décomposée ; une personne peut aussi taper l'une ou l'autre forme). Vérifié en direct : « BVI » trouve les 3 vrais albums BVI, « Alges » sans accent trouve le vrai « Algès ».

**Repasse recouvrement (`back` a livré depuis mon dernier signalement)** : `overlap`/`overlapSummary` maintenant décorés dans les deux sens, vérifié en vrai navigateur — « Voir les images » depuis un texte affiche « 2 photos dans une fenêtre de 130 jours » avec les vraies tuiles, plus aucune bannière de contrat.

600 tests front verts, tsc et eslint propres.

DETAIL : commits `0bf2bc9` (date), `3180f78` (tri + recherche Réglages). `superpowers:systematic-debugging` suivi intégralement pour le bug de date : reproduction avant hypothèse, hypothèse unique testée, test qui échoue avant correctif.

ASK : aucune décision Nicolas. J'attends la précision sur le bug d'album pour continuer, sinon je reste disponible.

---

## Avancement — front, cascade bloquante Tâches/Images + éditeur de période (2026-08-30)

RE : trois défauts bloquants + éditeur de période, écran Tâches/Images
DONE (`superpowers:systematic-debugging` sur chacun, cause avant correctif) :

**1. BLOQUANT — impossible d'ajouter une image à une tâche.** C'était le défaut que `back` avait déjà diagnostiqué et signalé (`add: [idNu]` au lieu de `add: [{cloudAssetId, selectedBecause}]`) — je l'avais acquitté sans jamais corriger le code client. Corrigé (`useSelection.ts`). Le corriger a immédiatement révélé un DEUXIÈME défaut, invisible jusque-là : `TaskImagesMutationResultSchema`/`TaskTextsMutationResultSchema` modélisaient `added`/`merged`/`removed` comme des tableaux d'ids — la vraie forme (`server/src/contract/task_interface.ts`) est des COMPTES (nombres), et `TaskImagesMutationResult` avait en plus `implicitlyAdded`/`contentHash`/`state` totalement absents. Corrigé aussi. **Pourquoi 601 tests ne l'ont pas vu** : rien ne valide un corps de requête sortant dans cette appli (`apiPost` ne valide que les réponses), et mon propre mock MSW acceptait la même forme fausse que le client envoyait — mock et client d'accord entre eux, tous deux en désaccord avec le vrai serveur. `TaskImagesMutationSchema` (le schéma de requête du contrat) encodait cette même forme fausse depuis longtemps sans jamais être branché nulle part — du code mort qui ressemblait à un filet de sécurité. Corrigé et câblé dans le mock, qui refuse maintenant un `add[]` malformé comme le vrai serveur. Test qui inspecte le corps réel envoyé à MSW, pas seulement la réponse du mock. Vérifié en direct : clic sur une case à cocher, image réellement ajoutée à `zz-repro-bug1`, `contentHash` cohérent.

**2/3. Liste d'albums non triée + illisible, écran Images (FilterPanel).** Même règle que Réglages, jamais appliquée là — extrait dans `domain/albumOrder.ts` (`sortAlbumsByPath`) pour que les deux écrans obéissent à la même règle au lieu de deux copies. Panneau élargi (18rem → 22rem), le nom d'album passe à la ligne au lieu d'entrer en collision avec son compte et le badge « couvre peut-être une plage » dans une ligne qui ne peut pas casser. Vérifié en direct : 82 albums, ordre alphabétique confirmé, capture d'écran propre.

**4. « le nom de hiérarchie ne peut pas être sélectionné » — toujours pas reproduit, y compris sous WebKit** (Nicolas est sur Safari ; installé `playwright install webkit`, rejoué clic texte/case/clavier/persistance — tout fonctionne, résultats filtrés 3930→22, URL correcte). Le mécanisme technique n'est vraisemblablement jamais le problème : la liste NON TRIÉE et TROP ÉTROITE (défauts 2/3 ci-dessus, dans une liste de 82 entrées) rendait très probablement impossible de TROUVER visuellement l'album cherché — même symptôme que la version « illisible » remontée séparément. Les deux corrections ci-dessus devraient la régler ; à confirmer par Nicolas.

**5. Éditeur de période de tâche — n'existait nulle part.** Vérifié : aucun champ de période, dans aucun écran, avant ce correctif — « I can't enter a date » était vrai au sens littéral, le formulaire de création n'a jamais eu de champ période, et Revue ne faisait que LIRE `period` (jamais l'éditer). Construit : `PATCH /tasks/:slug` câblé (`useUpdateTask`), éditeur mois/année sur l'écran Revue — mois/année plutôt qu'un sélecteur de date, sur demande explicite de Nicolas et de team-lead : le corpus va de 1998 à 2004, un sélecteur qui ouvre sur aujourd'hui et impose de reculer de 264 mois serait inutilisable même une fois la frappe réparée. Réutilise `domain/monthRange.ts` (déjà éprouvé par le correctif du panneau de filtres) — « Premier mois » → « Actuellement : 1998-06-01 → 1998-12-31 », même convention d'affichage que les bornes d'album sur Réglages. Vérifié en direct sur la vraie tâche de Nicolas (`01-le-grand-depart`) : période 1999-09 → 1999-10 posée et confirmée côté serveur — laissée en place, plausible et utile, pas nettoyée comme une donnée de test.

**Trouvé au passage, corrigé avec le même câblage** : le champ « Consigne pour le LLM » n'était jamais persisté — `useState('')` local, jamais initialisé depuis `task.data.brief`, aucun bouton câblé à rien. Le test existant (« the brief is editable ») ne vérifiait que la frappe locale, exactement la forme de test qui passe sur une fonctionnalité qui ne fait rien. Corrigé avec le même mécanisme que la période ; nouveau test qui démonte/remonte l'écran pour prouver qu'un enregistrement atteint vraiment le serveur.

610 tests front verts, tsc et eslint propres.

DETAIL : commits `1d46c3c` (add bloquant), `5eb72be` (tri + largeur Images), `0210b4e` (période + consigne). `chromium-cli` toujours absent ; `webkit`/`chromium` installés via `playwright install` pour cette session (jamais ajoutés à `package.json`).

ASK : aucune décision Nicolas. Les trois défauts bloquants et l'éditeur de période sont faits et vérifiés en direct contre son vrai serveur et sa vraie tâche. Je reste disponible.

---

## Avancement — front, deux défauts trouvés par l'agent V1.5 (2026-08-30)

RE : « Retirer scan-0007 » en dur + liste d'albums réduite à la feuille
DONE (`systematic-debugging`, test qui échoue vérifié avant correctif pour chacun) :

**1. `ReviewScreen.tsx` : le bouton retirer nommait la même image sur chaque ligne.** Littéral copié-collé : `Retirer scan-0007` en dur, jamais interpolé — contrairement à Monter/Descendre (juste à côté) qui portent déjà `aria-label={\`Monter ${image.cloudAssetId.slice(0, 8)}\`}`. Ici il n'y avait AUCUN `aria-label` : le texte visible EST le nom accessible, valeur fixe incluse — un lecteur d'écran entendait le même nom sur chaque ligne. Vérifié qu'il n'y a pas d'autre littéral du même genre dans le fichier (recherche `scan-`/motifs numériques). Le test existant (« removing an image ») cherchait justement `/Retirer scan-0007/` — il encodait le bug, pas le comportement voulu, d'où l'angle mort. Rejoué contre le composant non corrigé pour confirmer le rouge, puis corrigé (`aria-label` dynamique, texte visible neutre) et ajouté un test à deux lignes qui vérifie que chaque bouton porte un nom distinct.

**2. Liste d'albums réduite à la feuille (`album.albumName`), sur les deux écrans.** Le tri porte sur `path` complet (`sortAlbumsByPath`), mais rien n'affichait ce chemin — un nom d'album ne porte pas toujours sa propre année (`2000-2001/2000`), donc l'ordre paraissait arbitraire. Hypothèse de team-lead, plausible : c'est probablement la vraie cause du « nom de hiérarchie ne peut pas être sélectionné » — on ne sélectionne pas ce qu'on ne peut pas identifier. Corrigé sur `FilterPanel.tsx` ET `SettingsScreen.tsx` (`album.path` au lieu de `album.albumName`). En le faisant, une redondance est apparue sur Réglages : `groupName` valait presque toujours `albumName` mot pour mot dans les vraies données, donc affichait le même texte deux fois — avec le chemin ajouté devant, ça faisait déborder la ligne, exactement le défaut « illisible » déjà corrigé une fois. Retiré quand `groupName === albumName`. Vérifié en direct sur les deux écrans contre les 82 vrais albums.

612 tests front verts, tsc et eslint propres.

DETAIL : commits `e9b73b1` (bouton retirer), `66e3d10` (chemin complet + redondance Réglages).

ASK : aucune décision Nicolas. Les deux défauts remontés par l'agent V1.5 sont faits et vérifiés en direct.

---

## Avancement — impl-backend, v1.5 tranche A, Tasks 1-4 (2026-08-30)

RE : v1.5, tranche A — les quatre amendements au contrat
DONE : Tasks 1 à 4 terminées et commitées.
- **Task 1 (migration `006_v15.sql`)** : `app.task_note.derived_from_kind/derived_from_id/derived_text_original` (CHECK 0 ou 3), `ref.web_span.date_to` nullable, `app.page_date` (cascade de la 1.5). **Écart réel trouvé, corrigé, pas dans le plan** : le snippet du plan posait une FK `app.page_date.page_id → pipeline.page(id) ON DELETE CASCADE` — l'INVARIANT 6 existant (« aucune FK d'app/ref vers pipeline ») l'a immédiatement fait échouer : `import_service.ts` fait un `TRUNCATE` NU (sans `CASCADE`) sur `pipeline.*`, une FK ici aurait fait échouer TOUT import suivant. Corrigé : `page_id` sans FK, comme partout ailleurs dans `app`/`ref`. Migration déjà appliquée une fois avec la FK fautive (base réelle ET de test) — corrigée en place par un `ALTER TABLE ... DROP CONSTRAINT` ciblé sur les deux, le lanceur de migration ne rejouant jamais un fichier déjà marqué appliqué.
- **Task 2 (A6, `TaskNote.derivedFrom`/`editedSince`)** : `editedSince` calculé à la lecture (jamais stocké). `NOTE_SELECT` extrait (trois projections de note ne divergent plus). **Écart réel trouvé et corrigé, pas dans le plan** : `duplicateTask` (tâche 26) ne copiait que `id/title/body` — une note dérivée dupliquée perdait silencieusement sa provenance. Corrigé.
- **Task 3 (A7, verrou de préfixe)** : `note_title.ts` pur (`attributionPrefix`/`titleKeepsPrefix`), câblé sur `PATCH /tasks/:slug/notes/:noteId` → 422 `ATTRIBUTION_PREFIX_REMOVED` avant toute écriture.
- **Task 4 (A8, répertoire de livraison)** : `TaskPatchInput.exportDirectory`, confiné sous `TASKS_ROOT` (422 `DIRECTORY_OUTSIDE_ROOT`, jamais assaini). Le défaut `<TASKS_ROOT>/<slug>` est résolu à la frontière HTTP sur LES SIX routes qui rendent un `TaskSummary`/`TaskDetail`/`TaskReview.task`, pas seulement `PATCH` — pour ne pas répéter l'écart `outOfPeriod` déjà payé une fois. **Signalé, pas fait** : `export_service.ts` ne lit pas encore ce réglage comme repli avant son propre défaut — absent du périmètre de fichiers de la Task 4 dans le plan ; à confirmer si c'est un oubli ou un report délibéré (écrit dans l'amendement A8 aussi).
`src/shared/enums.ts` touché une fois pour les deux codes d'erreur (`ATTRIBUTION_PREFIX_REMOVED`, `DIRECTORY_OUTSIDE_ROOT`) — front prévenu au moment du geste.
31 tests neufs sur les quatre tâches. 683 tests serveur, tsc/eslint propres.
DETAIL : commits `d4b8f62`, `d7442ad`, `4f75a63`, `36f864e`.

**Task 5 — BLOQUÉE, message envoyé à team-lead** : l'algorithme décrit («l'ordre des non datés entre deux datés est celui du document_id ») contredit son propre exemple de test — `web/1999/Caraibe` (non daté) devrait hériter de `web/1999/Transat` (daté), mais `'Caraibe' < 'Transat'` en ordre `document_id` réel (vérifié contre la vraie collation Postgres), ce qui devrait au contraire le laisser sans date par la même règle que l'exemple `web/1900-1988`. Je ne tranche pas seul lequel des deux (le texte ou l'exemple) fait foi — c'est une règle qui va dater 60 documents réels. Task 6 (l'annonce) ne peut pas conclure tant que les quatre amendements ne sont pas tous écrits.

ASK : envoyé à team-lead directement (bloquant, une décision de conception). J'attends sa réponse pour Task 5 ; rien d'autre à faire en parallèle dans la tranche A tant qu'elle n'est pas close (team-lead : « rien d'autre en parallèle »).

---

## Avancement — impl-backend, v1.5 Task 5 + Task 6 — Tranche A complète (2026-08-30)

RE : team-lead tranche — ni ma lecture (a) ni (b), une troisième : `document_id` ne joue AUCUN rôle
DONE : **Task 5** implémentée selon la vraie règle de Nicolas (relayée par team-lead) : « la date de début du suivant est la date de fin », un CHAÎNAGE entre documents DATÉS seulement, par DATE — jamais par `document_id`, jamais un héritage vers un document non daté. `document_id` était une invention de CE plan, jamais une décision de Nicolas — contredite par sa propre mesure (`document_id` n'est pas chronologique : `gal_7` du 9 octobre rangé avant `gal_5` du 13 ; `funfun1`, classé `1999/`, date de décembre 2001). Un document non daté reste `span: null` sans exception : « les rebuts, gabarits vides et fichiers hors sujet sortent d'eux-mêmes en restant sans date » — un héritage les aurait rattrapés avec une période inventée.
`listWebDocuments`/`getTextDocument`/`listDocuments` calculent maintenant la fin d'un document daté via `LEAD(date_from) OVER (ORDER BY date_from)` sur `ref.web_span` — un seul `WEB_SPAN_CHAIN` partagé, calculé À LA LECTURE (rien stocké : supprimer un document du milieu de la chaîne étend automatiquement son prédécesseur jusqu'au document suivant restant, vérifié par un test dédié). `ref.web_span.date_to` reste la colonne existante mais n'est plus jamais lue en sortie — toujours réécrite `NULL` à chaque saisie pour qu'une valeur d'avant l'amendement ne puisse jamais refaire surface.
**Le plan lui-même corrigé dans le même commit que le code** (`docs/superpowers/plans/2026-08-30-v1.5-backend.md`, Task 5) — l'algorithme ET son exemple de test, avec une note datée expliquant pourquoi `document_id` a disparu, pour que personne ne le réintroduise en le croyant perdu.
9 tests changés/neufs, vérifié contre le corpus réel (un vrai enchaînement de deux documents produit exactement la bonne borne, 1999-12-31, la veille du suivant ; un document non daté reste null ; nettoyé ensuite). Amendement A9 écrit. 686 tests serveur, tsc/eslint propres.
**Task 6** : les quatre amendements v1.5 (A6-A9) confirmés écrits — 9 amendements au total dans `docs/api-contract.md` (A1-A9). Annonce envoyée à `front` ET à team-lead, nommant les quatre formes et leurs champs exacts.
DETAIL : commit `d755cb1` (Task 5). **Tranche A (v1.5) est maintenant complète : Tasks 1 à 6.**

ASK : aucun. J'enchaîne sur la tranche B (Task 7 : la cascade de date de page, pure) — peut démarrer en parallèle de rien d'autre, la tranche A étant close.

---

## Avancement — impl-backend, v1.5 Tasks 7-8 — tranche B (2026-08-30)

RE : v1.5, tranche B — la cascade de date de page
DONE :
- **Task 7 (`page_date.ts`, pure)** : `resolvePageDates` — registre (`log_entry`) prime sur notes (`passage`) prime sur héritage de la page précédente du MÊME document (`source: 'carried'`), la première page d'un document sans texte reste sans date, jamais d'héritage entre documents. 8 tests. Commit `0d6b6fa`.
- **Task 8 (`page_date_repository.ts`)** : `recomputePageDates` recalcule `app.page_date` en entier depuis `pipeline.text_unit`, appelée en fin d'import (`import_service.ts`, juste après `REFRESH MATERIALIZED VIEW app.text_search`) — jamais stockée ailleurs, jamais lue par `adobe_mcp`. `ma-vie` n'a structurellement aucun `log_entry`, donc tombe naturellement dans la branche « notes » sans cas particulier dans le code. `TextPage.date` ajouté, DISTINCT du `window` existant (`window` = géométrie du scan, `date` = chronologie résolue) — `kind: 'reading'` pour une date propre, `'inference'` pour une héritée. `PAGE_SELECT` en `LEFT JOIN app.page_date` : une page sans date résolvable sert `date: null`, jamais absente. `DateSource.PAGE_DATE` ajouté à `src/shared/enums.ts` — front prévenu au moment du geste.
Vérifié contre le corpus réel (écrit en base réelle, c'est l'état persistant voulu, pas nettoyé) : 155 lignes écrites, 0 page de journal sans date, pages 1/2/31 datées par notes (1998-07-08/1998-07-08/2000-03-02), exactement 22 pages ma-vie en `carried` — correspond exactement aux chiffres mesurés par le plan lui-même. Repassé aussi en HTTP réel (`GET /pages?documentId=ma-vie`) : page 1 `reading`, page 2 `inference`, page 3 `reading`.
5 tests neufs (Task 8) + 1 test HTTP. 700 tests serveur, tsc/eslint propres.
DETAIL : commit `52a349d` (Task 8).

ASK : aucun. J'enchaîne sur la tranche C (Task 9, vignettes de page) — D attend la tâche 5 (faite), C et E peuvent démarrer en parallèle de la suite de B selon team-lead. Je note aussi la tâche 12 (`excludedCount: 0` en dur, `fix:`) comme prioritaire dans mon ordre — remontée par team-lead comme un défaut vécu en production tous les jours par Nicolas.

---

## Avancement — impl-backend, v1.5 Task 12 — remontée en priorité (2026-08-30)

RE : team-lead, « remonte-la dans ton ordre si elle est loin » — `excludedCount: 0` en dur
DONE : `GET /texts?dateFrom=...&dateTo=...` codait `excludedCount: 0` en dur — un filtre de date écartait silencieusement les textes sans date, sans jamais le dire. Réel et vécu tous les jours par Nicolas : 341 unités du journal sans date, jamais comptées. `listTexts` renvoie maintenant `undatedExcluded` (les unités qui satisfont TOUS les autres filtres, mais que `date_start IS NULL` seul écarte — jamais un texte daté hors fenêtre, qui ne correspond pas pour une autre raison). `buildNonDateTextConditions` extrait pour que la requête principale et le compte d'écartés ne puissent jamais diverger sur ce que sont « tous les autres filtres ». Contrôleur : `populationTotal = total + undatedExcluded`, `excludedCount = undatedExcluded` (contrat : redondant et voulu).
Vérifié contre le corpus réel (script jetable, jamais commité) : 341 sans date + 491 dans la fenêtre 1999 pour `logbook` — correspond exactement au chiffre mesuré par le plan lui-même.
1 test HTTP neuf, avec fixtures synthétiques (un texte dans la fenêtre, un daté hors fenêtre, un sans date) — la suite `photo_ui_test` reste sur fixtures, jamais sur les vrais chiffres qui pourraient bouger avec la donnée. 701 tests serveur, tsc/eslint propres.
DETAIL : commit `5f5e237`.

ASK : aucun. J'enchaîne sur la tranche C (Task 9, vignettes de page).

---

## Avancement — impl-backend, v1.5 Task 9 — tranche C (2026-08-30)

RE : v1.5, tranche C — les vignettes de page
DONE : `GET /pages/thumb?pageId=…&edge=…` — le scan ENTIER réduit (jamais rogné), vocabulaire fermé `160·320·640`. Réutilise exactement le mécanisme des rendus de photos plutôt que d'en inventer un second : `sips -Z`, LE MÊME `InFlightRenders` par processus déjà construit dans `bootstrap.ts` (`imageService.inFlight`), même cache écrit-en-temporaire-puis-`rename`. Ce dernier geste était privé à `image_service.ts` — extrait en `io/render_cache.ts` (`writeCacheAtomic`) pour que photos et pages partagent une seule implémentation, jamais deux copies qui divergent. Clé de cache : `pageId` (tout caractère hors `[a-z0-9]` → `_`, ce qui exclut par construction tout `..` ou séparateur) + `edge`.
Vérifié contre le corpus réel (serveur réel, `curl`, puis arrêté) : `logbook/p001` en 320 sert un vrai JPEG 207×320, 24,3 Ko au lieu du scan complet ; `edge=4000` → 400 `INVALID_PARAMETER` ; page inconnue → 404 `NOT_FOUND` ; fichier de cache atterrit à `RENDER_CACHE_ROOT/pages/logbook_p001-320.jpg` comme prévu — laissé en place, c'est un cache légitime, pas une donnée de test.
Tests d'intégration contre un VRAI scan (`adobe_mcp/docs/pages`, lecture seule) et un vrai `sips` — aucun mock, même politique que le rendu photo déjà en place. Le test de réutilisation du cache compare le `mtime` du fichier avant/après une seconde requête (seul indice observable sans mocker `sips`).
8 tests neufs. 708 tests serveur, tsc/eslint propres. `docs/api-contract.md` : §6.3bis ajouté, table T2 et table des routes mises à jour.
DETAIL : commit `00be27a`.

ASK : aucun. J'enchaîne sur les tranches D et E (Task 10, la date proposée d'une page ; Task 11, le périmètre 1998-2004 ; Task 13, les facettes de dates ; Task 14, les pages qui correspondent à un filtre).

---

## Avancement — impl-backend, v1.5 Task 10 — tranche D (2026-08-30)

RE : v1.5, tranche D — la date proposée du site
DONE : `WebDocumentRow.proposal` — une SUGGESTION dérivée des photos liées par appariement de galerie (`app.web_gallery_link` → `pipeline.photo.sha256`) : la plus petite `resolved_start`, avec `photoCount`/`datedToDayCount`/`spanDays` disant ce qui la soutient. `datedToDayCount < photoCount` signale une proposition fragile. INDÉPENDANT de `WebDocumentRow.span` (Task 5) à dessein : une proposition s'AFFICHE, elle ne se SAISIT jamais — la mélanger à `ref.web_span` confondrait « ce que suggèrent les photos » et « ce que Nicolas a confirmé ».
`listWebProposals` vit dans son propre fichier (`web_proposal_repository.ts`), fusionné SÉQUENTIELLEMENT (jamais `Promise.all`, même règle déjà documentée dans `task_repository.ts`) dans `listWebDocuments`.
**Écart trouvé, pas dans le plan** : la liste de fichiers de la tâche ne citait que `text_interface.ts` et `ref_controller.ts` comme modifiés — mais le test du plan lui-même appelle `listWebDocuments(...).proposal` directement, ce qui exige de fusionner DANS `text_repository.ts`. Fait ainsi : le champ voyage partout où la ligne est lue, pas seulement sur une route HTTP. `ref_controller.ts` n'a eu besoin d'aucune modification (il ne fait que relayer le résultat de `listWebDocuments`).
Vérifié contre le corpus réel (requête en lecture seule) : 27 documents web réels ont une proposition ; `web/2003/2003_gal_15` correspond exactement au chiffre mesuré par le plan (date 2004-10-05, photoCount 20, datedToDayCount 20, spanDays 9).
5 tests neufs sur fixtures synthétiques (jamais les vrais chiffres dans la suite automatisée). 713 tests serveur, tsc/eslint propres.
DETAIL : commit `2c352cd`.

ASK : aucun. J'enchaîne sur la Task 11 (le périmètre 1998-2004).

---

## Avancement — front, v1.5 Tranche 1 — les trois écrans cassés rattrapés (2026-08-30)

RE : URGENT, trois écrans cassés contre le vrai serveur — Textes, Revue, Réglages
DONE : les quatre amendements de la tranche A backend rattrapés. `TextPageSchema.date`, `TaskNoteSchema.derivedFrom/editedSince` (+ `TaskNoteCreateInputSchema.derivedFrom`), `WebDocumentRowSchema.proposal` et `WebSpanPutInputSchema` sans `dateTo` (borne unique, fin dérivée à la lecture — jamais un héritage pour un document non daté). `mocks/handlers.ts` mis à jour dans le même commit (règle du plan) : `recomputeWebSpanEnds` recalcule la fin de tous les documents du site affectés à chaque changement, `proposal` reste `null` partout pour l'instant (calcul réel = tranche 6, task 12, pas ici). `SettingsScreen.tsx` : le formulaire de période du site perd son champ « Dernier jour ».

**Défaut architectural trouvé en écrivant le test du plan lui-même** (celui-ci teste `page_date` en `reading` ET en `inference` — les deux, volontairement) : `domain/dateKind.ts` modélisait la table source → nature comme une fonction PURE (une seule nature possible par source), une table exhaustive avec vérification `never` au compile. `DateSource.PAGE_DATE` est la première source à deux natures légitimes — `reading` quand la page porte sa propre date, `inference` quand elle hérite de la précédente. Corrigé : `expectedKindFor` retourne maintenant `DateKind | readonly DateKind[]`, nouvelle fonction `isKindConsistent` utilisée aux deux points d'application (`common.ts` superRefine, `dateKind.ts` assertKindConsistent) — `decision` reste refusé pour `page_date`, rien dans cette cascade n'arbitre. Répercuté dans les deux fichiers de test qui construisaient des dates de test via `expectedKindFor` (`formatResolvedDate.test.ts`, `ResolvedDate.test.tsx`) avec un petit helper `singleValidKind`.

**Étape 5 du plan (vérification contre le vrai serveur) bloquée** : le serveur ne démarre plus — `TypeError` à `ref_controller.ts:84`, `deps.periodFrom` est `undefined` (`bootstrap.ts` ne le câble apparemment pas encore dans `RefRoutesDeps`, malgré les défauts dans `config.ts`). Fichiers vus modifiés dans l'arbre partagé (`server/src/http/ref_controller.ts`, `server/src/runtime/bootstrap.ts`) — travail en cours de `back`, jamais touché. Signalé, je continue sur le mock et j'enchaîne sur la Tranche 2 (écran Images, aucune dépendance serveur) en attendant.

632 tests front verts, tsc et eslint propres (bruit sans rapport : deux fichiers scratch non suivis de `back` dans `server/`, hors périmètre de mon lint).

DETAIL : commit `f613eaf`. TDD suivi : chaque schéma corrigé avait un test qui échouait d'abord (fournis par le plan pour Task 1/2, écrits par moi pour `TaskNoteSchema` et `dateKind.ts`, aucun test existant pour ces deux-là).

ASK : aucune décision Nicolas. J'attends que `back` répare le boot du serveur pour finir l'étape 5, mais ça ne me bloque pas — j'enchaîne sur la Tranche 2.
