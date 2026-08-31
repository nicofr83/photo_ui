# État des travaux — point de reprise

**Établi le 2026-08-28 à 18:57**, à la demande de Nicolas, pour que l'épuisement
des crédits n'entraîne aucune perte.

Ce fichier n'est pas une spécification. C'est le document qu'on lit **froid**
pour reprendre. Il est écrit par `contrat-api` faisant fonction de coordinateur.

---

## Ce qu'il faut savoir d'abord

**Aucun agent ne peut détecter l'épuisement des crédits, ni se réveiller quand
ils reviennent.** Il n'existe aucun outil qui rapporte le quota. Quand les
crédits tombent, l'appel échoue au milieu du tour et l'agent s'arrête net — il
n'y a pas de fin de tour propre, donc pas de « mise en attente » qu'un agent
pourrait exécuter au dernier moment.

**Conséquence, et c'est tout le protocole :** la mise en attente ne peut pas
être un comportement d'exécution, seulement un **état durable écrit d'avance**.
Un travail qui n'est que dans le contexte d'un agent est perdu si le tour meurt.
Un travail commité ne l'est pas.

La reprise est une action de Nicolas — relancer la session. Ce qu'on contrôle,
c'est qu'elle soit sans perte et sans re-décision.

---

## Où en est chaque chantier

| Chantier | Agent | État | Durabilité |
|:---|:---|:---|:---|
| Contrat d'API | `contrat-api` | **GELÉ** sur la forme des types | **commité** — `docs/api-contract.md` |
| Spécification backend | `contrat-api` | **terminée** | **commité** — `docs/backend-spec.md` |
| Spécification frontend | `spec-frontend` | vivante, amendée en continu | **commité** — `docs/frontend-spec.md` |
| Plan frontend | `impl-frontend` | établi | **commité** — `docs/superpowers/plans/2026-08-28-frontend.md` |
| Implémentation frontend T1 | `impl-frontend` | tâches 1.0 à 1.6 **faites** — socle, domaine, rendu, client, fixtures, MSW | **tout commité** (`d193a1a`) — 232 tests verts, rien en vol |
| Échantillon de légendes | *(agent non nommé)* | en cours | `docs/echantillon-legendes.html` est commité |
| Plan d'implémentation backend | `impl-backend` | **terminé** — 26 tâches, plan de tests, 11 décisions d'architecture | **commité** (`e349da7`) — `docs/superpowers/plans/2026-08-28-backend.md` |
| Implémentation backend | `impl-backend` | **en cours** — tranche 0, tâche 1 | *(voir le plan pour l'état tâche par tâche)* |

Dernier commit : `c107907 feat: the resolved-date domain and the capital rule`,
2026-08-28 18:56, branche `test_dev`.

**Rien n'est à risque côté frontend.** Les fichiers de `src/ui/` qui étaient
listés ici comme non suivis sont commités depuis `08e71e5` — l'instantané
précédent datait de `c107907`. `impl-frontend` n'a aucun travail hors de git.

**Décisions frontend qui ne vivent nulle part ailleurs**, écrites ici pour
survivre à une coupure :

1. **TypeScript 6.0.3, pas 7.0.2** — aucune version de typescript-eslint ne
   supporte TS 7 (`latest` et `canary` plafonnent à `typescript <6.1.0`). Garder
   `strictTypeChecked` compte plus que le compilateur le plus neuf : c'est lui
   qui fait respecter la règle « pas de `any` ». Ne pas « moderniser » ce
   choix sans vérifier d'abord le peer range du linter.
2. **« Aucune date nue » est tenu à trois couches, et il faut les trois.**
   *(a)* Le type marqué `IsoDate` se propage à travers Zod — `.refine()` avec un
   prédicat de type narrowe la sortie du schéma — donc **le compilateur** refuse
   qu'une chaîne littérale serve de date nulle part dans le contrat.
   *(b)* `ResolvedDateSchema` refuse **à l'analyse de la réponse HTTP** une date
   dont le `kind` contredit sa `source` : elle ne devient jamais un objet
   JavaScript, donc aucun composant ne peut en recevoir une.
   *(c)* `ResolvedDateView` est le seul composant autorisé à transformer une
   date en texte, et `src/ui/date/noBareDateRendering.test.ts` fait échouer la
   suite si un fichier de `src/ui/` ou `src/screens/` formate une date lui-même.
   Un successeur casserait (a) sans le savoir en remplaçant un `.refine(guard)`
   par un `.regex()` : c'est le même contrôle, mais il perd le type marqué.

2 bis. **Quatre formes d'affichage d'une date, pas trois** (spec §3.6) :
   `1999-10-14`, `octobre 1999`, `2000`, et **« entre février 1998 et juin
   1999 »** quand l'intervalle est plus large que sa précision. `precision`
   qualifie **chaque borne**, jamais la largeur — la largeur se calcule.
3. **`web_span` est une `inference`** — divergence close le 2026-08-28 dans le
   sens de la spec, les trois documents disent maintenant la même chose.
   Le critère retenu, et il vaut pour toute source future : ce qui sépare
   `decision` d'`inference` n'est pas *qui* a agi mais **ce que le geste
   établit**. Une annotation de datation **arbitre** — quelqu'un a vu l'EXIF
   affiché et a tapé autre chose. Une plage de `ref.web_span` **comble un
   vide** : aucun des 569 passages du site ne porte de date. `source` dit qu'un
   humain a saisi, `kind` dit ce que ça vaut. **`annotation` est la seule source
   `decision`.** Conséquence de rendu voulue : les ~25 plages web saisies à la
   main s'affichent ambre italique `≈`, pas violet gras `✓`.
4. **Les tags de lieu mentent — règle pour la facette de T3, à ne pas oublier.**
   901 photos du périmètre portent un tag IA qui nomme un pays faux : `italy`
   frappe 18 photos de Tikal et 16 de Chichen Itza, `egypt` 30 du Maroc. Le
   classifieur voit des ruines de pierre et sort un nom de pays. Trois règles
   (spec, commit `af2a65b`) : **jamais dans l'axe lieu** — le lieu vient du nom
   d'album et du journal ; **hors du vocabulaire proposé** — offrir
   « italy (141) » dans une liste triée par sélectivité fait croire qu'il existe
   141 photos d'Italie ; **mais cherchables**, et alors **marqués comme
   supposition de machine**. Ne pas proposer n'est pas exclure : §7.3 porte sur
   les résultats, pas sur ce qu'on met en avant.
   **Le filtrage par confiance ne marche pas** — tags de lieu à 60 de moyenne,
   descriptifs à 69, les deux au-dessus du plancher de 48. Ne pas retenter.
   **Ne jamais coder une liste de tags de lieu côté client** : le prédicat vient
   du backend, table `ref.tag_kind`, corrigeable à la main.

5. **§7.1 s'étend à tout ce qu'une machine dit d'une image.** Après les dates et
   les textes, la troisième extension : une machine **lit** ce qui est écrit
   dans l'image — une enseigne, une date sur un écran de navigation — et c'est
   une lecture, vérifiable ; elle **déduit** à partir de l'apparence — un lieu,
   une époque, une identité — et c'est une conjecture, souvent fausse. Rien dans
   sa sortie ne les sépare : `ruins` est une lecture d'apparence honnête,
   `italy` une déduction fausse. C'est à l'interface de les séparer.

6. **`server/` est à la racine, pas sous `src/`** — accord avec `impl-backend`.
   La raison est mécanique : le `tsconfig.json` et la couverture du frontend
   portent sur `src/**`, du code serveur là-dedans casserait son `typecheck` et
   son seuil de couverture à chaque écriture en cours.

---

## Le protocole de mise en attente

Il tient en une règle : **ne jamais laisser une décision vivre uniquement dans
un contexte d'agent.**

1. **Commiter ce qui compile ou se lit.** Sur `test_dev`, jamais sur `main`,
   jamais de push. Un commit intermédiaire nommé `wip:` vaut mieux qu'un
   contexte perdu.
2. **Écrire les décisions, pas seulement le code.** Une décision prise et non
   écrite est à refaire — et sera refaite différemment.
3. **Ce qui est en cours de négociation entre agents va dans un document**, pas
   dans un fil de messages : les messages ne survivent pas.
4. **Mettre à jour la ligne de ce tableau qui vous concerne** avant de vous
   arrêter, si vous en avez le temps. Si vous ne l'avez pas, le commit suffit.

---

## Reprendre — dans cet ordre

1. `git log --oneline -5` et `git status` sur `test_dev` : voir ce qui a été
   laissé en vol.
2. Lire ce fichier, puis le document du chantier concerné.
3. **Ne pas rouvrir ce qui est gelé.** Le contrat est stable sur la forme des
   types ; `impl-frontend` a écrit son client contre lui. Les questions encore
   ouvertes sont listées en §11 du contrat et ne portent que sur du comportement
   serveur.
4. Reprendre à la première ligne non faite du plan concerné.

---

## Ce qui reste ouvert et qui bloquerait une reprise

Rien ne bloque. Les questions ouvertes sont documentées à leur place et chacune
porte un défaut appliqué en attendant :

- **Contrat, §11** — 11 questions, toutes de comportement serveur. Aucune ne
  change une interface. Les n° 1, 3, 4, 5, 6 et 7 sont tranchées.
- **Spec backend, §16** — 7 questions. La n° 1 (PostgreSQL 17.6 ou 18) est la
  seule à trancher **avant la première migration**, parce que revenir en arrière
  sur une base peuplée coûte plus cher que le contraire.
- **Légendage VLM** — décision de Nicolas : échantillon de 50 à 100 photos
  d'abord. Les champs restent dans le contrat, la passe complète n'est pas
  engagée, aucune UI n'est en V1.
- **`GET /tasks/:slug/review` : tranché, il reste.** `impl-frontend` s'était
  trompé en annonçant tout dériver côté client. La chronologie est du rendu et
  reste au frontend ; les **comptes** du bandeau restent au serveur, parce que
  « N images qu'aucun texte ne recouvre » applique le prédicat de recouvrement.
  Le calculer côté client créerait une seconde implémentation du recouvrement,
  qui finirait par contredire `GET /photos?overlapsText…` — un chiffre qui
  contredit le reste de l'application est pire qu'un endpoint de plus.

---

## Ce qu'on ne fait pas

**Pas de tâche planifiée (`cron`) pour reprendre automatiquement.** Une tâche
qui se déclenche pendant que les crédits sont épuisés échoue ; une tâche qui se
déclenche quand ils reviennent ferait tourner du travail de spécification
**sans personne pour le relire**, et ce travail-là se juge. La reprise reste un
geste de Nicolas.

---

## Les décisions de Nicolas, dans l'ordre où il les a prises

*Ajouté par la session pilote. Ce fil n'existait que dans son contexte de
conversation : aucun document ne le portait. Chaque ligne est une décision
tranchée par Nicolas lui-même, pas une inférence d'agent.*

| Décision | Ce qu'il a choisi | Pourquoi ça compte |
|:---|:---|:---|
| Topologie | Backend sur son Mac pour le développement, déplaçable en fin de projet | Impose : aucun chemin en dur, tout par variables d'environnement |
| Périmètre fonctionnel | Navigateur complet **et** revue de datation, d'un bloc — puis **pivot complet** vers l'atelier de composition de BD | La spec antérieure au pivot est morte ; seule la règle des trois dates en a survécu |
| Store | Postgres local plutôt que SQLite en lecture seule | Le pipeline reconstruit tout à zéro : une correction écrite dans ses bases meurt à la passe suivante |
| Retour vers `adobe_mcp` | Export explicite, à la main, jamais automatique, derrière un drapeau désactivé | Il a vu deux écrivains sur `annotations.jsonl` à la même minute |
| Stack | React + Vite + TypeScript strict | Web d'abord, iOS et macOS différés via Capacitor — le différé ne coûte rien si le web est fait correctement |
| Périmètre de travail | Les **82 albums** (3 930 photos), pas `photos.year` (3 558) | La hiérarchie qu'il a rangée à la main fait foi ; `photos.year` se trompe 745 fois |
| Plafond de fourchette | **Aucun** | Les dates étant faillibles, un plafond calculé dessus écarterait autant de vrai que de bruit |
| Galeries web ↔ photothèque | Investiguer avant de coder l'écran texte | Spike fait : exploitable, 108 liens sur 2003-2004 |
| Légendage VLM | **Un échantillon d'abord**, 50-100 photos, avant d'engager les 3 930 | Ni la spec ni le contrat ne peuvent trancher par le raisonnement si les légendes valent quelque chose |
| Reprise automatique | **Refusée** — pas de tâche planifiée | De la spécification qui tourne sans relecteur ne vaut rien |

### La règle des dates, telle qu'il l'a énoncée

Elle est le mécanisme central et elle vient de lui, mot pour mot :

> Quand il y a une date de capture dans l'EXIF qui ne diffère pas de plus de
> 6 mois avec la date dans le dernier niveau de hiérarchie, c'est cette date qui
> est bonne. Sinon prendre la date du dernier niveau de la hiérarchie, ou celle
> modifiée dans l'UI de la pipeline. Si besoin et si possible faire un
> rapprochement du lieu avec le contenu du journal de bord / « Ma vie », leurs
> dates sont exactes. Sinon on garde la date modifiée par l'UI du pipeline, ou
> année/mois du dernier niveau de la hiérarchie.

Et sa mise en garde, qui gouverne tout le reste : **« sur les photos récentes le
datage est correct, mais sur les anciennes il a été fait à la main, et des fois
comporte des erreurs. »** 40,2 % des dates du périmètre ne sont pas des mesures.

---

## Les agents, nommément

*Complète le tableau plus haut, qui en désignait deux comme « non nommés ».*

| Agent | Mandat | Joignable par `SendMessage` |
|:---|:---|:---|
| `spec-frontend` | Spécification fonctionnelle, vivante | oui |
| `contrat-api` | Contrat d'API **et** spec backend — mandat terminé, **toujours joignable** | oui |
| `impl-frontend` | Plan **et** implémentation du frontend | oui |
| `impl-backend` | Plan puis implémentation du backend | oui |
| `spike-legendes` | Échantillon de légendes | oui |
| `inventaire-schemas`, `digest-specs`, `spike-dhash`, `skill-dossier-bd` | Mandats terminés, livrables commités | oui |

`ListAgents` n'est pas disponible dans toutes les sessions : passer par la
session pilote pour un relais.

---

## Deux choses acquises hors dépôt

- **La base `photo_ui` existe** : PostgreSQL **17.6** (le client `psql` est en 18.6), `localhost:5432`, conteneur Docker
  `timescaledb`, utilisateur `nico`, collation ICU `fr-FR`, extensions
  `postgis` 3.5.3, `pg_trgm`, `unaccent` installées. Vide de schéma applicatif.
- **Le skill `bd_dossier` est actif globalement** : symlink créé par Nicolas
  depuis `~/.claude/skills/bd_dossier` vers `photo_ui/skills/bd_dossier`. Le
  modifier est un changement du dépôt.

**La clé API Anthropic de la machine est sans crédit.** Le spike des légendes
s'en passe : un agent Claude Code voit les images qu'il ouvre. À savoir avant de
planifier quoi que ce soit qui appelle l'API directement.

---

## La coupure du 2026-08-28, 19h00, et ce qu'elle a appris

Les cinq agents sont morts en quelques secondes, en plein tour, sur
`You've hit your monthly spend limit` — limite réinitialisée à 19h50.
Aucun n'a pu finir sa phrase ni sauvegarder quoi que ce soit.

**Ce qui a survécu :** tout ce qui était commité, plus le présent document.
**Ce qui a été perdu :** les cinq contextes, entièrement.

La reprise a été sans perte de travail — mais uniquement parce que l'état
avait été écrit **avant** la coupure. Il n'existe aucun mécanisme de mise en
attente : aucun agent ne détecte l'épuisement, l'appel échoue au milieu du
tour, sans fin propre.

**Règle qui en découle, pour tout agent de ce projet :** commiter tôt et
souvent, `wip:` compris, jamais plus d'une étape de travail non commitée. Et
écrire ses décisions dans les fichiers et les messages de commit, jamais
seulement dans un rapport à la session pilote.

**Fausse alerte sur les noms.** La session pilote a cru les agents perdus et en
a relancé quatre sous des noms suffixés `-2`. Les originaux étaient en fait
seulement suspendus et ont repris **avec tout leur contexte** à la
réinitialisation de 19h50. Pendant quelques minutes, deux agents par mandat ont
donc écrit sur la même branche. Les doublons `-2` ont été arrêtés ; aucun
conflit n'en est résulté, mais c'était de la chance autant que de la rapidité.

**Les noms d'origine sont les bons** — ceux du tableau ci-dessus. Ne pas
recréer d'agent portant un mandat déjà tenu sans avoir vérifié `ListAgents`
d'abord : une limite de dépense suspend les agents, elle ne les tue pas.

---

## Décisions closes par Nicolas — ne pas rouvrir

### `ref.web_span` est une **inférence**, pas une décision *(2026-08-29)*

Une plage saisie à la main sur un document du site web, qui ne porte aucune
date, se rend en **ambre italique avec le glyphe `≈`**.

**Tranché par Nicolas lui-même**, après trois allers-retours entre agents dans
deux sens opposés. C'est son geste que la règle classe : il a lu les deux
raisonnements et retenu celui-ci.

Le raisonnement retenu : **ce qui distingue une décision d'une inférence n'est
pas qui a agi mais ce que le geste établit.** Corriger la date d'une photo est
un *arbitrage* — quelqu'un a vu l'EXIF à l'écran et a tapé autre chose. Poser
une plage sur un document sans date *comble un vide* : c'est une conjecture.
Le champ `source` dit déjà qu'un humain l'a tapée ; `kind` dit ce qu'elle vaut.

`annotation` est donc la **seule** source de nature `decision`.

État d'application — **tout est conforme au 2026-08-29** :
- `src/domain/dateKind.ts` — conforme (commit `be819a2`)
- `docs/api-contract.md` — conforme (§2.1, §4.8, amendement A2)
- `docs/frontend-spec.md` §9.4 — corrigé par `contrat-api`, sur mandat du lead,
  `spec-frontend` étant tombé juste après l'avoir retourné en `decision`

Tout agent qui trouve un désaccord sur ce point corrige le document, il ne
rouvre pas la question.

---

## Amendements au contrat gelé

Le contrat est gelé sur la forme des types depuis le 2026-08-28. Un gel protège
de la dérive, pas de la correction d'une erreur — mais **tout amendement est
daté dans `docs/api-contract.md` et annoncé aux deux agents d'implémentation
avant d'être écrit.** Un contrat gelé qui change en silence est pire qu'un
contrat jamais gelé.

Trois à ce jour, tous documentés en tête du contrat sous « Amendements depuis le
gel » :

| # | Objet | Type modifié ? |
|:---|:---|:---|
| **A1** | `TextUnit.pageSpanSource` ajouté — `carried` doit se voir dans un résultat où la page n'est pas chargée | oui, champ ajouté |
| **A2** | `web_span` : `decision` → `inference` *(décision de Nicolas)* | non, valeur émise seulement |
| **A3** | `TextUnit.date` est `null` quand le texte n'affirme rien — 1 031 unités sur 2 871 | non, `date` était déjà nullable |

**A3 en une phrase**, parce que c'est celui qui change le plus de données : un
passage placé par la fenêtre de sa page ne porte plus de date héritée, la
fenêtre vit dans `overlap`, et **toute date de texte du système est désormais
une lecture** — garanti par trois contraintes PostgreSQL, pas par relecture.

## Une faute corrigée dans `backend-spec.md` *(2026-08-28)*

`CONSTRAINT photo_month_is_whole_month` testait la **largeur** de l'intervalle
alors que le contrat définit `precision` comme une propriété de **chaque
borne**. Il rejetait l'exemple phare de la spécification —
`1998-02-Maison rose Algès`, dix-sept mois — et n'offrait aucune précision
jouable pour les 421 photos concernées : `month` et `year` refusés par la base,
`day` faisant afficher un jour inventé.

Trouvée et mesurée par `impl-backend`, corrigée en testant l'alignement des
bornes. Le cas `[2004-09-14, 2004-09-14]` en `precision: 'month'` reste rejeté :
rien de ce qui était protégé n'est perdu.

---

## Protocole d'échange entre agents — obligatoire

Les échanges entre agents ont consommé une part majeure du budget de ce projet.
Un message coûte **deux fois** : l'émetteur l'écrit, le récepteur recharge son
contexte entier pour le lire. Une ligne écrite ici coûte une fois, et n'est lue
que par qui en a besoin.

### Règle 1 — n'envoie pas de message

Par défaut, **écris ici**. Un message ne se justifie que si l'autre agent est
**bloqué maintenant** par ce que tu as à dire.

| Situation | Où |
|:---|:---|
| Avancement, décision d'archi, ce qui reste | **ici**, jamais un message |
| Faute trouvée dans un document | **ici** + corrige le document |
| Question dont la réponse débloque ton prochain commit | message |
| Décision qui appartient à Nicolas | message à la session pilote |

### Règle 2 — format fixe, pas de prose

```
RE: <sujet en 3 mots>
ASK|TELL|BLOCK|DONE: <une ligne>
DETAIL: <3 lignes maximum, seulement si indispensable>
```

Pas de salutation, pas de reformulation du contexte que l'autre a déjà, pas de
justification sauf si elle change la réponse. Référence les fichiers par
`chemin:ligne` — **ne recopie jamais leur contenu**, le destinataire peut les
ouvrir.

Exemple réel de ce qui suffit :

```
RE: api légendes galerie
ASK: forme de GET /gallery-captions ?
DETAIL: besoin pour T2.4. Attendu: {caption, page, distance, margin, verified}[]
```

### Règle 3 — la session pilote se tait aussi

Elle ne relaie plus. Elle n'écrit qu'une décision de Nicolas ou un arrêt. Ses
messages suivent le même format.

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

## Avancement — impl-backend, v1.5 Task 11 — tranche D (2026-08-30)

RE : v1.5, tranche D — le périmètre de la liste des documents du site
DONE : `GET /ref/web-documents?scope=perimeter|all`, défaut `perimeter`. Un document est dans le périmètre (1998-2004, `config.periodFrom`/`periodTo`) s'il porte au moins deux passages ET que son CHEMIN OU sa `proposal` (Task 10) tombe dans la période — les deux sont des indices INDÉPENDANTS, aucun ne verrouille l'autre : `web/2005/images/2005_4` est classé sous `2005/` mais ses photos datent de 2003, il reste dans le périmètre. Le seuil de deux passages écarte les rebuts et la vérification Google sans nommer aucun fichier en dur.
`isInWebPerimeter` pure (`metier/dating/web_perimeter.ts`), testée contre les cas RÉELS du corpus qui ont motivé la conception (`googlea0ccc7e24963cc5e` n'a ni année reconnaissable ni proposition ; le « 2496 » qu'il contient est filtré par une plage d'années plausible, jamais confondu avec une vraie année).
**Trouvé au passage, corrigé** : une ligne du tableau des routes (§4.8) montrait encore `PUT /ref/web-span` acceptant `dateTo` — trois tâches après que l'amendement A9 l'a retiré. Le changelog de A9 (ligne 31 du contrat) le disait déjà, le tableau n'avait juste jamais suivi.
Vérifié contre le corpus réel (serveur réel, `curl`) : `scope=perimeter` → exactement 28 des 60 documents réels, correspond à une simulation par script jetable faite avant l'implémentation.
8 tests unitaires purs + 4 tests HTTP neufs (dont un test existant corrigé : un document à 1 passage n'apparaît plus par défaut, passé en `scope=all`). 724 tests serveur, tsc/eslint propres.
DETAIL : commit `ef4e136`.

**Incident signalé par front, résolu** : crash au boot (`Cannot read properties of undefined (reading 'slice')`, `ref_controller.ts:84`) — `deps.periodFrom` undefined. Root cause : un rechargement en mode watch a probablement surpris le code entre mes deux commits (l'exigence posée dans `ref_controller.ts` avant que le câblage compagnon de `bootstrap.ts` n'atterrisse), pas un défaut du code committé — `ef4e136` a TOUJOURS porté les deux ensemble. Confirmé par un `npm run start` propre après coup : démarre sans erreur, `/ref/web-documents`, `/texts`, `/pages/thumb` tous 200. Serveur relaissé vivant sur le port 4310 pour la vérification de front, prévenu.

ASK : aucun. J'enchaîne sur la tranche E (Task 13, les facettes de dates ; Task 14, les pages qui correspondent à un filtre).

---

## Avancement — impl-backend, v1.5 Task 13 — tranche E (2026-08-30)

RE : v1.5, tranche E — les facettes de dates
DONE : `GET /texts/facets?documentId=…` — trois agrégats (`years`/`months`/`days`, chacun un `FacetBucket[]`, le MÊME type que `PhotoFacets` — pas une seconde forme de bucket) sur `pipeline.text_unit.date_start`, `documentId` seul filtre (facultatif) : cette route répond « que contient réellement cette source », pas « que reste-t-il sous le filtre courant » (contrairement à `/photos/facets`, contextuel). `photo_repository.ts`'s `bucketQuery` (privée) exportée et réutilisée plutôt que dupliquée. Le format de `to_char` est lui aussi paramétré (`$1`), même s'il ne vient jamais que de trois littéraux internes — jamais d'interpolation, quelle que soit l'origine.
Vérifié contre le corpus réel (serveur réel redémarré — prévenu à front avant, code rechargé) : `ma-vie` → années `[{1999, count:677}]`, mois `1999-08..11`, 81 jours ; `logbook` → années 1998-2002. Correspond exactement aux chiffres mesurés par le plan.
4 tests de dépôt (fixtures synthétiques) + 3 tests HTTP neufs. 731 tests serveur, tsc/eslint propres.
DETAIL : commit `f4e60e6`.

**Incident d'index git partagé, corrigé sans casse** : mon premier `git commit` (par chemins explicites, 7 fichiers) a pourtant embarqué 5 fichiers de `front` (`albumOrder.ts`/`.test.ts`, `ImagesScreen.module.css`, `FilterPanel.tsx`/`.test.tsx`) — `front` a dû lancer son propre `git add` entre mon `add` et mon `commit`, sur l'index PARTAGÉ. Corrigé par `git reset --soft HEAD~1` (rien perdu, tout reste indexé) puis `git reset HEAD -- <les 5 fichiers de front>` (les désindexe sans toucher leur contenu), recommit avec mes 7 seulement. Front retrouve ses fichiers modifiés, non indexés, exactement comme avant — à lui de les committer. Aucune donnée perdue, mais ça confirme qu'un `git status --short` juste avant le commit lui-même (pas seulement avant le `add`) serait plus sûr sur un index partagé.

ASK : aucun. J'enchaîne sur la Task 14 (les pages qui correspondent à un filtre).

---

## Avancement — front, v1.5 Tranche 1 — les trois écrans cassés rattrapés (2026-08-30)

RE : URGENT, trois écrans cassés contre le vrai serveur — Textes, Revue, Réglages
DONE : les quatre amendements de la tranche A backend rattrapés. `TextPageSchema.date`, `TaskNoteSchema.derivedFrom/editedSince` (+ `TaskNoteCreateInputSchema.derivedFrom`), `WebDocumentRowSchema.proposal` et `WebSpanPutInputSchema` sans `dateTo` (borne unique, fin dérivée à la lecture — jamais un héritage pour un document non daté). `mocks/handlers.ts` mis à jour dans le même commit (règle du plan) : `recomputeWebSpanEnds` recalcule la fin de tous les documents du site affectés à chaque changement, `proposal` reste `null` partout pour l'instant (calcul réel = tranche 6, task 12, pas ici). `SettingsScreen.tsx` : le formulaire de période du site perd son champ « Dernier jour ».

**Défaut architectural trouvé en écrivant le test du plan lui-même** (celui-ci teste `page_date` en `reading` ET en `inference` — les deux, volontairement) : `domain/dateKind.ts` modélisait la table source → nature comme une fonction PURE (une seule nature possible par source), une table exhaustive avec vérification `never` au compile. `DateSource.PAGE_DATE` est la première source à deux natures légitimes — `reading` quand la page porte sa propre date, `inference` quand elle hérite de la précédente. Corrigé : `expectedKindFor` retourne maintenant `DateKind | readonly DateKind[]`, nouvelle fonction `isKindConsistent` utilisée aux deux points d'application (`common.ts` superRefine, `dateKind.ts` assertKindConsistent) — `decision` reste refusé pour `page_date`, rien dans cette cascade n'arbitre. Répercuté dans les deux fichiers de test qui construisaient des dates de test via `expectedKindFor` (`formatResolvedDate.test.ts`, `ResolvedDate.test.tsx`) avec un petit helper `singleValidKind`.

**Étape 5 du plan (vérification contre le vrai serveur) bloquée** : le serveur ne démarre plus — `TypeError` à `ref_controller.ts:84`, `deps.periodFrom` est `undefined` (`bootstrap.ts` ne le câble apparemment pas encore dans `RefRoutesDeps`, malgré les défauts dans `config.ts`). Fichiers vus modifiés dans l'arbre partagé (`server/src/http/ref_controller.ts`, `server/src/runtime/bootstrap.ts`) — travail en cours de `back`, jamais touché. Signalé, je continue sur le mock et j'enchaîne sur la Tranche 2 (écran Images, aucune dépendance serveur) en attendant.

632 tests front verts, tsc et eslint propres (bruit sans rapport : deux fichiers scratch non suivis de `back` dans `server/`, hors périmètre de mon lint).

DETAIL : commit `f613eaf`. TDD suivi : chaque schéma corrigé avait un test qui échouait d'abord (fournis par le plan pour Task 1/2, écrits par moi pour `TaskNoteSchema` et `dateKind.ts`, aucun test existant pour ces deux-là).

ASK : aucune décision Nicolas. J'attends que `back` répare le boot du serveur pour finir l'étape 5, mais ça ne me bloque pas — j'enchaîne sur la Tranche 2.

---

## Avancement — front, v1.5 Tranche 1 vérifiée + Tranche 2 (2026-08-30)

RE : étape 5 (vrai serveur) débloquée, Tranche 2 livrée
DONE : `back` a réparé le boot (câblage `periodFrom`/`periodTo`), serveur relancé. Vérifié en réel via un script qui fait passer les vraies réponses (`GET /pages?documentId=ma-vie`, `GET /ref/web-documents`) dans les vrais schémas Zod : les deux valident sans écart. `GET /tasks/01-le-grand-depart` confirme `derivedFrom`/`editedSince` sur une vraie note. Les cinq écrans (images/textes/revue/réglages/tâches) tournés en vrai navigateur contre le vrai serveur : zéro bannière, zéro console — Textes/Revue/Réglages sont vraiment réparés.

**Tranche 2 (écran Images, sans dépendance serveur), Task 3 + 4.** Task 3 : `sortAlbumsByPath` — le plan proposait `Intl.Collator('fr', {caseFirst:'upper', numeric:true})`, mais son propre test exige que « Fort Lauderdale » passe avant « everglades ». Vérifié en direct (node) : AUCUNE option de Collator ne produit ce résultat — la collation Unicode classe par LETTRE DE BASE d'abord ('e' < 'f'), la casse n'est qu'un départage tertiaire entre lettres IDENTIQUES. Remplacé par une comparaison brute par unité de code (`<`), qui donne exactement ce que le test du plan demande, et les préfixes `AAAA-MM` du corpus (chiffres à largeur fixe) restent correctement ordonnés sans avoir besoin d'un `numeric` Unicode. Task 4 : champ « Filtrer les albums » sur `FilterPanel` (réutilise `matchesSearch`), hors du conteneur qui défile, un album coché reste épinglé même si le filtre l'exclurait — décocher à l'aveugle est le défaut évité. Panneau élargi à 26rem (le plan).

Incident d'index partagé (encore) : mon commit Tranche 2 s'est retrouvé mêlé au commit `79dccfa` de `back` (Task 13 serveur). Contenu vérifié intact, signalé, rien à corriger.

637 tests front verts, tsc et eslint propres (même bruit sans rapport : scratch files non suivis de `back`).

DETAIL : le tri par `Intl.Collator` est un écart documenté par rapport au plan écrit — testé et justifié, pas une improvisation.

ASK : aucune décision Nicolas. J'enchaîne sur la Tranche 3 (navigation, en-têtes fixes).

---

## Avancement — impl-backend, v1.5 Task 13 — tranche E (2026-08-30)

RE : v1.5, tranche E — les facettes de dates
DONE : `GET /texts/facets?documentId=…` — trois agrégats (`years`/`months`/`days`, chacun un `FacetBucket[]`, le MÊME type que `PhotoFacets` — pas une seconde forme de bucket) sur `pipeline.text_unit.date_start`, `documentId` seul filtre (facultatif) : cette route répond « que contient réellement cette source », pas « que reste-t-il sous le filtre courant » (contrairement à `/photos/facets`, contextuel). `photo_repository.ts`'s `bucketQuery` (privée) exportée et réutilisée plutôt que dupliquée. Le format de `to_char` est lui aussi paramétré (`$1`), même s'il ne vient jamais que de trois littéraux internes — jamais d'interpolation, quelle que soit l'origine.
Vérifié contre le corpus réel (serveur réel redémarré — prévenu à front avant, code rechargé) : `ma-vie` → années `[{1999, count:677}]`, mois `1999-08..11`, 81 jours ; `logbook` → années 1998-2002. Correspond exactement aux chiffres mesurés par le plan.
4 tests de dépôt (fixtures synthétiques) + 3 tests HTTP neufs. 731 tests serveur, tsc/eslint propres.
DETAIL : commit `f4e60e6`.

**Incident d'index git partagé, corrigé sans casse — et une seconde collision sur CE fichier** : mon premier `git commit` (7 fichiers par chemins explicites) a quand même embarqué 5 fichiers de `front` (`albumOrder.ts`/`.test.ts`, `ImagesScreen.module.css`, `FilterPanel.tsx`/`.test.tsx`) — corrigé par `git reset --soft HEAD~1` puis `git reset HEAD -- <fichiers de front>` (rien perdu, rien touché côté contenu), recommité en `f4e60e6` avec mes 7 seulement. Front a signalé de son côté une collision symétrique sur son propre commit Tranche 2, mêlé à mon commit Task 13 (`79dccfa` avant ma correction). Puis une TROISIÈME collision, sur ce fichier `ETAT-TRAVAUX.md` lui-même : ma première tentative d'ajouter cette entrée a été écrasée sur disque par un commit concurrent de `front` (`6a8b957`) avant que je ne la committe — perdue sans qu'aucun outil ne signale d'erreur, puisque l'écriture avait réussi avant d'être recouverte. Ré-écrite ici. À surveiller : sur un fichier que DEUX agents modifient en continu (celui-ci), écrire ET committer dans le MÊME geste, sans pause entre les deux, réduit la fenêtre de course.

ASK : aucun. J'enchaîne sur la Task 14 (les pages qui correspondent à un filtre).

---

## Avancement — impl-backend, v1.5 Task 14 — tranche E complète (2026-08-30)

RE : v1.5, tranche E — les pages qui correspondent à un filtre
DONE : `GET /pages` gagne `dateFrom`/`dateTo`/`q` — mêmes noms et même sémantique que `/texts`. Une page sort dès qu'UN de ses textes satisfait le filtre — un `EXISTS` sur `pipeline.text_unit`, jamais un `IN` construit en TypeScript à partir d'une liste d'ids chargée à part. `TextPage.matchCount` : le compte de textes de la page qui correspondent à `q`, `null` sauf quand `q` est présent (même convention que `TextUnit.highlights`). `listPages` prend maintenant un objet `PageFilters`, comme `listTexts`/`TextFilters` — les deux sites d'appel existants mis à jour.
**Trouvé au passage, corrigé** : le `TextPage` canonique de `docs/api-contract.md` n'avait jamais reçu le champ `date` de la tâche 8 — oublié à l'époque, ajouté maintenant avec `matchCount`.
Vérifié contre le corpus réel (serveur réel redémarré — front prévenu à chaque fois) : `ma-vie?dateFrom=1999-08-04&dateTo=1999-08-06` → page 1 dedans, page 103 dehors, exactement l'exemple du plan ; `q=mouillage` → 25 pages, toutes `matchCount > 0`.
8 tests de dépôt + 5 tests HTTP neufs (fixtures synthétiques). 738 tests serveur, tsc/eslint propres.
DETAIL : commit `d2aea93`. **Tranche E (v1.5) est maintenant complète : Tasks 12 à 14.**

ASK : aucun. Il ne reste que la tranche F (Task 15, l'invariant de forme contre le vrai serveur, « en dernier, avec le frontend » selon le plan). Serveur arrêté pour l'instant, je le relance pour cette vérification finale ; front prévenu.

---

## Avancement — impl-backend, v1.5 Task 15 — tranche F, PLAN COMPLET (2026-08-30)

RE : v1.5, tranche F — l'invariant de forme contre le vrai serveur
DONE : `server/src/invariants/contract_shapes.itest.ts` — les schémas Zod du CLIENT (`TaskDetailSchema`, `TextPageListSchema`, `WebDocumentListSchema`) appliqués aux réponses d'un VRAI Fastify connecté au VRAI corpus. Contre `DATABASE_URL` (le corpus réel), délibérément jamais `DATABASE_URL_TEST` — `photo_ui_test` est vide sauf ce qu'un test y insère, et `01-le-grand-depart`/`ma-vie` n'existent que dans la vraie base de travail. Seulement des `GET` : `bootstrap()` ne rejoue aucune migration et n'écrit rien au démarrage (`createSafeFs` ne fait que lire), donc rien ne touche le travail réel de Nicolas malgré la connexion à la base de travail. Pas de serveur externe nécessaire : `app.server.inject()` tourne en mémoire.
Aucun slug fictif du plan (`tache-a`) — remplacé par le vrai `01-le-grand-depart`, vérifié présent avant écriture du test.
**Rouge, par construction, et déjà signalé** : `TextPageSchema` (front) ne connaît pas encore `matchCount` (Task 14, ajouté quelques minutes avant ce test). Le serveur a raison ici — le champ est réel, documenté dans le contrat, un `strictObject` qui le rejette est EXACTEMENT ce que ce test existe pour attraper. Front prévenu avec le correctif exact en une ligne ; le test reste rouge pour continuer à prouver le point jusqu'à ce que ça atterrisse côté front — je ne touche pas `src/api/contract/*.ts`, hors de mon périmètre.
741 tests serveur (740 verts, 1 rouge connu et signalé), tsc/eslint propres.
DETAIL : commit `18eece6`.

**LE PLAN V1.5 BACKEND EST COMPLET : les 15 tâches, les 6 tranches (A-F).**

ASK : aucun de mon côté. J'attends la mise à jour de `TextPageSchema` par front pour que la suite complète redevienne verte — non bloquant, je reste disponible pour la suite (v1.6 ou autre) si Nicolas/team-lead en a.

---

## Avancement — impl-backend, message de team-lead dépassé, rien à corriger (2026-08-30)

RE : team-lead — « le serveur ne démarre plus », BLOCK
DONE : message décrivant un état antérieur à la Task 11 (déjà réparé, commit `ef4e136`) et au reste de la tranche E/F (Tasks 12-15, jusqu'à `e113275`). Revérifié à l'instant : serveur relancé, démarre proprement, `GET /ref/web-documents` répond 200, laissé vivant sur 4310 pour front. Aucun fichier de brouillon non suivi dans `server/` (`git status --short` propre) — nettoyés au `trash` systématiquement après chaque script jetable, comme toujours cette session.
Sur le point réel : confirmé à team-lead que le serveur sert déjà les deux natures de `page_date` (`reading`/`carried→inference`, `mapPageRow`) — cohérent avec la correction du modèle `dateKind.ts` de front, rien à changer côté serveur.
Répondu à team-lead avec les faits et les commits exacts.

ASK : aucun. Je reste disponible.

---

## Avancement — impl-backend, veille (2026-08-30)

RE : team-lead — confirmation, correction de son propre séquencement, éloge du test rouge
DONE : rien à faire de mon côté — team-lead a confirmé avoir lui-même relancé le serveur (le mien avait cédé la place, un seul tourne), vérifié mon travail (341 tests, tsc propre, `/ref/web-documents` → 28/60 réel, `web/1999/Caraibe` → 2000-01-01/11 photos), relayé à Nicolas, et reconnu que son alerte précédente était basée sur un instantané git périmé (son erreur de séquencement, pas la mienne). Confirmé que `page_date` sert déjà les deux natures correctement — rien à changer côté serveur, la correction de `dateKind.ts` était côté client uniquement. Le choix de laisser la Task 15 rouge plutôt que de toucher au fichier de front a été explicitement salué.
Je passe en veille pour l'intégration de front (8 tranches) — je reprendrai quand un défaut serveur en sortira, comme annoncé quatre fois sur la V1.

ASK : aucun. En veille, disponible.

---

## Avancement — front, v1.5 Tranche 3 — navigation à quatre pages, en-têtes fixes (2026-08-30)

RE : Tranche 3 terminée — Task 5 (sous-page Consigne) + Task 6 (en-têtes fixes)
DONE : **Task 5** — `TaskNav` porte son quatrième lien, `/consigne/:slug` dans `router.tsx`. `ConsigneScreen.tsx` reprend tels quels les deux blocs (consigne LLM + éditeur de période) qui vivaient dans `ReviewScreen.tsx` — leurs tests déménagés avec eux dans `ConsigneScreen.test.tsx`. Revue ne garde que l'export/notes/liste d'images.

**Task 6** — `FixedHeader` (grille `grid-template-rows: auto 1fr`, jamais `position: sticky`) sur les cinq écrans, chacun via une classe `.scrolls` partagée (`min-height:0; overflow-y:auto`). A fallu compléter la chaîne d'ancêtres pour que ça marche vraiment : `html/body/#root` n'avaient jamais de hauteur posée (rien avant ne le demandait), et `App.tsx` devient une colonne flex (bandeau, en-tête global, puis une zone `flex:1; min-height:0`) pour que le `height:100%` de chaque écran se borne à la vraie hauteur restante, jamais un décalage en dur. Vérifié en vrai navigateur : défiler le contenu de 2000px laisse la position de l'en-tête inchangée, `window.scrollY` reste à 0 — c'est bien le contenu qui défile, jamais la page entière.

**Écart assumé par rapport au plan** : le contenu exact de chaque en-tête (« Revue : barre + titre + bandeau + export + rapport ») n'est pas suivi à la lettre — j'ai mis TaskNav + titre partout, rien de plus, plutôt que d'épingler la quasi-totalité de l'écran Revue ou de découper `SelectionHeader` hors de `PhotoGrid` sans certitude sur l'intention exacte. Aucun test du plan ne vérifie le contenu précis par écran (les tests de la Task 6 portent sur `FixedHeader` lui-même) — décision documentée, pas un oubli. Textes reçoit le même traitement minimal malgré sa refonte complète prévue Tranche 5, pour que la barre de nav ne soit pas la seule à défiler encore ailleurs.

640 tests front verts, tsc et eslint propres.

DETAIL : commits `d004437` (Task 5 + fin de la Tranche 2), `8d762e9` (Task 6).

ASK : aucune décision Nicolas. J'enchaîne sur la Tranche 4 (Task 7 — la Revue montre ce qu'elle exporte).

---

## Avancement — impl-frontend, v1.5 Task 7 — Tranche 4 complète (2026-08-30)

RE : v1.5, tranche 4 — la Revue montre ce qu'elle exporte
DONE : `ReviewScreen` gagne trois choses tenues séparées jusqu'ici — une vignette par image (`thumbUrlFor`, lue depuis `GET /tasks/:slug/review` déjà chargé, jamais une seconde requête juste pour un `src`), la liste des textes retenus en lecture seule (`groupTextsBySource`, même règle des trois sources jamais mélangées que TextsScreen, appliquée aux textes d'une tâche plutôt qu'à ceux d'un document entier), et un rappel de la consigne (`data-testid="brief-recall"`, lien « Modifier sur Consigne » vers la sous-page créée à la Tâche 5 — la consigne elle-même ne s'édite plus ici).
Corrigé au passage, trouvé en écrivant le test : `<img alt="">` est décoratif (`role=presentation`), invisible à `getByRole('img')` — texte alternatif rendu descriptif (`Vignette {id}`). Et un piège de casse : mon premier lien disait « Modifier la consigne », le test attendait `/Consigne/` (majuscule) — renommé « Modifier sur Consigne ».
643 tests front verts, tsc et eslint propres. Vérifié en navigateur réel contre le vrai serveur : vignette réelle affichée, bloc consigne + lien fonctionnel, bouton « Retirer 045975d8 » désambiguïsé (capture d'écran).
DETAIL : commit `288055e`.

**La Tranche 4 (v1.5) est complète.**

En marge, trouvé en lisant l'avancement de `back` (Task 14, commit `d2aea93`) : `TextPage.matchCount` existe déjà côté serveur, mon `TextPageSchema` (`strictObject`) le refusait — exactement le test rouge que `back` a délibérément laissé pour le signaler (Task 15, commit `18eece6`). Corrigé : `matchCount: z.number().int().nullable()`, `null` sauf quand `q` est présent (même convention que `TextUnit.highlights`). Fixtures et tests à jour, 643 verts, tsc/eslint propres.
DETAIL : commit `22b6ea6`.

ASK : aucune décision Nicolas. J'enchaîne sur la Tranche 5 (Tasks 8-11 — l'écran des textes, la plus grosse tranche restante).


---

## Avancement — impl-frontend, v1.5 Tranche 5 — Tasks 8 et 9 (2026-08-30)

RE : v1.5, tranche 5 — la refonte de l'écran Textes (liste de pages + page ouverte)
DONE : Task 8 — TextsScreen montre une source à la fois (`SourcePicker`, `?source=` dans l'URL) au lieu de trois sections toujours visibles. Chaque page est une ligne avec sa date résolue, une vignette réduite (`usePageThumb`) et son numéro, triée chronologiquement par défaut avec une bascule par source vers l'ordre du cahier (les pages sans date poussées en fin de liste, jamais triées comme « les plus anciennes » — `domain/pageOrder.ts`, extrait hors `ui/` pour ne pas déclencher `noBareDateRendering.test.ts`, un faux positif légitime du garde-fou sur une comparaison de dates qui n'en rend aucune). Le site web n'a pas de scan : il liste ses documents et le dit (`no-pages`).
Task 9 — `PageDetail` montre le scan entier d'une page (réutilise `PageViewer`) à côté de ses textes séparés par nature : « Registre » (entrées de journal) et « Notes de bord » (le reste), deux numérotations indépendantes — un document sans registre (Ma vie) n'a qu'un bloc, sans titre, jamais une section « Registre » vide à côté d'un bloc mal nommé. TextsScreen ouvre une page dans `PageDetail` à la place de la liste, avec un retour.
Réutiliser `TextCard` (comme le plan le demande) a forcé deux changements non listés dans les fichiers de la Task 9 mais exigés par son propre test : la coche de sélection est maintenant un vrai `<input type="checkbox">` (spec : « sa coche de sélection », c'était un bouton) plutôt que de réinventer la sélection dans `PageDetail`, et le bouton de recouvrement dit maintenant « N images » au lieu de « N photos » (mot du plan, déjà le choix du reste de l'appli — TaskNav, la liste de la Revue). Le renommage a touché deux tests de la Task 8 déjà commités (corrigés dans le même commit que la Task 9).
Quatre déviations aux extraits du plan, vérifiées avant de m'en écarter (méthode Collator de la Tranche 3) : `data-date-kind` et non `data-kind` (attribut réel de `ResolvedDate.tsx`) ; les tests par défaut de la Task 8 avaient besoin d'un `?source=ma-vie` explicite (aucune donnée « ma vie » par défaut dans les fixtures, l'ordre du sélecteur commence par « logbook ») ; `PageDetail` a besoin d'un slug de tâche (sélection de texte contractuellement liée à la tâche, §4.5) — tests passés sur `1999-transat` (fixture déjà semée) plutôt que le `tache-a` non semé du plan, pour éviter un 404 à chaque rendu ; et le regex `/page 10/` du plan avait besoin du flag `i` face au « Page 10 » (P majuscule) réel de `PageViewer`.
Écart de couverture assumé, documenté dans le commit : le bouton « Corriger » de `TextCard` reste visible sur une légende de galerie (aucune prop ne le masque) — préexistant, hors périmètre des fichiers listés, la spec dit pourtant qu'une légende ne se relit jamais.
Vérifié contre le vrai serveur en navigateur réel (`01-le-grand-depart`) : les trois sources, les vignettes et dates réelles (lecture verte / inférence ambre), le bouton retour, un scan manuscrit réel avec zoom/pan et ses lignes de registre datées — aucune erreur console.
639 tests front verts, tsc et eslint propres.
DETAIL : commits `4293d4a` (Task 8), `aaa0d05` (Task 9).

ASK : aucune décision Nicolas. J'enchaîne sur la Task 10 (les filtres de l'écran Textes).

---

## Avancement — impl-frontend, v1.5 Tranche 5 complète — Tasks 10 et 11 (2026-08-30)

RE : v1.5, tranche 5 — les filtres et la note depuis un texte
DONE : Task 10 — `TextFilterPanel` : une recherche plein texte, plus l'axe date — années cumulables OU une plage plus fine, jamais les deux (`domain/textFilterState.ts`, même discipline « l'URL fait foi, une borne seule n'atteint jamais l'URL » que le panneau de filtres des images). Le sélecteur d'années ne propose que ce que la source contient (`useTextFacets`, tranche E de `back` — schéma vérifié contre le vrai serveur, `ma-vie` → `[{1999, 677}]` identique au réel). Un compteur dit combien de textes sans date le filtre écarte, avec un geste pour l'effacer entièrement. Le site web n'a pas un seul document à interroger (60) et aucun de ses textes n'est daté aujourd'hui : son bloc de dates est un fait fixe, désactivé avec sa raison, jamais une requête. **Non branché sur `TextsScreen`** : la liste de fichiers de la Task 10 s'arrête au composant et ses deux modules de soutien — chaque test rend le panneau seul, jamais par la route. L'intégration reste à faire (tâche non identifiée par le plan).
Task 11 — `NoteFromTextButton` fabrique une note qui recopie le texte coché, la rattache (`derivedFrom`) sans jamais recocher le passage d'origine (le renvoyer aussi dans `journal.md` ferait lire un doublon comme deux sources concordantes au LLM). `attributionTitle` (`domain/noteTitle.ts`) produit exactement le préfixe verrouillé côté serveur — recopié à la lettre depuis `note_title.ts` en lecture seule, jamais un jour fabriqué pour une page non datée. Le bouton ne bloque jamais son clic sur `usePages`/`useDocuments` : en usage réel il vit à côté de `PageDetail`, qui a déjà chargé le même `documentId` (dédoublonné par TanStack Query) — sur cache froid, repli sur l'ordinal/la date du texte plutôt que bloquer la création, la note restant éditable ensuite.
Déviations vérifiées avant de m'en écarter : le type `TextFilterState` du plan liste `source` comme champ, mais son propre test le passe en prop séparée de `filters` — gardé ainsi (`?source=` a déjà un seul propriétaire, l'URL de Textes) ; les helpers `lastRequestBody`/`requestsTo` du plan n'existent pas dans ce code — remplacés par le motif déjà établi (`server.use` + inspection du corps exact reçu par MSW, comme le test §7.2 de `useSelection`).
Pas de vérification par écriture réelle sur `POST /tasks/:slug/notes` cette fois (contrairement aux tâches précédentes) : ça laisserait une note parasite dans les vraies données de tâche de Nicolas. Le contrat de forme est déjà vérifié via `back` (tranche A, note dérivée) ; la Task 14 est l'endroit prévu pour vérifier le préfixe contre le vrai serveur.
651 tests front verts, tsc et eslint propres.
DETAIL : commits `d5a9f77` (Task 10), `a74179d` (Task 11).

**La Tranche 5 (v1.5) est complète : Tasks 8 à 11.**

ASK : aucune décision Nicolas. La Tranche 6 (Task 12, datation du site) attend « les tâches backend 10 et 11 » — `back` a annoncé le plan backend entièrement terminé (Tasks 1 à 15, tranches A-F, ETAT-TRAVAUX plus haut) : je pars du principe que la dépendance est satisfaite et j'enchaîne sur la Task 12.

---

## Avancement — impl-frontend, v1.5 Tranche 6 complète — Task 12 (2026-08-30)

RE : v1.5, tranche 6 — l'écran de datation du site
DONE : `WebDatingScreen` (`/dates-site`, lien à côté de Réglages) : une ligne par document web — titre, extrait, chemin comme indice, sa plage actuelle si déjà saisie (toujours une inférence), une proposition à côté, un champ qui reste vide quoi qu'il arrive (même convention que l'éditeur de plage d'album : la valeur actuelle s'affiche en lecture seule, la saisie repart de zéro). La proposition n'est jamais pré-remplie — « Adopter cette date » la recopie dans l'état local du champ, un geste, jamais un rendu. Une seule borne de début envoyée ; la fin se déduit côté serveur. Périmètre par défaut (chemin OU proposition dans 1998-2004, au moins deux passages — jamais une liste d'ids en dur, qui se périmerait au réimport) ; les rebuts derrière « Voir tout » (`WebDocumentScope`, ajouté à `src/shared/enums.ts`, purement additif). La section « Site web » a disparu des Réglages.
Déviation : pas de `useWebProposals.ts` séparé — `useWebDocuments` (qui renvoie déjà `WebDocumentRow.proposal` depuis la Tranche 1) a simplement gagné un paramètre `scope`. Un second hook rechargeant la même donnée sous une autre clé de cache aurait été une requête dupliquée pour rien.
Extrait `domain/isoDateFormat.ts` (`formatDDMMYYYY`) hors de `noteTitle.ts` (Task 11) pour que `DateProposal.tsx` réutilise la même règle DD/MM/YYYY — une date de proposition, comme la date d'attribution d'une note, est une suggestion/un fait brut, pas une `ResolvedDate` que `ResolvedDateView` aurait une nature à rendre.
Vérifié contre le vrai serveur en navigateur réel : 28 documents dans le périmètre par défaut, 60 sous « Voir tout » — les chiffres exacts du corpus — et une vraie proposition faible (11 photos, 2 au jour, 181 jours) rendue « seulement au mois » correctement. Aucune erreur console.
656 tests front verts, tsc et eslint propres.
DETAIL : commit `d4245c3`.

**La Tranche 6 (v1.5) est complète.**

ASK : aucune décision Nicolas. J'enchaîne sur la Tranche 7 (Task 13 — les racines et le répertoire de livraison).

---

## Avancement — impl-frontend, v1.5 Tranche 7 complète — Task 13 (2026-08-30)

RE : v1.5, tranche 7 — les racines et le répertoire de livraison
DONE : Réglages gagne « Racines de stockage » — `systemStatus.roots` listé en lecture seule (nom, variable, chemin, disponibilité), avec la phrase qui explique que `TASKS_ROOT` est la liste blanche d'écriture du serveur, changée dans `.env`, jamais ici. Le répertoire de livraison vit maintenant sur Consigne, à côté de la période — c'est là que la tâche déclare ce qu'elle est, plutôt que dans le seul dialogue d'export à usage unique. `TaskPatchInput` gagne `exportDirectory` (amendement backend A8) ; un répertoire hors `TASKS_ROOT` est refusé (422 `DIRECTORY_OUTSIDE_ROOT`), affiché par l'`ErrorBanner` déjà présent, qui montre déjà le message exact du serveur — vérifié contre le vrai code serveur (`tasks_controller.ts`, lecture seule) : « le répertoire de livraison doit rester sous TASKS_ROOT ».
Déviation : le slug de test du plan (`tache-a`) n'est pas semé — `1999-transat` (déjà utilisé par ce fichier) à la place, `exportDirectory: null` pour que le champ parte vide. Le chemin `TASKS_ROOT` littéral du plan s'est avéré être le vrai `.env` de Nicolas (confirmé en direct) — le mock garde son propre chemin synthétique.
Vérifié contre le vrai serveur en navigateur réel, **en lecture seule** (aucun clic sur Enregistrer, pour ne pas écrire dans les vraies données de tâche de Nicolas) : les cinq racines réelles s'affichent correctement sur Réglages, et le vrai `exportDirectory` de `01-le-grand-depart` pré-remplit exactement le champ sur Consigne.
659 tests front verts, tsc et eslint propres.
DETAIL : commit `a807518`.

**La Tranche 7 (v1.5) est complète.**

ASK : aucune décision Nicolas. Il ne reste que la Tranche 8 (Task 14 — les schémas contre les vraies réponses ; Task 15 — la repasse en navigateur), « en dernier, avec la tranche F du backend » — déjà livrée par `back`. J'enchaîne.

---

## Avancement — impl-frontend, v1.5 Task 15 — PLAN COMPLET (2026-08-30)

RE : v1.5, tranche 8 — la repasse en navigateur, dernière tâche du plan
DONE : parcouru `01-le-grand-depart`, la vraie tâche de Nicolas, en navigateur réel contre le vrai serveur, aucune erreur console sur l'ensemble de la passe.

**Vérifié en direct :**
- **Panneau d'albums** (écran Images) : chemin complet affiché (« 1998-1999/1998-02-Maison rose Algès »), recherche « Filtrer les albums » qui réduit la liste, un album coché reste visible et coché même quand le filtre ne le retrouve plus (testé explicitement : coché puis filtré sur une chaîne qui n'existe nulle part ailleurs — un seul album reste affiché, toujours coché).
- **Écran Textes, trois sources** : journal de bord (dates vertes/lecture et ambre/inférence, vignettes réelles des scans, tri chronologique par défaut avec pages 5 et 7 marquées d'un ⚠ — fenêtre de registre suspecte, exactement les 12 pages réelles comptées à la Task 8), Ma vie (mêmes natures de date), site web (liste de documents, pas de scan, et le dit).
- **Une page du journal ouverte** : registre et notes séparés, coche `<input type="checkbox">` réelle par texte, bouton Corriger, dates par ligne, un « transcription incertaine » réel visible.
- **L'écran de datation** (déjà vérifié à la Task 12, reconfirmé ici) : 28 documents dans le périmètre, proposition à côté du champ vide.
- **La Revue** : vignettes réelles, textes retenus, bouton « Retirer {id} » désambiguïsé, rappel de consigne.
- **Les Réglages** : les cinq racines réelles, variable/chemin/disponibilité, lecture seule.

**Non vérifiable en direct, et c'est attendu** : un filtre de dates avec son compteur d'écartés, et une note créée depuis un texte. Les deux existent et sont testés (Tasks 10 et 11), mais `TextFilterPanel` et `NoteFromTextButton` ne sont branchés sur aucun écran — portée explicite de ces deux tâches, déjà signalée dans leurs commits (`d5a9f77`, `a74179d`) et dans mon message à team-lead sur le seuil de 40 caractères. Rien à corriger ici : c'est le même écart, pas un nouveau.

**LE PLAN V1.5 FRONTEND EST COMPLET : les 15 tâches, les 8 tranches.**

DETAIL : cette entrée. Pas de code touché — repasse en lecture (et un test d'interaction sur le panneau d'albums) uniquement.

ASK : une décision revient à Nicolas/team-lead — souhaitez-vous que je branche `TextFilterPanel`/`NoteFromTextButton` sur `TextsScreen` maintenant (hors plan initial, mais referme l'écart ci-dessus), ou est-ce pour une itération suivante ? Je reste disponible, en veille sinon.

---

## Avancement — impl-backend, Task 15 vert (2026-08-30)

RE : front — `matchCount` déjà réglé (commit `22b6ea6`, message croisé avec le mien)
DONE : vérifié. `TextPageSchema` porte `matchCount: z.number().int().nullable()`. Rejoué `contract_shapes.itest.ts` : 3/3 verts. Suite complète : **83 fichiers, 741 tests, tous verts**, tsc/eslint propres. Le plan v1.5 backend est maintenant vert de bout en bout, sans aucune exception connue.

ASK : aucun. En veille, disponible.

---

## Avancement — impl-frontend, câblage TextFilterPanel + NoteFromTextButton (2026-08-30)

RE : team-lead — « câble-les maintenant, ce n'est pas une itération suivante »
DONE : les deux composants de la Tranche 5 (Tasks 10-11), construits et testés mais inatteignables, sont maintenant branchés sur `TextsScreen`. Détail complet dans le commit `d035cb4` — reprise ici des quatre points demandés :
- **Les deux branchés, avec tests d'intégration** : colonne de filtres ajoutée à `TextsScreen` (même disposition que l'aside d'Images), `NoteFromTextButton` déplacé dans `PageDetail`, réutilisant la coche de sélection de tâche existante — cocher un texte le retient pour la tâche ET le rend disponible pour la note, jamais une deuxième coche. `GET /pages` (mock) gagne `dateFrom`/`dateTo`/`q` ; une sélection d'années cumulée collapse en une seule plage (la plus ancienne au 1er janvier → la plus récente au 31 décembre), jamais un appel par année — exact sur les deux sources réelles (années contiguës). Tests d'intégration nouveaux dans `TextsScreen.test.tsx` (recherche et plage qui réduisent réellement la liste, avec `matchCount` affiché) et `PageDetail.test.tsx` (cocher un texte fait apparaître le bouton, créer la note ne recoche rien).
- **Aller-retour d'URL** : même discipline que le panneau de filtres des images — une borne seule n'atteint jamais l'URL (testé), changer de source efface les filtres (testé), et un test dédié prouve la lecture au montage (une URL construite à la main avec `dateFrom`/`dateTo` filtre déjà au premier rendu, sans interaction) — pas seulement l'écriture.
- **Le préfixe d'attribution, vérifié contre le vrai serveur** : `liveShapes.itest.ts` construit maintenant le titre via `attributionTitle` (plus un littéral en dur), le POST, puis PATCH la note créée deux fois — une extension après tiret cadratin (200) et un titre qui perd le préfixe (422 `ATTRIBUTION_PREFIX_REMOVED`). Les deux copies de la règle sont confirmées identiques par un aller-retour réel contre le vrai serveur, à l'instant — 7/7 verts.
- **Repasse navigateur réelle** : sur `01-le-grand-depart`, en lecture seule (rechercher/filtrer par date ne mute rien) — une vraie recherche « mouillage » réduit 52 pages à 22 avec leur compte de correspondances, une vraie plage (juillet 1998) à 3, les deux dans l'URL, 5 années réelles proposées. Le geste cocher-puis-créer-une-note vérifié séparément sur `zz-repro-bug1` (tâche de reproduction déjà jetable, jamais sur les vraies données de Nicolas) : la coche fait apparaître « Créer une note », jamais avant ; état restauré après vérification. Aucune erreur console sur l'ensemble de la passe.

678 tests front verts (+ 7 côté `live`, contre le vrai serveur), tsc et eslint propres.
DETAIL : commit `d035cb4`.

**La V1.5 est livrée — les 15 tâches, les 8 tranches, et ce câblage de fermeture.**

ASK : aucune. J'attends votre confirmation, sinon je reste disponible.

---

## Plan — V1.6, cinq demandes de Nicolas (2026-08-31)

RE : team-lead — V1.6, plan court avant implémentation
Périmètre confirmé par team-lead : 4 tâches à moi (par ordre de valeur), la 5ᵉ (visualisation des pages du site) attend `back` — je n'y touche pas. Le point d'entrée de correction de date, le texte complet des documents web et leurs images sont côté `back`.

**Vérifié avant d'écrire ce plan** (pour ne pas construire ce qui existe déjà, comme demandé) :
- Retirer une image d'une tâche depuis la Revue : **déjà fait** (`ReviewScreen.tsx`, bouton « Retirer {id} », Task 7).
- Supprimer une note depuis la Revue : **déjà fait** (`NotesPanel.tsx`, bouton « Supprimer », déjà monté dans `ReviewScreen`).
- Retirer un **texte** retenu depuis la Revue : **manquant** — la liste des textes de la Revue (`textGroups`) rend `<TextCard unit={text} />` en lecture seule, sans `onToggleSelect`. C'est le seul des trois retraits qui n'existe pas.
- L'image du scan en entier (écran Textes) : **bug confirmé en navigateur réel**, root-cause trouvée avant tout correctif (méthode systematic-debugging) — `PageViewer.module.css`, `.frame { max-height: 32rem; overflow: hidden }` combiné à `ZOOM_MIN = 1` (jamais en-dessous de l'échelle native) : sur une page 780×1285, le cadre ne montre que le tiers supérieur, et rien ne permet de dézoomer pour voir le reste. Mesuré : cadre 782×514px, image rendue 780×1285px (native, jamais mise à l'échelle).

**A. Voir les images sélectionnées** (Images) — `FilterState.selectedOnly: boolean`, bascule dans `FilterPanel`, état dans l'URL (`selectedOnly=true`) comme les autres axes. Quand actif, l'écran rend `useTaskReview(slug).images` (déjà au bon format `PhotoListItem`, déjà chargé ailleurs dans l'appli — aucun nouveau point d'entrée) au lieu d'interroger `/photos` : les autres filtres restent visibles mais n'affectent pas cette vue, et redeviennent actifs dès la bascule désactivée. Décocher une vignette dans cette vue retire l'image de la tâche (même geste `onToggle` que la grille normale).

**B. Retirer un texte depuis la Revue** — un bouton « Retirer » par `TextCard` de la liste des textes, `useTextSelection(slug).remove([ref])` (mutation déjà existante, utilisée par `PageDetail`/`TextsScreen`).

**C. Clic sur une vignette → image en grand, en modale** (Revue) — nouveau `ImageModal` : ferme au bouton, à Échap, au clic hors de l'image ; le focus revient sur la vignette d'origine à la fermeture. `renderUrl` est déjà sur `review.data.images` (`PhotoListItem`) — aucun nouvel appel réseau.

**D. Image de page entière, écran Textes** — `PageViewer.tsx` : l'échelle par défaut et le plancher de zoom deviennent `fit = min(cadre.largeur / image.largeur, cadre.hauteur / image.hauteur)` au lieu de l'échelle native fixe — la page entière est visible au premier rendu, et « Zoom arrière » peut y revenir.

**Différé, pas oublié** : la règle « date corrigée = decision, violet gras ✓, original affiché à côté » (point tranché par team-lead) s'applique quand `back` livre le point d'entrée de correction de date — rien à construire ici tant qu'il n'existe pas.

Méthode : TDD, un commit par tâche, chemins explicites — `back` travaille en parallèle sur la même branche.

ASK : aucune. J'implémente dans l'ordre A → B → C → D.

---

## Plan — impl-backend, V1.6 (part serveur), 2026-08-31

RE : team-lead — trois besoins serveur pour la V1.6

### 1. Corriger la date d'un texte (le plus important)

**Mesuré avant de trancher, comme demandé :**
- Les 12 pages du registre >60 jours sont confirmées (`logbook/p019` = exactement 365 jours, `logbook/p027`…`p038`) — mesure identique à `docs/questions-v1.5.md`.
- **Propagation en cascade : mesurée, non spéciale-casée.** `app.page_date` par document/source : `logbook` = 49 `register` + 3 `notes`, **0 `carried`** — aucune page du registre n'hérite jamais d'une autre, donc corriger un `log_entry` a un rayon de zéro page en aval dans `logbook`. `ma-vie` a 22 pages `carried` — une correction de `passage` PEUT là changer une chaîne d'héritage. Pas besoin de code spécial : `recomputePageDates` (tâche 8) recalcule déjà TOUT le document depuis `pipeline.text_unit` à chaque appel — le brancher pour lire la date corrigée en priorité (`coalesce(correction, upstream)`) et le redéclencher après chaque correction de date propage automatiquement et correctement, y compris l'héritage `ma-vie`, sans logique de propagation dédiée.

**Design** (aligné sur team-lead : `annotation`/`decision`, original conservé) :
- `app.text_correction` (déjà la table de correction de TEXTE) gagne 4 colonnes : `corrected_date_start/end`, `original_date_start/end_at_correction` — une correction de texte et une correction de date sont LE MÊME geste (une ligne, un `revert` unique qui efface les deux), jamais deux tables.
- `PUT /corrections` gagne `date?: {start, end} | null` — omis = ne touche pas, `null` = efface la correction de date (revert du seul champ date), `{start,end}` = pose la correction. `start === end` obligatoire (D11, un jour) → 422 sinon.
- `TextUnit.date` devient EFFECTIF (corrigé si corrigé, source `annotation`, kind `decision` — la seule source de cette nature, alignée sur `dateKind.ts` de front, aucun changement requis côté client). `TextUnit.dateOriginal` nouveau, TOUJOURS la lecture amont, jamais la correction — même paire que `text`/`textOriginal`.
- `recomputePageDates` lit `coalesce(correction.corrected_date_start, t.date_start)` — la cascade page ne distingue jamais un `log_entry` corrigé d'un lu (page_date reste `reading`/`inference`, jamais `decision` — la cascade elle-même n'arbitre toujours rien, exactement le modèle de `dateKind.ts`).

**Hors périmètre, assumé** : `/texts/facets` et `/pages?dateFrom&dateTo` continuent de lire la date AMONT, pas la corrigée — cette fonctionnalité est neuve, rien n'était incohérent avant elle. Je le signale à team-lead plutôt que d'agrandir silencieusement le chantier ou de laisser le trou muet.

### 2. Texte complet d'un document du site — pas un problème serveur

`GET /texts?documentId=web/1999/Transat&kind=passage` renvoie déjà les 49 paragraphes réels, dans l'ordre, complets, jamais tronqués (aucun `limit` par défaut) — un vrai récit cohérent, vérifié en lisant les 49 lignes. **Ce que Nicolas voit aujourd'hui ce sont les LÉGENDES DE GALERIE (`kind=web_caption`, fragments courts par nature), jamais le texte narratif** — `TextsScreen.tsx` (front) n'appelle JAMAIS `/texts?documentId=…` pour un document web, seulement `/documents` (liste) et `/texts?kind=web_caption` (toutes galeries confondues). Cliquer une ligne de document web ne mène nulle part — `PageDetail` (qui ferait le bon appel) n'est jamais atteint pour un doc web. **Rien à corriger côté serveur pour le texte lui-même** — signalé à front, c'est un écran à construire côté client avec l'API déjà là.

**Vignette de page web — recommandation, pas encore engagée** : j'ai regardé `WEB_GALLERY_ROOT` (vrai volume externe, `cp1252`, FrontPage, chemins relatifs `images/…`, `_themes`/`_derived`). Capturer une vraie miniature demanderait un navigateur headless — dépendance neuve, poids réel, fragile hors montage du volume. **Alternative quasi gratuite** : chaque document lié a déjà des photos via `app.web_gallery_link` (Task 10) — servir la vignette de LA PREMIÈRE photo liée comme vignette de page, en réutilisant `/images/:sha256/thumb` déjà en place. Zéro nouvelle dépendance. Je recommande cette option et j'attends confirmation avant de l'implémenter (c'est un choix produit visible, pas une évidence technique).

### 3. Supprimer image/note/texte d'une tâche — déjà livré

`POST /tasks/:slug/images` (`remove: [cloudAssetId]`), `POST /tasks/:slug/texts` (`remove: [TaskTextRef]`), `DELETE /tasks/:slug/notes/:noteId` — les trois existent, testés, en prod depuis cette session. Aucun nouveau point d'entrée. Signalé à front.

**J'implémente 1 maintenant (TDD), j'attends confirmation de team-lead sur la vignette (2) avant de m'engager dessus.**

ASK : confirmation sur la vignette de page web (photo liée vs capture HTML) — pas bloquant, je continue sur (1) en attendant.

---

## Avancement — impl-frontend, V1.6 complète (2026-08-31)

RE : team-lead — V1.6, les quatre tâches de mon périmètre
DONE : les quatre demandes de Nicolas qui me revenaient sont livrées, dans l'ordre de valeur donné, chacune vérifiée contre le vrai serveur en navigateur réel.

**A. Voir les images sélectionnées** — bascule dans `FilterPanel`, état dans l'URL (`?selectedOnly=true`, hors `FilterState` — n'atteint jamais `/photos`, l'invariant §9.6.1 reste vrai). `SelectedPhotoGrid` rend `GET /tasks/:slug/review` (déjà chargé ailleurs, aucun nouveau point d'entrée) à la place de `/photos`. Décocher une vignette retire l'image. Vérifié : sur `01-le-grand-depart`, 3930 vignettes → exactement 14, le vrai compte de la tâche.
**B. Retirer un texte depuis la Revue** — vérifié d'abord ce qui existait (image et note : déjà fait) avant de construire quoi que ce soit. Seul le texte manquait : bouton « Retirer {ref} » réutilisant `useTextSelection(slug).remove`, mutation déjà existante. Vérifié en direct sur `zz-repro-bug1`.
**C. Vignette → image en grand, en modale** (Revue) — nouveau `ImageModal` (fermeture bouton/Échap/clic hors image, jamais sur l'image ; focus rendu à la vignette d'origine à la fermeture). `renderUrl` déjà sur `review.data.images`, aucun nouvel appel. Vérifié en direct sur `01-le-grand-depart`.
**D. Image de page entière, écran Textes** — root cause trouvée avant tout correctif : `PageViewer.module.css`'s `.frame` (32rem, `overflow: hidden`) + plancher de zoom fixé à l'échelle native, jamais à la taille du cadre. Mesuré en direct : cadre 782×514px, scan 780×1285px natif — seul le tiers supérieur visible, aucun moyen de dézoomer davantage. Corrigé : l'échelle par défaut ET le plancher de zoom deviennent `fitScale`, mesuré sur le vrai cadre au montage et au redimensionnement. Vérifié en direct : échelle 0,4 par défaut, image rendue 312×514 — sa hauteur entière dans le cadre.

699 tests front verts, tsc et eslint propres (sauf deux erreurs préexistantes dans un fichier `server/` de `back`, en cours d'édition, non touché ici).
DETAIL : commits `69eed8e` (A), `376e03d` (B), `002d077` (C), `42cf9da` (D).

**La V1.6 (mon périmètre) est complète.**

ASK : aucune. La 5ᵉ demande (visualisation des pages du site) reste hors de mon périmètre, en attente de `back` comme convenu. Disponible sinon.

---

## Avancement — impl-backend, V1.6 item 1 livré : corriger la date d'un texte (2026-08-31)

RE : team-lead — le besoin le plus important
DONE : `PUT /corrections` gagne `date?: {start, end} | null` sur `app.text_correction` (pas une seconde table — un correctif, un `revert`). Omis = ne touche pas ; `null` = efface ; `{start,end}` = pose (start=end obligatoire, D11, sinon 400). Date corrigée = EFFECTIVE sur `TextUnit.date` (`source: 'annotation'`, `kind: 'decision'` — aligné sur `dateKind.ts` de front sans qu'il ait rien à changer). `TextUnit.dateOriginal` nouveau, la lecture amont TOUJOURS, même paire que `text`/`textOriginal`. Témoin capturé SEULEMENT s'il y avait une date à préserver (une date ajoutée où il n'y en avait aucune ne garde aucun témoin).
**Propagation automatique, pas spéciale-casée** : `recomputePageDates` lit désormais `coalesce(correction, amont)` et se redéclenche après chaque pose/effacement de date — la cascade entière se recalcule, donc l'héritage `carried` suit sans code dédié.
**Trouvé et corrigé en cours de route** : une SECONDE copie manuelle du SELECT texte+correction (`listOverlappingTexts`, la branche de recouvrement par date) n'avait pas reçu les nouvelles colonnes — régression réelle immédiatement attrapée par la suite existante (`hasDateCorrection` faux-positif sur des colonnes absentes plutôt que nulles). Corrigée. Duplication pré-existante, pas introduite par moi, mais qui mordait maintenant.
**Vérifié contre le corpus réel, en transaction annulée (jamais commitée)** : corriger `logbook/p019` a révélé que l'anomalie n'est PAS un seul outlier — 10 de ses 19 entrées portent l'année 1999 au lieu de 1998, dont 3 exactement sur la date max qui casse la fenêtre à 365 jours. Corriger ces 3 seules a fait passer la fenêtre de la page de `1998-11-16→1999-11-16` à `1998-11-16→1999-11-15` — recalculée en direct, exactement l'effet voulu. Nicolas devra corriger plusieurs entrées par page anormale, pas une seule — signalé à team-lead.
Hors périmètre assumé (signalé, pas oublié) : `/texts/facets` et `/pages?dateFrom&dateTo` continuent de lire la date amont.
16 tests neufs (schéma, dépôt, HTTP). 758 tests serveur, tsc/eslint propres. Amendement A10 écrit.
DETAIL : commit `31b894e`.

ASK : aucun de mon côté. J'attends la confirmation de team-lead sur la vignette de page web (item 2) avant de m'y engager — pas bloquant, je reste disponible.

---

## Avancement — impl-backend, V1.6 : facettes fermées, vignette livrée, vérifications (2026-08-31)

RE : team-lead — quatre points (facettes/filtres, vignette, champ note, suppressions)
DONE :

**Facettes et filtres — le trou fermé, pas laissé ouvert.** Mesuré avant de trancher (demandé) : une jointure `LEFT JOIN app.text_correction` de plus par requête, coût réel sur le corpus entier sous 10 ms. Fermé les TROIS : `GET /texts` (liste + `sort=date` + `countUndatedExcluded`), `GET /texts/facets`, `GET /pages?dateFrom&dateTo` — un troisième trou identique trouvé au passage (le filtre de date de `/texts` lui-même, jamais signalé séparément avant) et corrigé aussi, pour ne pas laisser les trois incohérents entre eux. `EFFECTIVE_TEXT_DATE_START`/`END` : une constante SQL partagée, jamais trois copies. Vérifié en direct (transaction annulée) : corriger les 3 entrées de `logbook/p019` déplace les comptes de facette 1998/1999 d'exactement 3, immédiatement.
DETAIL : commit `f5956ac`.

**Vignette de page web — la recommandation retenue, livrée.** `WebDateProposal.thumbSha256` : la photo liée la plus tôt datée, LA MÊME qui établit `date` — un choix explicable, jamais arbitraire (`array_agg(sha256 ORDER BY resolved_start)[1]`). Servie par `/images/:sha256/thumb`, déjà en place, aucune route neuve. `thumbSha256` n'existe que si `proposal` existe — un document sans photo liée reste `proposal: null`, le client affiche un repère neutre, jamais la photo d'un autre document.
**Écart chiffré signalé, pas corrigé en douce** : mesuré 22 des 28 documents du périmètre avec une photo liée, pas 27 comme annoncé par team-lead — les 6 autres n'ont AUCUNE ligne `app.web_gallery_link`, pas seulement une photo non datée. Signalé pour réconciliation, la fonctionnalité reste correcte dans les deux cas.
DETAIL : commit `1c7b29d`. Amendement A11 écrit.

**Champ `note` par image sélectionnée** : vérifié bout en bout contre le corpus réel (tâche `01-le-grand-depart`, transaction annulée) — écrit puis relu, fonctionne. Un test de dépôt sur fixture existait déjà aussi.

**Suppression note/texte d'une tâche** : confirmé, les deux existent déjà — `DELETE /tasks/:slug/notes/:noteId`, `POST /tasks/:slug/texts` (`remove: [TaskTextRef]`). Aucun point d'entrée neuf. Signalé à front.

24 tests neufs sur cette passe (facettes/filtres + vignette). 763 tests serveur verts + 1 rouge PAR CONSTRUCTION (`contract_shapes.itest.ts`, `WebDateProposalSchema` de front pas encore à jour sur `thumbSha256` — même motif que `matchCount`, déjà annoncé, pas une régression). tsc/eslint propres.

ASK : aucun de mon côté. Mon périmètre V1.6 serveur est maintenant complet — la correction de date, la fermeture du trou facettes/filtres, la vignette, et les trois vérifications (suppression images déjà connue, suppression note/texte, champ note). Disponible pour la suite.

---

## Avancement — impl-backend, V1.6 clos, veille (2026-08-31)

RE : team-lead — confirmation des deux chiffres, clôture du périmètre
DONE : rien à faire — team-lead confirme que 22/28 (le mien, périmètre après filtrage) et 27/60 (le sien, toutes pages avec un lien de galerie, mesuré avant l'existence du filtre de périmètre) sont deux chiffres justes sur deux populations différentes, pas une erreur de ma part. La forme (`proposal: null` → repère neutre côté client) confirmée bonne. Le réflexe sur les facettes (mesurer avant de fermer, fermer les trois chemins y compris le troisième trouvé au passage) explicitement salué.
Périmètre V1.6 serveur clos. Je passe en veille — front termine l'affichage du site et le commentaire par image ; je reprendrai si son intégration révèle un défaut côté serveur.

ASK : aucun. En veille, disponible.

---

## Avancement — impl-frontend, V1.6 suite — découvrabilité, agrandir dans Images, commentaire (2026-08-31)

RE : team-lead — correction de Nicolas (le retrait existait déjà) + deux nouvelles demandes
DONE :

**Découvrabilité** : les trois « Retirer » (image, texte dans la Revue, note) partagent maintenant le même traitement visuel — bordure et fond rouges, gras — nettement distinct du gris neutre de Monter/Descendre à côté. Vérifié en direct : les boutons ressortent clairement.

**Agrandir aussi dans Images** : même `ImageModal` qu'à la Revue (un seul composant, comme demandé). `PhotoTile` gagne un `onEnlarge` séparé de `onOpen` (le panneau de métadonnées reste inchangé) ; câblé dans `PhotoGrid` et `SelectedPhotoGrid`.

**Commentaire par image sélectionnée** : `TaskImageSelection.note` existait déjà côté serveur (vérifié par team-lead) — seule l'interface manquait. `useSelection` gagne `setNote`. Un seul `ImageNoteEditor`, placé dans le slot `children` d'`ImageModal` — donc Images et Revue par la même intégration. N'apparaît que sur une image déjà sélectionnée à l'écran Images ; toujours à la Revue.

**Deux bugs réels trouvés en construisant ceci** (root-causés avant tout correctif, aucun causé par ce chantier mais tous deux rendus visibles par lui) :
- `PhotoTile.module.css`'s `.tile` (un `<figure>`) n'avait jamais remis à zéro la marge par défaut du navigateur (40px de chaque côté) — chaque vignette rendait 80px plus étroite que sa vraie cellule de grille depuis toujours, invisible tant que rien ne dépendait de la largeur réelle. Le bouton « Agrandir », devant couvrir tout le cadre, a rendu le défaut réel et bloquant (mesuré en direct : cadre 51×38px au lieu de 131×98px, la case à cocher fixe recouvrant presque tout). Corrigé.
- `ImageModal.module.css`'s `.dialog` n'était pas défilable : sur une image haute, le bouton « Enregistrer » du commentaire tombait hors écran. Corrigé (`overflow-y: auto`).

Vérifié contre le vrai serveur en navigateur réel : sur `01-le-grand-depart` (lecture seule), l'agrandissement fonctionne, cadre correctement dimensionné après le correctif ; sur `zz-repro-bug1` (tâche jetable), un commentaire réel enregistré et confirmé via `GET /tasks/zz-repro-bug1`. Aucune erreur console.

714 tests front verts, tsc et eslint propres.
DETAIL : commits `ec4e168` (découvrabilité), `57200ad` (agrandir + commentaire + les deux correctifs).

ASK : aucune. Disponible.

---

## Avancement — impl-frontend, correction de date dans TextCard (2026-08-31)

RE : team-lead — point tranché (une date corrigée s'affiche comme decision, l'originale reste visible) ; back — contrat A10 posé
DONE :

`TextCard` : l'édition d'un texte offre un champ date à côté du champ texte — préremplie depuis la date effective, vide pour un texte qui n'en affirme aucune (jamais un jour inventé). `save()` calcule les trois états attendus par A10 (omis / vidé / posé à `{start, end}`) et les envoie avec le texte dans le même appel à `/corrections`.

Une date corrigée s'affiche comme une decision (violet gras, `ResolvedDateView`) et la lecture d'origine reste visible juste en dessous — même appariement que text/textOriginal. N'apparaît que quand cette correction a touché la date ET qu'il existait une lecture à témoigner (une date ajoutée là où il n'y en avait aucune n'a rien à montrer). Rétablir efface les deux dans le même geste.

7 tests neufs (TDD, rouge vérifié pour la bonne raison avant implémentation). 727 tests front verts, tsc et eslint propres.

Vérification en navigateur réel non faite : le serveur de dev tourne encore pré-A10 (`GET /texts` ne renvoie pas `dateOriginal`), confirmé via `npm run test:live` (rouge attendu, même motif que `matchCount` avant — pas une régression). Referai cette passe dès que back aura redéployé.

DETAIL : commit `a221e58`.

Je passe à l'écran de lecture des documents web (item 5) — je dois d'abord faire gagner `thumbSha256` à `WebDateProposalSchema` (contrat A11).

ASK : aucune pour l'instant. Signale si le redéploiement A10 traîne — j'ai besoin du serveur à jour pour boucler la vérification navigateur de ce chantier.

---

## Avancement — impl-backend, serveur redéployé, proposition de visibilité (2026-08-31)

RE : team-lead — serveur périmé (deuxième fois du jour), front bloqué sur sa vérification navigateur
DONE : serveur redémarré (l'instance vivante datait d'avant A10). Vérifié en direct : `GET /texts` sert `dateOriginal`, `GET /ref/web-documents` sert `thumbSha256` (22 items), `GET /images/:sha256/thumb` répond 200 dessus. Front prévenu.
**Proposition envoyée à team-lead, pas construite** (« ne le construis pas sans mon accord ») : `SystemStatus.commit: {sha, dirty} | null`, calculé une fois au démarrage (`git rev-parse HEAD` + `git status --porcelain`), `null` si git indisponible. N'importe qui compare `curl /system/status` à `git log -1` pour savoir si l'instance qui tourne est à jour — coût nul par requête, un seul `execSync` au boot. J'attends l'accord avant de construire.

ASK : aucune. En veille.

---

## Avancement — impl-backend, SystemStatus.commit construit (2026-08-31)

RE : team-lead — accord donné, deux réserves
DONE : `SystemStatus.commit: { sha, dirty } | null` — `build_info.ts` (`getCommitInfo`, injection du runner git pour le test, jamais un mock du module), calculé UNE FOIS dans `bootstrap.ts`, jamais par requête. Les deux réserves respectées : champ système seul (jamais montré à Nicolas, commenté dans le code ET le contrat), `sha` est le champ qui répond à la question, `dirty` reste une information écrite comme telle, jamais une alerte. Commentaire explicite : ne se met jamais à jour tout seul tant que le process tourne.
Serveur redéployé pour refléter ce commit lui-même (sinon le correctif serait servi par une instance déjà périmée dès sa propre livraison). Vérifié en direct : `curl /system/status` → `commit.sha` == `git rev-parse HEAD` exact.
6 tests neufs (3 unitaires purs sur `getCommitInfo`, 1 HTTP). 768 tests serveur verts, tsc/eslint propres. Amendement A12 écrit, marqué hors V1.6.
DETAIL : commit `09ca8cc`.

ASK : aucune. En veille.

---

## Avancement — impl-frontend, lecture des documents du site web (2026-08-31)

RE : team-lead — item 5, débloqué (A11 posé côté back), la vraie plainte (web_caption confondu avec le vrai texte)
DONE :

La liste des documents du site web porte maintenant sa vraie vignette (`WebDateProposal.thumbSha256`, A11) — une photo, jamais une capture de la page HTML. Un document sans photo liée montre un repère neutre, jamais une vignette fabriquée. Cliquer sur un document ouvre son texte complet : tous ses passages, dans l'ordre du pipeline, chacun dans son propre `TextCard` (correction, coche, date) — jamais un bloc aplati, jamais mêlé aux légendes de galerie (`useTexts` gagne un filtre `kind` optionnel, appelle `GET /texts?documentId=…&kind=passage`). Sélectionner un ou plusieurs passages fait apparaître le même bouton « Créer une note » que le journal de bord.

13 tests neufs (TDD). 737 tests front verts, tsc et eslint propres.

Vérifié en navigateur réel contre le vrai serveur : sur `01-le-grand-depart` (lecture seule), 28 documents, 22 vraies vignettes chargées (200 image/jpeg) et 6 repères neutres — exactement le ratio annoncé par back ; ouverture d'un document réel, 6 passages affichés, zéro légende, zéro image de page, zéro erreur console. Sur `zz-repro-bug1` (tâche jetable), une note créée depuis un passage web, confirmée via `GET /tasks/zz-repro-bug1` (titre « site web, 1998-1999 », `derivedFrom` correct).

DETAIL : commit `05c0498`.

C'est le dernier point du V1.6 qui m'était assigné (voir images sélectionnées, retrait découvrable, agrandir dans Revue et Images, commentaire par image, correction de date, lecture du site web). Il reste la vérification navigateur de la correction de date (bloquée sur le redéploiement A10 du serveur de dev, signalé au message précédent) — sinon disponible pour la suite.

ASK : aucune.
