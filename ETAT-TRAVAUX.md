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
| Plan d'implémentation backend | *(agent à lancer)* | **pas commencé** | — |

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
2. **`ResolvedDateView` est le seul composant autorisé à transformer une date en
   texte** (§7.1). `src/ui/date/noBareDateRendering.test.ts` fait échouer la
   suite si un fichier de `src/ui/` ou `src/screens/` formate une date lui-même.
   C'est la traduction mécanique de la règle capitale : ne pas la contourner,
   la corriger.
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
4. **`server/` est à la racine, pas sous `src/`** — accord avec `impl-backend`.
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

- **La base `photo_ui` existe** : `localhost:5432`, conteneur Docker
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
