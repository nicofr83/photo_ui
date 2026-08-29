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
