# `photo_ui` — spécification

Application d'atelier pour composer, à partir d'une photothèque et de documents
transcrits, le dossier qu'un LLM utilisera pour écrire une bande dessinée.
Période 1998-2004.

Tous les chiffres marqués *(mesuré)* ont été relevés le 2026-08-28 sur les bases
vivantes, en lecture seule. Les mesures détaillées sont en **annexe A**, ce que
fournit le pipeline en amont en **annexe B**, la forme du manifeste en
**annexe C**.

Documents de référence pour le détail des schémas : `docs/pipeline-inventory.md`
et `docs/pipeline-capabilities.md`.

---

## 1. But et périmètre

### 1.1 Ce que produit l'application

L'utilisateur rassemble, pour une bande dessinée donnée : des **photographies**,
des **extraits de texte** (journal de bord manuscrit, mémoire « Ma vie », ancien
site web), et du **texte qu'il écrit lui-même** pour ce que les documents ne
disent pas.

Le livrable est un **dossier sur disque, un par tâche** (§1.3). C'est la sortie
du système ; tout le reste existe pour la produire.

L'application ne génère pas la bande dessinée, ne fait pas de mise en page, et
ne modifie rien dans le pipeline `adobe_mcp`.

### 1.2 Cadre

- **Un utilisateur**, sur son Mac, à côté du disque externe. Pas
  d'authentification. Serveur sur la boucle locale.
- **Backend** Node + Fastify + TypeScript strict, REST JSON.
- **Frontend** React + Vite + TypeScript strict, SPA, pas de SSR.
- **Responsive et tactile dès le départ** — iOS et macOS suivront via Capacitor.
  Concrètement : cibles de 44 px, sélection par appui long puis glissé, aucune
  action accessible seulement au survol ou au clic droit.
- **Store** PostgreSQL local, trois schémas : `pipeline` (copie des données du
  pipeline, rechargée par TRUNCATE), `app` (données humaines, jamais touchées
  par l'import), `ref` (référentiels saisis à la main).
- **Aucun chemin en dur.** Tout par variables d'environnement ; le backend
  vérifie chaque racine au démarrage et refuse de démarrer en nommant celle qui
  manque.
- **Périmètre 1998-2004**, mais c'est un paramètre, pas une constante.

### 1.3 Le dossier livré

```
<TASKS_ROOT>/<slug>/
  manifest.json     le contrat — seul fichier à lire pour tout retrouver
  README.md         rendu lisible du manifeste
  images/<cloud_asset_id>.jpg      rendu 1400 px, qualité 78
  pages/<doc>-p<NNN>.jpg           page scannée, pour les passages qui en ont une
  textes/journal.md · ma-vie.md · site-web.md · notes.md
```

Forme complète en **annexe C**. Quatre propriétés non négociables :

1. **La nature de chaque date voyage avec elle** — lecture, inférence ou
   décision humaine, plus sa précision (jour, mois, année). Le LLM doit pouvoir
   écrire « le 14 octobre » quand c'est lu et « vers la mi-octobre » sinon.
2. **La nature de chaque texte voyage avec lui** — texte d'époque, note humaine
   d'aujourd'hui, légende produite par une machine : trois emplacements
   distincts. Le LLM ne peut pas faire la différence tout seul.
3. **Le texte corrigé et le texte d'origine coexistent.** Une correction d'OCR
   ne détruit jamais la transcription.
4. **Le manifeste est autosuffisant** — images et pages copiées dans le dossier.
   Il est déplaçable et envoyable tel quel.

L'export est **idempotent** : ré-exporter une tâche inchangée réécrit un dossier
identique.

### 1.4 Ce que l'application ne fait pas

- Elle n'écrit **jamais** sur le volume des originaux ni dans les bases du
  pipeline (§7.2).
- Elle n'écrit dans `adobe_mcp/data/annotations/` que par un **export explicite,
  déclenché à la main, derrière un drapeau désactivé par défaut** (§8.1).
- Elle ne re-date pas les photos, ne relance pas de passe, ne reconstruit pas
  d'index.

---

## 2. Population de travail

### 2.1 Définition du périmètre

**Les 82 albums des cinq sets `1998-1999`, `2000-2001`, `2002`, `2003`, `2004`
— 3 930 photos** *(mesuré)*. La hiérarchie fait foi : c'est un classement fait à
la main, alors que `photos.year` se trompe 745 fois sur cette période (§3.3).

373 photos datées 1998-2004 vivent hors de ces albums, dans les fourre-tout
racine (`all pics` 330, `h30` 33, autres 10). Elles restent accessibles par un
filtre explicite « hors hiérarchie ». Union : 4 303.

| Set | Albums | Photos | GPS | Jour connu |
|:---|---:|---:|---:|---:|
| `1998-1999` | 16 | 326 | 0 | 283 |
| `2000-2001` | 19 | 806 | 546 | 780 |
| `2002` | 14 | 757 | 331 | 529 |
| `2003` | 22 | 861 | 187 | 787 |
| `2004` | 11 | 1 180 | 0 | 1 176 |
| **Total** | **82** | **3 930** | **1 064** | **3 555** |

Le plus gros album fait 286 photos, la médiane est autour de 30. **Aucune grille
n'a à virtualiser plus de 300 éléments** en mode album.

### 2.2 Couvertures *(mesuré, sur 3 930)*

| Axe | Couvert | % |
|:---|---:|---:|
| Vignette 224 px déjà construite | 3 925 / 3 925 sha256 | **100 %** |
| Score esthétique · tags IA | 3 930 | 100 % |
| Nom de sortie (`groupName`) | 3 900 | 99,2 % |
| Position GPS · pays | 1 064 | **27,1 %** |
| Ville | 717 | 18,2 % |
| Personne nommée (46 personnes) | 782 | 19,9 % |
| OCR non vide | 614 | 15,6 % |
| OCR ≥ 25 caractères | 165 | 4,2 % |
| Note > 0 | 300 | 7,6 % |
| Titre · drapeau `pick`/`reject` | 2 · 0 | ~0 % |
| Description | 1 019, **toutes valant `OLYMPUS DIGITAL CAMERA`** | inutilisable |

Formats : jpg 3 918, tif 11, png 1. **Aucune vidéo** — le cas « photo qui ne
peut produire aucun pixel » ne se présente pas. Poids total 2 986 Mo, moyenne
778 Ko.

Contre-intuitif : cette période est majoritairement **numérique**, pas du film
scanné. Appareils *(mesuré)* : Nikon E5700 1 752, Olympus C2020Z 1 019, **HP
Scanjet G4010 386** (le scanner), Canon A40 179.

### 2.3 Corpus textuel *(mesuré)*

**Les dates du journal de bord et de « Ma vie » sont exactes.** Ce sont les
seules dates certaines du corpus : écrites le jour même, sur la page. Une date
transcrite peut avoir été mal *lue* — c'est ce que dit sa `confidence` et ce que
§5.4 permet de corriger — mais la date écrite ne se discute pas.

| Source | Volume | Plage réelle | Datation |
|:---|---:|:---|:---|
| Journal de bord (`log_entries`) | 1 012 lignes, **241 jours distincts** | **1998-04-12 → 2002-06-02** | jour strict, 1 012/1 012 |
| Passages « Ma vie » | 798 | **1999-08-04 → 1999-11-18 seulement** | 677 datés, le reste par la fenêtre de sa page |
| Passages journal | 492 | 1998-07-08 → 2001-06-04 | 151 datés, le reste par la page |
| Passages site web (60 documents) | 569 | — | **aucun daté, zéro sur 569** |

Trois faits structurants :

- **« Ma vie » ne couvre que trois mois et demi de 1999.** Ce n'est pas un
  mémoire couvrant la période, c'est le récit de la transat.
- **Aucun passage du site web ne porte de date.** Le seul indice est le chemin
  du document (`web/1999/Transat`, `web/2003/2003_gal_1`). 416 des 569 tombent
  dans le périmètre par ce seul indice.
- **Après juin 2002 il n'y a plus de journal**, et c'est là que les photos sont
  les plus nombreuses : **2 041 photos sur 2003-2004 contre zéro ligne**.

**1 290 des 1 859 passages (69,4 %) sont plaçables dans le temps** — 828 par
leur propre `dateFrom`, **462 seulement par la fenêtre de leur page** (341
`entries`, 121 `carried`). Les 569 du web ne le sont pas.

La distinction compte : un passage placé par la fenêtre de sa page n'affirme pas
cette date, il l'hérite. Sa nature est donc `inference`, jamais `reading` — et
les 121 `carried` sont une inférence sur une inférence, la page ne nommant aucun
jour et reprenant celui de la précédente.

Les **155 images de page existent toutes sur disque** *(vérifié)*, ≈ 810 × 1 250 px,
49 Mo au total ; les **60 sources HTML aussi**.

---

## 3. La date d'une photo — la cascade

C'est le mécanisme central : il donne sa date à chacune des 3 930 photos, et le
filtre de dates, le tri, la chronologie, l'ordre du manifeste et tout le
recouvrement (§4) en dépendent.

### 3.1 La contrainte de fond

> Sur les photos récentes le datage est correct, mais sur les anciennes il a été
> fait à la main, et comporte parfois des erreurs. *(Nicolas)*

Vérifiable dans les chemins : **les 82 dossiers du disque sont exactement les 82
albums** *(mesuré)*, et le préfixe `aaaa-mm` que le pipeline analyse est **le nom
qu'une personne a tapé sur un dossier des années après la prise de vue**.
**Après cascade, seules 2 332 photos sur 3 930 (59 %) portent une date lue par
la machine et validée par un arbitrage.** Les 1 598 autres se partagent en 870
inférences tirées d'un nom d'album et 728 décisions humaines — dont Nicolas dit
lui-même qu'elles « comportent parfois des erreurs ». C'est ce qui gouverne §4.

### 3.2 Ce que donne le nom d'album

| Forme du préfixe | Albums | Photos | Produit |
|:---|---:|---:|:---|
| `aaaa-NN`, NN ∈ 01-12 | 80 | 3 769 | **mois** |
| `aaaa-NN`, NN > 12 (`2002-38Dec02`) | 1 | 131 | année |
| `aaaa` seul (`2000-2001/2000`) | 1 | 30 | année |

Tous les albums donnent au moins une année : **la cascade est totale, aucune
photo ne finit sans date.**

**Mais le préfixe nomme un début, pas un mois.** `1998-02-Maison rose Algès`
couvre en réalité février 1998 à fin juin 1999 — dix-sept mois. Les données le
confirment : **19 de ses 22 fichiers s'appellent `98-99 maison rose
Lisbonne (N).jpg`**. **25 des 82 albums portent un nom qui annonce une durée ou
un trajet** (`3mois`, `Fort Lauderdale - Belize`, `Sorel-Beaufort-Fort
Lauderdale`), et **421 des 840 photos datées au mois — la moitié — s'y
trouvent** *(mesuré, détail en annexe A.3)*.

D'où une table **`ref.album_span`** (`album_path`, `date_from`, `date_to`,
`note`) consultée avant tout le reste. À défaut, l'intervalle présumé est le
mois du préfixe, **marqué `presumed`** et corrigeable depuis l'écran de réglage
(§5.7). Les 25
albums suspects sont pré-listés à revoir : **25 saisies corrigent l'intervalle
de 421 photos**, le meilleur rapport effort/gain du projet.

### 3.3 La cascade

| Rang | Échelon | Produit | Nature | Photos |
|---:|:---|:---|:---|---:|
| 0 | `ref.album_span` | l'intervalle de l'album, dont les rangs 2/4/5 se servent | *(pas une date)* — saisie humaine, mais les dates qu'elle produit restent des **inférences** | 1 saisie |
| 1 | **Décision humaine** — annotation de datation | jour | **décision** | **728** |
| 2 | **EXIF arbitré** — dans l'intervalle de l'album élargi de 6 mois | jour | **lecture validée par arbitrage** | **2 424** |
| 3 | **Lieu ↔ journal** — proposition du gazetteer croisé au journal (§3.5) | jour + position, avec fourchette et preuves | **inférence** | 37 avec preuve |
| 4 | **Album, EXIF écarté** — hors fenêtre : l'EXIF est une date de scan | l'intervalle de l'album | inférence | **970** |
| 5 | **Album, pas d'EXIF** | idem | inférence | **375** |
| 6 | **Album à année seule** | année | inférence | **161** |

Les rangs 2, 4, 5 et 6 sont exclusifs : 2 424 + 970 + 375 + 161 = 3 930. Le rang
1 se superpose (92 chevauchements, cf. Q7).

**Ce que la cascade répare.** Les 512 photos du rang 4 et les 233 du rang 5 qui
portent aujourd'hui une date fausse ou nulle sont **exactement les 745 photos
mal datées** du périmètre : dates de scan (années EXIF 2017, 2013, 2014) ou
absence totale. **La cascade les répare toutes, et plus aucune photo n'est sans
date** (contre 233 aujourd'hui). Aucune n'avait été corrigée à la main.

**État final** *(calculé)* : **3 060 photos datées au jour** (728 décisions +
2 332 lectures arbitrées), **840 au mois**, **30 à l'année**.

### 3.4 La fenêtre de 6 mois

C'est un **arbitrage entre deux sources qui se contredisent**, pas une lecture.

```
L'EXIF est retenu  ⟺  il tombe dans l'intervalle de l'album élargi de 6 mois
                       de chaque côté.
```

Pour un album `aaaa-mm`, l'intervalle fait un mois et la comparaison se fait
**en mois entiers** — l'album ne prétend pas au jour. Pour un album à année
seule, la fenêtre porte sur l'année (`annéeEXIF = annéeAlbum`) : une année
civile est déjà plus large que ±6 mois autour d'un mois inconnu.

**Le seuil est robuste et n'est pas un réglage délicat.** La distribution des
écarts est franchement bimodale : elle s'effondre après 3 mois (216 photos → 1)
et se reforme au-delà de 5 ans (874, les dates de scan). N'importe quel seuil
entre 4 et 12 mois donne le même résultat *(distribution complète en annexe A.2)*.

### 3.5 Le rang 3 — le rapprochement par le lieu existe déjà

`adobe_mcp/packages/dating` fait exactement ce travail : un gazetteer de 30
lieux avec leurs boîtes englobantes, apparié au nom d'album, croisé aux
positions du journal pour encadrer la photo et interpoler sa position.
**`photo_ui` consomme ces propositions, il ne les réimplémente pas** : afficher
la date en ambre italique préfixé `≈` avec sa fourchette, rendre les preuves
atteignables (un clic ouvre la page de journal), montrer la position comme une
interpolation, et surfacer le motif quand il n'y a pas de proposition.

**Ce que cet échelon rend aujourd'hui est faible** : sur 521 propositions,
**37 seulement portent une fourchette, des preuves et une position** ; les 484
autres sont des dates posées à la main. Trois plafonds structurels : le journal
s'arrête au 2 juin 2002 ; le gazetteer ignore la géographie de 2003-2004 (ni
Belize, ni Tikal, ni Maroc, ni Sorel) ; la passe est bornée à 2003 et ne
considère que 551 photos.

### 3.6 Ce que la cascade impose

- **La précision voyage avec la date.** Un champ `precision` ∈ `day` | `month` |
  `year`, et **l'affichage suit** : `1999-10-14`, `octobre 1999`, `2000` —
  jamais un jour inventé.
- **Une photo datée au mois est un intervalle**, pas un point (§4.1).
- **L'arbitrage se voit** : une date du rang 2 est une lecture *retenue contre
  une autre source*, et l'interface le dit au détail (« EXIF, confirmé à 2 mois
  du mois d'album »).
- **La cascade est calculée au backend, une fois, à l'import**, et stockée. Une
  règle réévaluée en deux endroits finit par diverger.

---

## 4. Le recouvrement texte ↔ images

Le cœur fonctionnel, et **il n'existe pas dans les données** : `documents.db` ne
référence aucune photo, aucune colonne ne porte de `cloudAssetId`. Le
recouvrement se calcule par la date, seul signal partagé.

### 4.1 Principes

**La date qu'un texte affirme et la fenêtre qu'il couvre sont deux choses
différentes, et ne doivent jamais être confondues.** Une entrée de journal du
14 octobre 1999 *affirme* ce jour-là — c'est une lecture exacte, écrite le jour
même. La règle A lui fait *couvrir* jusqu'à la veille de la journée suivante
renseignée, ce qui peut aller jusqu'à 92 jours. Écrire cette extension dans la
date du texte transformerait une lecture exacte en une affirmation de trois
mois, exactement ce que §7.1 interdit.

Un texte porte donc **deux intervalles distincts** : sa `date` — ce qu'il
affirme, avec sa nature — et sa fenêtre de recouvrement, avec la règle qui l'a
produite. La nature ne dérive que de la première. La seconde ne s'affiche jamais
comme une date.

**On croise deux intervalles, jamais un point.**

```
photo   [Pd, Pf]   1 jour, 1 mois ou 1 an selon sa précision
texte   [Td, Tf]   LA FENÊTRE DE RECOUVREMENT, pas la date affirmée
recouvre  ⟺  Pd ≤ Tf  ET  Td ≤ Pf
```

**Les deux largeurs sont retournées et affichées**, et le tri par défaut est
leur somme croissante. Elles ne disent pas la même chose : la largeur du côté
texte dit ce que la page couvre, celle du côté image dit ce qu'on ignore.

**Aucun plafond de largeur.** Tout recouvrement est proposé, y compris les 436
à plus d'un mois. La raison : **1 598 photos sur 3 930 (41 %) ne portent pas
une date mesurée** — 870 sont des inférences d'album, 728 des décisions humaines
faillibles (§3.1). Un seuil calculé dessus masquerait des recouvrements corrects
autant que du bruit, et le ferait en silence. C'est à l'humain de trancher, avec
l'information sous les yeux.

### 4.2 Les trois règles

**A — Journal de bord.** Une entrée couvre `[E.date, E_suivante.date)`, où
`E_suivante` est la prochaine journée distincte portant une entrée. Le journal a
241 jours renseignés sur les ~1 513 de sa plage : on photographie au mouillage,
on tient le journal en mer. Les écarts entre journées vont de 1 jour à **92
jours** *(annexe A.4)*.

**B — Passages.** Un passage couvre `[dateFrom, dateFrom]` s'il est daté, sinon
la fenêtre de sa page `[startAt, endAt]`. La largeur et le `spanSource`
(`passages` | `entries` | `carried` — **`carried` est une inférence et doit se
voir**) accompagnent le résultat. Les fenêtres de « Ma vie » font 1 à 3 jours ;
celles du journal vont jusqu'à plus de 30 jours pour 20 de ses pages.

**C — Site web : aucune date, association manuelle.** Aucun recouvrement
automatique. Deux mécanismes : une table `ref.web_span` (document → intervalle),
60 documents dont ~25 dans le périmètre, saisie à la main une fois dans l'écran
de réglage (§5.7) ; et en
attendant, navigation et recherche plein texte, avec attachement par un geste
explicite. C'est frustrant et c'est le bon compromis : le site est la seule
source textuelle de 2003-2004, et lui inventer des dates serait exactement
l'erreur que §7.1 interdit.

### 4.3 La relation inverse

D'un passage sélectionné, on propose les photos dont l'intervalle chevauche
celui du passage, **triées par largeur croissante de l'intervalle de la photo**
puis par score esthétique. Chaque photo affiche sa précision et sa distance au
centre de la fenêtre.

Le compteur est explicite : « 87 photos dans une fenêtre de 41 jours, dont 34
datées au mois seulement » — l'utilisateur sait ce que vaut la proposition *et
d'où vient sa faiblesse*.

### 4.4 Ce que le recouvrement ne peut pas faire

**Limite 1 — les corpus ne se recouvrent presque pas.** Le texte est dense en
1999, les photos en 2003-2004. Au mieux ~850 photos sont atteintes, dont ~300
avec une fourchette serrée *(rendements mesurés en annexe A.4)*.

**Limite 2 — l'incertitude est entièrement du côté des images.** Les dates du
texte sont exactes (§2.3) ; après cascade, 870 photos ne sont datées qu'au mois
ou à l'année. Le problème n'est donc pas « faire coïncider deux sources floues »
mais **positionner des images mal datées contre une référence sûre**. C'est plus
favorable, mais insuffisant : une photo datée « octobre 1999 » chevauche tout le
mois, et rien dans les données ne dira laquelle des 31 journées est la bonne.
**C'est un œil humain qui reconnaît le mouillage.**

**Le flux principal est donc humain** : l'utilisateur navigue dans les images,
navigue dans les textes, et associe. Le recouvrement est une **aide au tri**,
affichée comme telle, jamais comme un lien établi.

### 4.5 Piste en cours d'évaluation

Les galeries du site de 2003 pairent **une légende avec une image précise**
*(vérifié dans `2003_gal_1.htm` : chaque `<img>` porte un
`xthumbnail-orig-image` et une `alt`)*, et 2 207 JPEG du site sont sur disque.
Aucun nom de fichier ne correspond à la photothèque, mais `visual.dhash` porte
une empreinte perceptuelle pour les 41 913 photos : un appariement par distance
de Hamming donnerait un **lien direct légende ↔ photo**, sans aucune date, et
précisément sur 2003-2004 où le journal n'existe plus.

**Une investigation dédiée est en cours.** Rien n'est établi ; l'écran texte ne
doit pas être codé en supposant cette piste vraie.

---

## 5. Les écrans

### 5.1 Choix ou création d'une tâche

**On y voit** une liste, la plus récemment ouverte en tête : titre, période,
compteurs (images, textes, notes), date du dernier export, état — `brouillon` |
`exportée` | `exportée, modifiée depuis`.

**On y fait** ouvrir, créer (titre, période pré-remplie, consigne libre pour le
LLM), dupliquer, renommer, supprimer. Le `slug` est dérivé du titre et
**modifiable à la création uniquement** : c'est le nom du dossier livré.

**Erreurs.** Slug déjà pris → refus à la saisie, en nommant la tâche existante.
`TASKS_ROOT` inaccessible → bandeau bloquant, création désactivée, consultation
possible ; ne jamais laisser créer une tâche qui ne pourra pas être exportée.
Suppression → confirmation nommant la tâche, et **le dossier déjà exporté n'est
pas touché**, ce qui est dit.

**Tactile.** Balayage horizontal pour révéler renommer/supprimer ; appui long
pour le menu.

### 5.2 Sélection d'images

L'écran principal : filtres (colonne à gauche, tiroir sur mobile), grille,
panneau de détail.

**On y voit** une grille de vignettes 224 px — elles existent toutes,
l'affichage est immédiat. Chaque vignette porte une coche de sélection visible
sans survol, **sa date rendue selon sa nature et sa précision** (§7.1), et un
liseré discret si elle est retenue dans une autre tâche (information, pas
interdiction). Une photo sans date affiche `sans date`.

En-tête : compte de résultats, compte de sélectionnés, **compte des écartés par
le filtre courant** avec un geste pour les ramener (§7.3). « Tout sélectionner »
porte sur le résultat du filtre et le dit : « Sélectionner les 87 résultats ».

**On y fait** filtrer (§6), sélectionner par intervalle (appui puis appui long ;
glissé sur tactile), ouvrir le détail — rendu 1400 px, tous les axes, la date
avec sa nature et sa fourchette, les textes qui la recouvrent avec accès direct
à l'écran texte. Champ **note** par photo : c'est la légende qui partira avec
cette image.

**Tris.** Date croissante (défaut), décroissante, esthétique, album+fichier. Le
tri par date **range les photos sans date à la fin, groupées**.

**Erreurs.** Vignette absente → tuile grise nommant le fichier, jamais un vide.
Rendu indisponible → distinguer **volume absent** (configuration, global) de
**fichier manquant** (cette photo). Volume démonté en session → bandeau global,
vignettes et sélections déjà chargées restent utilisables, export bloqué.

**Tactile.** 2 colonnes en portrait, 4-6 en paysage, pincer pour la densité,
filtres en tiroir avec compteur de filtres actifs.

### 5.3 Lecture et sélection de texte, page en regard

Deux panneaux : texte transcrit à gauche, image de la page scannée à droite. Sur
mobile, deux onglets.

**Trois sources, trois sections, jamais mélangées** — journal, « Ma vie », site
web. Elles n'ont ni la même granularité de date ni le même statut.

Chaque passage porte son texte, **sa date et sa nature**, sa `confidence` de
transcription, une coche, un bouton « corriger », et le nombre d'images qu'il
recouvre, cliquable.

**On y fait** naviguer par page, par date ou par recherche plein texte ;
sélectionner ; corriger (§5.4) ; ouvrir la grille pré-filtrée sur la fenêtre du
passage.

**La page en regard** se cale sur le passage courant. Zoom et déplacement
obligatoires : 810 × 1 250 px, c'est juste pour de l'écriture manuscrite. Le
passage est mis en évidence dans le texte ; **aucune mise en évidence n'est
possible sur l'image** — `pages.region` est NULL sur les 155 lignes, rien ne dit
où un passage se trouve. Ne pas promettre ce qui n'existe pas.

**Le site web n'a pas de page** : panneau vide explicite.

**Erreurs.** Image absente → panneau nommant le chemin attendu (0 cas mesuré).
Passage sans page et sans date → sélectionnable, date affichée `indéterminée`,
jamais devinée.

### 5.4 Correction de transcription

Mode de l'écran précédent. Le passage devient éditable, la page reste affichée ;
**le texte d'origine reste visible en dessous**, grisé, avec un bouton
« rétablir ».

**Où vit la correction** : dans `app`, clé = identifiant du passage ou de
l'entrée. **Globale, pas par tâche** — une erreur d'OCR est fausse dans toutes
les tâches.

**Elle ne remonte pas au pipeline, et c'est vérifié dans le code.**
`readAnnotations` accepte `target.type: 'log_entry'` et `'passage'` et
`kind: 'correction'`, mais son seul consommateur filtre sur
`kind === 'dating'` et `target.type === 'photo'` (ou `'album'`). **Une
correction de texte serait lue, validée, puis ignorée sans un mot.** Elle reste
donc définitivement locale (annexe B.4).

**Erreurs.** Passage changé côté pipeline depuis la correction → celle-ci est
**conservée et marquée « à revoir »**, jamais appliquée en silence ni
supprimée. Correction vide → refusée ; effacer un texte n'est pas le corriger.

### 5.5 Note libre

Liste des notes de la tâche : titre, texte Markdown, horodatage, rattachements
facultatifs à des images ou des passages. Une note sans rattachement est une
note générale, et c'est un cas courant (« Gaëtan n'était plus à bord après
2002 »). Créable aussi depuis la grille et depuis l'écran texte, sans quitter le
contexte.

**Erreur.** Perte de connexion pendant la saisie → le brouillon survit côté
client jusqu'à confirmation. C'est la seule donnée de l'application qui n'existe
nulle part ailleurs.

### 5.6 Revue et export

**On y voit** les images retenues, les textes groupés par source (avec mention
des corrections), les notes, et une **chronologie** plaçant images et textes sur
un même axe — c'est le seul endroit où l'on voit qu'on a 200 photos de 2004 et
pas une ligne de texte pour les accompagner.

Un bandeau de contrôle, non bloquant : N images sans date, N dont la date est
une inférence, N textes en `confidence: uncertain`, N textes dont la fenêtre
dépasse 30 jours, N images qu'aucun texte ne recouvre.

**On y fait** retirer, réordonner (l'ordre du manifeste est celui que le LLM
lira), éditer la consigne, exporter.

**L'export** écrit le dossier de §1.3. Coût mesuré : **19 ms par image à 8 en
parallèle** — une tâche de 200 images s'exporte en **4 secondes**. Barre de
progression, annulable.

**Erreurs.** Dossier existant → proposer d'écraser en le nommant, ou d'exporter
ailleurs ; jamais d'écrasement silencieux. Une image qui ne rend pas → l'export
**continue**, l'image est absente du dossier **et du manifeste**, et le rapport
la nomme avec sa cause ; un manifeste qui référence un fichier absent est pire
qu'un manifeste incomplet. Disque plein → arrêt, rapport, dossier partiel
signalé.

### 5.7 Réglages — les référentiels saisis à la main

Écran hors tâche, atteignable depuis n'importe où. Il porte les trois
référentiels de `ref` (§9.4), qui n'existent que parce qu'une personne les
remplit. Petit écran, gros rendement.

**Plages d'albums (`ref.album_span`).** La liste des 82 albums, **les 25
suspects de couvrir une plage en tête** (§3.2), chacun avec : son nom, son
nombre de photos, son intervalle courant et l'origine de cet intervalle —
`saisi` ou `presumed`. On édite deux dates. Un album corrigé quitte la tête de
liste.

Aide à la saisie : l'écran montre **ce que les noms de fichiers de l'album
racontent** quand ils portent un motif de date (Q9) et **la plage des
`captureDate` écartés par l'arbitrage** — deux indices gratuits, présentés comme
des indices, jamais pré-remplis dans les champs.

**Après enregistrement, l'écran dit ce que la saisie a produit** : « cette plage
vient de redater 243 photos ». Le backend recalcule la cascade de l'album dans
la même transaction et renvoie le compte. Sans ce retour, on saisit une plage et
rien ne bouge à l'écran avant un réimport — vingt-cinq saisies fastidieuses au
lieu de vingt-cinq gestes qui montrent leur effet.

**Plages des documents web (`ref.web_span`).** Les ~25 documents du périmètre
sans aucune date (§4.2, règle C), avec un extrait de leur texte pour les
reconnaître. Même édition. Ces intervalles sont marqués comme des **inférences
humaines grossières** partout où ils servent.

**Noms de pays.** La liste des valeurs distinctes avec leur compte, et de quoi
en fusionner deux (§6.2).

**On y voit aussi** l'état du système : date du dernier import, disponibilité du
volume, avancement de la pré-construction des rendus, nombre de sélections
orphelines et de corrections « à revoir ». C'est le seul endroit où ces
compteurs vivent ; ailleurs, un bandeau global ne s'affiche que lorsque l'un
d'eux est non nul.

**Erreurs.** `date_to` antérieure à `date_from` → refus à la saisie. Un
intervalle qui ne recouvre pas l'année du préfixe d'album → **accepté avec un
avertissement** : c'est précisément le cas que la saisie existe pour traiter, et
`1998-02-Maison rose Algès` s'étend jusqu'en 1999. Supprimer une plage saisie →
l'album repasse en `presumed`, ce qui est dit.

---

## 6. Les axes de sélection

| Axe | Couverture | Verdict |
|:---|---:|:---|
| **Album / hiérarchie** | 100 % | **le plus fort**, par construction |
| **Plage de dates** | 100 % après cascade | **l'axe principal** |
| **Contenu (tags IA)** | 100 % | **fonctionne dès l'import**, voir §6.3 |
| **Contenu (phrase descriptive)** | 0 % aujourd'hui, 100 % après la passe | **la brique à construire**, voir §6.4 |
| Nom de sortie | 99,2 % | raccourci textuel utile |
| Lieu | 27,1 % | **décevant**, voir §6.2 |
| Personne (46 noms) | 19,9 % | utile, minoritaire |
| Texte qui recouvre | 21,5 %, dont 7,7 % serré | aide, pas axe principal |
| OCR (texte *dans* l'image) | 15,6 %, 4,2 % exploitable | marginal mais irremplaçable |
| Similarité « plus-comme-celle-ci » | **0 %** | demande des vecteurs, hors V1 (§8.2) |
| Note, drapeau, titre, description, couleur, appareil | — | **ne rien construire** (annexe A.6) |

### 6.1 Plage de dates et album

**Dates.** Le sélecteur travaille sur l'**intervalle résolu**, jamais sur
`captureDate`, et une photo est retenue si son intervalle **chevauche** la
plage. Ce n'est pas un détail : sur la quinzaine `2000-12-01 → 2000-12-20`, une
lecture stricte rend **0 photo** et le chevauchement en rend **273** (§7.3).

Une bascule « n'inclure que les dates fiables » restreint aux 3 060 photos
datées au jour ; elle est **désactivée par défaut**. La précision se voit dans
la grille, sans ouvrir la photo. Granularité utile du sélecteur : le mois.

**Album.** 82 albums nommés par quelqu'un qui était là : `2004-03- visite de
Tikal`, `2002-04-Ghislaine est a Saint Martin`. Ces noms disent le lieu,
l'événement, parfois qui était présent. **Le préfixe n'est jamais présenté comme
une date** (§3.2). Le filtre porte sur `albumPath`, l'album principal ; les
fourre-tout racine ne sont pas proposés comme des albums.

### 6.2 Lieu — l'axe décevant, et il faut le dire à l'utilisateur

1 064 photos sur 3 930 ont une position. La répartition est brutale :
**`1998-1999` 0 sur 326, `2004` 0 sur 1 180**, `2000-2001` 546 sur 806. Les
appareils de l'époque n'avaient pas de GPS ; le pays et la ville n'existent que
là où il y a du GPS.

Conséquences : l'axe est **désactivé avec sa raison affichée** quand le filtre
courant ne contient aucune photo géolocalisée ; le sélecteur montre le compte à
côté de chaque pays ; les doublons de nom sont normalisés dans `ref`
(« Republique de Trinite et Tobago » / « Trinité-et-Tobago », « Saint-Martin » /
« Sint Maarten ») ; et surtout **le lieu est souvent dans le nom de l'album**
alors qu'il n'est dans aucune colonne — `Belize`, `Tikal`, `Sorel`. Le filtre
lieu cherche donc aussi dans `albumPath` et `groupName`, et **dit lequel a
répondu**.

Pas de carte en V1 : elle serait vide pour 73 % des photos et totalement vide
pour deux des cinq années.

### 6.3 Contenu de l'image — les tags IA fonctionnent

**C'est le seul axe de contenu qui existe, et il couvre 100 % du périmètre.**
2 593 tags distincts *(mesuré)*. La tête ne trie rien, la queue trie très bien :
seuls **5 tags** couvrent plus de 1 500 photos (`blue`, `travel`, `sky`,
`water`, `nature`), tandis que **1 001 tags couvrent entre 6 et 500 photos** —
la bande exploitable — et **chaque photo en porte au moins un** *(distribution
en annexe A.5)*.

Le vocabulaire colle au corpus : `maya` 93, `ruins` 184, `fortress` 83,
`archeology` 66 pour Tikal, Tulum et Chichen Itza ; `gator` 16 pour les
Everglades ; `dunes` 50, `volcano` 42, `ferry` 11, `aquarium` 46.

Trois règles d'interface :

- **Ne pas mettre en avant les 42 tags les plus larges** (> 500 photos) : ce
  sont eux qui donnent l'impression que l'axe ne sert à rien.
- **Proposer le vocabulaire par sélectivité décroissante**, avec le compte à
  côté. `maya (93)` se choisit tout seul, `water (1 701)` non.
- **Plancher de confiance bas.** Mesuré : 62 219 liens à 48-64, 31 424 à 65-79,
  **seulement 4 206 à 80 ou plus** — un plancher à 80 détruirait 96 % de l'axe.
  La confiance s'affiche, elle ne filtre pas par défaut, et **n'écarte jamais un
  tag qui n'en porte pas**.

**Ne pas proposer les mots-clés `user`** : 1 591 des 2 496 noms sont aussi des
tags IA et 656 sont des noms d'album ; les présenter comme « vos mots-clés » est
faux.

### 6.4 Contenu par la phrase descriptive — la brique à construire

**Ce que le pipeline n'a jamais fait.** Sa passe contenu a lu le texte imprimé
(`ocr`), mesuré une couleur moyenne (64 % de gris, inexploitable) et calculé une
empreinte de similarité. Elle **n'a jamais analysé ce que montrent les images**.
La table `embeddings` a 0 ligne ; les outils MCP `describe` et `similarTo` sont
spécifiés mais non implémentés.

**La réponse : décrire chaque image en texte, puis chercher dans ce texte.** Un
modèle de vision produit une phrase par photo ; la phrase est stockée et
indexée en plein texte comme n'importe quel autre texte de l'application. C'est
la première brique de contenu à construire, avant tout mécanisme vectoriel.

**Pourquoi c'est la moins chère, et l'argument n'est pas le prix.** En dollars,
les deux approches sont dérisoires à cette échelle (§8.2). Ce qui les sépare est
le **coût d'ingénierie** :

| | Légendes en texte | Embeddings CLIP |
|:---|:---|:---|
| Infrastructure nouvelle | **aucune** | sidecar Python, `trust_remote_code`, poids du modèle, quantification int8, `pgvector` |
| Chemin de recherche | **celui déjà nécessaire** pour les documents (§9.2) : `tsvector` français + `pg_trgm` + `unaccent` | un second chemin, vectoriel, à écrire et à composer avec les filtres SQL |
| Inspectable par l'utilisateur | **oui** — il lit la légende et juge | non — un vecteur ne se lit pas |
| Corrigeable | **oui**, c'est du texte | non |
| Part dans le dossier livré | **oui**, le LLM de la BD la lit | non |

La dernière ligne est décisive : **une légende a deux usages, un vecteur n'en a
qu'un.** Elle indexe la photo *et* elle décrit la photo au modèle qui écrira la
bande dessinée. Les tags IA, eux, n'ont que le premier usage — `maya`, `ruins`,
`boat` ne se transmettent pas utilement à un scénariste.

**Ce que ça change par rapport aux tags (§6.3), qui restent.** Les tags sont
gratuits, immédiats, et couvrent tout : on les expose, ils ne coûtent rien
puisqu'ils sont importés de toute façon. Mais ils sont un **vocabulaire fermé de
2 593 mots**, et les requêtes qu'appelle la composition d'une BD sont des
scènes, pas des mots-clés : « la maison rose », « le bateau au sec sur son ber »,
« Hugo à la barre ». Aucun tag ne dit ça. **Les deux axes cohabitent** et
répondent à des questions différentes.

**Ce que ça apporte aussi aux photos mal datées.** 233 photos n'ont aucune date
d'origine et 745 en portaient une fausse (§3.3). Une légende les rend
trouvables par ce qu'elles montrent, indépendamment de toute date — le seul axe
du document qui ne dépende pas de la cascade.

**La limite, à dire franchement.** La recherche plein texte est **lexicale, pas
sémantique** : « voilier » ne trouvera pas une légende qui dit « bateau à
voiles ». Le `tsvector` français gère les flexions (pluriels, conjugaisons), pas
les synonymes. Deux atténuations, toutes deux gratuites :

- **demander au modèle une phrase *et* une courte liste de mots-clés
  normalisés**, et indexer les deux — cela rattrape l'essentiel de la synonymie
  sans rien ajouter à l'infrastructure ;
- **afficher l'extrait de légende qui a répondu**, surligné, dans les résultats.
  Sans lui, l'utilisateur ne peut pas juger pourquoi une photo remonte, ni
  apprendre le vocabulaire que le modèle emploie.

Ce qui reste hors de portée après cette brique : le **plus-comme-celle-ci**, qui
demande vraiment des vecteurs, et la synonymie profonde. C'est ce qui justifie
de garder les embeddings en réserve (§8.2) — pas en V1.

#### La passe de légendage

**Déclenchée par l'utilisateur**, sur le périmètre ou un sous-ensemble (un
album, une sélection). Elle ne bloque rien : l'application est pleinement
utilisable sans une seule légende, et les tags portent l'axe contenu en
attendant.

**Ce qu'on demande au modèle** : une description factuelle de ce qui est
visible, en français, deux à quatre phrases, **suivie de 5 à 10 mots-clés
normalisés** (c'est l'atténuation de la synonymie décrite plus haut).
**Décrire, ne pas raconter** — « un homme barre un voilier, mer formée », pas
« Hugo affronte la tempête ». **Ne nommer personne**, les visages viennent de
l'index. **Ne dater ni localiser** — c'est le travail de §3 et la source de
toutes les erreurs du corpus. **Dire ce qu'il ne voit pas** plutôt que produire
une description plausible. Le modèle reçoit le rendu 1400 px **sans aucune
métadonnée** : lui donner le contexte l'inciterait à le recracher comme s'il
l'avait vu.

**Ce qu'on stocke**, dans `app`, clé `sha256` : `caption`, `keywords`, `model`,
`prompt_version`, `created_at`, et `edited_caption` si l'utilisateur corrige —
la production d'origine n'est jamais détruite. Le `tsvector` porte sur
`coalesce(edited_caption, caption)` et sur `keywords`.

**Marquage** : `images[].caption` avec `kind: "machine"` et le modèle. **Jamais
dans `texts[]`** (textes d'époque) ni `notes[]` (humain) — §7.1. Une légende
corrigée passe à `kind: "human-edited"` et conserve `machine_original`. Ce
cloisonnement compte davantage maintenant que la légende devient un axe de
recherche courant : elle sera partout dans l'interface.

**Coût pour les 3 925 photos** *(estimé, ~1 500 tokens d'entrée et ~200 de
sortie par image)* : ≈ 10 $ avec Claude Haiku 4.5, ≈ 20 $ avec Sonnet 5, ≈ 49 $
avec Claude Opus 5 ; l'**API Batch divise par deux** et convient parfaitement,
la passe n'étant pas interactive.

**Ne pas choisir le modèle à l'aveugle.** L'écart entre le moins cher et le plus
cher est de ≈ 40 $ sur une passe unique, et la légende sert deux fois — index de
recherche *et* matière pour le scénariste. Légender **20 photos représentatives
avec deux ou trois modèles** coûte moins d'un dollar et tranche la question sur
pièces. Faire ce sondage avant d'engager les 3 925, en même temps que la
vérification du compte de tokens (§11, point 9).

Passe **reprenable**, état et coût cumulé consultables, ne re-soumet pas une
photo déjà légendée. `prompt_version` permet de re-légender un sous-ensemble
quand la consigne change, sans tout refaire.

### 6.5 Composition

Les axes se composent en ET, les valeurs d'un axe multivalué en OU.

**Un filtre demandé doit restreindre, ou ne rien renvoyer, ou échouer
bruyamment.** Il ne disparaît jamais : un paramètre inconnu est une erreur 400,
un terme qui se réduit à rien renvoie zéro résultat, jamais la bibliothèque
entière. **Et chaque filtre s'applique dans sa lecture la plus généreuse**
(§7.3).

L'UI affiche en permanence les filtres actifs en jetons retirables, le compte de
résultats **et le compte des écartés**. Aucun filtre caché, aucune exclusion
muette.

---

## 7. Règles invariantes

### 7.1 Une inférence ne doit jamais ressembler à une lecture

**La règle capitale.** Trois natures, jamais fusionnées, jusqu'au pixel :

| Nature | Origine | Rendu |
|:---|:---|:---|
| **Lecture** (`reading`) | EXIF, `passages.dateFrom`, `log_entries.date` | vert, romain — `1999-09-30 (exif)` |
| **Inférence** (`inference`) | passe de datation, fenêtre de page, intervalle d'album, `ref.web_span` | ambre, italique, `≈` — `≈ 1999-09-30 (± 96 h)` |
| **Décision humaine** (`decision`) | annotation de datation, et elle seule | violet, gras, `✓` — `✓ 1999-09-28 — à la main` |

Elle tient **structurellement**, pas seulement visuellement : colonnes
distinctes en base, `date_kind` dérivé jamais saisi, champs séparés dans l'API,
trois traitements visuels, et **`kind` dans le manifeste exporté** — la règle
survit à la sortie du système.

**Ce qui range une date dans la colonne « décision » n'est pas *qui* a agi, mais
*ce que le geste établit*.** Une annotation de datation **tranche** : quelqu'un a
ouvert la photo, vu l'EXIF affiché, et tapé autre chose — le geste arbitre entre
deux sources qui se contredisent. Une plage de `ref.album_span` ou de
`ref.web_span` **comble un vide** : le nom d'album ne nomme qu'un début, aucun
des 569 passages du site ne porte de date. C'est une conjecture, faite par un
humain, sur une source qui ne dit rien — donc une **inférence**, rendue ambre et
`≈`, quelle que soit la main qui l'a saisie. Rien n'est perdu au passage :
`kind` dit ce que la date vaut, `source` dit d'où elle vient, et les deux
voyagent séparément. C'est précisément à ça que servent deux champs.

**Elle porte aussi sur les textes.** Trois natures y coexistent : texte d'époque
(sa `confidence`, sa page, sa date), texte humain d'aujourd'hui (note,
correction), **texte produit par une machine** (légende VLM : `kind: "machine"`
+ le modèle et la date). Un texte que personne n'a écrit ne doit jamais pouvoir
être lu comme un souvenir.

**Corollaires.** La fourchette voyage avec la proposition — sans elle, afficher
`sans fourchette`, jamais un nombre non soutenu. Les preuves sont atteignables.
Un doute porte sur la passe, pas sur l'appareil : « pas de GPS » et « le journal
ne met jamais le bateau là » ne se rendent pas pareil. `dateSource` est un
signal de confiance et s'affiche.

### 7.2 Ce sur quoi on n'écrit jamais

| Cible | Écriture |
|:---|:---|
| `/Volumes/OWC Envoy Ultra` en entier | **jamais**, caches compris |
| Les 4 bases SQLite du pipeline · les catalogues Lightroom | jamais |
| `adobe_mcp/docs/` | jamais |
| `adobe_mcp/data/annotations/` | **uniquement** par l'export explicite de §8.1 |

Les caches de `photo_ui` (rendus 1400 px, pages agrandies) vivent sur le disque
interne, sous une racine configurable. Les bases pipeline s'ouvrent en lecture
seule (`mode=ro`).

### 7.3 Ne jamais écarter ce qui pourrait correspondre

> Il faut éviter de ne pas filtrer des photos qui pourraient correspondre à la
> demande, donc un petit % d'erreur positif est acceptable. *(Nicolas)*

**Le rappel prime sur la précision.** Un faux positif coûte un coup d'œil ; un
faux négatif coûte une photo qu'on ne retrouvera jamais, faute de savoir qu'elle
manque. L'asymétrie est d'autant plus forte que la population tient en 3 930
photos, passées en revue à l'œil de toute façon.

**Mesuré** : filtre sur `2000-12-01 → 2000-12-20`, lecture stricte **0 photo**,
chevauchement **273**. L'album `2000-12-viree au Venezuela-3mois` porte 243
photos datées au mois, d'intervalle `[2000-12-01, 2000-12-31]` ; le 31 dépasse
le 20. Ce n'est pas un cas construit, c'est le deuxième album du périmètre.

Six applications : un intervalle qui **chevauche** est retenu, jamais « doit
être contenu » ; le doute inclut, et la bascule « dates fiables » est désactivée
par défaut ; un seuil n'exclut jamais l'absence de valeur ; un axe textuel
cherche dans tous les champs plausibles ; aucun plafond sur le recouvrement
(§4.1) ; **ce qui est écarté se compte et s'affiche**.

**La limite** : le rappel prime sur la précision, pas sur l'honnêteté. Élargir
un filtre n'élargit pas ce qu'on **affirme**. Une photo ramenée par un
chevauchement de mois affiche `octobre 1999`, pas un jour ; une photo ramenée
par le nom de son album dit que c'est le nom qui a répondu, pas le GPS. **On
ratisse large, on ne raconte pas large.**

### 7.4 Autres invariants

- **Absent n'est pas zéro.** Les valeurs manquantes remontent NULL, jamais une
  valeur par défaut qui se lit comme une donnée. L'interface affiche `sans
  date`, `sans position`.
- **Clés durables** : `cloud_asset_id` pour une photo, `sha256` pour son contenu
  et sa vignette. **Jamais `photos.id`**, réattribué à chaque build.
- **La clé d'un texte est le couple `(kind, id)`, jamais l'`id` seul.**
  *(Mesuré, et c'est un piège réel.)* `passages.id` et `log_entries.id` sont
  bien des clés primaires de `documents.db` — `photo_ui` ne les fabrique pas —
  mais elles vivent dans **deux espaces de noms qui se chevauchent** : les deux
  valent `<pageId>/<NNN>`, et **456 identifiants existent dans les deux
  tables**. `logbook/p003/001` est à la fois un passage (la prose libre du haut
  de page) et une entrée de journal (la première ligne du tableau réglé) — deux
  textes différents. Le manifeste porte déjà `kind` (annexe C) ; la table de
  corrections d'OCR de `app` doit être clée sur le couple, pas sur l'id.
- **Cette clé est positionnelle, donc dérivée, donc instable.** L'id est
  `<pageId>` suivi de l'`ordinal` (passage) ou du `seq` (entrée). Une
  re-dérivation de `documents.db` qui change le découpage d'une page décale tous
  les ids suivants **de cette page**. C'est la raison d'être du `text_original`
  conservé avec chaque correction (§5.4) : il sert de témoin, et une correction
  dont le texte d'origine ne correspond plus est **signalée, jamais appliquée ni
  supprimée**.
- **L'import ne touche pas au travail humain.** Le schéma `app` n'est jamais
  touché par le rechargement. Une sélection dont la photo a disparu est
  **marquée orpheline et signalée**, jamais supprimée.
- **Le geste et l'enregistrement sont deux unités différentes.** L'interface
  sélectionne un album d'un geste, mais enregistre une ligne par photo.

---

## 8. Hors périmètre de la V1

### 8.1 Corriger la datation des photos

`photo_ui` affiche les dates et ne reconstruit pas l'outil de datation
(`packages/review` existe et a produit les 758 annotations).

Mais §3.1 rend l'aller-retour inévitable, donc un chemin de retour est prévu
**sous quatre conditions strictes** : export explicite déclenché à la main ;
drapeau désactivé par défaut ; passage par le writer validant existant
(`appendAnnotation`), jamais un JSONL formaté ici ; et **uniquement
`kind: 'dating'` sur `target.type: 'photo'`** — le seul couple que le pipeline
honore. Écrire autre chose produirait une ligne lue puis ignorée en silence, le
pire des résultats.

### 8.2 Les embeddings CLIP

**Hors V1.** Ils répondent à ce que la légende ne sait pas faire — le
**plus-comme-celle-ci** et la synonymie profonde — au prix d'une infrastructure
entière : sidecar Python, `trust_remote_code`, poids du modèle, quantification
int8, `pgvector`, et un second chemin de recherche à composer avec les filtres
SQL (§6.4).

Le terrain est prêt si le besoin se confirme : `pgvector 0.8.0` est disponible
non installé sur le serveur, et le modèle `jinaai/jina-clip-v2` (1 024
dimensions, int8, ≈ 43 Mo pour la photothèque entière, pas d'index ANN, balayage
complet) est déjà choisi en amont dans `content_index_spec.md`.

**La bonne façon de décider** reste celle que le pipeline s'était imposée entre
ses étapes A et B : vivre avec la brique précédente assez longtemps pour savoir
ce qu'elle ne trouve pas. Ici, cela veut dire lancer le légendage (§6.4),
l'utiliser, et relever les requêtes qui échouent.

### 8.3 Le reste

| Hors périmètre | Pourquoi |
|:---|:---|
| Génération de la BD | ce n'est pas le rôle de l'application |
| Multi-utilisateur, partage | un utilisateur, une machine |
| Carte interactive | 27 % de couverture, 0 % sur deux années |
| Détection de doublons | disponible, sans usage pour composer une BD |
| Vidéos | **aucune sur le périmètre** |
| Reconstruction d'index, relance de passes | `photo_ui` est un consommateur |
| Mode hors ligne | le backend est sur la même machine |
| Historique et annulation des sélections | YAGNI ; désélectionner suffit |

---

## 9. Besoins pour le backend

Ce que le frontend doit obtenir et faire persister. Un contrat REST en sera
dérivé.

### 9.1 État du serveur *(mesuré)*

Conteneur `timescaledb` sur `localhost:5432`, **PostgreSQL 17.6**. Base
`photo_ui` créée, propriétaire `nico`, UTF-8, **fournisseur de collation ICU,
locale `fr-FR`**. Extensions installées : `postgis 3.5.3`, `pg_trgm 1.6`,
`unaccent 1.1`. **Les schémas `pipeline`, `app` et `ref` n'existent pas
encore** — seul `public` est présent.

### 9.2 À lire

**La date résolue de chaque photo** — le calcul de §3, effectué **une fois à
l'import** et stocké, jamais refait à la volée. Colonnes séparées :

| Champ | Contenu |
|:---|:---|
| `resolved_from` | `annotation` · `exif_arbitrated` · `logbook_bracket` · `album_month` · `album_year` — **mêmes valeurs que `date.source` du manifeste**, aucune table de correspondance |
| `resolved_start`, `resolved_end` | **les deux bornes, toujours**, même égales |
| `resolved_precision` | `day` · `month` · `year` |
| `resolved_kind` | `reading` · `inference` · `decision` |
| `arbitration_gap_months` | l'écart mesuré à l'album, NULL hors rang 2 |
| `bracket_hours`, `evidence` | rang 3 seulement |

Les colonnes brutes restent à côté, intactes : la cascade est une couche de
résolution, pas un écrasement, et un désaccord doit rester constatable.

**Les photos filtrées et paginées** — tous les axes de §6 composables, total
renvoyé à part de la page. Chaque photo porte les six champs ci-dessus, la
position avec sa nature, les personnes, le lieu, l'esthétique, `date_source`
brut, l'URL de sa vignette.

**Une photo en détail** — plus les tags IA avec leur confiance, les autres
albums, l'EXIF, et **la proposition et le doute comme champs séparés de premier
niveau**, jamais fondus dans la date.

**Les vignettes** — servies telles quelles depuis
`work/content-thumbs/<sha256>.jpg`. Aucune transformation, aucun cache : elles
existent toutes. Cachables agressivement, la clé est un hash de contenu.

**Un rendu 1400 px** — produit par `sips`, **caché sur le disque interne**. Coût
mesuré : 59 ms en séquentiel, **19 ms à 8 en parallèle** ; le backend doit
paralléliser, c'est le seul levier et il donne un facteur 3. **Pré-construction
complète au premier démarrage**, en tâche de fond : ≈ 75 secondes et ≈ 1,4 Go
pour tout le périmètre, sans bloquer le démarrage. Trois échecs distincts à ne
jamais confondre : volume absent, fichier absent, format non rendable.

**Documents, pages, passages, entrées** — avec leur date, sa nature, leur
`confidence`, et le `spanSource` des fenêtres. Le texte renvoyé est **le texte
corrigé s'il existe, accompagné du texte d'origine**, jamais l'un sans l'autre.
Les images de page sont servies telles quelles.

**La recherche plein texte** — `tsvector` français + `pg_trgm` + `unaccent`,
sur **deux corpus distincts et jamais mélangés** : les textes d'époque (sur le
**texte corrigé**, §5.4) et les **légendes d'images** (§6.4, sur
`coalesce(edited_caption, caption)` et sur `keywords`). Les deux renvoient
**l'extrait qui a répondu, surligné** — sans lui, l'utilisateur ne peut ni juger
un résultat de légende ni apprendre le vocabulaire du modèle. (`passages_fts`
existe en amont mais est vide ; Postgres refait son propre index.)

**Le recouvrement dans les deux sens** — chaque résultat porte **les deux
largeurs et la règle qui l'a produit** (A, B ou C). Aucun plafond ; tri par
défaut sur la somme des largeurs.

### 9.3 À faire persister — schéma `app`

Tâches (slug, titre, consigne, période, horodatages) · sélection d'images (une
ligne par couple tâche/`cloud_asset_id`, avec note, raison de sélection, ordre ;
**créable et supprimable par lot** — sélectionner un album de 286 photos est un
geste, pas 286 requêtes) · sélection de textes (avec décalages si portion) ·
notes libres · **corrections de transcription, globales et non par tâche**
(texte corrigé, texte d'origine au moment de la correction, horodatage) ·
légendes VLM.

### 9.4 À faire persister — schéma `ref`

**`ref.album_span`** (§3.2) — `album_path` normalisé NFC, `date_from`,
`date_to`, `note`, saisie dans l'écran de réglage (§5.7). La donnée la plus
rentable du projet : 25 saisies corrigent
l'intervalle de 421 photos. Appliquée **avant tout le reste de la cascade** ;
tout album absent est marqué `presumed`.

**`ref.web_span`** (§4.2, règle C) — document web → intervalle, marqué comme
inférence humaine.

**Normalisation des noms de pays** (§6.2).

### 9.5 Actions

**Importer / réimporter** — TRUNCATE de `pipeline`, réinsertion depuis les
quatre SQLite **et depuis `annotations.jsonl`** (annexe B.3 : 728 datations à la
main, dont 207 n'existent nulle part ailleurs). Rapport de fin nommant les
sélections orphelines et les corrections dont le texte a bougé.

**Exporter une tâche** · **déclencher le légendage** · **pré-construire les
rendus** · **exporter les datations vers `adobe_mcp`** (§8.1, drapeau désactivé
par défaut). Le backend ne doit avoir **aucun autre chemin d'écriture** vers
`adobe_mcp`.

### 9.6 Règles

1. **Un paramètre de requête inconnu est une erreur 400.** Jamais ignoré, jamais
   retiré en silence — un filtre qui disparaît renvoie la bibliothèque entière,
   c'est arrivé deux fois dans le pipeline.
2. **Un terme de recherche qui se réduit à rien renvoie zéro résultat.**
   Échapper les métacaractères, retirer les caractères de contrôle (un octet NUL
   tronque la requête au milieu d'un littéral).
3. **Chaque filtre s'applique dans sa lecture la plus généreuse** (§7.3), et
   **toute réponse filtrée porte le compte de ce qu'elle a écarté**.
4. **Date, nature, source, précision et bornes sont des champs séparés.** Jamais
   une chaîne pré-formatée. Une date au mois se transmet
   `[2004-09-01, 2004-09-30]` + `precision: 'month'`, **jamais** comme un jour
   arbitraire : un jour inventé au backend est indétectable au frontend.
5. **Aucune date convertie en UTC.** Pas de `timestamptz` — 76 % des
   `captureDate` n'ont aucun fuseau, et le chemin du fichier sur disque dérive
   de l'heure telle qu'elle est stockée. On garde `capture_date_local
   timestamp`, `capture_offset_min int NULL`, `capture_date_raw text`.
6. **Normaliser l'Unicode en NFC à l'import.** *(Vérifié.)* `albumPath` est
   stocké **en NFD** — `…Algès` avec le `è` décomposé, convention du système de
   fichiers macOS. Une égalité littérale avec la même chaîne tapée en NFC **ne
   trouve rien** : un `WHERE albumPath = '…Algès'` a renvoyé zéro ligne là où un
   `LIKE '%Maison rose%'` en renvoyait 22. La clé de `ref.album_span` est un
   `album_path`, donc directement exposée.
7. **`photos.id` ne sort jamais du backend.** Les SQLite s'ouvrent en lecture
   seule.
8. **Un total et une page sont deux choses.**
9. **Le vocabulaire des raisons de doute est une donnée, pas une énumération
   figée** — il a déjà changé une fois et le pipeline s'est désynchronisé avec
   lui-même.

---

## 10. Questions ouvertes

Chacune appelle un choix. **Le défaut indiqué est appliqué en attendant** : rien
n'est bloqué, et une réponse ultérieure ne remet rien en cause.

**Q1 — Que faire des 2 041 photos de 2003-2004 qu'aucun texte ne peut couvrir ?**
Le journal s'arrête le 2 juin 2002. (a) On accepte : elles partent avec les
seules notes personnelles. (b) On date les ~25 documents web du périmètre pour
ouvrir un recouvrement grossier. (c) On s'appuie sur l'appariement visuel (§4.5).
*Défaut : (a) + (b) — `ref.web_span` est prévue et vide, la remplir est un geste
utilisateur, pas un prérequis.*

**Q2 — Sélection de texte : le passage entier ou une portion ?**
(a) Entier — **1 731 des 1 859 passages (93,1 %) font moins de 400 caractères**.
(b) Portion surlignée avec décalages — plus fin, plus de code, fragile si
`documents.db` est re-dérivé.
*Défaut : (a). Passer à (b) n'invalide rien : deux colonnes nullables.*

**Q3 — Correction d'OCR dont le passage a changé côté pipeline ?**
(a) Conserver et marquer « à revoir ». (b) Appliquer et signaler. (c) Supprimer.
*Défaut : (a). Une correction est du travail humain.*

**Q4 — Afficher les pages du site web ?**
Les 60 HTML sont sur disque mais utilisent des thèmes FrontPage, un encodage
`cp1252` et des chemins relatifs. (a) Non, texte seul. (b) Iframe isolée.
(c) Avec nettoyage.
*Défaut : (a). À rouvrir si §4.5 aboutit.*

**Q5 — Une tâche peut-elle contenir des photos hors 1998-2004 ?**
(a) Non. (b) Oui, avec avertissement.
*Défaut : (b) — le périmètre est un paramètre, et une photo de 2005 peut
légitimement conclure un récit.*

**Q6 — L'ordre du manifeste : chronologique ou manuel ?**
*Défaut : chronologique par défaut, réordonnable. Réserve : un ordre calculé sur
des dates faillibles à 40 % se trompera visiblement, ce qui plaide pour que le
réordonnancement arrive tôt.*

**Q7 — Une décision humaine prime-t-elle sur un EXIF qui passe la fenêtre de
6 mois ?** La règle de §3 cite « la date modifiée dans l'UI du pipeline » à deux
échelons, et les deux lectures divergent. **Mesuré : 92 photos portent les deux,
et la main diffère de l'EXIF sur 69.** (a) La main prime toujours. (b) L'EXIF
arbitré prime. (c) La main prime, l'interface signale les 69 désaccords.
*Défaut : (a), éventuellement (c). La passe de datation applique déjà ce
principe (`handDatings()` remplace sans condition) ; §7.1 le suppose ; et
quelqu'un qui a ouvert la photo et tapé une date connaissait l'EXIF affiché — le
contredire était le geste. La précision finale est identique dans les deux cas,
seule la valeur change.*

**Q8 — Quel intervalle par défaut pour un album suspect de couvrir une plage,
tant que sa plage n'est pas saisie ?** 25 albums, 421 photos concernées.
(a) Le mois du préfixe — précis mais trop étroit, donc exclut à tort.
(b) Jusqu'au préfixe de l'album suivant — dérivé, mais faux quand deux albums se
chevauchent, ce qui arrive. (c) L'année entière — large, jamais faux dans le
sens qui coûte, très imprécis.
*Défaut : (a) + le pré-listage des 25 albums à revoir. 25 décisions humaines
contre un mécanisme dérivé fragile ; (c) est le repli si la saisie traîne.*

**Q9 — Exploiter les dates portées par les noms de fichiers ?**
**297 fichiers du périmètre portent un motif `NN-NN`** (`98-99 maison rose
Lisbonne`, `99-03 Les Maldives`), tantôt un mois tantôt une plage d'années ; le
pipeline les ignore entièrement. (a) Non. (b) Comme aide à la saisie de
`ref.album_span` — on montre ce que les noms racontent, l'humain décide.
(c) Comme échelon automatique.
*Défaut : (b). Gain réel, risque nul ; (c) ajouterait une heuristique ambiguë
(`99-00`, `03-04`) à un mécanisme qui n'en a pas besoin.*

---

## 11. Incertitudes

Ce qui n'a pas été vérifié. Rien n'y est deviné.

1. **PostgreSQL est en 17.6, pas 18** *(mesuré)*, sur une image TimescaleDB. Je
   n'ai pas pu me connecter avec des identifiants applicatifs — la vérification
   est passée par `docker exec`. Rien ne dit si la version 18 était visée.

2. **Une seule plage d'album est connue** — celle de `1998-02-Maison rose Algès`,
   donnée par Nicolas. Les 24 autres albums « suspects » sont **ma détection par
   le nom**, et cette liste rate probablement des albums dont le nom ne dit rien
   tout en couvrant plusieurs mois. Le chiffre de 421 photos exposées est un
   ordre de grandeur.

3. **Deux points de la cascade sont ma proposition, pas la règle énoncée** :
   le traitement des albums à année seule (égalité d'année ; 161 photos, dont 16
   basculent), et le calcul de la fenêtre **en mois entiers** plutôt qu'en jours.
   Vu la bimodalité de la distribution, aucun des deux ne change les ordres de
   grandeur.

4. **Le rendement du recouvrement après cascade n'est pas mesuré.** Les chiffres
   de l'annexe A.4 sont ceux d'avant : ils comptent comme « hors plage » ou
   « sans jour » les 745 photos que la cascade répare. **Ce sont des planchers**,
   et c'est la première chose à mesurer une fois §3 implémenté.

5. **L'appariement visuel §4.5 n'est pas testé.** J'ai vérifié la structure des
   galeries, l'existence des 2 207 JPEG et l'absence de correspondance de noms.
   Je n'ai calculé aucun hash perceptuel.

6. **La résolution des pages scannées est peut-être un plafond artificiel.** Les
   155 JPEG font ≈ 810 × 1 250 px, cohérent avec le poids des PDF sources, mais
   je n'ai pas pu extraire une image des PDF pour comparer (ni `pdfimages`, ni
   `pdftoppm`, ni `mutool` sur cette machine). Si l'écriture manuscrite se révèle
   illisible, il reste à établir si une meilleure résolution est récupérable.

7. **Le fuseau de `log_entries.time` est inconnu**, et le bateau a traversé
   l'Atlantique. C'est pourquoi le recouvrement se calcule **au jour civil**. Une
   précision horaire n'est pas dérivable des données.

8. **Les mesures de rendu** viennent d'un échantillon de 20 photos, à chaud, sur
   une machine. Le parallélisme à 8 donne un facteur 3 sur cet échantillon ; les
   75 secondes de pré-rendu complet sont une **extrapolation**.

9. **Les coûts de légendage** reposent sur une estimation du nombre de tokens
   qu'une image consomme. Les tarifs sont exacts, le compte de tokens ne l'est
   pas : à vérifier avec l'API de comptage sur une dizaine d'images, puis un
   échantillon de 20 légendes sur deux ou trois modèles pour trancher consigne
   et modèle sur pièces, avant d'engager les 3 925. **Le légendage étant devenu
   la brique 1 du contenu (§6.4), ce sondage n'est plus optionnel** : il
   conditionne un axe de recherche de la V1, pas une phase différée.

9 bis. **La qualité de la recherche lexicale sur légendes n'est pas mesurée.**
   Je l'ai raisonnée — le `tsvector` français gère les flexions, pas les
   synonymes, d'où les mots-clés normalisés demandés au modèle — mais je n'ai
   ni légende réelle ni requête réelle sur ce corpus. Le taux de rappel effectif
   d'une requête comme « la maison rose » sur 3 925 légendes reste à établir,
   et c'est ce qui dira si les embeddings de §8.2 méritent d'être repris.

10. **Je n'ai pas vérifié album par album** que les préfixes sont cohérents avec
    les documents après la réorganisation de la hiérarchie. §6.1 suppose qu'ils
    ne le sont pas : c'est prudent, pas mesuré.

11. **Une autre session travaille sur `adobe_mcp`** ; les chiffres de l'annexe
    B.3 peuvent avoir bougé. Le mécanisme, lui, ne bougera pas :
    `annotations.jsonl` restera toujours plus complet que `dating.proposals`.

12. **Je n'ai pas lu** l'intégralité de `adobe_mcp/CLAUDE.md`, ni
    `packages/documents/` au-delà de son schéma, ni `packages/photo-index/`. Les
    affirmations de §5.4 sur ce que le pipeline ignore viennent en revanche
    d'une lecture directe du code et sont vérifiées.

---
---

# Annexe A — Mesures détaillées

Relevées le 2026-08-28, en lecture seule, sur `mcp-index.db` (reconstruite à
16 h 48), `mcp-content.db`, `documents.db` et `dating.db` (réécrite à 16 h 49).

## A.1 Fiabilité des dates, avant et après cascade

**Avant** — ce que le pipeline livre :

| Origine | Photos | % |
|:---|---:|---:|
| EXIF, année dans la période | 2 350 | 59,8 % |
| EXIF, année hors période (**date de scan**) | 512 | 13,0 % |
| Nom de dossier tapé à la main | 835 | 21,2 % |
| Rien | 233 | 5,9 % |

Soit **1 580 photos sur 3 930 (40,2 %) qui reposent sur une main, une horloge de
scanner, ou rien.**

`dateSource` du pipeline : `capture-date` 2 862, `folder-sequence` 538, `none`
233, `folder-month` 197, `folder-month-assumed` 70, `folder-year` 30,
`folder-exact` **0**.

**Après cascade** — voir §3.3. État final : 3 060 au jour, 840 au mois, 30 à
l'année. Les 30 sont l'album `2000-2001/2000`, ce tas de photos jamais classées.

## A.2 Distribution des écarts EXIF ↔ album

*(3 394 photos ayant un EXIF et un album `aaaa-mm`)*

| Écart | Photos |
|:---|---:|
| 0 mois | 981 |
| 1 mois | 776 |
| 2 mois | 442 |
| 3 mois | 216 |
| 4 mois | 1 |
| 5 mois | 4 |
| 6 mois | 4 |
| 7-12 mois | 25 |
| 1-5 ans | 71 |
| **> 5 ans** | **874** |

Années EXIF des 874 : **2017** pour 466, **2013** pour 260, **2014** pour 135,
2011 pour 8, 2010 pour 3, 2008 pour 2.

Verdict : **2 424 EXIF retenus, 970 écartés.**

Albums à année seule (161 photos) : 115 ont un EXIF de la même année → retenu ;
16 sont à un an d'écart, 30 à 13-15 ans → album retenu.

## A.3 Albums suspects de couvrir une plage

25 albums sur 82, 1 268 photos, dont **421 des 840 photos datées au mois**.

| Signal | Exemples | Albums | Photos |
|:---|:---|---:|---:|
| Durée explicite | `2000-12-viree au Venezuela-3mois` | 1 | 246 |
| Trajet, deux lieux ou plus | `1999-12 Capvert Guadeloupe`, `2003-11-Sorel-Beaufort-Fort Lauderdale`, `2004-01- Fort Lauderdale - Belize`, `1999-10 Lisboa Madere` | 24 | 1 022 |

**Cas de référence, `1998-1999/1998-02-Maison rose Algès`** : 22 photos, aucune
position GPS, **19 fichiers nommés `98-99 maison rose Lisbonne (N).jpg`**. Les
captureDate sont des dates de scan (2013-12, 2014-01) sauf une,
`6ieme Lisbonne 98-99.jpg` à `1998-06-01`, à 4 mois du préfixe donc retenue par
l'arbitrage — et bien dans la plage réelle février 1998 → juin 1999.

**297 fichiers du périmètre** portent un motif `NN-NN` dans leur nom (`99-03 Les
Maldives`, `99-12 Traversée Atlantique`, `98-07 Famille Trotobas Lisbonne`),
tantôt un mois tantôt une plage d'années. Le pipeline ignore les noms de
fichiers (Q9).

## A.4 Rendement du recouvrement *(avant cascade — planchers)*

**Écarts entre journées consécutives du journal** : 1 jour 87 fois, 2-3 j 56,
4-7 j 48, 8-30 j 39, 31-90 j 9, plus de 90 j 1 fois. **Maximum 92 jours.**

**Règle A sur les 3 930 photos :**

| Résultat | Photos | % |
|:---|---:|---:|
| Hors de la plage du journal | 2 851 | 72,5 % |
| Sans jour exploitable | 233 | 5,9 % |
| Fourchette ≤ 2 jours | 67 | 1,7 % |
| Fourchette 3-7 jours | 236 | 6,0 % |
| Fourchette 8-30 jours | 107 | 2,7 % |
| Fourchette > 30 jours | 436 | 11,1 % |

Égalité stricte de jour, pour comparaison : **126 photos (3,2 %)**.

**Règle B :** « Ma vie » recouvre **55 photos** avec 5 à 13 passages candidats
chacune (moyenne 9) — peu de photos, mais serré. Les passages du journal
recouvrent **687 photos** avec 3 à **51** candidats (moyenne 14), parce que 20
pages du journal couvrent chacune plus de 30 jours.

**Fenêtres de page :** « Ma vie » 23 pages couvrent 1 jour, 80 en couvrent 2-3.
Journal : 1 page 1 jour, 7 pages 2-3 j, 8 pages 4-7 j, 13 pages 8-30 j, **20
pages plus de 30 jours**. `spanSource` : `entries` 49, `passages` 81, `carried`
22, NULL 3.

## A.5 Vocabulaire des tags IA sur le périmètre

**2 593 tags distincts.**

| Photos couvertes | Tags | Liens | Valeur |
|:---|---:|---:|:---|
| > 1 500 | 5 | 9 087 | inutilisable — `blue`, `travel`, `sky`, `water`, `nature` |
| 501 – 1 500 | 37 | 31 029 | trop large — `sea`, `man`, `boat`, `beach` |
| 101 – 500 | 156 | 33 400 | utile — `castle` 217, `ruins` 184, `adventure` 319 |
| 21 – 100 | 369 | 16 139 | très utile — `maya` 93, `fortress` 83, `archeology` 66, `dunes` 50, `aquarium` 46, `volcano` 42 |
| 6 – 20 | 476 | 5 169 | pointu — `gator` 16, `map` 13, `ferry` 11, `moon` 11, `camping` 10, `tulum` 7 |
| 2 – 5 | 730 | 2 205 | anecdotique |
| 1 | 820 | 820 | bruit ou pépite, indiscernable |

**Bande exploitable (6 à 500 photos) : 1 001 tags**, et les 3 930 photos en
portent chacune au moins un.

**Confiance** : 62 219 liens à 48-64, 31 424 à 65-79, **4 206 à 80 ou plus**.

## A.6 Axes à ne pas construire

| Axe | Périmètre | Pourquoi non |
|:---|:---|:---|
| Note (`rating`) | 300 > 0 (7,6 %) | trop peu |
| Drapeau `pick`/`reject` | **0** | n'existe pas sur la période |
| Titre | 2 | — |
| Description | 1 019, **toutes `OLYMPUS DIGITAL CAMERA`** | artefact d'appareil |
| Couleur dominante | 100 %, dont 64 % `grey` | ne discrimine rien |
| Appareil | 100 % | corrélé à l'année, pas une intention de recherche |
| Doublons perceptuels | disponible | vrai service, pas pour composer une BD |

## A.7 Personnes et lieux

**46 personnes** sur 782 photos : Hugo 249, Nicolas 148, Gigi 135, Gaetan 94,
Michel Berube 76, Nicole 37, Michel 29, Anton 26. Sous 20 photos, la traîne
n'est pas un filtre utilisable.

Une présence date une photo : Gaëtan est à bord du premier voyage et pas du
second, Michel seulement du second. Mais **un album n'est pas un équipage** —
`2002-04-Ghislaine est a Saint Martin` est Ghislaine seule pendant que le reste
de la famille est ailleurs.

**Pays** (là où il y a du GPS) : États-Unis 354, Venezuela 329, Trinité 139 + 6,
France 77, Bahamas 42, Turks et Caïques 24, Grenade 23, Portugal 22, Guadeloupe
17, Sainte-Lucie 17, Saint-Vincent 8, Saint-Martin 3 + Sint Maarten 3. Noter les
doublons de graphie.

## A.8 Coût de rendu

Mesuré à 1400 px, qualité 78, sur le volume Thunderbolt : **59 ms par image en
séquentiel, 19 ms à 8 en parallèle**, ≈ 365 Ko par image. Pré-rendu complet du
périmètre : **≈ 75 s et ≈ 1,4 Go** (extrapolé). Les vignettes 224 px existent
déjà, 3 925 sur 3 925, 1 Go pour la photothèque entière.

---

# Annexe B — Ce que fournit le pipeline

## B.1 Les quatre bases

| Base | Rôle | Cycle de vie |
|:---|:---|:---|
| `mcp-index.db` | l'index interrogeable, 42 911 photos | **supprimée et réécrite** à chaque build |
| `mcp-content.db` | OCR, `dhash`, couleur, clé `sha256` | jamais supprimée — cache de faits coûteux |
| `documents.db` | journal, « Ma vie », site web | **la seule irremplaçable** (`page_replies`) |
| `dating.db` | propositions de date et de position | **vidée et réécrite** à chaque passe |

**Clés de jointure** : `cloudAssetId` (identité stable d'une photo) et `sha256`
(contenu et vignette). **`photos.id` est réattribué à chaque build.**

Chemins : originaux et bases sous `LR_TARGET`, vignettes dans
`work/content-thumbs/<sha256>.jpg` (côté long 224 px), images de pages sous
`adobe_mcp/docs/pages/`, annotations dans `adobe_mcp/data/annotations/`.

## B.2 Ce que la passe contenu a réellement produit

| Signal | Périmètre | Permet |
|:---|:---|:---|
| `ocr.text` | 614 non vides, 165 ≥ 25 caractères | le texte **imprimé dans** l'image |
| `visual.colorName` | 3 930, 64 % de gris | rien |
| `visual.dhash` | 3 930 | doublons perceptuels |
| `embeddings` | **0 ligne** | — |

Échantillon d'OCR réellement utile : `ROBERT IS HERE... FRUIT STAND`,
`TISSAGE LAFFAILLE`, `AZROU KHENIFRA MARRAKECH RAS EL MA`. Marginal mais
irremplaçable — c'est le seul moyen d'atteindre ce qui est *écrit* dans une
photo. `ocr.lang` n'est pas un axe : le reconnaisseur devine plutôt que de
s'abstenir.

## B.3 Datations à la main — l'état réel

`annotations.jsonl` : **758 lignes**, toutes `kind: 'dating'` sur
`target.type: 'photo'`, 758 cibles distinctes, toutes présentes dans l'index.
**728** portent une date, **30** portent `value: {}` et la note
`"photo were moved to another place in the hierarchy"`.

**Ces 30 sont exactement les 30 `no-place-in-name` de `dating.db`**
*(intersection mesurée : 30 sur 30)*. La note est donc la réponse humaine à ce
doute précis, pas une annotation orpheline. Une photo « déplacée ailleurs dans
la hiérarchie » reste sans date : ce sont les seules du périmètre dont le doute
a été vu et laissé ouvert.

`dating.db` : **521 propositions, toutes `manual`** ; **30 doutes, tous
`no-place-in-name`**. **Aucune proposition machine ne subsiste.**

**Écart de 207 datations, expliqué et vérifié dans le code** : la passe
(`packages/dating/src/cli.ts`) ne considère que les photos
`year BETWEEN 1998 AND 2003` **dont le `captureDate` ne concorde pas avec
l'année**. Les 207 ont un `captureDate` concordant et sortent de son périmètre.

Deux conséquences pour `photo_ui` : **`annotations.jsonl` est la seule trace
complète des décisions humaines**, `dating.proposals` en est un sous-ensemble
filtré ; et **2004 est entièrement hors de la passe** (`TO_YEAR = 2003`), soit
1 180 photos sans proposition ni doute.

## B.4 Ce que le pipeline ignore silencieusement

Vérifié dans le code. `readAnnotations` accepte quatre `kind` et cinq
`target.type`, mais son **seul consommateur** est `packages/dating/src/cli.ts`,
qui les passe à deux fonctions filtrant respectivement sur
`kind === 'dating' && target.type === 'photo'` et
`kind === 'dating' && target.type === 'album'`.

**Tout le reste — `correction`, `addition`, `arbitration`, et les cibles
`passage`, `log_entry`, `page` — est lu, validé, puis ignoré sans un mot.**
D'où : les corrections de texte de §5.4 restent locales, et l'export de §8.1 ne
porte que sur `dating`/`photo`.

À noter aussi : une annotation `dating` sur `target.type: 'album'` avec
`value: {from, to}` est lue **avant tout calcul et prime sur tout, le filtre
d'année compris**. C'est l'équivalent amont de `ref.album_span` (§3.2), et
l'export pourrait la remonter telle quelle si §8.1 était un jour élargi aux
cibles `album`.

## B.5 Pièges hérités, déjà payés

- **`photos.year`/`month` ne sont pas autoritaires sur 1998-2004** : le préfixe
  d'album gagne sur l'EXIF dans le pipeline, et ces préfixes n'ont jamais été
  réconciliés avec les documents.
- **`albums.year` est pire encore, et il faut l'ignorer.** Le build le remplit
  après coup par un vote sur l'année **modale** des photos de l'album : une
  majorité de dates de scan emporte le vote. **19 des 82 albums du périmètre
  portent une année fausse** *(mesuré)* — `1998-02-Maison rose Algès` vaut 2013,
  `2000-12-viree au Venezuela-3mois` vaut 2017, `2003-05-Orlando` vaut 2008, et
  `2003-03-everglades` vaut NULL. Ne jamais lire `albums.year` : l'année vient
  du préfixe du nom, et l'intervalle de `ref.album_span`.
- **`captureDate` a six formats** dans une seule colonne, dont 76 % sans aucun
  fuseau. Un cast naïf en `timestamptz` décale silencieusement 32 070 photos.
- **Les mots-clés `kind='user'` ne sont pas ce qu'une personne a écrit** :
  1 591 des 2 496 noms sont aussi des tags IA, 656 sont des noms d'album.
- **`photos_fts` est contentless** : `WHERE photos_fts MATCH ? AND rowid = ?`
  ignore silencieusement le rowid et renvoie le compte du corpus.
- **`passages_fts` est vide** malgré ce qu'annonce la doc amont.
- **Les positions du journal sont en degrés-minutes**, pas en décimal :
  `14.43.9N` vaut 14,73 et non 14,44.
- **L'appartenance album est multiple** : sur le périmètre, 613 photos sont dans
  2 albums, 3 223 dans 3, 94 dans 4 — les fourre-tout racine ajoutent une
  appartenance à presque tout.

---

# Annexe C — Forme du manifeste

```jsonc
{
  "schema_version": 1,
  "task": {
    "slug": "1999-transat",
    "title": "La transat, septembre-octobre 1999",
    "brief": "…",
    "period": { "from": "1999-09-01", "to": "1999-11-30" },
    "created_at": "…", "exported_at": "…"
  },
  "images": [{
    "cloud_asset_id": "05b9a4fac5df4dd28dcc1002d7ec0074",
    "sha256": "…",
    "file": "images/05b9a4fac5df4dd28dcc1002d7ec0074.jpg",
    "album_path": "1998-1999/1999-10 Lisboa Madere",
    "group_name": "Lisboa Madere",

    // La date, avec SA NATURE et SA PRÉCISION. Jamais aplatie.
    "date": { "start": "1999-10-14", "end": "1999-10-14", "precision": "day",
              "kind": "decision", "source": "annotation", "bracket_hours": null },
    "position": { "lat": 32.98, "lon": -16.39, "kind": "inference",
                  "source": "logbook_interpolated" },

    "people": ["Hugo", "Gigi"],
    "place": { "city": null, "country": null },
    "user_note": "Hugo à la barre, on venait de doubler le Bugio",

    // Légende VLM, optionnelle. JAMAIS dans `texts[]` ni `notes[]`.
    "caption": { "text": "Un homme barre un voilier, mer formée, ciel couvert.",
                 "kind": "machine", "model": "claude-haiku-4-5",
                 "created_at": "…" },

    "selected_because": ["date_range", "album"]
  }],
  "texts": [{
    // (1) UNE ENTRÉE DE JOURNAL, règle A — le seul cas où la date affirmée et la
    //     fenêtre couverte divergent vraiment.
    "id": "logbook/p021/004",
    "kind": "log_entry",            // passage | log_entry
    "document": "logbook",          // ma-vie | logbook | web/1999/Transat
    "page": "logbook/p021",
    "page_image": "pages/logbook-p021.jpg",
    "text": "…",                    // le texte EFFECTIF, corrigé s'il l'a été
    "text_original": "…",           // la transcription d'origine, si corrigée
    "corrected": true,
    // ce que le texte AFFIRME — ce jour-là, écrit sur la page le jour même
    "date": { "from": "1999-10-14", "to": "1999-10-14",
              "kind": "reading", "source": "log_entry_date" },
    // la fenêtre qu'il COUVRE — jusqu'à la veille de la journée suivante
    // renseignée. Calculée, jamais plus étroite, JAMAIS affichée comme une date.
    "overlap": { "from": "1999-10-14", "to": "1999-10-16",
                 "rule": "logbook_entry", "span_source": null },
    "covers_images": ["05b9a4fac5df4dd28dcc1002d7ec0074"],
    "user_note": null
  }, {
    // (2) UN PASSAGE NON DATÉ, règle B — placé par la fenêtre de sa page, donc
    //     `inference` et jamais `reading` : il n'affirme pas cette date, il
    //     l'hérite. `span_source: "carried"` dit que la page ne nomme aucun jour
    //     et reprend celui de la précédente — une inférence sur une inférence,
    //     et ça doit se voir. Sous la règle B, `date` et `overlap` coïncident
    //     toujours : daté, le passage couvre son seul jour ; non daté, il couvre
    //     la fenêtre qui le date.
    "id": "ma-vie/p007/002",
    "kind": "passage",
    "document": "ma-vie",
    "page": "ma-vie/p007",
    "page_image": "pages/ma-vie-p007.jpg",
    "text": "…",
    "text_original": "…",
    "corrected": false,
    "date": { "from": "1999-10-20", "to": "1999-10-22",
              "kind": "inference", "source": "page_window" },
    "overlap": { "from": "1999-10-20", "to": "1999-10-22",
                 "rule": "passage", "span_source": "carried" },
    // vide : la photo est du 14 octobre, hors de [10-20, 10-22]. `covers_images`
    // n'énumère que les images que le prédicat de §4.1 retient réellement.
    "covers_images": [],
    "user_note": null
  }],
  "notes": [{
    "id": "note_01JB…", "created_at": "…",
    "title": "Ce que le journal ne dit pas",
    "text": "…",
    "attached_to": { "images": [], "texts": [] }   // vide = note générale
  }]
}
```

**Les valeurs du manifeste sont celles du contrat, à la lettre près.** Aucune
table de correspondance entre l'API, la base et le fichier livré : `date.source`,
`position.source`, `overlap.rule`, `span_source` et `selected_because` prennent
les valeurs des énumérations fermées du contrat (§2.1), en `snake_case`. En
particulier `logbook_interpolated` et non `logbook-interpolated` — le pipeline
amont écrit des tirets, `photo_ui` normalise en tirets bas à l'import et ne les
reproduit nulle part. Les **clés** du manifeste sont en `snake_case` là où
l'API est en `camelCase` : c'est la seule différence, et elle est mécanique.

**Le manifeste ne se relit pas seulement pour sa forme, mais pour sa
cohérence.** Chaque `covers_images` doit satisfaire le prédicat de §4.1 contre
la `date` de l'image citée, et chaque `overlap` doit être ce que sa règle
produit — un exemple qui triche est recopié tel quel.
