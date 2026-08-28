# Inventaire du pipeline `adobe_mcp` — données dérivées

Document de référence. Tout ce qui suit a été **lu sur les bases réelles** le
**2026-08-28**, en lecture seule (`sqlite3 "file:…?mode=ro" -readonly`), et non
recopié depuis `docs/sqlite.md`. Là où le réel diffère de la doc du projet, c'est
signalé explicitement.

Racine des quatre bases (surchargeable par `LR_TARGET`) :

```
/Volumes/OWC Envoy Ultra/Pictures/lightroom/work/
```

| Base | Taille disque | Tables | Table principale | Lignes |
|---|---|---|---|---|
| `mcp-index.db` | 95 043 584 o | 11 (dont 1 FTS5) | `photos` | 42 911 |
| `mcp-content.db` | 19 120 128 o | 4 | `ocr` / `visual` | 41 913 chacune |
| `documents.db` | 1 310 720 o | 7 (dont 1 FTS5) | `passages` | 1 859 |
| `dating.db` | 229 376 o | 2 | `unresolved` | 483 |

Toutes ont un `-shm` et un `-wal` de 0 octet à côté : elles sont en mode WAL mais
sans transaction en attente. Rien n'a été écrit pendant cet inventaire.

---

## 1. `mcp-index.db` — l'index interrogeable

Reconstruit intégralement par `npm run build-index`, qui **supprime le fichier et
le réécrit**. Aucune donnée non recalculable ne doit y vivre.

### 1.1 `photos` — 42 911 lignes

Une ligne par photographie, aplatie depuis les deux catalogues Lightroom + les
passes dérivées. C'est la table pivot de tout le système.

```sql
CREATE TABLE photos(
  id              INTEGER PRIMARY KEY,
  cloudAssetId    TEXT UNIQUE NOT NULL,
  path            TEXT UNIQUE NOT NULL,
  folder          TEXT NOT NULL,
  albumPath       TEXT,
  groupName       TEXT,
  year            INTEGER,
  month           INTEGER,
  day             INTEGER,
  sequence        INTEGER,
  dateSource      TEXT NOT NULL,
  captureDate     TEXT,
  rating          INTEGER,
  flag            TEXT,
  format          TEXT NOT NULL,
  fileSize        INTEGER,
  sha256          TEXT,
  width           INTEGER,
  height          INTEGER,
  aestheticsScore INTEGER,
  cameraMake      TEXT,
  cameraModel     TEXT,
  lens            TEXT,
  iso             INTEGER,
  aperture        REAL,
  shutter         TEXT,
  focalLength     REAL,
  latitude        REAL,
  longitude       REAL,
  altitude        REAL,
  city            TEXT,
  state           TEXT,
  country         TEXT,
  countryCode     TEXT,
  sublocation     TEXT,
  title           TEXT,
  description     TEXT,
  hasDevelop      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX photos_year    ON photos(year, month);
CREATE INDEX photos_group   ON photos(groupName);
CREATE INDEX photos_place   ON photos(country, city);
CREATE INDEX photos_rating  ON photos(rating);
CREATE INDEX photos_camera  ON photos(cameraModel);
CREATE INDEX photos_sha     ON photos(sha256);
CREATE INDEX photos_capture ON photos(captureDate);
```

| Colonne | Type | Non-NULL / 42 911 | Remarques mesurées |
|---|---|---|---|
| `id` | INTEGER PK | 42 911 | **Instable.** Réattribué à chaque `build-index`. Ne jamais l'utiliser hors de cette base. |
| `cloudAssetId` | TEXT UNIQUE | 42 911 | **32 caractères hex**, minuscules, sans tirets. Ex. `000123eefc6c45c498a068a6e251bfe6`. C'est l'id du catalogue cloud Adobe, stable. Clé de jointure inter-bases. |
| `path` | TEXT UNIQUE | 42 911 | Chemin **absolu** de l'original. Toujours sous `/Volumes/OWC Envoy Ultra/Pictures/lightroom/originals/`. Vérifié : 8 fichiers pris au hasard existent tous sur le disque. |
| `folder` | TEXT | 42 911 | `dirname(path)`, absolu lui aussi. |
| `albumPath` | TEXT | 38 187 | Chemin logique de l'album principal, ex. `2000-2001/2000-10 St Vincent`. 4 724 NULL (les photos du bucket `a_deplacer`). |
| `groupName` | TEXT | 36 143 | Le nom de la sortie, préfixe de date retiré, ex. `St Vincent`. |
| `year` `month` `day` | INTEGER | 42 491 / — / — | Date **effective** retenue, cf. `dateSource`. Plage `year` : 1923 → 2026, 420 NULL. |
| `sequence` | INTEGER | 1 212 | Numéro de semaine ou de voyage quand `YYYY-NN` n'a pas pu être un mois. Valeurs 2 → 99. |
| `dateSource` | TEXT NOT NULL | 42 911 | 7 valeurs, cf. §6. |
| `captureDate` | TEXT | 42 081 | Chaîne ISO-8601 de longueur variable, cf. §6. |
| `rating` | INTEGER | 23 328 | 0..5. 19 583 NULL, 18 260 à 0. Classic gagne sur le cloud quand les deux diffèrent. |
| `flag` | TEXT | 38 | `pick` (23) ou `reject` (15). NULL partout ailleurs. |
| `format` | TEXT NOT NULL | 42 911 | `jpg` 32 061 · `heic` 8 600 · `png` 828 · `cr2` 676 · `tif` 470 · `jpeg` 143 · `dng` 85 · `m4v` 40 · `orf` 5 · `psd` 3. Minuscules. **`m4v` = 40 vidéos**, que la passe contenu saute. |
| `fileSize` | INTEGER | — | Octets. |
| `sha256` | TEXT | 42 911 (0 NULL) | 64 hex minuscules. **Pas unique** : 41 951 valeurs distinctes, 949 groupes de doublons (le même fichier importé deux fois). Index non-unique `photos_sha`. |
| `width` `height` | INTEGER | — | Pixels de l'original. |
| `aestheticsScore` | INTEGER | 42 708 | Score Adobe, 24 → 100. |
| `cameraMake` … `focalLength` | mixte | — | EXIF brut. `shutter` est **une chaîne** (`1/35`), pas un nombre. `aperture` et `focalLength` sont REAL. |
| `latitude` `longitude` | REAL | **18 059** | Degrés décimaux signés, cf. §7. |
| `altitude` | REAL | 11 880 | Mètres, −245,1 → 2 467,4. |
| `city` | TEXT | 15 263 | Reverse-geocoding Adobe. |
| `state` | TEXT | 17 676 | |
| `country` | TEXT | 18 052 | Nom localisé en français (`Maurice`, `France`). |
| `countryCode` | TEXT | 10 673 | |
| `sublocation` | TEXT | 2 855 | |
| `title` | TEXT | 232 | |
| `description` | TEXT | 3 025 | |
| `hasDevelop` | INTEGER NOT NULL | 36 459 à 1 | Booléen 0/1. |

**Deux lignes réelles** (tronquées à 200 car./colonne) :

```
id = 1
cloudAssetId = 000123eefc6c45c498a068a6e251bfe6
path = /Volumes/OWC Envoy Ultra/Pictures/lightroom/originals/ToBeSorted/iPhoneNico/20170702_074223253_iOS.jpg
folder = /Volumes/OWC Envoy Ultra/Pictures/lightroom/originals/ToBeSorted/iPhoneNico
albumPath = ToBeSorted/iPhoneNico
groupName = iPhoneNico
year = 2017 | month = 7 | day = 2 | sequence = NULL
dateSource = capture-date
captureDate = 2017-07-02T11:42:23
rating = 0 | flag = NULL | format = jpg | fileSize = 1587830
sha256 = 91b6b507ddf4ea37470538722191ecedd3b6727f69ea6530fb9ce5b0b1c34ebd
width = 4032 | height = 3024 | aestheticsScore = 47
cameraMake = Apple | cameraModel = iPhone 7
lens = iPhone 7 back camera 3.99mm f/1.8
iso = 32 | aperture = 1.8 | shutter = 1/35 | focalLength = 39.0
latitude = -19.993445 | longitude = 57.636383 | altitude = 15.6
city = NULL | state = Rivière du Rempart District | country = Maurice
countryCode = NULL | sublocation = NULL | title = NULL | description = NULL
hasDevelop = 1

id = 2
cloudAssetId = 000349d15863411099e89665ec8ecc85
path = /Volumes/OWC Envoy Ultra/Pictures/lightroom/originals/ToBeSorted/aTrier/IMG_2312.JPG
folder = /Volumes/OWC Envoy Ultra/Pictures/lightroom/originals/ToBeSorted/aTrier
albumPath = ToBeSorted/aTrier
groupName = aTrier
year = 2015 | month = 6 | day = 4 | sequence = NULL
dateSource = capture-date
captureDate = 2015-06-04T13:57:16
rating = 0 | flag = NULL | format = jpg | fileSize = 2372014
sha256 = c29240337e1331f9d69c5512dd53e315500483b4e11f8bbc6404a0f328ca3da4
width = 2448 | height = 3264 | aestheticsScore = 50
cameraMake = Apple | cameraModel = iPhone 6
lens = iPhone 6 back camera 4.15mm f/2.2
iso = 32 | aperture = 2.2 | shutter = 1/580 | focalLength = 29.0
latitude = 48.722038 | longitude = -3.978622 | altitude = 7.8
city = Roscoff | state = Bretagne | country = France
countryCode = NULL | sublocation = NULL | title = NULL | description = NULL
hasDevelop = 1
```

### 1.2 `albums` — 675 lignes

La hiérarchie cloud à deux niveaux, une ligne par album.

```sql
CREATE TABLE albums(
  id         INTEGER PRIMARY KEY,
  path       TEXT UNIQUE NOT NULL,
  setName    TEXT,
  albumName  TEXT NOT NULL,
  groupName  TEXT,
  year       INTEGER,
  month      INTEGER,
  dateSource TEXT NOT NULL
);
```

**Représentation de la hiérarchie** — il n'y a **pas** de table `album_sets` ni de
colonne `parentId`. Le niveau est purement textuel :

- `path` est la clé logique, ex. `2023/23-05 Semaine du Golfe`.
- `setName` = tout ce qui précède le dernier `/`, ou **NULL pour un album racine**.
- `albumName` = le dernier segment.
- Mesuré : **21 albums racine** (`setName IS NULL`), **654 albums imbriqués**,
  répartis sur **33 sets distincts**. Aucun troisième niveau observé.
- Les 21 racines : `194x -> 1969`, `1970 -> 1979`, `1980 -> 1987`,
  `2 August 2022 21:25`, `29 mai 2025` (+ 5 variantes numérotées),
  `Chapon à trier`, `Gigi Ipad`, `Gigi Iphone`, `Gigi Recettes`, `Importants`,
  `Nico Ipad`, `Nico Iphone`, `Perso`, `all pics`, `h30`, `test`.
- Sets les plus fournis : `2016` (65), `2015` (45), `2017` (38), `2009` (37),
  `2018` (33), `1994-1995` (31), `2014` (31), `2010` (31).

| Colonne | Non-NULL / 675 | Remarques |
|---|---|---|
| `year` | 673 | Plage 1923 → 2024. **Rempli après coup** par un `UPDATE` qui prend l'année **modale** des photos de l'album — d'où `2023/23-05 Semaine du Golfe` avec `year = 1923` (une photo mal datée suffit à emporter le vote quand elle est majoritaire). |
| `month` | 672 | Même mécanisme. |
| `groupName` | 624 | |
| `dateSource` | 675 | **`unset` pour les 675 lignes, sans exception.** La colonne existe mais n'est jamais renseignée par le build actuel. |

Exemples réels :

```
id=2  path=ToBeSorted/iPhoneNico  setName=ToBeSorted  albumName=iPhoneNico  groupName=iPhoneNico  year=2017 month=9  dateSource=unset
id=4  path=2023/23-05 Semaine du Golfe  setName=2023  albumName=23-05 Semaine du Golfe  groupName=Semaine du Golfe  year=1923 month=5  dateSource=unset
```

### 1.3 `photo_albums` — 89 036 lignes

Appartenance photo↔album, plusieurs-à-plusieurs, sans clé primaire.

```sql
CREATE TABLE photo_albums(
  photoId INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  albumId INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE
);
CREATE INDEX photo_albums_photo ON photo_albums(photoId);
CREATE INDEX photo_albums_album ON photo_albums(albumId);
```

Distribution mesurée : 8 436 photos dans 1 album, 9 418 dans 2, **19 568 dans 3**,
765 dans 4. Maximum observé : 4. Exemples : `(1,1)`, `(1,2)`.

### 1.4 `people` — 133 lignes · `photo_people` — 13 612 lignes

```sql
CREATE TABLE people(
  id   INTEGER PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);
CREATE TABLE photo_people(
  photoId  INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  personId INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  x REAL, y REAL, w REAL, h REAL
);
CREATE INDEX photo_people_photo  ON photo_people(photoId);
CREATE INDEX photo_people_person ON photo_people(personId);
```

- **133 personnes nommées**, une par cluster de visages nommé dans Lightroom.
- **9 723 photos distinctes** portent au moins un visage nommé (sur 42 911).
- Le lien personne↔photo est `photo_people`, joint sur `photos.id` **local**
  (jamais sur `cloudAssetId`).
- `x y w h` sont des **fractions normalisées [0,1]** de la largeur/hauteur de
  l'image : boîte du visage. Mesuré : x ∈ [0 ; 0,974], y ∈ [0 ; 0,957],
  w ∈ [0,014 ; 0,947], h ∈ [0,016 ; 0,958]. Convention : `(x, y)` = coin haut-gauche.
- Personnes les plus photographiées : Atlas 1 981, Gigi 1 923, Nicolas 1 857,
  Hugo 1 113, Gaetan 973, Kathya 365, Babette 363, Bastien Seze 323,
  Joelle Vignault 278, Celine Berger 255, Stephanie Cuvillier 241, Eric 218.

Exemples réels :

```
people:       id=1 name=Gigi        | id=2 name=Cathy
photo_people: photoId=2 personId=1 x=0.335375816993464 y=0.14307598039215683 w=0.17197712418300654 h=0.12898284313725492
              photoId=4 personId=1 x=0.6506189821182944 y=0.2937204591492235 w=0.061898211829436035 h=0.09115462525320728
```

### 1.5 `tags` — 8 024 lignes · `photo_tags` — 971 097 lignes

```sql
CREATE TABLE tags(
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  UNIQUE(name, kind)
);
CREATE TABLE photo_tags(
  photoId    INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  tagId      INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  confidence INTEGER
);
CREATE INDEX photo_tags_photo ON photo_tags(photoId);
CREATE INDEX photo_tags_tag   ON photo_tags(tagId, confidence);
```

- `tags.kind` : **`ai` 5 528** · **`user` 2 496**. Le même libellé peut exister
  dans les deux `kind` (d'où l'unicité composite).
- `photo_tags.confidence` : **NULL pour les 246 568 liens `user`**, entier
  **48 → 98** pour les 724 529 liens `ai`. C'est donc aussi le discriminant
  pratique sans jointure sur `tags`.
- Les tags `user` incluent des artefacts d'import : `all pics` (22 257 photos),
  `2 August 2022 21:25` (20 788), `Nico Iphone` (10 108) — ce sont des noms
  d'album promus en mots-clés Classic, pas des mots-clés éditoriaux.
- Tags `ai` les plus fréquents : `blue` 14 139, `nature` 12 021, `sky` 11 106,
  `people` 10 919, `man` 10 608, `water` 10 458, `travel` 10 251.

Exemples réels : `tags(1,'hand','user')`, `tags(2,'iPhoneNico','user')` ;
`photo_tags(1, 1, NULL)`, `photo_tags(1, 2, NULL)`.

### 1.6 `photo_proposals` — 85 lignes

Copie de `dating.proposals`, **re-clée sur `photos.id` local**, jamais fusionnée
dans `photos`.

```sql
CREATE TABLE photo_proposals(
  photoId        INTEGER PRIMARY KEY REFERENCES photos(id) ON DELETE CASCADE,
  date           TEXT NOT NULL,
  dateSource     TEXT NOT NULL,
  latitude       REAL, longitude REAL,
  positionSource TEXT,
  evidence       TEXT NOT NULL,
  spanHours      REAL,
  confidence     TEXT NOT NULL
);
CREATE INDEX photo_proposals_date ON photo_proposals(date);
```

Valeurs réelles mesurées : `dateSource` = `logbook-bracket` (85/85),
`confidence` = `proposed` (85/85), `positionSource` = `logbook-interpolated` (79)
ou NULL (6). `evidence` est une **chaîne JSON**, tableau d'ids de `log_entries`.

```
photoId=86  date=2002-02-23 dateSource=logbook-bracket lat=NULL lon=NULL positionSource=NULL evidence=[] spanHours=NULL confidence=proposed
photoId=337 date=2002-03-05 dateSource=logbook-bracket lat=18.40909557713053 lon=-64.26342265372169 positionSource=logbook-interpolated evidence=["logbook/p047/018","logbook/p048/001"] spanHours=206.0 confidence=proposed
```

> **Périmé.** `dating.db` ne contient plus que **68** propositions ; seules **23**
> des 85 lignes d'ici correspondent encore à une ligne de `dating.proposals` via
> `cloudAssetId`. Voir §5.

### 1.7 `photo_doubts` — 933 lignes

```sql
CREATE TABLE photo_doubts(
  photoId   INTEGER PRIMARY KEY REFERENCES photos(id) ON DELETE CASCADE,
  albumPath TEXT NOT NULL,
  reason    TEXT NOT NULL
);
CREATE INDEX photo_doubts_reason ON photo_doubts(reason);
```

**Valeurs réelles de `reason` dans cette table** (≠ celles de `dating.unresolved`) :

| `reason` | Lignes |
|---|---|
| `not-a-stay` | 453 |
| `album-not-in-logbook` | 398 |
| `no-place-in-name` | 69 |
| `out-of-logbook-period` | 13 |

Pas de `candidates` ici : la colonne n'existe pas. Exemples :
`(26, '2000-2001/2000-10 St Vincent', 'not-a-stay')`,
`(62, '2000-2001/2001-06 Venezuela 3', 'not-a-stay')`.

> **Vocabulaire périmé, et dans le code aussi.** `album-not-in-logbook` a été
> retiré de `UnresolvedReason` côté `packages/dating`, mais `packages/photo-index`
> le déclare toujours (`src/index.ts:54`) et ignore les deux valeurs actuelles
> `several-visits` et `place-not-on-track`. Voir §5 et Incertitude 5.

### 1.8 `photos_fts` — table virtuelle FTS5, 42 911 lignes

```sql
CREATE VIRTUAL TABLE photos_fts USING fts5(
  path, groupName, albumPath, place, people, tags, caption, ocr,
  content='', tokenize='unicode61 remove_diacritics 2'
);
```

- **Contentless (`content=''`)** : un `SELECT path FROM photos_fts` renvoie des
  chaînes **vides**. Seul `MATCH` fonctionne, et on récupère les données par
  jointure sur `photos.id = photos_fts.rowid`.
- `rowid` = `photos.id`, de 1 à 42 911, un pour un. Non stable entre deux builds.
- Peuplée **en même temps que `photos`**, une insertion explicite par ligne dans
  `packages/photo-index/src/index/build.ts:183` — pas de trigger.
- Contenu de chaque colonne :
  - `path` : le chemin absolu tel quel.
  - `groupName` : `record.groupName` ou `''`.
  - `albumPath` : **tous** les albums de la photo joints par un espace (pas seulement le principal).
  - `place` : `city state country sublocation` non-NULL, joints par un espace.
  - `people` : les noms des visages, joints par un espace.
  - `tags` : mots-clés `user` puis tags `ai`, joints par un espace.
  - `caption` : `title`, `description`, et **`visual.colorName`** du store contenu, joints par un espace.
  - `ocr` : `mcp-content.ocr.text` **aplati** (`\s+` → une espace, trim) et
    **tronqué à 4 000 caractères** (`MAX_OCR`). La couleur dominante a été
    délibérément sortie de cette colonne pour aller dans `caption`.
- Forme de requête recommandée par le code (`queries.ts:170`) :
  `p.id IN (SELECT rowid FROM photos_fts WHERE photos_fts MATCH ?)` — jamais
  `WHERE photos_fts MATCH ? AND rowid = ?`, qui est faux sur une table contentless.
- Vérifié : `photos_fts MATCH 'ocr : "recette"*'` renvoie bien des photos
  (`_root/Gigi Recettes/IMG_1145.PNG`, …). 2 873 blocs dans `photos_fts_data`.

### 1.9 `meta` — 2 lignes

```sql
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
```

Contenu réel intégral : `cloudWatermark = 321892`, `photoCount = 42911`.

---

## 2. `mcp-content.db` — ce qui est visible dans l'image

Clé : `sha256`. Aucun build ne la supprime ; la passe est reprenable.

### 2.1 `ocr` — 41 913 lignes

```sql
CREATE TABLE ocr(
  sha256    TEXT PRIMARY KEY,
  text      TEXT NOT NULL,
  lang      TEXT,
  blocks    INTEGER NOT NULL,
  createdAt TEXT NOT NULL
);
```

| Fait mesuré | Valeur |
|---|---|
| Lignes | 41 913 |
| `text = ''` | **34 128** (81 %) — l'immense majorité des photos ne porte aucun texte |
| `text <> ''` | 7 785 |
| `lang` non-NULL | 4 666 (le reste NULL, y compris pour du texte reconnu) |
| `blocks` max | 397 |
| `length(text)` max | 7 355 |
| `createdAt` | `2026-08-24T11:19:43.538Z` → `2026-08-24T12:51:32.306Z` — **ISO-8601 UTC, suffixe `Z`, millisecondes** |

Répartition de `lang` : NULL 37 247 · `fr` 2 047 · `en` 988 · `id` 175 · `es` 170
· `pt` 161 · `ca` 155 · `pl` 130 · `ro` 109 · `tr` 100 · `nl` 95 · `it` 91 …
Codes ISO-639-1 sur 2 lettres. **Peu fiable** sur du texte court : l'exemple 2
ci-dessous est étiqueté `pl` pour une étiquette de Thermomix belge.

```
sha256=91b6b507ddf4ea37470538722191ecedd3b6727f69ea6530fb9ce5b0b1c34ebd  text=''  lang=NULL  blocks=0  createdAt=2026-08-24T11:19:43.538Z
sha256=a8af7da228cf907bc13d21901682281bbbde526cdeef9524c5279391be8f113a  text='GAB\nRO M'  lang=de  blocks=2  createdAt=2026-08-24T11:19:43.539Z
```

### 2.2 `visual` — 41 913 lignes

```sql
CREATE TABLE visual(
  sha256    TEXT PRIMARY KEY,
  dhash     INTEGER NOT NULL,
  r         INTEGER NOT NULL,
  g         INTEGER NOT NULL,
  b         INTEGER NOT NULL,
  colorName TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX visual_dhash ON visual(dhash);
```

- `dhash` : hash perceptuel 64 bits stocké en **entier signé** — plage réelle
  −9 223 372 036 854 775 808 → 9 223 367 578 578 059 263. 40 751 valeurs
  distinctes sur 41 913 lignes. Comparaison de proximité = distance de Hamming
  sur les 64 bits, à faire côté application (SQLite n'a pas de `popcount`).
- `r g b` : couleur moyenne, 0-255.
- `colorName` : 10 valeurs, l'intégralité du vocabulaire — `grey` 23 579,
  `orange` 6 776, `blue` 4 532, `yellow` 1 558, `cyan` 1 499, `black` 1 198,
  `red` 1 022, `green` 1 020, `white` 636, `magenta` 93.

```
sha256=91b6b507…4ebd dhash=-4139214307560991722 r=127 g=119 b=112 colorName=grey createdAt=2026-08-24T11:19:43.539Z
sha256=c2924033…3da4 dhash=4930352282086573652  r=138 g=117 b=135 colorName=grey createdAt=2026-08-24T11:19:43.539Z
```

### 2.3 `embeddings` — 0 ligne

```sql
CREATE TABLE embeddings(
  sha256    TEXT PRIMARY KEY,
  model     TEXT NOT NULL,
  dim       INTEGER NOT NULL,
  scale     REAL NOT NULL,
  vec       BLOB NOT NULL,
  createdAt TEXT NOT NULL
);
```

Le schéma existe et est complet (`model`, `dim`, `scale`, `vec` BLOB quantifié),
mais **aucune ligne**. Stage B non démarré. Pas d'exemple à donner.

### 2.4 `content_meta` — 0 ligne

```sql
CREATE TABLE content_meta(key TEXT PRIMARY KEY, value TEXT);
```

Vide. Pas de filigrane de passe écrit à ce jour.

---

## 3. `dating.db` — propositions, jamais des faits

Les deux tables sont **vidées et réécrites** à chaque `npm run propose-dates`.
Une photo est dans l'une **ou** l'autre : vérifié, **0 ligne en commun**.

### 3.1 `proposals` — 68 lignes

```sql
CREATE TABLE proposals(
  photoId        TEXT PRIMARY KEY,   -- cloudAssetId, PAS photos.id
  date           TEXT,
  dateSource     TEXT NOT NULL,      -- logbook-bracket | manual
  latitude       REAL, longitude REAL,
  positionSource TEXT,               -- logbook-interpolated | null
  evidence       TEXT NOT NULL,      -- JSON array of log_entry ids
  spanHours      REAL,
  confidence     TEXT NOT NULL,      -- proposed | manual
  createdAt      TEXT NOT NULL
);
CREATE INDEX proposals_date ON proposals(date);
```

Valeurs réelles mesurées :

| `dateSource` | `confidence` | `positionSource` | Lignes |
|---|---|---|---|
| `logbook-bracket` | `proposed` | `logbook-interpolated` | 67 |
| `manual` | `manual` | NULL | 1 |

- `date` : `YYYY-MM-DD`, aucun NULL. Plage 1998-07-22 → 2000-07-15.
- `latitude`/`longitude` non-NULL sur 67 lignes (la ligne `manual` n'en a pas).
- `spanHours` : 5,03 → 1 247,07 — largeur de la fourchette d'interpolation.
- `createdAt` : identique sur les 68 lignes, `2026-08-28T14:13:05.244Z` — preuve
  de la réécriture en bloc.
- `confidence` décrit **la date seulement** : une ligne `manual` peut porter une
  position machine, il faut lire `positionSource` pour ça.

```
photoId=05b9a4fac5df4dd28dcc1002d7ec0074 date=1998-07-22 dateSource=logbook-bracket
  lat=38.677516838113405 lon=-9.33927669913936 positionSource=logbook-interpolated
  evidence=["logbook/p003/019","logbook/p004/003"] spanHours=407.75 confidence=proposed
  createdAt=2026-08-28T14:13:05.244Z

photoId=08c815875f8f4703b2e1f92a47e350dd date=1998-08-02 dateSource=logbook-bracket
  lat=38.80265538070259 lon=-9.26532633921475 positionSource=logbook-interpolated
  evidence=["logbook/p003/019","logbook/p004/003"] spanHours=407.75 confidence=proposed
  createdAt=2026-08-28T14:13:05.244Z
```

### 3.2 `unresolved` — 483 lignes

```sql
CREATE TABLE unresolved(
  photoId    TEXT PRIMARY KEY,   -- cloudAssetId
  albumPath  TEXT NOT NULL,
  reason     TEXT NOT NULL,
  createdAt  TEXT NOT NULL,
  candidates TEXT               -- ajoutée par ALTER TABLE, d'où sa position
);
CREATE INDEX unresolved_reason ON unresolved(reason);
```

**Valeurs réelles de `reason`** (conformes à `docs/sqlite.md`, total 483) :

| `reason` | Lignes | `candidates` non-NULL |
|---|---|---|
| `several-visits` | 242 | **242** |
| `place-not-on-track` | 138 | 0 |
| `no-place-in-name` | 46 | 0 |
| `not-a-stay` | 46 | 0 |
| `out-of-logbook-period` | 11 | 0 |

`candidates` est une **chaîne JSON**, tableau de
`{place: string, from: "YYYY-MM-DD", to: "YYYY-MM-DD", fixes: number}`, et
uniquement pour `several-visits`.

```
photoId=bbc3830b1756413885cc64ac9737e388 albumPath=1998-1999/1999-03 Maldives
  reason=place-not-on-track createdAt=2026-08-28T14:13:05.244Z candidates=NULL

photoId=a44de98188b742cd80d919a0e9ecdc24 albumPath=1998-1999/1999-11 Mad CapVert
  reason=several-visits createdAt=2026-08-28T14:13:05.244Z
  candidates=[{"place":"Cap Vert","from":"1999-01-20","to":"1999-01-21","fixes":9},
              {"place":"Cap Vert","from":"1999-11-12","to":"1999-11-16","fixes":6}]
```

---

## 4. `documents.db` — le journal de bord et les mémoires

La seule base irremplaçable : `page_replies` contient des lectures modèle payées.

### 4.1 `documents` — 62 lignes

```sql
CREATE TABLE documents(
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,
  title      TEXT NOT NULL,
  author     TEXT,
  sourcePath TEXT NOT NULL,
  pageCount  INTEGER,
  sha256     TEXT NOT NULL
);
```

- `kind` : **`handwritten` 2** (`logbook`, `ma-vie`) · **`html` 60** (le site web).
- `sourcePath` est **relatif à `/Users/nico/projects/adobe_mcp/docs/`**. Vérifié :
  `docs/journal de bord/FunFun-j de bord.pdf`, `docs/ma vie/FunFun ma vie.pdf` et
  `docs/web_site/1900-1988.htm` existent.
- `pageCount` renseigné pour les 2 PDF seulement (52 et 103) ; NULL pour le HTML.
- `sha256` = hash du fichier source, pas d'une photo. **Ne joint rien.**

```
id=logbook kind=handwritten title=Journal du bord author=NULL
  sourcePath=journal de bord/FunFun-j de bord.pdf pageCount=52
  sha256=f06d69c92568e8d9282589bcbfff0d76c16a61e0c7f21102704a1478d589bcfb
id=ma-vie  kind=handwritten title=Ma vie author=NULL
  sourcePath=ma vie/FunFun ma vie.pdf pageCount=103
  sha256=1904bcbdf6423b36c555b8c86762ac949e051a51334b376cbc882c7cf44124ff
```

Ids web : `web/1900-1988`, `web/1998-1999`, `web/1999/Caraibe`, `web/1999/Transat`, …

### 4.2 `pages` — 155 lignes

```sql
CREATE TABLE pages(
  id         TEXT PRIMARY KEY,
  documentId TEXT NOT NULL REFERENCES documents(id),
  ordinal    INTEGER NOT NULL,
  label      TEXT,
  imagePath  TEXT NOT NULL,
  region     TEXT,
  rotation   INTEGER NOT NULL DEFAULT 0,
  width      INTEGER NOT NULL,
  height     INTEGER NOT NULL,
  startAt    TEXT, endAt   TEXT,
  startLat   REAL, startLon REAL,
  endLat     REAL, endLon   REAL,
  spanSource TEXT
);
CREATE INDEX pages_span ON pages(documentId, startAt, endAt);
```

- **Seuls les deux documents manuscrits ont des pages** : `ma-vie` 103, `logbook` 52.
  Les 60 documents HTML n'en ont aucune.
- `id` = `<documentId>/p<NNN>` sur 3 chiffres, ex. `logbook/p001`.
- `imagePath` : **relatif à `/Users/nico/projects/adobe_mcp/docs/pages/`**,
  forme `journal-de-bord/pNNN.jpg` ou `ma-vie/pNNN.jpg`. Attention : le dossier
  image est `journal-de-bord` (avec tirets) alors que `documentId` est `logbook`
  et que `sourcePath` pointe vers `journal de bord/` (avec espaces) — **trois
  orthographes pour le même document**. Vérifié : `docs/pages/journal-de-bord/p001.jpg` existe.
- `region` : **NULL sur les 155 lignes**. `rotation` : **0 sur les 155 lignes**.
- `width`/`height` : pixels de l'image de page (ex. 830×1282).
- `startAt`/`endAt` : 152 lignes ont un `startAt`. Format **mixte** : `1998-04-12`
  (date seule) jusqu'à `2002-06-02T16:00` (date + heure locale, sans zone).
- `startLat/startLon/endLat/endLon` : **47 lignes** renseignées, degrés décimaux
  signés. Plages : lat 10,433 → 41,835 ; lon −77,317 → −8,768.
- `spanSource` : `passages` 81 · `entries` 49 · `carried` 22 · NULL 3.

```
id=logbook/p001 documentId=logbook ordinal=1 label=NULL imagePath=journal-de-bord/p001.jpg
  region=NULL rotation=0 width=830 height=1282
  startAt=NULL endAt=NULL startLat=NULL startLon=NULL endLat=NULL endLon=NULL spanSource=NULL
id=logbook/p002 documentId=logbook ordinal=2 label=NULL imagePath=journal-de-bord/p002.jpg
  region=NULL rotation=0 width=774 height=1275  (reste NULL)
```

### 4.3 `log_entries` — 1 012 lignes

Une ligne réglée du journal de bord.

```sql
CREATE TABLE log_entries(
  id          TEXT PRIMARY KEY,
  pageId      TEXT NOT NULL REFERENCES pages(id),
  seq         INTEGER NOT NULL,
  date        TEXT NOT NULL,
  time        TEXT,
  latitude    REAL, longitude REAL,
  rawPosition TEXT,
  placeName   TEXT,
  heading     TEXT, wind TEXT, baro REAL, engineHours REAL,
  remark      TEXT,
  fixConfidence    TEXT NOT NULL,
  remarkConfidence TEXT NOT NULL
);
CREATE INDEX log_entries_page ON log_entries(pageId, seq);
CREATE INDEX log_entries_time ON log_entries(date, time);
```

- `id` = `<pageId>/<NNN>`, ex. `logbook/p003/001`. C'est cet id qu'on retrouve
  dans `proposals.evidence`.
- `date` : **`YYYY-MM-DD`, exactement 10 caractères, 1 012/1 012.** Plage
  1998-04-12 → 2002-06-02. Par année : 1998 → 90, 1999 → 450, 2000 → 193,
  2001 → 145, 2002 → 134. **Aucun fuseau, aucune heure** dans cette colonne.
- `time` : **807 non-NULL, `HH:MM` exactement 5 caractères**, `00:00` → `23:55`.
  Heure de bord telle qu'écrite à la main, **fuseau inconnu et non enregistré**.
- `latitude`/`longitude` : **711 non-NULL**, **degrés décimaux signés déjà
  convertis**. Plages : lat 10,05 → 42,533 ; lon −80,1 → −8,717.
- `rawPosition` : **711 non-NULL**, la transcription littérale, en **degrés et
  minutes**, dans une douzaine de graphies différentes. Ne jamais reconvertir.
- `placeName` : 115 non-NULL — et **les 115 sont sur des lignes sans position**
  (le mouillage nommé remplace le point).
- `heading` 596 · `wind` 610 · `baro` 800 (hPa) · `engineHours` 661 · `remark` 910.
- `fixConfidence` : `transcribed` 1 002 · `uncertain` 10.
- `remarkConfidence` : `transcribed` 966 · `uncertain` 46.

Échantillon de `rawPosition` → décimal, qui montre l'étendue des graphies :

```
15.52N 56.39W          -> 15.86667, -56.65
13.54 N 29.02 W        -> 13.9,     -29.03333
11.09 - 64.03W         -> 11.15,    -64.05
Depart de Vilagarcia 42.26 N - 8.46 -> 42.43333, -8.76667
19.34.9N 66.53.8W      -> 19.58167, -66.89667
1021N 64.70W           -> 10.35,    -64.7
41.41.7 N 8.53W        -> 41.695,   -8.88333
1428N 60.52W           -> 14.46667, -60.86667
16.04 N    61.25 W     -> 16.06667, -61.41667
22 48N 74 20W          -> 22.8,     -74.33333
38.33.25/9.17.2        -> 38.554167, -9.286667
38.41  9.14            -> 38.683333, -9.233333   (aucun N/W : hémisphère déduit)
```

Lecture : `DD.MM` = degrés.minutes (`15.52N` = 15°52′ = 15,8667°) ;
`DD.MM.t` = degrés.minutes.dixièmes (`19.34.9N` = 19°34,9′) ; `DDMM` collé
(`1428N` = 14°28′) ; séparateurs `,` `-` `/` espace, `N`/`W` parfois absents
(hémisphère alors déduit du contexte). `64.70W` → −64,7 : 70 minutes étant
impossible, la valeur a été lue en degrés décimaux — **règle de repli non
documentée dans le code lu**, à ne pas généraliser.

```
id=logbook/p003/001 pageId=logbook/p003 seq=1 date=1998-07-09 time=13:20
  lat=NULL lon=NULL rawPosition=NULL placeName=Pont Alcantara
  heading=W wind='NW forte' baro=1020.0 engineHours=2536.1
  remark='Départ Lisbonne - Ecluse' fixConfidence=transcribed remarkConfidence=transcribed

id=logbook/p003/002 pageId=logbook/p003 seq=2 date=1998-07-09 time=15:30
  lat=NULL lon=NULL rawPosition=NULL placeName='5 mls Sud rocailles'
  heading=E wind='NW 25n' baro=1018.0 engineHours=2537.0
  remark='6 tourbillons + 1 ris' fixConfidence=transcribed remarkConfidence=transcribed
```

### 4.4 `passages` — 1 859 lignes

```sql
CREATE TABLE passages(
  id         TEXT PRIMARY KEY,
  documentId TEXT NOT NULL REFERENCES documents(id),
  pageId     TEXT REFERENCES pages(id),
  ordinal    INTEGER NOT NULL,
  text       TEXT NOT NULL,
  dateFrom   TEXT, dateTo TEXT,
  confidence TEXT NOT NULL
);
CREATE INDEX passages_page ON passages(pageId, ordinal);
```

- Répartition : `ma-vie` 798 · `logbook` 492 · puis les pages web
  (`web/1999/VersTrinidad` 58, `web/1999/Transat` 49, `web/1999/Venez02` 48,
  `web/1999/funfun1` 46, `web/1999/Caraibe` 45, `web/1999/Venez01` 34, …).
- `pageId` NULL pour les passages issus du HTML (aucune page).
- `dateFrom` : **828 non-NULL, `YYYY-MM-DD` sur 10 caractères**, 1998-07-08 →
  2001-06-04. **`dateTo` est NULL sur les 1 859 lignes** : la colonne existe,
  elle n'est jamais renseignée.
- `confidence` : `transcribed` 1 125 · `reviewed` 569 · `uncertain` 165.

```
id=logbook/p024/001 documentId=logbook pageId=logbook/p024 ordinal=1
  text='4/12/99\nHugo' dateFrom=1999-12-04 dateTo=NULL confidence=transcribed
id=logbook/p024/002 documentId=logbook pageId=logbook/p024 ordinal=2
  text='H 4944' dateFrom=1999-12-04 dateTo=NULL confidence=transcribed
```

### 4.5 `page_replies` — 205 lignes · `page_passes` — 206 lignes

```sql
CREATE TABLE page_passes(
  pageId    TEXT NOT NULL REFERENCES pages(id),
  mode      TEXT NOT NULL,     -- 'prose' | 'table'
  rows      INTEGER NOT NULL,
  illegible INTEGER NOT NULL,
  at        TEXT NOT NULL,
  PRIMARY KEY (pageId, mode)
);
CREATE TABLE page_replies(
  pageId TEXT NOT NULL REFERENCES pages(id),
  mode   TEXT NOT NULL,
  reply  TEXT NOT NULL,
  at     TEXT NOT NULL,
  PRIMARY KEY (pageId, mode)
);
```

- `mode` : `prose` 154 / `table` 52 dans `page_passes` ; `prose` 153 / `table` 52
  dans `page_replies` (**une page a un `page_pass` sans `page_reply`**).
- `at` : format **`YYYY-MM-DD HH:MM:SS`, espace séparateur, sans zone ni
  millisecondes** — différent de tous les autres timestamps du projet.
- `reply` : la réponse modèle **verbatim, en JSON**. Deux formes selon `mode` :

```
mode=table : {"year": 1998, "columns": ["[illisible]"], "rows": []}
mode=table : {"year": 1998, "columns": [], "rows": []}
mode=prose : {"dateFrom": "1998-07-08", "paragraphs": ["[illisible]", "Equipage famille CUVILLIER", "Journal du bord.", "8 juillet 1998."]}
```

```
page_passes: pageId=logbook/p024 mode=prose rows=11 illegible=1 at=2026-08-26 09:35:59
             pageId=logbook/p001 mode=table rows=0  illegible=0 at=2026-08-27 10:36:30
```

### 4.6 `passages_fts` — table virtuelle FTS5, **0 ligne**

```sql
CREATE VIRTUAL TABLE passages_fts USING fts5(
  text, title, content='', tokenize='unicode61 remove_diacritics 2'
);
```

**Elle est vide.** Mesures : `SELECT count(*) FROM passages_fts` → 0 ;
`passages_fts_data` → 2 blocs (l'entête d'une table neuve) ; `MATCH` sur
`bateau`, `mer`, `jour`, `le`, `vent` → 0 résultat chacun. Aucun `INSERT INTO
passages_fts` n'existe dans `packages/documents/src/` (seul le `CREATE` dans
`schema.ts:56`). **La recherche plein texte sur les documents n'existe pas
aujourd'hui**, contrairement à ce qu'annonce `docs/sqlite.md`.

---

## 5. Jointures entre bases

`photos.id` est **réattribué à chaque `build-index`**. Aucune jointure inter-bases
ne doit l'utiliser. Les deux seules clés valides sont `cloudAssetId` et `sha256`.

| De | Vers | Clé | Cardinalité mesurée |
|---|---|---|---|
| `dating.proposals` | `mcp-index.photos` | `proposals.photoId = photos.cloudAssetId` | 68/68 trouvées |
| `dating.unresolved` | `mcp-index.photos` | `unresolved.photoId = photos.cloudAssetId` | 483/483 trouvées |
| `mcp-content.ocr` | `mcp-index.photos` | `ocr.sha256 = photos.sha256` | 41 905 photos couvertes ; 46 sha256 de photos sans OCR, 8 OCR orphelins |
| `mcp-content.visual` | `mcp-index.photos` | `visual.sha256 = photos.sha256` | même ensemble que `ocr`, exactement |
| `data/annotations/*.jsonl` | `mcp-index.photos` | `target.id = photos.cloudAssetId` (quand `target.type = 'photo'`) | 336 ids distincts |
| `data/places.jsonl` | `mcp-index.albums` | `album = albums.path` | non vérifié ligne à ligne |
| `mcp-index.photo_proposals` / `photo_doubts` | `photos` | `photoId = photos.id` (**local**) | copie de `dating.db`, re-clée au build |
| `documents.db` | photos | **aucune** | voir ci-dessous |

**`documents.db` ne référence aucune photo.** Aucune colonne de `log_entries`,
`passages`, `pages` ou `documents` ne porte un `cloudAssetId` ni un `sha256` de
photo (`documents.sha256` est le hash du PDF/HTML source). Le lien est
**indirect et unidirectionnel** : la passe `dating` lit `log_entries` pour
encadrer une photo dans le temps et l'espace, puis écrit le résultat dans
`dating.proposals`, dont la colonne `evidence` contient les **ids de
`log_entries`** ayant servi. C'est le seul chemin :

```
photos.cloudAssetId
  → dating.proposals.photoId
  → dating.proposals.evidence  (JSON: ["logbook/p047/018", …])
  → documents.log_entries.id
  → documents.log_entries.pageId → documents.pages.id → documents.documents.id
```

Exemple d'ouverture croisée (lecture seule) :

```bash
W="/Volumes/OWC Envoy Ultra/Pictures/lightroom/work"
sqlite3 "file:$W/mcp-index.db?mode=ro" -readonly "
  ATTACH 'file:$W/mcp-content.db?mode=ro' AS ct;
  ATTACH 'file:$W/dating.db?mode=ro'      AS dt;
  SELECT p.path, o.text
    FROM photos p JOIN ct.ocr o USING(sha256) LIMIT 5;"
```

### Décalage mesuré entre `dating.db` et `mcp-index.db`

Les copies dans l'index sont **périmées** : le dernier `propose-dates` est
postérieur au dernier `build-index`.

| | `dating.db` (2026-08-28 14:13 UTC) | `mcp-index.db` | Correspondance |
|---|---|---|---|
| propositions | 68 | `photo_proposals` = 85 | 23 seulement |
| doutes | 483 | `photo_doubts` = 933 | 450 seulement |
| raisons | `several-visits`, `place-not-on-track`, `no-place-in-name`, `not-a-stay`, `out-of-logbook-period` | `not-a-stay`, **`album-not-in-logbook`**, `no-place-in-name`, `out-of-logbook-period` | vocabulaires **disjoints** sur 2 valeurs |

`album-not-in-logbook` n'existe plus dans `dating.db` ; `several-visits` et
`place-not-on-track` n'existent pas encore dans `mcp-index.db`. **Pour tout ce
qui touche au dating, lire `dating.db`, pas l'index.**

---

## 6. Dates : format, fuseau, et lecture vs inférence vs décision humaine

### 6.1 La colonne qui distingue : `photos.dateSource`

`TEXT NOT NULL`, **7 valeurs réelles**, mesurées sur 42 911 lignes :

| Valeur | Lignes | Origine | Nature |
|---|---|---|---|
| `capture-date` | **23 739** | EXIF/XMP du fichier | **Lecture** |
| `folder-exact` | **14 104** | nom de dossier `YYYY-MM-DD <groupe>` | **Inférence** (nom écrit par une personne) |
| `folder-year` | 2 652 | nom de dossier `YYYY <groupe>` | Inférence, année seule |
| `folder-sequence` | 1 212 | `YYYY-NN` où NN n'a pas pu être un mois | Inférence, année seule + n° de semaine/voyage |
| `folder-month-assumed` | 516 | `YYYY-NN`, NN ≤ 12, **aucune date EXIF de la même année pour arbitrer** | Inférence **présumée**, la plus faible |
| `folder-month` | 268 | `YY-MM` explicite, ou `YYYY-NN` confirmé à ≥ 60 % par les dates EXIF de la même année | Inférence confirmée |
| `none` | 420 | rien | Aucune date : `year`, `month`, `day`, `captureDate` tous NULL |

Priorité appliquée (`packages/photo-index/src/index/extract.ts:88`) : **le nom du
dossier gagne sur l'EXIF**. Si le dossier donne une date, `dateSource` est la
valeur `folder-*` correspondante ; sinon, `capture-date` si l'EXIF en a une ;
sinon `none`. Conséquence directe : `captureDate` et `year/month/day` peuvent se
contredire, et c'est **voulu** — la moitié de la photothèque est du film scanné,
dont l'EXIF porte la date du scan. Exemples réels :

```
dateSource=folder-year          captureDate=2013-06-07T14:02:55  year=1977 month=6 day=7
dateSource=folder-month-assumed captureDate=2014-01-06T14:00:40  year=1997 month=12 day=6
dateSource=folder-month         captureDate=2023-05-20T23:55:23.73 year=1923 month=5 day=20
```

> Il n'existe **aucune valeur `manual` / `human` / `annotation`** dans
> `photos.dateSource` : une décision humaine ne remonte pas jusque-là. Elle vit
> dans `data/annotations/annotations.jsonl` (`kind: 'dating'`) et, après une
> passe, dans `dating.proposals` avec `dateSource = 'manual'` et
> `confidence = 'manual'` — **1 seule ligne aujourd'hui**, contre 337 annotations
> de dating dans le fichier. Voir Incertitudes.

### 6.2 Les autres colonnes de type date

| Base.table.colonne | Format réel | Fuseau | Non-NULL |
|---|---|---|---|
| `mcp-index.photos.captureDate` | ISO-8601, **6 longueurs différentes** (voir ci-dessous) | mixte | 42 081 |
| `mcp-index.photos.year/month/day` | INTEGER | — | 42 491 / — / — |
| `mcp-index.photo_proposals.date` | `YYYY-MM-DD` | — | 85 |
| `dating.proposals.date` | `YYYY-MM-DD` | — | 68 |
| `dating.proposals.createdAt` | `2026-08-28T14:13:05.244Z` | **UTC** | 68 |
| `dating.unresolved.createdAt` | idem | UTC | 483 |
| `dating.unresolved.candidates[].from/.to` | `YYYY-MM-DD` dans le JSON | — | 242 |
| `mcp-content.ocr.createdAt` | `2026-08-24T11:19:43.538Z` | **UTC** | 41 913 |
| `mcp-content.visual.createdAt` | idem | UTC | 41 913 |
| `documents.log_entries.date` | `YYYY-MM-DD` (10 car., strict) | — | 1 012 |
| `documents.log_entries.time` | `HH:MM` (5 car., strict) | **heure de bord, non enregistrée** | 807 |
| `documents.passages.dateFrom` | `YYYY-MM-DD` | — | 828 |
| `documents.passages.dateTo` | — | — | **0** |
| `documents.pages.startAt` / `endAt` | mixte : `YYYY-MM-DD` **ou** `YYYY-MM-DDTHH:MM` | sans zone | 152 / 152 |
| `documents.page_passes.at` / `page_replies.at` | **`YYYY-MM-DD HH:MM:SS`** (espace, pas de `T`, pas de zone) | locale, implicite | 206 / 205 |
| `data/annotations/*.jsonl` `at` | `2026-08-28T13:13:10.077Z` | **UTC** | toutes |

**`photos.captureDate` en détail** — il n'y a pas un format mais six :

| Longueur | Lignes | Exemple | Zone |
|---|---|---|---|
| 19 | 32 070 | `2017-07-02T11:42:23` | **aucune** (heure locale implicite) |
| 20 | 56 | `2018-11-16T06:20:19Z` | UTC |
| 22 | 70 | `2023-05-20T23:07:11.36` | aucune, centièmes |
| 24 | 418 | `2023-02-01T16:04:33.000Z` | UTC, millisecondes |
| 25 | 2 | `2022-04-25T11:10:10+02:00` | offset |
| 29 | 9 465 | `2018-11-10T11:48:23.780+04:00` | offset + millisecondes |

Agrégé : **32 140 sans aucune indication de fuseau**, 9 467 avec un offset
`±HH:MM`, 474 en `Z`. Un parseur doit accepter les six et **traiter l'absence de
zone comme de l'heure locale de prise de vue**, pas comme de l'UTC. Plage
globale : `1987-05-03T12:01:16` → `2026-08-26T12:56:07.983+02:00`.

---

## 7. Colonnes géographiques

Toutes les latitudes/longitudes **stockées en base** sont en **degrés décimaux
signés** (nord et est positifs), quel que soit le format d'origine. La seule
colonne en degrés-minutes est `log_entries.rawPosition`, qui est du **texte
brut de transcription** et non un nombre.

| Base.table | Colonnes | Unité | Non-NULL | Plage mesurée |
|---|---|---|---|---|
| `mcp-index.photos` | `latitude`, `longitude` | degrés décimaux signés (EXIF) | **18 059** / 42 911 | lat −31,983 → 57,743 · lon −81,546 → 153,122 |
| `mcp-index.photos` | `altitude` | **mètres** | 11 880 | −245,1 → 2 467,4 |
| `mcp-index.photo_proposals` | `latitude`, `longitude` | degrés décimaux signés, **interpolés** | 79 / 85 | — |
| `dating.proposals` | `latitude`, `longitude` | degrés décimaux signés, **interpolés** | 67 / 68 | ex. 38,677516838113405 / −9,33927669913936 |
| `documents.log_entries` | `latitude`, `longitude` | degrés décimaux signés, **déjà convertis** | **711** / 1 012 | lat 10,05 → 42,533 · lon −80,1 → −8,717 |
| `documents.log_entries` | `rawPosition` | **degrés et minutes, texte libre** | 711 | voir §4.3 |
| `documents.pages` | `startLat`, `startLon`, `endLat`, `endLon` | degrés décimaux signés | **47** / 155 | lat 10,433 → 41,835 · lon −77,317 → −8,768 |
| `data/places.jsonl` | `box` | **`[latMin, lonMin, latMax, lonMax]`** | 31 lignes | voir §9 |
| `packages/dating/src/places.ts` `PLACES[].box` | — | **`[latMin, latMax, lonMin, lonMax]`** | 31 entrées codées en dur | **ordre différent de `places.jsonl`** |

Il n'existe **aucune** autre colonne géographique : pas de géométrie, pas de
géohash, pas de colonne `place_id`. Le lieu textuel de `photos` (`city`, `state`,
`country`, `countryCode`, `sublocation`) vient du reverse-geocoding d'Adobe et
n'a pas de coordonnées propres.

Attention aux **positions absentes mais nommées** : les 115 `log_entries` qui
portent un `placeName` sont exactement celles qui n'ont pas de position.

---

## 8. Vignettes — `work/content-thumbs/`

- **41 913 fichiers, tous `.jpg`, dossier plat** (aucun sous-dossier, aucun
  sharding par préfixe).
- **Convention de nommage : `<sha256>.jpg`** — le `sha256` du fichier original,
  64 caractères hex minuscules, celui de `photos.sha256` et de
  `mcp-content.ocr.sha256`. **Pas** le `photoId`, **pas** le `cloudAssetId`.
- **Retrouver la vignette d'une photo** :
  ```sql
  SELECT '/Volumes/OWC Envoy Ultra/Pictures/lightroom/work/content-thumbs/'
         || sha256 || '.jpg'
    FROM photos WHERE cloudAssetId = ?;
  ```
  Vérifié sur les photos `id` 1, 5 000 et 25 000 : le fichier existe à chaque fois.
- **Couverture exacte** : l'ensemble des noms de fichiers est **strictement égal**
  à l'ensemble des `sha256` de `mcp-content.ocr`. Par rapport à `photos` :
  **41 905 des 41 951 sha256 distincts** ont une vignette ; **46 n'en ont pas**
  (dont les 40 vidéos `m4v` que la passe saute) ; **8 vignettes sont orphelines**
  (photo depuis retirée de l'index). Comme 949 groupes de photos partagent un
  `sha256`, une même vignette sert parfois plusieurs lignes de `photos`.
- **Format et dimensions** : JPEG sRGB, qualité 0,92, **côté long contraint à 224 px**,
  ratio préservé (`packages/photo-index/tools/contentpass.swift:108`, `let side: CGFloat = 224`).
  Échantillon réel de 15 fichiers : 224×168, 224×150, 224×126, 224×104, 168×224,
  142×224, 126×224, 224×224. **Le côté long vaut toujours 224.**
- Poids : moyenne 23 539 o, maximum 50 308 o, **1,0 Go au total** (`du -sh`).
- Écrites par `npm run build-content`, en même temps que les lignes `ocr` et
  `visual` (`packages/photo-index/src/content/build.ts:69`).

> **Attention** : `packages/review` **n'utilise pas ces vignettes**. Il fabrique
> les siennes, en 600 px, via `sips -Z 600`, dans
> `os.tmpdir()/adobe-mcp-review-thumbs/`, nommées par le sha256 **du chemin**
> (32 premiers hex), pas du contenu (`packages/review/src/server.ts:30-53`).
> Deux caches de vignettes coexistent, avec deux conventions différentes.

---

## 9. Fichiers JSONL du dépôt

### 9.1 `data/annotations/annotations.jsonl` — 337 lignes

Le seul fichier présent dans `data/annotations/` (avec un `.gitkeep`). Le lecteur
(`packages/dating/src/annotations.ts`) lit **tous** les `.jsonl` du dossier, triés
par nom, et **lève une exception** sur une ligne malformée en la nommant
`fichier:ligne`.

Schéma réel observé, une ligne = un objet JSON :

```jsonc
{
  "id":     string,          // obligatoire, non vide. Forme observée : "<kind>_<target.id>_<at>"
  "at":     string,          // obligatoire, ISO-8601 UTC avec ms et Z
  "kind":   "correction" | "addition" | "arbitration" | "dating",
  "target": { "type": "passage"|"log_entry"|"photo"|"page"|"album",
              "id":   string | number },
  "field":  string,          // optionnel — JAMAIS présent dans le fichier actuel
  "value":  unknown,         // obligatoire, forme libre selon kind
  "was":    unknown,         // optionnel — JAMAIS présent dans le fichier actuel
  "note":   string           // optionnel — présent sur 1 ligne sur 337
}
```

Contenu réel du fichier, mesuré :

- **337 lignes, toutes `kind: "dating"`, toutes `target.type: "photo"`.**
  Aucune `correction`, `addition` ni `arbitration` ; aucun target `album`,
  `page`, `passage` ni `log_entry`. Les autres formes sont donc **supportées par
  le code mais non exercées par les données**.
- `target.id` est un **`cloudAssetId`** (32 hex). 336 ids distincts pour 337
  lignes : **une photo a été datée deux fois**.
- `value` a exactement une forme sur les 337 lignes : **`{"date": "YYYY-MM-DD"}`**.
- Jeu de clés : 336 lignes en `{at,id,kind,target,value}`, 1 ligne avec `note` en plus.
- `at` : `2026-08-28T13:13:10.077Z` → `2026-08-28T14:19:58.594Z` — tout a été
  saisi dans la même heure.

Deux lignes réelles :

```json
{"id":"dating_e8bc80b75e254b7db2e1454222416813_2026-08-28T13:13:10.077Z","at":"2026-08-28T13:13:10.077Z","kind":"dating","target":{"type":"photo","id":"e8bc80b75e254b7db2e1454222416813"},"value":{"date":"1999-03-02"},"note":"wrong date in folder-sequence"}
{"id":"dating_864808752b754c10aca1dffbc93a10a2_2026-08-28T14:18:33.326Z","at":"2026-08-28T14:18:33.326Z","kind":"dating","target":{"type":"photo","id":"864808752b754c10aca1dffbc93a10a2"},"value":{"date":"2001-12-16"}}
```

Sémantique documentée dans `annotations.ts` : `correction` remplace une valeur
transcrite, `addition` crée un fait écrit nulle part, `arbitration` tranche entre
deux sources qui se contredisent, `dating` affirme une date ou un lieu à la main.
**Les quatre priment sur la sortie machine et ne sont jamais écrasées par une
re-passe.** Le target `album` existe pour régler `several-visits` d'un coup pour
tout un album.

### 9.2 `data/places.jsonl` — 31 lignes

Schéma réel : **les 31 lignes ont exactement les mêmes 4 clés**.

```jsonc
{
  "album": string,           // = albums.path dans mcp-index.db
  "kind":  "place" | "passage",
  "box":   [number, number, number, number],   // [latMin, lonMin, latMax, lonMax]
  "note":  string            // texte libre, en anglais
}
```

Lignes réelles :

```json
{"album":"1998-1999/1998-07 Famille Trotobas Lisbonne","kind":"place","box":[38.6,-9.5,38.8,-9.05],"note":"Lisbon and the Tagus"}
{"album":"1998-1999/1999-03 Lisboa Madere","kind":"passage","box":[32.55,-17.35,38.8,-9.0],"note":"Lisbon to Madeira"}
{"album":"2002/2002-24 TCI","kind":"place","box":[21.0,-72.6,22.1,-71.0],"note":"Turks and Caicos — Provo, Grand Turk, Six Hill Cays"}
{"album":"2003-toCheck/2003-57 - Abacos - Floride","kind":"place","box":[25.9,-80.3,27.0,-76.9],"note":"Abacos and the Florida coast"}
```

Ordre de `box` déduit des valeurs : `[38.6, -9.5, 38.8, -9.05]` pour Lisbonne =
`[sud, ouest, nord, est]`, soit `[latMin, lonMin, latMax, lonMax]`.

> **Ce fichier n'est lu par aucun code.** Un `grep` sur tout le dépôt (hors
> `node_modules`) ne trouve aucune occurrence de `places.jsonl` ni de lecture de
> `data/places.jsonl`. Le gazetteer réellement utilisé par la passe dating est
> **codé en dur** dans `packages/dating/src/places.ts`, sous la forme
> `PLACES: readonly Place[]` avec `{name, terms[], box}`, et son `box` suit
> l'ordre **`[latMin, latMax, lonMin, lonMax]`** — **différent de celui du
> JSONL**. Le fichier est versionné dans git (`git ls-files data/` le liste) mais
> semble être une note de travail, pas une entrée du pipeline.

---

## 10. Récapitulatif des chemins

| Quoi | Racine | Colonne / convention |
|---|---|---|
| Originaux | `/Volumes/OWC Envoy Ultra/Pictures/lightroom/originals/` | `photos.path`, **absolu** ; `photos.folder` = son dirname |
| Vignettes 224 px | `/Volumes/OWC Envoy Ultra/Pictures/lightroom/work/content-thumbs/` | `<photos.sha256>.jpg` |
| Bases dérivées | `/Volumes/OWC Envoy Ultra/Pictures/lightroom/work/` | 4 fichiers, cf. §0 |
| Snapshots Lightroom (ne jamais écrire) | même dossier | `mcp-cloud.mcat`, `mcp-classic.lrcat`, `mcp-faces.wfindex`, `catalog-snapshot.mcat`, `classic-snapshot.lrcat`, `faceindex-snapshot.wfindex` |
| RAW décodés | `…/work/raw-decoded/` | intermédiaire de la passe contenu |
| PDF & HTML sources | `/Users/nico/projects/adobe_mcp/docs/` | `documents.sourcePath`, **relatif** |
| Images de pages | `/Users/nico/projects/adobe_mcp/docs/pages/` | `pages.imagePath`, **relatif** (`journal-de-bord/pNNN.jpg`, `ma-vie/pNNN.jpg`) |
| Annotations | `/Users/nico/projects/adobe_mcp/data/annotations/` | tous les `*.jsonl` du dossier |

Surcharges d'environnement : `LR_TARGET` (racine du volume), `LR_INDEX` (chemin
de `mcp-index.db`), `LR_REPO` (racine du dépôt), `LR_BUNDLE`, `LR_LIBRARY`.

---

## 11. Incertitudes

Ce qui suit n'a **pas** pu être établi avec certitude. Rien n'y est deviné.

1. **Le fuseau de `log_entries.time`.** C'est l'heure écrite à la main à bord.
   Aucune colonne ne dit si c'est UTC, l'heure légale locale ou l'heure du bord.
   Le bateau a traversé l'Atlantique : le décalage change en cours de route.
   Non déterminable depuis les bases.

2. **Le fuseau des `captureDate` sans offset** (32 140 lignes, 76 %). Rien dans
   la base ne dit si c'est l'heure locale de prise de vue ou l'heure de la
   machine d'import. J'ai supposé « heure locale de prise de vue » par cohérence
   avec la sémantique EXIF, sans le vérifier.

3. **La règle de repli de conversion de `rawPosition`.** `64.70W → -64.7` montre
   qu'une valeur de minutes impossible bascule en lecture décimale, mais je n'ai
   pas lu le code du parseur (`packages/documents/`) pour confirmer que c'est
   délibéré, ni pour connaître toutes les graphies acceptées. La liste de §4.3
   est un échantillon de 20 lignes tirées au hasard, pas une énumération.

4. **Pourquoi `dating.proposals` ne contient qu'une ligne `manual` alors que
   `annotations.jsonl` compte 337 datations manuelles.** Trois explications
   possibles (passe non rejouée depuis la saisie ; annotations rejetées parce
   qu'elles ciblent des photos hors du périmètre 1998-2002 ; ou les annotations
   `dating` sur `target.type: 'photo'` alimentent un autre chemin que
   `proposals`). Je n'ai pas lu `packages/dating/src/propose.ts` assez loin pour
   trancher. **À vérifier avant de construire une UI de datation.**

5. *(Résolu — conservé ici car c'est un piège.)* `album-not-in-logbook` n'est
   **plus** dans `UnresolvedReason` (`packages/dating/src/unresolved.ts:16-29`,
   qui déclare exactement `no-place-in-name`, `out-of-logbook-period`,
   `place-not-on-track`, `not-a-stay`, `several-visits`). Mais **`packages/photo-index`
   déclare encore l'ancien vocabulaire de 4 valeurs**, `album-not-in-logbook`
   compris et sans `several-visits` ni `place-not-on-track`
   (`src/index.ts:54`, `src/tools/queries.ts:32`, `src/index/dating.ts:73`).
   Les deux paquets sont désynchronisés dans le code, pas seulement dans les
   données. Ce qui reste incertain : si l'énumération côté index sera alignée
   ou si elle est volontairement figée.

6. **`albums.dateSource`.** La colonne est `NOT NULL`, vaut `unset` sur les 675
   lignes, et le build l'écrit en dur à `'unset'` (`build.ts`). Deux lignes de
   `build.ts` (`:92`, `:93`) comptent pourtant des albums en
   `folder-month-assumed` et `folder-sequence` : il existe donc un autre chemin
   qui la renseigne ailleurs (probablement en mémoire, avant l'insertion). Je
   n'ai pas identifié pourquoi la valeur ne survit pas jusqu'à la base.

7. **`documents.pages.region`** est NULL partout et son format n'est documenté
   nulle part. Type déclaré `TEXT`. Contenu attendu inconnu.

8. **La correspondance ligne à ligne entre `data/places.jsonl` et
   `packages/dating/src/places.ts`.** Les deux comptent 31 entrées, mais l'une
   est clée par album et l'autre par lieu, avec des `box` dans un ordre
   différent. Je n'ai pas vérifié qu'elles décrivent les mêmes zones.

9. **Les 8 vignettes orphelines et les 46 photos sans vignette.** J'ai établi les
   comptes mais pas la cause pour chaque cas. Les 40 `m4v` expliquent la majeure
   partie des 46 ; les 6 restants et les 8 orphelins ne sont pas expliqués.

10. **`meta.cloudWatermark = 321892`.** C'est un compteur de synchronisation du
    catalogue cloud Adobe. Son unité et son échelle ne sont pas documentées et je
    ne les ai pas déduites.

11. **Le format de `page_replies.reply` pour toutes les pages.** Je n'ai lu que 3
    réponses (2 `table`, 1 `prose`). Les clés `year`/`columns`/`rows` et
    `dateFrom`/`paragraphs` sont donc observées, pas exhaustives : une réponse
    modèle peut porter d'autres clés sur d'autres pages.

12. **Les vidéos.** 40 lignes `format = 'm4v'` dans `photos`. Je n'ai pas vérifié
    si elles ont une `width`/`height` cohérente, ni ce que l'UI doit en faire.

---

*Établi le 2026-08-28 par lecture directe des quatre bases, du dossier
`work/content-thumbs/`, de `data/annotations/annotations.jsonl`, de
`data/places.jsonl` et des sources TypeScript/Swift de `adobe_mcp`. Aucune
écriture effectuée.*
