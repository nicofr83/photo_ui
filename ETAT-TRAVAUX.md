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