# `photo_ui` — spécification du backend

Comment le serveur produit ce que `docs/api-contract.md` fait passer sur le fil.

Le contrat dit **ce qui sort**. Ce document dit **comment**. Un lecteur du
contrat n'a pas à connaître PostgreSQL ; un lecteur d'ici a le contrat sous la
main.

Sources : `docs/frontend-spec.md` (la spécification), `docs/pipeline-inventory.md`
(les schémas amont exacts), `docs/pipeline-capabilities.md` (les pièges déjà
payés), `docs/spike-dhash-galeries.md` (l'appariement des galeries).

**Prose en français, identifiants en anglais.**

---

## 1. Périmètre et principes

Le backend est un **consommateur**. Il lit quatre bases SQLite en lecture seule,
en recopie le contenu dans PostgreSQL, y ajoute une couche de résolution et le
travail humain, et sert le tout. Il ne reconstruit aucun index amont, ne relance
aucune passe, et n'écrit sur le volume des originaux **jamais**.

Cinq principes gouvernent chaque décision qui suit.

1. **Ce que le schéma peut tenir, la discipline ne le tiendra pas.** La règle
   capitale — une inférence ne doit jamais ressembler à une lecture — est une
   **colonne générée** que PostgreSQL refuse de laisser écrire (§4.3), pas une
   convention de nommage.
2. **Ce qui est stable est matérialisé ; ce qui dépend d'une saisie humaine est
   calculé.** La cascade et les fenêtres de page sont figées à l'import ; le
   recouvrement, qui dépend de `ref.album_span` et `ref.web_span`, ne l'est pas
   (§7).
3. **Un seul endroit par règle.** Une règle réévaluée en deux endroits finit par
   diverger.
4. **Une écriture passe par un seul point de contrôle.** Toutes les écritures
   disque traversent une fonction qui refuse tout chemin hors des racines
   autorisées (§13.3) — l'invariant devient testable au lieu d'être relu.
5. **Le périmètre est un paramètre.** 1998-2004, 3 930 photos, 82 albums sont
   des valeurs de configuration, pas des constantes du code.

### 1.1 Version de PostgreSQL — une divergence à trancher

La consigne du projet dit **PostgreSQL 18**. La spécification frontend mesure
**17.6**, sur une image TimescaleDB, et note qu'elle n'a pas pu établir si la 18
était visée.

**Rien dans ce document n'exige la 18.** Colonnes générées (12+), `daterange` et
GiST (bien antérieurs), `MERGE` non utilisé, `unaccent`, `pg_trgm`, `postgis` :
tout fonctionne en 17.6. La divergence est reportée en question ouverte n° 1 et
n'a aucune conséquence sur ce qui suit.

---

## 2. Architecture

### 2.1 Les couches

```
controllers  →  metier  →  repository  →  db
```

Aucun saut de couche : un contrôleur ne voit jamais un `repository`, un
`repository` ne contient jamais de règle métier, `db` ne connaît que le pool et
les transactions.

```
src/
  runtime/
    bootstrap.ts          LE composition root — le seul module qui construit
    config.ts             lecture et validation de l'environnement
    server.ts             instanciation Fastify, arrêt propre
  http/                   controllers
    photos_controller.ts
    texts_controller.ts
    tasks_controller.ts
    images_controller.ts
    jobs_controller.ts
    ref_controller.ts
    system_controller.ts
    error_handler.ts      AppError → ApiError du contrat
    query_params.ts       l'allowlist stricte, une seule implémentation
  metier/
    dating/               la cascade — fonctions PURES, sans base
      cascade.ts
      arbitration.ts
      album_span.ts
    overlap/              croisement d'intervalles — fonctions pures
    search/               nettoyage de `q`, calcul des offsets de surlignage
    tasks/                sélection, revue, hash de contenu
    export/               écriture du dossier, sérialisation canonique
    captions/             la passe de légendage
    gallery/              hash perceptuel et appariement
    jobs/                 la ressource de travail
  repository/             une méthode = une requête paramétrée
    photo_repository.ts
    text_repository.ts
    task_repository.ts
    ref_repository.ts
    import_repository.ts
  db/
    pool.ts
    transaction.ts        withTransaction — LA frontière transactionnelle
    migrations/           NNN_nom.sql, appliquées en ordre
  io/
    safe_fs.ts            LE point de contrôle des écritures disque
    sips.ts               rendu d'image, execFile sans shell
    sqlite_reader.ts      ouverture read-only des quatre bases
  shared/                 les *_interface.ts et enums.ts du contrat
  log/
    log.ts                le service de log — jamais console.log
```

`shared/` est **exactement** le code normatif de `docs/api-contract.md` §2. Le
frontend importe le même dossier. Il n'existe aucune autre définition de forme
de réponse.

### 2.2 Composition root explicite, sans conteneur

`runtime/bootstrap.ts` construit tout, dans l'ordre, en passant les dépendances
par constructeur. Pas de décorateurs, pas de `reflect-metadata`, pas de
résolution par type.

```ts
export async function bootstrap(env: NodeJS.ProcessEnv): Promise<App> {
  const config = loadConfig(env);              // lève en nommant ce qui manque
  const log = createLog(config.logLevel);
  const pool = createPool(config.databaseUrl);
  await runMigrations(pool, log);

  const safeFs = createSafeFs(config.writableRoots, log);
  const sips = createSipsRenderer(config, safeFs, log);

  const photoRepository = createPhotoRepository(pool);
  const textRepository = createTextRepository(pool);
  const taskRepository = createTaskRepository(pool);
  const refRepository = createRefRepository(pool);

  const datingService = createDatingService(photoRepository, refRepository, log);
  const overlapService = createOverlapService(photoRepository, textRepository);
  const imageService = createImageService(config, sips, photoRepository, log);
  const exportService = createExportService(config, safeFs, taskRepository,
                                            imageService, log);
  const jobService = createJobService(log);

  return createServer(config, log, {
    photoRepository, textRepository, taskRepository, refRepository,
    datingService, overlapService, imageService, exportService, jobService,
  });
}
```

Pourquoi pas de conteneur : il y a une quinzaine de dépendances et un seul
graphe. Un conteneur remplacerait un fichier lisible par une configuration
implicite, et déplacerait au démarrage des erreurs que le compilateur voit
aujourd'hui.

### 2.3 Mono-thread

Aucun `worker_threads`. Le seul parallélisme est :

- **des processus enfants** — jusqu'à 8 `sips` simultanés (§9.2), qui sont des
  processus, pas des fils ;
- **de l'entrée-sortie asynchrone** — les requêtes SQL et les lectures de
  fichiers.

`sharp` (§11.2), s'il est retenu, utilise le pool de threads de libuv en
interne. Ce n'est pas du code à fils écrit ici, et la contrainte porte sur le
code du projet.

---

## 3. Configuration

**Aucun chemin en dur.** Tout par variables d'environnement, validées au
démarrage par un schéma. Le serveur **refuse de démarrer en nommant la racine
qui manque** — à une exception près, §3.2.

| Variable | Défaut | Rôle |
|:---|:---|:---|
| `PHOTO_UI_HOST` | `127.0.0.1` | boucle locale seulement |
| `PHOTO_UI_PORT` | `4310` | — |
| `DATABASE_URL` | — | `postgres://nico@localhost:5432/photo_ui` |
| `ORIGINALS_ROOT` | — | racine des fichiers originaux, **volume externe** |
| `THUMBS_ROOT` | — | `…/work/content-thumbs`, vignettes 224 px |
| `PIPELINE_DB_ROOT` | — | dossier des quatre `.db` |
| `PAGES_ROOT` | — | `adobe_mcp/docs/pages/`, images de page |
| `ANNOTATIONS_DIR` | — | `adobe_mcp/data/annotations/`, lu à l'import |
| `RENDER_CACHE_ROOT` | — | **disque interne**, cache des rendus |
| `TASKS_ROOT` | — | **disque interne**, dossiers exportés |
| `PERIOD_FROM` / `PERIOD_TO` | `1998-01-01` / `2004-12-31` | le périmètre est un paramètre |
| `PERIMETER_SETS` | les cinq sets | la hiérarchie fait foi |
| `RENDER_EDGE` | `1400` | — |
| `RENDER_CONCURRENCY` | `8` | mesuré : facteur 3 par rapport au séquentiel |
| `FEATURE_DATING_EXPORT` | `false` | le seul chemin d'écriture vers `adobe_mcp` |
| `CAPTION_MODEL` · `CAPTION_PROMPT_VERSION` · `ANTHROPIC_API_KEY` | — | passe de légendage |
| `LOG_LEVEL` | `info` | — |

### 3.1 Racines en écriture, racines en lecture

C'est une distinction de configuration, pas une convention :

```ts
readonly writableRoots  = [RENDER_CACHE_ROOT, TASKS_ROOT]      // + ANNOTATIONS_DIR si le drapeau est actif
readonly readOnlyRoots  = [ORIGINALS_ROOT, THUMBS_ROOT, PIPELINE_DB_ROOT, PAGES_ROOT]
```

`io/safe_fs.ts` refuse toute écriture dont le chemin résolu ne tombe pas sous
une `writableRoots`. Voir §13.3.

### 3.2 Vérification au démarrage

Chaque racine est résolue, canonicalisée (`fs.realpath`) et testée.

- Une racine **en écriture** absente ou non inscriptible → **refus de démarrer**,
  en la nommant avec sa variable d'environnement.
- `PIPELINE_DB_ROOT`, `PAGES_ROOT` absents → refus de démarrer.
- **`ORIGINALS_ROOT` et `THUMBS_ROOT` absents → démarrage quand même**, avec un
  avertissement. Le volume externe peut être démonté en session : refuser de
  démarrer rendrait impossible la consultation des données déjà en base et des
  rendus déjà en cache, ce que la spécification interdit expressément. Leur
  absence devient un `VOLUME_UNAVAILABLE` par requête et un bandeau global.

La disponibilité est re-testée à chaque requête d'image et toutes les 30 s pour
`GET /system/status` — un `fs.access` sur la racine, pas un parcours.

---

## 4. Le schéma PostgreSQL

Trois schémas, trois cycles de vie.

| Schéma | Contenu | Cycle de vie |
|:---|:---|:---|
| `pipeline` | copie des données amont + cascade résolue | **TRUNCATE et rechargé** à chaque import |
| `app` | tâches, sélections, notes, corrections, légendes, liens de galerie | **jamais touché par l'import** |
| `ref` | référentiels saisis à la main | jamais touché par l'import |

### 4.1 La règle des clés étrangères — le piège à ne pas poser

**Aucune clé étrangère de `app` ou `ref` vers `pipeline`.**

`TRUNCATE pipeline.photo` avec une FK entrante exige `CASCADE`, qui
**supprimerait le travail humain**. La contrainte protégerait donc exactement
l'inverse de ce qu'on veut protéger. Les tables de `app` portent des
`cloud_asset_id`, des `(kind, id)` de texte et des `album_path` **libres**, et
l'orphelinat se **constate** après chaque import par une jointure (§6.6), puis
se **signale** — jamais ne supprime.

À l'intérieur d'un même schéma, les FK sont normales et utiles.

### 4.2 Dates : `timestamp` sans fuseau, `date` pour le civil

**La règle et sa portée exacte.** L'interdiction de `timestamptz` porte sur les
**dates photographiques et documentaires**, pas sur les horodatages d'audit.

| Nature | Type | Pourquoi |
|:---|:---|:---|
| Prise de vue | `timestamp` + `int NULL` + `text` | 76 % des `captureDate` n'ont **aucune** indication de fuseau, et six formats coexistent dans une seule colonne amont. Un cast naïf en `timestamptz` décale silencieusement des milliers de photos, et le chemin du fichier sur disque dérive de l'heure telle qu'elle est stockée. |
| Jour civil résolu, dates de texte | `date` | Le recouvrement se calcule **au jour civil** : l'heure du journal est l'heure de bord, de fuseau inconnu, sur un bateau qui a traversé l'Atlantique. |
| Création, import, export | `timestamptz` | Ce sont de **vrais instants**, produits par cette machine, et les comparer entre fuseaux a un sens. |

```sql
capture_date_local  timestamp,     -- ce que l'appareil a écrit, tel quel
capture_offset_min  int,           -- NULL = aucune zone connue. NULL ≠ 0.
capture_date_raw    text           -- la chaîne amont intégrale, pour l'audit
```

`capture_offset_min` **NULL et 0 ne sont pas la même chose** : `NULL` veut dire
« aucun fuseau n'était écrit », `0` voudrait dire « UTC ». 32 140 lignes sont
dans le premier cas et aucune règle ne doit les traiter comme le second.

### 4.3 `pipeline.photo` — et la colonne qui tient la règle capitale

```sql
CREATE SCHEMA pipeline;

CREATE TABLE pipeline.photo (
  cloud_asset_id      char(32) PRIMARY KEY,
  sha256              char(64) NOT NULL,
  relative_path       text NOT NULL,      -- relatif à ORIGINALS_ROOT : le volume est déplaçable
  file_name           text NOT NULL,
  album_path          text,               -- NFC, toujours
  group_name          text,
  format              text NOT NULL,
  file_size           bigint,
  width               int,
  height              int,
  aesthetics_score    int,

  -- ---- les colonnes BRUTES, intactes : un désaccord doit rester constatable
  raw_date_source     text NOT NULL,      -- photos.dateSource amont, 7 valeurs
  raw_year            int,
  raw_month           int,
  raw_day             int,
  capture_date_local  timestamp,
  capture_offset_min  int,
  capture_date_raw    text,

  -- ---- la cascade RÉSOLUE, matérialisée à l'import (§6)
  resolved_from       text,               -- NULL seulement si aucune date n'est dérivable
  resolved_start      date,
  resolved_end        date,
  resolved_precision  text,
  arbitration_gap_months int,             -- écart mesuré à l'album, rangs 2 et 4
  arbitration_outcome text,               -- 'accepted' (rang 2) | 'rejected' (rang 4) | NULL (rang 5)
  bracket_hours       real,               -- rang 3 seulement
  evidence_entry_ids  text[],             -- rang 3 seulement

  -- ---- LA RÈGLE CAPITALE, TENUE PAR LE SCHÉMA
  resolved_kind text GENERATED ALWAYS AS (
    CASE resolved_from
      WHEN 'annotation'      THEN 'decision'
      WHEN 'exif_arbitrated' THEN 'reading'
      WHEN 'logbook_bracket' THEN 'inference'
      WHEN 'album_month'     THEN 'inference'
      WHEN 'album_year'      THEN 'inference'
      ELSE NULL
    END
  ) STORED,

  -- l'intervalle comme OPÉRANDE, pour que « chevauche » soit un opérateur
  resolved_range daterange GENERATED ALWAYS AS (
    CASE WHEN resolved_start IS NULL THEN NULL
         ELSE daterange(resolved_start, resolved_end, '[]') END
  ) STORED,

  -- ---- géographie
  position         geography(Point, 4326),
  position_source  text,                  -- 'exif' | 'logbook_interpolated'
  altitude_m       real,
  city             text,
  state            text,
  country_raw      text,                  -- tel qu'Adobe l'a écrit
  sublocation      text,

  camera_make text, camera_model text, lens text,
  iso int, aperture real, shutter text, focal_length real,
  title text, description text,
  ocr_text text,

  CONSTRAINT photo_resolved_from_known CHECK (
    resolved_from IS NULL OR resolved_from IN
      ('annotation','exif_arbitrated','logbook_bracket','album_month','album_year')),
  CONSTRAINT photo_precision_known CHECK (
    resolved_precision IS NULL OR resolved_precision IN ('day','month','year')),
  CONSTRAINT photo_bounds_ordered CHECK (
    resolved_start IS NULL OR resolved_start <= resolved_end),
  CONSTRAINT photo_bounds_complete CHECK (
    (resolved_start IS NULL) = (resolved_end IS NULL)),
  -- une date au mois EST le mois entier, jamais un jour arbitraire
  CONSTRAINT photo_month_is_whole_month CHECK (
    resolved_precision <> 'month' OR (
      extract(day from resolved_start) = 1
      AND resolved_end = (resolved_start + interval '1 month' - interval '1 day')::date)),
  CONSTRAINT photo_year_is_whole_year CHECK (
    resolved_precision <> 'year' OR (
      extract(doy from resolved_start) = 1
      AND resolved_end = (resolved_start + interval '1 year' - interval '1 day')::date)),
  CONSTRAINT photo_bracket_only_rank3 CHECK (
    bracket_hours IS NULL OR resolved_from = 'logbook_bracket')
);
```

**Pourquoi `resolved_kind` est une colonne générée, et pourquoi ça change tout.**

PostgreSQL **refuse toute écriture** visant une colonne `GENERATED ALWAYS`. Un
`INSERT` ou un `UPDATE` qui tenterait de poser `resolved_kind = 'reading'` sur
une photo datée par l'album échoue avec une erreur, pas silencieusement. La
règle « une inférence ne doit jamais ressembler à une lecture » cesse d'être une
consigne de revue de code : **elle devient impossible à violer sans que la base
le dise**. C'est le seul mécanisme de ce document qui ne dépend d'aucune
vigilance humaine.

Le `CHECK photo_resolved_from_known` complète le dispositif : sans lui, une
sixième valeur de `resolved_from` produirait un `resolved_kind` NULL — une date
sans nature, exactement ce que la règle interdit. Le `CHECK` la refuse à
l'insertion.

> **Un écart de vocabulaire avec la spécification frontend, assumé.** Elle
> nomme le rang 1 `human` dans la liste des colonnes (§9.2) et `annotation` dans
> le manifeste (annexe C) — deux noms pour la même chose. Ce document retient
> **`annotation`, celui du contrat**, et l'emploie de la colonne jusqu'à la
> réponse HTTP. Une table de correspondance entre un vocabulaire de base et un
> vocabulaire d'API est un endroit où se glisse une faute, pour un bénéfice nul.
> À confirmer avec `spec-frontend`, mais le sens de l'unification ne fait pas de
> doute.

Les deux `CHECK` de précision empêchent l'autre moitié de la faute : une date
au mois transmise comme un jour arbitraire. `[2004-09-01, 2004-09-30]` passe ;
`[2004-09-14, 2004-09-14]` avec `precision: 'month'` est rejeté.

**Recherche plein texte — colonnes séparées, et c'est délibéré.**

```sql
CREATE TEXT SEARCH CONFIGURATION fr_unaccent (COPY = french);
ALTER TEXT SEARCH CONFIGURATION fr_unaccent
  ALTER MAPPING FOR hword, hword_part, word WITH unaccent, french_stem;

ALTER TABLE pipeline.photo
  ADD COLUMN search_meta tsvector GENERATED ALWAYS AS (
    to_tsvector('fr_unaccent',
      coalesce(album_path,'') || ' ' || coalesce(group_name,'') || ' ' ||
      coalesce(file_name,'')  || ' ' || coalesce(city,'')       || ' ' ||
      coalesce(state,'')      || ' ' || coalesce(country_raw,'') || ' ' ||
      coalesce(sublocation,''))
  ) STORED,
  ADD COLUMN search_ocr tsvector GENERATED ALWAYS AS (
    to_tsvector('fr_unaccent', coalesce(ocr_text,''))
  ) STORED;
```

**Fusionner OCR et métadonnées serait une faute mesurable.** L'OCR contient
`ROBERT IS HERE... FRUIT STAND`, du texte de panneaux, des fragments illisibles
sur 614 photos. Mêlé aux noms d'album et de lieu dans un seul vecteur, il fait
remonter du bruit sur des recherches qui n'ont rien à voir, sans que
l'utilisateur puisse savoir lequel des deux a répondu — alors que le contrat
exige précisément de le dire (`matchedOn`). Deux colonnes, deux réponses
distinctes.

Les **légendes** ont leur propre vecteur, mais dans `app` : elles ne viennent pas
du pipeline et survivent au TRUNCATE (§4.6).

> **Deux pièges de `to_tsvector` en colonne générée.**
> 1. La forme à **deux arguments** avec un nom de configuration littéral est
>    obligatoire : `to_tsvector(text)` est `STABLE` (elle dépend de
>    `default_text_search_config`) et PostgreSQL refuse de l'utiliser dans une
>    colonne générée.
> 2. `to_tsvector(regconfig, text)` est **déclarée** `IMMUTABLE` alors que la
>    configuration `fr_unaccent` s'appuie sur un dictionnaire lu sur disque. Si
>    les règles d'`unaccent` changent un jour, les vecteurs stockés ne se
>    régénèrent **pas** tout seuls : il faut les reconstruire. Sans conséquence
>    ici — l'import réécrit tout — mais à savoir avant de s'en étonner.

**Index :**

```sql
CREATE INDEX photo_album        ON pipeline.photo (album_path);
CREATE INDEX photo_sha          ON pipeline.photo (sha256);
CREATE INDEX photo_range        ON pipeline.photo USING gist (resolved_range);
CREATE INDEX photo_position     ON pipeline.photo USING gist (position)
                                 WHERE position IS NOT NULL;
CREATE INDEX photo_search_meta  ON pipeline.photo USING gin (search_meta);
CREATE INDEX photo_search_ocr   ON pipeline.photo USING gin (search_ocr);
CREATE INDEX photo_album_trgm   ON pipeline.photo USING gin (album_path gin_trgm_ops);
CREATE INDEX photo_group_trgm   ON pipeline.photo USING gin (group_name gin_trgm_ops);
CREATE INDEX photo_aesthetics   ON pipeline.photo (aesthetics_score DESC);
```

L'index GiST sur `resolved_range` est le pivot de toute l'application : le filtre
de dates, le recouvrement et la chronologie s'y appuient tous par l'opérateur
`&&`. Écrire `a && b` plutôt que `a.start <= b.end AND b.start <= a.end`
supprime la possibilité même de se tromper de sens d'inégalité — la faute qui
rendrait 0 photo au lieu de 273.

L'index partiel sur `position` évite d'indexer 73 % de NULL.

### 4.4 Le reste de `pipeline`

```sql
CREATE TABLE pipeline.album (
  path            text PRIMARY KEY,        -- NFC
  set_name        text,
  album_name      text NOT NULL,
  group_name      text,
  photo_count     int NOT NULL DEFAULT 0,
  prefix_year     int,                     -- re-dérivé du NOM, pas lu en amont
  prefix_month    int,                     -- NULL si NN > 12 ou année seule
  in_perimeter    boolean NOT NULL,
  suspected_range boolean NOT NULL DEFAULT false,
  span_from       date NOT NULL,           -- la cascade s'en sert (rang 0)
  span_to         date NOT NULL,
  span_presumed   boolean NOT NULL,        -- true = déduit du préfixe, à revoir
  CONSTRAINT album_span_ordered CHECK (span_from <= span_to)
);

CREATE TABLE pipeline.photo_album (
  cloud_asset_id char(32) NOT NULL REFERENCES pipeline.photo ON DELETE CASCADE,
  album_path     text     NOT NULL REFERENCES pipeline.album ON DELETE CASCADE,
  is_primary     boolean  NOT NULL,
  PRIMARY KEY (cloud_asset_id, album_path)
);

CREATE TABLE pipeline.tag (
  name       text NOT NULL,
  kind       text NOT NULL,               -- 'ai' | 'user'
  photo_count int NOT NULL DEFAULT 0,
  PRIMARY KEY (name, kind)
);

CREATE TABLE pipeline.photo_tag (
  cloud_asset_id char(32) NOT NULL REFERENCES pipeline.photo ON DELETE CASCADE,
  tag_name       text NOT NULL,
  tag_kind       text NOT NULL,
  confidence     int,                     -- 48..98 pour 'ai', NULL pour 'user'
  PRIMARY KEY (cloud_asset_id, tag_name, tag_kind),
  FOREIGN KEY (tag_name, tag_kind) REFERENCES pipeline.tag ON DELETE CASCADE
);
CREATE INDEX photo_tag_by_tag ON pipeline.photo_tag (tag_name, tag_kind)
  WHERE tag_kind = 'ai';

CREATE TABLE pipeline.person (
  name text PRIMARY KEY,
  photo_count int NOT NULL DEFAULT 0
);
CREATE TABLE pipeline.photo_person (
  cloud_asset_id char(32) NOT NULL REFERENCES pipeline.photo ON DELETE CASCADE,
  person_name    text NOT NULL REFERENCES pipeline.person ON DELETE CASCADE,
  PRIMARY KEY (cloud_asset_id, person_name)
);

-- Rang 3 : proposition et doute, séparés, jamais fondus dans la date
CREATE TABLE pipeline.dating_proposal (
  cloud_asset_id char(32) PRIMARY KEY REFERENCES pipeline.photo ON DELETE CASCADE,
  proposed_date  date NOT NULL,
  position       geography(Point, 4326),
  position_source text,
  evidence_entry_ids text[] NOT NULL DEFAULT '{}',
  span_hours     real
);
CREATE TABLE pipeline.dating_doubt (
  cloud_asset_id char(32) PRIMARY KEY REFERENCES pipeline.photo ON DELETE CASCADE,
  reason         text NOT NULL,           -- VOCABULAIRE OUVERT — aucun CHECK
  album_path     text NOT NULL,
  candidates     jsonb NOT NULL DEFAULT '[]'
);
CREATE INDEX dating_doubt_reason ON pipeline.dating_doubt (reason);
```

> **`dating_doubt.reason` n'a délibérément aucune contrainte de valeur.** Le
> vocabulaire a déjà changé sous le projet, et deux composants du pipeline en
> portent aujourd'hui deux versions divergentes : l'index connaît
> `album-not-in-logbook` que `dating.db` ne produit plus, et ignore
> `several-visits` et `place-not-on-track` qu'il produit. Un `CHECK` ferait
> échouer l'import à la prochaine évolution amont. Les raisons rencontrées sont
> insérées dans `ref.doubt_reason` au fil de l'import (§6.5), et l'API les sert
> comme des **données**.

**Documents et textes — la clé est le couple :**

```sql
CREATE TABLE pipeline.document (
  id            text PRIMARY KEY,          -- 'logbook', 'ma-vie', 'web/1999/Transat'
  kind          text NOT NULL,             -- 'handwritten' | 'html'
  title         text NOT NULL,
  page_count    int,
  has_pages     boolean NOT NULL
);

CREATE TABLE pipeline.page (
  id            text PRIMARY KEY,          -- 'logbook/p001'
  document_id   text NOT NULL REFERENCES pipeline.document ON DELETE CASCADE,
  ordinal       int NOT NULL,
  label         text,
  image_relpath text NOT NULL,             -- relatif à PAGES_ROOT, tel qu'amont
  width int NOT NULL, height int NOT NULL,
  window_start  date, window_end date,
  window_range  daterange GENERATED ALWAYS AS (
    CASE WHEN window_start IS NULL THEN NULL
         ELSE daterange(window_start, window_end, '[]') END) STORED,
  span_source   text,                      -- 'passages' | 'entries' | 'carried'
  UNIQUE (document_id, ordinal)
);

-- Passages ET entrées de journal dans une seule table.
-- LA CLÉ PRIMAIRE EST LE COUPLE : 456 identifiants existent dans les deux
-- espaces de noms amont. PRIMARY KEY (id) écraserait un texte par un autre.
CREATE TABLE pipeline.text_unit (
  kind          text NOT NULL,             -- 'passage' | 'log_entry'
  id            text NOT NULL,             -- 'ma-vie/p007/002'
  document_id   text NOT NULL REFERENCES pipeline.document ON DELETE CASCADE,
  page_id       text REFERENCES pipeline.page ON DELETE CASCADE,
  ordinal       int NOT NULL,
  body          text NOT NULL,             -- la transcription AMONT, jamais corrigée ici
  confidence    text NOT NULL,             -- 'transcribed' | 'reviewed' | 'uncertain'

  -- ---- (1) LA DATE QUE LE TEXTE AFFIRME. Ce que le contrat expose en `date`.
  date_source   text,                      -- vocabulaire du contrat, à l'identique
  date_start    date,
  date_end      date,
  date_kind     text GENERATED ALWAYS AS (
    CASE date_source
      WHEN 'passage_date_from' THEN 'reading'
      WHEN 'log_entry_date'    THEN 'reading'
      WHEN 'page_window'       THEN 'inference'
      WHEN 'web_span'          THEN 'inference'   -- humaine, mais conjecturale : voir contrat §4.8
      ELSE NULL
    END) STORED,

  -- ---- (2) LA FENÊTRE DE RECOUVREMENT. Autre chose, et c'est essentiel.
  covers_start  date,
  covers_end    date,
  covers_range  daterange GENERATED ALWAYS AS (
    CASE WHEN covers_start IS NULL THEN NULL
         ELSE daterange(covers_start, covers_end, '[]') END) STORED,
  covers_rule   text,                      -- 'logbook_entry' (A) | 'passage' (B) | 'web_span' (C)
  -- Dénormalisé depuis page.span_source : le client en a besoin dans les
  -- résultats de recouvrement et de recherche, où la page n'est pas chargée.
  page_span_source text,                   -- 'passages' | 'entries' | 'carried' | NULL

  -- champs propres aux entrées de journal
  entry_time      text,                    -- 'HH:MM' tel qu'écrit — fuseau INCONNU
  entry_position  geography(Point, 4326),
  raw_position    text,                    -- degrés-minutes, littéral, jamais reconverti
  place_name      text,
  heading text, wind text, baro real, engine_hours real,
  fix_confidence text, remark_confidence text,

  PRIMARY KEY (kind, id),
  CONSTRAINT text_kind_known CHECK (kind IN ('passage','log_entry')),
  CONSTRAINT text_date_source_known CHECK (
    date_source IS NULL OR date_source IN
      ('passage_date_from','log_entry_date','page_window','web_span'))
);
CREATE INDEX text_unit_range    ON pipeline.text_unit USING gist (covers_range);
CREATE INDEX text_unit_document ON pipeline.text_unit (document_id, ordinal);
CREATE INDEX text_unit_page     ON pipeline.text_unit (page_id, ordinal);
```

**La date affirmée et la fenêtre de recouvrement sont deux colonnes
différentes, et les confondre serait une faute.** Une entrée de journal
`1999-10-14` **affirme** ce jour-là — c'est une lecture, écrite le jour même sur
la page. Mais pour le recouvrement, la règle A lui fait **couvrir** jusqu'à la
veille de la journée suivante renseignée, soit parfois 92 jours. Cette extension
appartient au calcul du recouvrement, pas à la date du texte : l'écrire dans
`date_end` transformerait une lecture exacte en une affirmation de trois mois.
D'où deux intervalles, et `date_kind` dérivé du **premier** seulement.

Les vecteurs de recherche des textes portent sur le **texte effectif**, qui
dépend de `app.text_correction` — ils ne peuvent donc pas être une colonne
générée de `pipeline`. Ils vivent dans une vue matérialisée, §10.2.

**Journal de l'import :**

```sql
CREATE TABLE pipeline.import_run (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_id    text NOT NULL UNIQUE,       -- ULID, celui qu'expose ListEnvelope
  started_at   timestamptz NOT NULL,
  finished_at  timestamptz,
  status       text NOT NULL,              -- 'running' | 'succeeded' | 'failed'
  sources      jsonb NOT NULL,             -- [{name, path, mtime, size_bytes}]
  counts       jsonb NOT NULL DEFAULT '{}',
  cascade      jsonb NOT NULL DEFAULT '{}',
  error        text
);
```

`sources` porte, pour chacune des quatre bases SQLite et du fichier
d'annotations, son chemin, son `mtime` et sa taille au moment de la lecture.
C'est ce qui permet de dire plus tard **sur quelles données une décision a été
prise**, et de détecter qu'une base a bougé pendant l'import (§6.1).

### 4.5 `ref` — les référentiels saisis à la main

```sql
CREATE SCHEMA ref;

CREATE TABLE ref.album_span (
  album_path text PRIMARY KEY,             -- NFC. AUCUNE FK vers pipeline (§4.1).
  date_from  date NOT NULL,
  date_to    date NOT NULL,
  note       text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT album_span_ordered CHECK (date_from <= date_to)
);

CREATE TABLE ref.web_span (
  document_id text PRIMARY KEY,
  date_from   date NOT NULL,
  date_to     date NOT NULL,
  note        text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT web_span_ordered CHECK (date_from <= date_to)
);

CREATE TABLE ref.country_alias (
  raw        text PRIMARY KEY,             -- 'Republique de Trinite et Tobago'
  normalized text NOT NULL                 -- 'Trinité-et-Tobago'
);

-- Vocabulaire ouvert : rempli PAR l'import, libellé À LA MAIN.
CREATE TABLE ref.doubt_reason (
  reason text PRIMARY KEY,
  label  text                              -- français, NULL tant que personne n'a écrit
);
```

`ref.album_span` est la **donnée la plus rentable du projet** : 25 saisies
corrigent l'intervalle de 421 photos. Elle est consultée **avant tout le reste
de la cascade** (rang 0). Un `album_path` qui ne correspond plus à aucun album
après un import n'est pas supprimé : il est signalé, comme tout le reste du
travail humain.

### 4.6 `app` — le travail humain

```sql
CREATE SCHEMA app;

CREATE TABLE app.task (
  slug        text PRIMARY KEY,
  title       text NOT NULL,
  brief       text NOT NULL DEFAULT '',
  period_from date, period_to date,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  last_opened_at timestamptz,
  exported_at timestamptz,
  export_directory text,
  exported_content_hash text,
  CONSTRAINT task_period_ordered CHECK (
    period_from IS NULL OR period_to IS NULL OR period_from <= period_to)
);

CREATE TABLE app.task_image (
  task_slug      text NOT NULL REFERENCES app.task ON DELETE CASCADE,
  cloud_asset_id char(32) NOT NULL,        -- pas de FK : pipeline est tronqué
  position       int NOT NULL,
  note           text,
  selected_because text[] NOT NULL DEFAULT '{}',   -- ADDITIF, jamais remplacé
  selected_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_slug, cloud_asset_id)
);
CREATE INDEX task_image_by_photo ON app.task_image (cloud_asset_id);

CREATE TABLE app.task_text (
  task_slug    text NOT NULL REFERENCES app.task ON DELETE CASCADE,
  text_kind    text NOT NULL,
  text_id      text NOT NULL,
  position     int NOT NULL,
  start_offset int, end_offset int,        -- nullables dès aujourd'hui (Q2)
  selected_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_slug, text_kind, text_id)
);

CREATE TABLE app.task_note (
  id         text PRIMARY KEY,             -- 'note_01JB…', ULID préfixé
  task_slug  text NOT NULL REFERENCES app.task ON DELETE CASCADE,
  title      text NOT NULL DEFAULT '',
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.task_note_image (
  note_id text NOT NULL REFERENCES app.task_note ON DELETE CASCADE,
  cloud_asset_id char(32) NOT NULL,
  PRIMARY KEY (note_id, cloud_asset_id)
);
CREATE TABLE app.task_note_text (
  note_id text NOT NULL REFERENCES app.task_note ON DELETE CASCADE,
  text_kind text NOT NULL, text_id text NOT NULL,
  PRIMARY KEY (note_id, text_kind, text_id)
);

-- GLOBALE, jamais par tâche. CLÉE SUR LE COUPLE.
CREATE TABLE app.text_correction (
  text_kind             text NOT NULL,
  text_id               text NOT NULL,
  corrected_text        text NOT NULL,
  original_at_correction text NOT NULL,    -- LE TÉMOIN DE DÉRIVE
  corrected_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (text_kind, text_id),
  CONSTRAINT correction_not_empty CHECK (btrim(corrected_text) <> '')
);

-- Légendes. Clé sha256 : c'est le CONTENU qui est décrit, pas la ligne d'index.
CREATE TABLE app.photo_caption (
  sha256          char(64) PRIMARY KEY,
  caption         text NOT NULL,
  keywords        text[] NOT NULL DEFAULT '{}',
  model           text NOT NULL,
  prompt_version  text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  edited_caption  text,                    -- correction humaine
  edited_keywords text[],
  edited_at       timestamptz,
  search_caption tsvector GENERATED ALWAYS AS (
    to_tsvector('fr_unaccent',
      coalesce(edited_caption, caption) || ' ' ||
      array_to_string(coalesce(edited_keywords, keywords), ' '))
  ) STORED
);
CREATE INDEX caption_search ON app.photo_caption USING gin (search_caption);

-- Appariement des galeries web (§11). Une table de LIENS, jamais une écriture amont.
CREATE TABLE app.web_gallery_link (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sha256      char(64) NOT NULL,
  page        text NOT NULL,               -- '2003/2003_gal_11.htm'
  image_path  text NOT NULL,
  caption     text,
  alt         text,
  distance    int NOT NULL,
  margin      int NOT NULL,
  verified    boolean,                     -- NULL = pas encore relu par un humain
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sha256, image_path)
);
```

**`app.photo_caption` est clée sur `sha256`, pas sur `cloud_asset_id`.** C'est le
contenu qui est décrit : 949 groupes de photos partagent un `sha256` dans la
photothèque, et légender deux fois le même fichier serait payer deux fois pour
la même image.

`selected_because` est un `text[]` **additif** : un second geste ajoute sa
raison par `array(SELECT DISTINCT unnest(existing || new))`, il n'écrase pas.
Sinon la re-sélection efface la trace du premier geste.

---

## 5. Les migrations

Fichiers `db/migrations/NNN_nom.sql`, appliqués en ordre lexicographique dans
une transaction, suivis dans `public.schema_migration (version, applied_at)`.

Pas de framework. Ce sont quelques fichiers, appliqués sur une seule base, par
un seul processus, et un outil apporterait un vocabulaire à apprendre pour un
problème qui n'existe pas ici. La seule fonction utile — « ne pas rejouer ce qui
est déjà appliqué » — tient en vingt lignes.

`001` crée les extensions (`postgis`, `pg_trgm`, `unaccent`), la configuration
`fr_unaccent`, et les trois schémas.

---

## 6. La passe d'import

Lit les quatre bases SQLite et `annotations.jsonl` **en lecture seule**, remplit
`pipeline`, calcule la cascade, ne touche **jamais** à `app` ni à `ref`.

### 6.1 Ouverture des sources

```ts
new Database(path, { readonly: true, fileMustExist: true });
```

Les catalogues Lightroom ne sont **pas** ouverts : le pipeline en produit déjà
des instantanés et `photo_ui` ne les lit pas.

**Détection d'une lecture déchirée.** Le pipeline peut réécrire une base pendant
l'import. Le `mtime` et la taille des cinq sources sont relevés **avant** et
**après** la lecture ; s'ils ont bougé, l'import échoue en le nommant, plutôt
que d'écrire un mélange de deux états. Coût : cinq `stat`. C'est la version
pauvre — et suffisante ici — de ce que la copie par l'API de sauvegarde ferait.

### 6.2 `COPY FROM STDIN`, jamais `COPY FROM '<chemin>'`

**PostgreSQL tourne dans un conteneur Docker et ne voit pas
`/Volumes/OWC Envoy Ultra`.** Un `COPY … FROM '/Volumes/…'` s'exécute **côté
serveur**, dans le système de fichiers du conteneur, et échouerait — ou pire,
lirait un fichier homonyme du conteneur.

Toutes les insertions en masse passent donc par `COPY … FROM STDIN` alimenté
depuis Node (`pg-copy-streams`), les lignes étant produites au fil de la lecture
SQLite. Aucun fichier intermédiaire, aucun chemin partagé, et le débit d'un
`COPY` en flux.

`INSERT … VALUES` reste utilisé pour les tables de quelques dizaines de lignes
(documents, pages, raisons de doute), où le `COPY` ne gagne rien.

### 6.3 Normalisation NFC — vérifiée, et pas théorique

macOS stocke les noms de fichiers en **NFD** : `albumPath` arrive avec le `è` de
`Algès` décomposé. Une égalité littérale avec la même chaîne tapée en NFC **ne
trouve rien** — mesuré : `WHERE albumPath = '…Algès'` a renvoyé zéro ligne là où
`LIKE '%Maison rose%'` en renvoyait 22.

**Toute chaîne lue depuis une source amont est passée par `.normalize('NFC')`
avant insertion.** Sans exception, et en particulier `album_path`, `group_name`,
`file_name`, `relative_path`, les noms de personnes, de tags et de pays.

C'est structurant parce que `album_path` est la **clé** de `ref.album_span` : une
clé en deux normalisations est deux clés. Le contrat garantit en conséquence que
tout ce qui traverse l'API est en NFC, dans les deux sens.

### 6.4 Transaction unique

L'import entier est **une transaction**. `TRUNCATE` est transactionnel en
PostgreSQL : un import qui échoue à mi-parcours laisse la base exactement dans
son état précédent, sans reprise ni nettoyage.

```sql
BEGIN;
  TRUNCATE pipeline.photo, pipeline.album, pipeline.photo_album,
           pipeline.tag, pipeline.photo_tag, pipeline.person,
           pipeline.photo_person, pipeline.dating_proposal,
           pipeline.dating_doubt, pipeline.document, pipeline.page,
           pipeline.text_unit
    RESTART IDENTITY;
  -- COPY …
  -- cascade
  -- constats d'orphelinat
COMMIT;
```

`app` et `ref` ne figurent pas dans ce `TRUNCATE`, et l'absence de FK entrante
(§4.1) garantit qu'aucun `CASCADE` ne pourrait les atteindre.

Le prix est un verrou de plusieurs minutes sur `pipeline`. Pour un utilisateur
sur une machine, c'est le bon échange : l'atomicité vaut mieux que la
disponibilité pendant un import qu'on a soi-même déclenché.

### 6.5 Ce qui est lu où — et ce qui ne l'est pas

| Donnée | Source retenue | Source **écartée**, et pourquoi |
|:---|:---|:---|
| Photos, albums, tags, personnes, OCR | `mcp-index.db` + `mcp-content.db` | — |
| Propositions et doutes de datation | **`dating.db`** | `mcp-index.photo_proposals` et `photo_doubts` sont **périmés** : seules 23 des 85 lignes correspondent encore, et leur vocabulaire de raisons diverge de celui du code actuel |
| Datations à la main | **`annotations.jsonl`** | `dating.proposals` n'en garde qu'un sous-ensemble filtré : **207 des 728 datations n'existent nulle part ailleurs**, la passe amont ne considérant que les photos `1998-2003` dont le `captureDate` ne concorde pas |
| Vignettes | `THUMBS_ROOT`, par `sha256` | — |

`annotations.jsonl` : toutes les lignes `.jsonl` du dossier, triées par nom.
Seules les lignes `kind: 'dating'` sur `target.type: 'photo'` ou `'album'` sont
retenues — les autres formes sont acceptées par le lecteur amont mais ignorées
par son unique consommateur, et les reprendre ici introduirait une donnée que
rien ne produit. Une ligne malformée fait échouer l'import en la nommant
`fichier:ligne`, comme en amont.

Les raisons de doute rencontrées sont insérées dans `ref.doubt_reason` par
`ON CONFLICT DO NOTHING` : une valeur inédite en amont enrichit le référentiel
au lieu de casser l'import.

### 6.6 Ce que l'import constate sans y toucher

Après le rechargement, dans la même transaction :

```sql
-- sélections orphelines : la photo n'est plus dans l'index
SELECT ti.task_slug, ti.cloud_asset_id
  FROM app.task_image ti
  LEFT JOIN pipeline.photo p USING (cloud_asset_id)
 WHERE p.cloud_asset_id IS NULL;

-- corrections dont le texte amont a bougé, ou dont la cible a disparu
SELECT c.text_kind, c.text_id,
       CASE WHEN t.id IS NULL THEN 'orphaned'
            WHEN t.body <> c.original_at_correction THEN 'needs_review'
            ELSE 'applied' END AS status
  FROM app.text_correction c
  LEFT JOIN pipeline.text_unit t
         ON t.kind = c.text_kind AND t.id = c.text_id;
```

Rien n'est supprimé, rien n'est appliqué. Les résultats partent dans
`ImportReport` et alimentent `SystemStatus.attention`.

La comparaison de `body` avec `original_at_correction` est le seul moyen de
détecter la dérive, parce que **la clé d'un texte est positionnelle** :
`<pageId>` suivi de l'`ordinal` ou du `seq`. Une re-dérivation de `documents.db`
qui recoupe une page décale tous les identifiants suivants **de cette page**, et
la correction se retrouverait silencieusement sur le mauvais texte. Le témoin
l'attrape.

### 6.7 Idempotence

Deux imports consécutifs sur des sources inchangées produisent un `pipeline`
identique et ne modifient ni `app` ni `ref`. C'est un test d'intégration (§14.3),
pas une intention.

---

## 7. La cascade de résolution des dates

C'est le mécanisme central : il donne sa date à chacune des 3 930 photos, et le
filtre de dates, le tri, la chronologie, l'ordre du manifeste et tout le
recouvrement en dépendent.

### 7.1 Calculée à l'import et matérialisée — trois raisons

1. **La spécification l'exige** : « calculée au backend, une fois, à l'import, et
   stockée. Une règle réévaluée en deux endroits finit par diverger. »
2. **Elle doit être indexable.** Le filtre de dates et le recouvrement passent
   par `resolved_range && …` sur un index GiST. Une cascade évaluée à la volée ne
   s'indexe pas, et chaque filtre de dates deviendrait un parcours complet avec
   un calcul par ligne.
3. **Elle doit être constatable.** Un désaccord entre l'EXIF et l'album est une
   information que l'interface affiche (« EXIF, confirmé à 2 mois du mois
   d'album »). Il faut donc stocker l'écart, pas seulement le résultat.

Coût : 3 930 lignes. Le calcul lui-même est négligeable ; c'est la lecture
SQLite qui domine l'import.

### 7.2 Où vit le code

Dans `metier/dating/`, en **fonctions pures** — entrée : une ligne brute plus
l'intervalle de son album ; sortie : les six champs résolus. Aucun accès base.

Pas en SQL. La règle a six rangs, un arbitrage en mois entiers, un traitement
distinct pour les albums à année seule et une priorité humaine qui se superpose :
en SQL cela donne un `CASE` de cinquante lignes que personne ne relit et qu'on ne
peut tester qu'avec une base. En fonctions pures, chaque rang est un test unitaire
de trois lignes — et c'est ce qui rend testable l'invariant qui compte
(§14.4).

L'application est en masse : les lignes sont lues, transformées en mémoire, puis
réécrites par un seul `UPDATE … FROM (VALUES …)`.

### 7.3 Rang 0 — l'intervalle de l'album

Calculé d'abord, pour tous les albums, parce que les rangs 2, 4, 5 et 6 s'en
servent.

```
si ref.album_span contient l'album  →  [date_from, date_to], presumed = false
sinon si le préfixe est `aaaa-NN` avec NN ∈ 01..12  →  le mois entier, presumed = true
sinon (NN > 12, ou année seule)     →  l'année entière, presumed = true
```

**Le préfixe nomme un début, pas un mois.** `1998-02-Maison rose Algès` couvre en
réalité février 1998 à fin juin 1999 — dix-sept mois, et 19 de ses 22 fichiers
s'appellent `98-99 maison rose Lisbonne (N).jpg`. **25 des 82 albums portent un
nom qui annonce une durée ou un trajet**, et 421 des 840 photos datées au mois
s'y trouvent. D'où le drapeau `presumed`, la mise en tête de liste des 25 dans
l'écran de réglage, et la question ouverte n° 8 de la spécification frontend
qui retient le mois du préfixe comme repli.

La détection de `suspected_range` se fait sur le nom : une durée explicite
(`3mois`) ou deux toponymes ou plus (`Fort Lauderdale - Belize`). C'est une
**heuristique d'aide à la saisie**, jamais une source de date : elle ne fait que
trier la liste de l'écran de réglage.

### 7.4 La fenêtre d'arbitrage

```
L'EXIF est retenu  ⟺  il tombe dans l'intervalle de l'album élargi de 6 mois
                       de chaque côté.
```

Pour un album `aaaa-mm`, la comparaison se fait **en mois entiers** — l'album ne
prétend pas au jour. Pour un album à année seule, la fenêtre porte sur l'année
(`annéeEXIF = annéeAlbum`).

**Le seuil n'est pas un réglage délicat.** La distribution des écarts est
franchement bimodale : 981 photos à 0 mois, 776 à 1, 442 à 2, 216 à 3, puis
**1 seule à 4 mois**, 4 à 5, 4 à 6 — et **874 au-delà de 5 ans**, dont 466 avec
une année EXIF 2017 et 260 en 2013 : les dates de scan. N'importe quel seuil
entre 4 et 12 mois donne le même résultat. Verdict : **2 424 EXIF retenus,
970 écartés.**

L'écart mesuré est stocké dans `arbitration_gap_months` **des deux côtés** —
retenu comme écarté — avec `arbitration_outcome` qui dit lequel. C'est ce qui
distingue le rang 4 (« l'EXIF existait et a été écarté, c'est une date de
scan ») du rang 5 (« il n'y avait pas d'EXIF »), que `resolved_from` seul ne
distingue pas.

### 7.5 Les six rangs

| Rang | Échelon | `resolved_from` | Précision | `kind` (généré) | Photos |
|---:|:---|:---|:---|:---|---:|
| 0 | `ref.album_span` | *(alimente les autres)* | — | — | 1 saisie |
| 1 | Décision humaine — `annotations.jsonl` | `annotation` | jour | **decision** | **728** |
| 2 | EXIF arbitré, dans la fenêtre | `exif_arbitrated` | jour | **reading** | **2 424** |
| 3 | Lieu ↔ journal — `dating.proposals` | `logbook_bracket` | jour | inference | 37 avec preuve |
| 4 | Album, EXIF écarté (date de scan) | `album_month` | mois | inference | **970** |
| 5 | Album, pas d'EXIF | `album_month` | mois | inference | **375** |
| 6 | Album à année seule | `album_year` | année | inference | **161** |

Les rangs 2, 4, 5 et 6 sont exclusifs : 2 424 + 970 + 375 + 161 = 3 930. Le rang
1 se **superpose** : 92 photos portent les deux, et la main diffère de l'EXIF sur
69. **La main prime sans condition** (Q7, défaut (a)) : la passe amont applique
déjà ce principe, et quelqu'un qui a ouvert la photo et tapé une date connaissait
l'EXIF affiché — le contredire était le geste.

**État final :** 3 060 photos datées au jour, 840 au mois, 30 à l'année, et
**aucune sans date** — contre 233 aujourd'hui. Les 512 photos du rang 4 et les
233 du rang 5 qui portent une date fausse ou nulle sont exactement les 745 photos
mal datées du périmètre ; la cascade les répare toutes.

`resolved_from` peut malgré tout rester NULL pour une photo **hors périmètre**
sans album ni EXIF (420 dans la photothèque entière), et le contrat prévoit
`date: null`. C'est le seul cas.

### 7.6 Recalcul partiel

Une saisie dans `ref.album_span` invalide la cascade **de cet album seulement**.
`PUT /ref/album-span` recalcule ces photos-là, **dans la même transaction que
l'écriture du référentiel**, et renvoie combien de dates ont changé.

C'est le seul recalcul partiel autorisé. Il est synchrone : le plus gros album
fait 286 photos. Et il porte le retour immédiat qui rend les 25 saisies
motivantes — « cette plage vient de redater 243 photos ».

---

## 8. Le recouvrement texte ↔ images

Il **n'existe pas dans les données** : `documents.db` ne référence aucune photo,
aucune colonne ne porte de `cloudAssetId`. Il se calcule par la date, seul signal
partagé.

### 8.1 Ce qui est matérialisé, ce qui ne l'est pas

**Matérialisé à l'import** — `pipeline.text_unit.covers_range` :

- **Règle A, journal.** Une entrée couvre `[E.date, E_suivante.date)`, où
  `E_suivante` est la prochaine **journée distincte** portant une entrée. Calculé
  par une fenêtre SQL, une fois :

  ```sql
  UPDATE pipeline.text_unit t SET covers_start = d.day, covers_end = d.next_day,
                                  covers_rule = 'logbook_entry'
    FROM (SELECT day, coalesce(lead(day) OVER (ORDER BY day) - 1, day) AS next_day
            FROM (SELECT DISTINCT date_start AS day FROM pipeline.text_unit
                   WHERE kind = 'log_entry') s) d
   WHERE t.kind = 'log_entry' AND t.date_start = d.day;
  ```

  Le journal a 241 jours renseignés sur les ~1 513 de sa plage : on photographie
  au mouillage, on tient le journal en mer. Les écarts vont de 1 jour à **92**.
  **La `date` de l'entrée reste le jour écrit** ; seule sa `covers_range`
  s'étend.

- **Règle B, passages.** `[dateFrom, dateFrom]` si daté, sinon la fenêtre de sa
  page `[startAt, endAt]` — et dans ce second cas `date_source = 'page_window'`,
  donc `date_kind = 'inference'` : une fenêtre de page n'est pas une lecture.

  *(Chiffres corrigés le 2026-08-28 par `spec-frontend`, qui a trouvé une
  confusion entre deux requêtes dans sa propre spec.)* **1 290 des 1 859
  passages sont plaçables (69,4 %)** : 828 par leur propre `dateFrom`, **462 par
  la fenêtre de leur page** — dont **341** venant d'une page `entries` et
  **121 d'une page `carried`**.

  **Les 121 `carried` sont une inférence sur une inférence** : la page ne nomme
  aucun jour et reprend celui de la précédente. Le schéma ne leur donne pas une
  quatrième nature — `date_kind` reste `inference`, la spécification n'en connaît
  que trois — mais **`page_span_source` voyage jusqu'au client** pour que
  l'interface puisse les distinguer d'une fenêtre de page réellement datée.

**Non matérialisé** — la **règle C**, site web. Aucun de ses 569 passages ne
porte de date ; leur seul intervalle possible vient de `ref.web_span`, que
l'utilisateur saisit à tout moment. Le stocker dans `pipeline` obligerait à
invalider un cache à chaque saisie. La requête fait donc un `LEFT JOIN` sur
`ref.web_span` et un `COALESCE`. Coût : 569 passages et ~25 spans, sans index —
c'est un parcours de rien du tout.

### 8.2 Le croisement lui-même : à la demande

```sql
SELECT p.cloud_asset_id,
       upper(p.resolved_range) - lower(p.resolved_range) AS photo_span_days,
       upper(t.range)          - lower(t.range)          AS text_span_days
  FROM pipeline.photo p
  JOIN text_windows t ON p.resolved_range && t.range      -- l'opérateur, pas l'inégalité
 WHERE t.kind = $1 AND t.id = $2
 ORDER BY photo_span_days + text_span_days;
```

**Calculé à la demande, jamais matérialisé.** Trois raisons :

1. Le recouvrement dépend de **trois** choses que l'utilisateur modifie : la
   cascade (via `ref.album_span`), `ref.web_span`, et rien d'autre. Une table
   matérialisée exigerait un graphe d'invalidation pour économiser des
   microsecondes.
2. Le volume est petit. Un passage recouvre 3 à 51 photos (moyenne 14) ; une
   photo recouvre au plus quelques dizaines de textes. Une requête rend des
   dizaines à des centaines de lignes, par un index GiST.
3. Le total lui-même est modeste — de l'ordre de quelques dizaines de milliers de
   couples sur tout le corpus. Il n'y a rien à précalculer qui vaille la peine
   d'être invalidé.

**Aucun plafond de largeur**, y compris les 436 recouvrements à plus d'un mois.
40 % des dates de photo ne sont pas des mesures : un seuil calculé dessus
masquerait des recouvrements corrects autant que du bruit, et le ferait en
silence. Les **deux largeurs** sont renvoyées et le tri par défaut est leur somme
croissante — elles ne disent pas la même chose : celle du texte dit ce que la
page couvre, celle de l'image dit ce qu'on ignore.

### 8.3 Ce qu'il ne peut pas faire

Les corpus ne se recouvrent presque pas : le texte est dense en 1999, les photos
en 2003-2004, et **après juin 2002 il n'y a plus de journal** alors que
2 041 photos couvrent 2003-2004. Au mieux ~850 photos sont atteintes.

L'incertitude est **entièrement du côté des images** : les dates du texte sont
exactes — écrites le jour même, sur la page. Le problème n'est donc pas de faire
coïncider deux sources floues, mais de positionner des images mal datées contre
une référence sûre. C'est plus favorable, et insuffisant : une photo datée
« octobre 1999 » chevauche tout le mois, et rien dans les données ne dira
laquelle des 31 journées est la bonne.

Le backend produit donc une **aide au tri**, avec ses deux largeurs et sa règle,
et jamais un lien établi.

---

## 9. Le service et le cache des images

### 9.1 Vignettes — aucun traitement

`GET /images/:sha256/thumb` renvoie `THUMBS_ROOT/<sha256>.jpg` tel quel. Elles
existent toutes : 3 925 sur 3 925 sur le périmètre, côté long 224 px, 1 Go pour
la photothèque entière. Aucune transformation, aucun cache applicatif —
`Cache-Control: immutable` et `ETag: "<sha256>"`, la clé **étant** le hash du
contenu.

Le `sha256` est validé contre `^[0-9a-f]{64}$` **avant** toute concaténation de
chemin. C'est la seule protection nécessaire contre la traversée de répertoire,
et elle est totale : aucun `..` ne satisfait cette expression.

### 9.2 Rendus 1400 px

Produits par `sips`, cachés dans `RENDER_CACHE_ROOT/<sha256>-<edge>.jpg`, sur le
**disque interne**. Jamais sur le volume des originaux, caches compris.

Dossier **plat**, sans sharding par préfixe : le pipeline en fait autant avec
41 913 vignettes dans un seul dossier et s'en porte bien ; nous en aurons 3 930.
Un niveau de sharding serait du code pour un problème que personne n'a.

**Les trois échecs sont déterminés avant d'appeler `sips`**, parce que son code
de sortie ne les distingue pas :

```
1. La racine est-elle montée ?      non → VOLUME_UNAVAILABLE (503, global)
2. Le fichier existe-t-il ?          non → SOURCE_FILE_MISSING (404, cette photo)
3. Le format peut-il rendre ?        non → NOT_RENDERABLE      (415, cette photo)
4. sinon → sips ; un échec ici est un INTERNAL (500)
```

Le format non rendable est une **liste d'extensions sans pixel** (`m4v`, `mov`,
`mp4`, `avi`), pas une liste blanche : le pipeline a déjà payé cette erreur — sa
liste `UNSUPPORTED` bloquait 766 photos pour rien, alors que `sips` décode CR2,
ORF et DNG nativement. **Ne pas réintroduire de liste noire de formats.**

**Appel :**

```ts
execFile('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '78',
                  '-Z', String(edge), sourcePath, '--out', tempPath]);
```

`execFile` avec un tableau d'arguments, **jamais** `exec` ni de shell. Les
chemins contiennent des espaces — `/Volumes/OWC Envoy Ultra/…` en contient un
dans le nom du volume lui-même — et tout passage par un shell serait à la fois
fragile et une surface d'injection.

**Écriture atomique.** Le rendu va dans un fichier temporaire du même dossier,
puis `rename`. Sans cela, deux requêtes simultanées sur la même photo pourraient
servir un JPEG à moitié écrit. Une **table des rendus en vol** garantit en outre
qu'un seul `sips` est lancé par clé, même si huit requêtes arrivent ensemble.

**Parallélisme 8.** Mesuré : 59 ms par image en séquentiel, **19 ms à 8 en
parallèle** — facteur 3, et c'est le seul levier. Un sémaphore de 8 encadre les
processus enfants.

### 9.3 Pré-construction

Au premier démarrage, en tâche de fond, **sans bloquer le démarrage** :
≈ 75 secondes et ≈ 1,4 Go pour tout le périmètre. Le job est reprenable — il
saute ce qui est déjà en cache — et son avancement est lisible dans
`SystemStatus.prerender`.

### 9.4 Pages scannées

Servies telles quelles depuis `PAGES_ROOT/<page.image_relpath>`, ≈ 810 × 1 250 px,
155 fichiers, tous présents. Le chemin vient de la colonne, **jamais reconstruit
depuis `document_id`** : trois orthographes coexistent en amont pour le même
document — `logbook` (identifiant), `journal de bord/` (PDF source),
`journal-de-bord/` (dossier des images).

Aucun rendu de région : `pages.region` est NULL sur les 155 lignes, `rotation`
vaut 0 partout. Rien ne dit où un passage se trouve sur l'image, et le backend ne
prétend pas le savoir.

---

## 10. Recherche plein texte

### 10.1 Le nettoyage de `q`

Dans `metier/search/`, avant toute requête :

1. suppression des **caractères de contrôle**, l'octet NUL en premier — il
   tronque une requête au milieu d'un littéral ;
2. normalisation NFC ;
3. découpage en termes, échappement des métacaractères ;
4. **si le résultat est vide, la recherche rend zéro résultat** — jamais la
   bibliothèque entière — et la valeur brute est reportée dans
   `filters.unmatchedValues`.

Requêtes paramétrées `$1, $2…` partout. Aucune interpolation de chaîne dans du
SQL, y compris pour les listes : `= ANY($1::text[])`.

### 10.2 Le texte effectif des documents

Le texte cherché est le **texte corrigé s'il existe**, jamais la transcription
seule. Il dépend donc de `app.text_correction`, qui vit dans un autre schéma et
change à tout moment.

Solution : une **vue matérialisée** rafraîchie à l'import et à chaque écriture de
correction.

```sql
CREATE MATERIALIZED VIEW app.text_search AS
  SELECT t.kind, t.id,
         coalesce(c.corrected_text, t.body) AS effective_text,
         to_tsvector('fr_unaccent', coalesce(c.corrected_text, t.body)) AS tsv
    FROM pipeline.text_unit t
    LEFT JOIN app.text_correction c ON c.text_kind = t.kind AND c.text_id = t.id;
CREATE UNIQUE INDEX ON app.text_search (kind, id);
CREATE INDEX ON app.text_search USING gin (tsv);
```

`REFRESH MATERIALIZED VIEW CONCURRENTLY` sur 2 871 lignes coûte quelques
millisecondes. Une vue simple non matérialisée conviendrait aussi, mais elle
recalculerait 2 871 `to_tsvector` à chaque recherche et interdirait l'index GIN.

`pg_trgm` complète le dispositif là où la lemmatisation ne suffit pas — noms
propres, noms d'album, toponymes — par des index GIN `gin_trgm_ops`. C'est ce
qui fait fonctionner la lecture généreuse de l'axe lieu, qui cherche `Belize` et
`Tikal` dans `album_path` alors qu'ils ne sont dans aucune colonne de lieu.

### 10.3 Le surlignage se calcule en Node

**Pas `ts_headline`.** Il renvoie une chaîne pré-formatée avec des balises, et le
contrat interdit toute sortie pré-formatée : le frontend reçoit des **offsets**
et rend lui-même.

Le backend extrait donc l'extrait et calcule les positions en JavaScript, en
**unités UTF-16** — la sémantique de `String.prototype.slice`, pour que le client
puisse découper sans conversion. C'est aussi la raison pour laquelle ce calcul ne
peut pas se faire en SQL : PostgreSQL compte en points de code.

---

## 11. La passe de légendage et l'appariement des galeries

### 11.1 Légendage

Déclenchée par l'utilisateur, sur le périmètre ou un sous-ensemble. **Elle ne
bloque rien** : l'application est pleinement utilisable sans une seule légende.

Le modèle reçoit le **rendu 1400 px sans aucune métadonnée** — lui donner le
contexte l'inciterait à le recracher comme s'il l'avait vu. Il rend deux à quatre
phrases factuelles en français, puis 5 à 10 mots-clés normalisés.

Stockage : `app.photo_caption`, clé `sha256`. La passe est **reprenable** et ne
re-soumet pas une photo déjà légendée ; l'état et le coût cumulé sont
consultables. Une correction humaine passe la légende en `human-edited` et
**conserve la production d'origine** — `caption` n'est jamais écrasée, seule
`edited_caption` est écrite.

Le vecteur de recherche `search_caption` est une colonne générée sur la table :
corriger une légende ré-indexe la photo sans code.

### 11.2 Appariement des galeries web

Le spike a établi la faisabilité et mesuré les seuils. Deux points où **ce
document diverge sciemment de sa recommandation**.

**Divergence 1 — on ne touche pas à `adobe_mcp`.** Le spike proposait d'ajouter
une fonction de hash au binaire Swift du pipeline et une colonne `matchhash` à sa
base. C'est exclu : `photo_ui` n'écrit jamais dans le pipeline. Le hash est
recalculé **de notre côté**, depuis les **vignettes 224 px que nous lisons déjà**
— le spike a vérifié qu'un hash calculé depuis la vignette ne diffère que de 0 à
1 bit de celui calculé depuis l'original, et que le recalcul complet de la
bibliothèque prend **2 min 13 s**. Le résultat vit dans `app.web_gallery_link`.

**Divergence 2 — les seuils devront être re-mesurés.** Le spike a obtenu ses
distributions avec Core Image (rendu 72 × 64 puis moyenne de blocs 8 × 8). Une
réimplémentation en Node ne reproduira pas ce filtre au bit près. Ce n'est **pas**
un problème de justesse — le hash ne se compare qu'à lui-même, et les deux côtés
(vignettes de la photothèque, images du site) passeraient par le même code — mais
c'est un problème de **seuils** : la coupure nette à 5-6 bits et la marge ≥ 4
sont des mesures faites sur l'autre implémentation.

Le spike fournit gratuitement le banc d'essai pour les refaire : le site contient
**800 paires image / vignette `_small`**, même cadrage, même source, seulement
réduite. C'est exactement la mesure de sensibilité à l'échelle qu'il faut
reproduire avant de faire confiance à un seuil.

**Les garde-fous sont obligatoires, pas optionnels.** Les faux positifs ne sont
pas répartis au hasard : ce sont des **images dégénérées** — quasi uniformes ou à
très faible contraste : ciel nocturne, éclipse, brume, capture d'écran. Leur hash
est presque constant, donc proche de tous les autres du même type. Sans filtre de
marge et sans exclusion des images à faible variance, on injecte des légendes
d'éclipse sur des photos de bateau.

| Garde-fou | Règle |
|:---|:---|
| Marge | écart au deuxième meilleur candidat ≥ 4 bits — mesuré : 100 % de précision avec, 23 % sans |
| Variance | les images à faible variance sont écartées et **comptées**, jamais appariées en silence |
| Relecture | `verified` NULL tant qu'un humain n'a pas confirmé ; ~210 liens, précision > 90 % |
| Traçabilité | `page`, `image_path`, `distance`, `margin` conservés : le texte reste attribuable et réversible |

**Ce que ça rapporte :** 209 liens légendés, dont **108 sur 2003-2004** — la
seule source de texte d'époque pour la période où le journal n'existe plus.
Rapporté aux 2 037 photos de ces albums, 5,3 % de couverture ; mais chaque
légende est un texte écrit sur le moment, nommant des lieux et des événements.

**Ce que le backend ne fait pas encore avec :** rien ne les expose comme des
`texts[]` exportables. Une légende de galerie n'est ni un `passage` ni un
`log_entry` — elle n'a ni page ni date propre — et l'introduire dans le contrat
demande une valeur d'énumération, une règle de recouvrement et une décision de
spécification. C'est la question ouverte n° 11 du contrat, et je ne la tranche
pas ici.

*(Anomalie relevée par le spike, hors périmètre mais à ne pas perdre : 37 liens
tombent sur des photos dont le `captureDate` indique 2017 alors que l'album est
`2000-12-viree au Venezuela-3mois`. L'appariement par galerie est incidemment un
détecteur de dates aberrantes.)*

---

## 12. L'export d'une tâche

**Le seul endroit où le backend écrit hors de sa base**, avec le cache de rendus.

### 12.1 Le déroulé

1. Lire la tâche, ses sélections, ses notes, les textes effectifs, les dates
   résolues. Une seule transaction en lecture.
2. Écrire dans un **dossier temporaire** `TASKS_ROOT/.<slug>.tmp-<ulid>`.
3. Rendre les images à 1400 px, **8 en parallèle** — 19 ms par image, donc
   ≈ 4 secondes pour 200 images.
4. Copier les pages scannées des passages qui en ont une.
5. Écrire `manifest.json`, `README.md`, `textes/*.md`.
6. Si le dossier cible existe : refuser (409) sauf `overwrite: true`, auquel cas
   le supprimer.
7. `rename` du temporaire vers la cible.

Le passage par un temporaire garantit qu'un export interrompu — disque plein —
**ne détruit pas l'export précédent**. Le dossier temporaire est alors conservé,
nommé dans le rapport, et `partial: true`.

### 12.2 Une image qui ne rend pas

L'export **continue**. L'image est absente du dossier **et du manifeste**, et le
rapport la nomme avec sa cause. Un manifeste qui référence un fichier absent est
pire qu'un manifeste incomplet — et c'est la seule raison pour laquelle la
génération du manifeste vient **après** le rendu des images, pas avant.

### 12.3 L'idempotence, et comment elle est obtenue

« Ré-exporter une tâche inchangée réécrit un dossier identique » n'est vrai que
si la sérialisation est **canonique**. Trois règles, sans lesquelles la promesse
est fausse dès le deuxième export :

1. **Ordre des clés fixe.** Le manifeste est construit par des littéraux d'objet
   écrits dans l'ordre, jamais par itération sur une `Map` ou un `Set`.
2. **Ordre des tableaux déterministe.** `images[]` suit `task_image.position` ;
   `texts[]` suit `task_text.position` ; `people[]`, `keywords[]`,
   `selected_because[]` et `covers_images[]` sont **triés**, parce que
   PostgreSQL ne garantit aucun ordre sur un `text[]` ni sur un agrégat sans
   `ORDER BY`.
3. **Formatage fixe** : indentation de 2, fins de ligne `\n`, saut de ligne
   final, pas de champ optionnel omis — `null` explicite.

Les rendus JPEG sont déterministes à paramètres égaux : même `sips`, même source,
même bord, même qualité.

**Ce qui reste variable, et c'est assumé :** `task.exported_at`. La promesse est
donc « identique au champ `exported_at` près », et `content_hash` la rend
vérifiable — c'est lui, et non l'horodatage, qui distingue `exported` de
`exported_stale`.

**Aucun identifiant ni horodatage de job n'entre dans le dossier.** Le `job_id`
sert au suivi ; l'écrire dans le manifeste casserait l'idempotence sans rien
apporter.

### 12.4 `content_hash`

SHA-256 d'une sérialisation canonique de **ce qui part** : titre, consigne,
période, la liste ordonnée des `(cloud_asset_id, position, note,
selected_because)`, celle des `(text_kind, text_id, position, offsets)`, et les
notes avec leurs rattachements. **Ni `exported_at`, ni `updated_at`, ni aucun
identifiant technique.**

C'est la seule chose qu'il faut calculer juste : `exported_stale` en dépend
entièrement.

---

## 13. Erreurs, transactions, écritures, journalisation

### 13.1 La frontière transactionnelle

**Une seule** : la méthode de service dans `metier`. `db/transaction.ts` expose
`withTransaction(fn)`, qui prend un client du pool, `BEGIN`, appelle `fn`,
`COMMIT`, et `ROLLBACK` sur toute exception avant de la relancer.

- Un `repository` **n'ouvre jamais** de transaction : il reçoit son client.
- Un contrôleur **n'en ouvre jamais** non plus.
- Les erreurs **remontent** jusqu'à cette frontière. Aucun `catch` intermédiaire
  ne les avale ; un `catch` n'existe que pour enrichir puis relancer.

Les écritures liées vont dans une seule transaction : la mutation par lot d'une
sélection (ajouts, retraits, mises à jour) en est une, et
`PUT /ref/album-span` + son recalcul de cascade en est une autre.

### 13.2 Le modèle d'erreur

Une classe `AppError` porte un `ErrorCode` du module d'énumérations partagé, le
`details` typé du contrat, et le code HTTP. Un `setErrorHandler` Fastify unique
la traduit en `ApiError`.

Toute exception non typée devient un `INTERNAL` avec un `traceId` : la trace
complète est journalisée, **rien du message d'origine n'est renvoyé au client**.

La validation des paramètres de requête est faite par **une seule
implémentation** (`http/query_params.ts`) qui reçoit l'allowlist de l'endpoint.
C'est elle qui garantit qu'un nom inconnu est un 400 nommé, et non un filtre qui
disparaît — la faute qui, en amont, a deux fois renvoyé la bibliothèque entière.

### 13.3 Le point de contrôle des écritures

Toute écriture disque passe par `io/safe_fs.ts` :

```ts
function assertWritable(target: string): void {
  const resolved = path.resolve(target);
  if (!writableRoots.some(root => resolved === root ||
                                  resolved.startsWith(root + path.sep))) {
    throw new AppError(ErrorCode.INTERNAL, `écriture refusée hors racine : ${resolved}`);
  }
}
```

Les racines sont canonicalisées au démarrage (`fs.realpath`), ce qui neutralise
les liens symboliques qui pointeraient hors zone. `path.resolve` neutralise les
`..`.

Ce n'est pas une ceinture de sécurité décorative : c'est ce qui rend
**testable** — et pas seulement relisible — la règle « on n'écrit jamais sur le
volume des originaux, caches compris ». Un test pointe `RENDER_CACHE_ROOT` vers
un dossier, `ORIGINALS_ROOT` vers un autre, exerce le rendu et l'export, et
vérifie que le second n'a pas changé (§14.4).

Le drapeau `FEATURE_DATING_EXPORT` ajoute `ANNOTATIONS_DIR` aux racines
inscriptibles, et **seulement lui**. L'écriture passe par le writer validant
amont (`appendAnnotation`), jamais par un JSONL formaté ici, et uniquement pour
`kind: 'dating'` sur `target.type: 'photo'` — le seul couple que le pipeline
honore. Écrire autre chose produirait une ligne lue, validée, puis ignorée sans
un mot.

### 13.4 Journalisation

Un service `Log` (pino en dessous), injecté comme toute autre dépendance.
**Jamais `console.log`.** La seule exception est le chemin d'amorçage, avant que
le service existe — deux ou trois lignes dans `bootstrap.ts`, avec un
`eslint-disable-next-line no-console` et son motif.

Chaque requête porte un identifiant de corrélation, présent dans toutes les
lignes qu'elle produit et dans le `traceId` d'une éventuelle erreur 500.

**Ce qui n'est jamais journalisé** : le contenu des textes et des notes. Ce sont
des mémoires personnelles ; un niveau `debug` ne doit pas les recopier dans un
fichier de log.

---

## 14. Tests

**Vitest**, tests colocalisés : `cascade.ts` → `cascade.test.ts`.

### 14.1 Unitaires — base moquée, et surtout pas de base du tout

La majeure partie de ce qui mérite un test est **pure** et ne touche à rien :

- la cascade et l'arbitrage (`metier/dating/`) ;
- le croisement d'intervalles et les deux largeurs (`metier/overlap/`) ;
- le nettoyage de `q` et le calcul des offsets UTF-16 (`metier/search/`) ;
- la sérialisation canonique et le `content_hash` (`metier/export/`) ;
- la dérivation du slug, la validation de l'allowlist de paramètres ;
- le hash perceptuel (`metier/gallery/`).

Ces tests reçoivent des lignes en entrée et comparent des objets en sortie.
Aucune moquerie n'est nécessaire, ce qui est le signe que le découpage est bon :
là où il faut moquer un `repository`, c'est en général qu'une règle a fui dans
la mauvaise couche.

### 14.2 Intégration — base réelle, jeu d'essai construit à la main

La base de test n'est **pas** une copie de la vraie : celle-ci fait 3 930 photos
et vit sur un volume externe qui peut être démonté.

`test/fixtures/seed.sql` construit une population d'une quarantaine de photos,
trois albums, deux documents et une trentaine de textes, choisie pour contenir
**une instance de chaque piège** :

| Piège | Ce que le jeu d'essai contient |
|:---|:---|
| NFD / NFC | un `album_path` avec `Algès` décomposé |
| Collision d'identifiants de texte | `logbook/p003/001` en `passage` **et** en `log_entry`, avec des textes différents |
| Date de scan | un EXIF 2017 dans un album `2000-12` |
| Album à année seule | un album `2000` sans mois |
| Photo sans aucune date | une ligne `raw_date_source = 'none'` |
| Le cas des 273 | un album au mois dont l'intervalle dépasse la borne haute d'un filtre |
| Fenêtre `carried` | une page dont `span_source = 'carried'` |
| `sha256` partagé | deux photos, un seul contenu, une seule vignette |
| Position absente mais nommée | une entrée de journal avec `place_name` et sans coordonnées |

Cycle : migrations une fois, puis **chaque test dans une transaction annulée à la
fin**. Isolation parfaite, pas de `TRUNCATE` entre les tests, et une suite qui
reste rapide.

### 14.3 Les invariants qui méritent leur propre fichier

Ce sont des tests de règle, pas de fonction. Ils échouent quand quelqu'un a
raison localement et tort globalement.

1. **Une inférence ne peut jamais être servie comme une lecture.** Trois niveaux,
   et c'est le test qui compte le plus du projet :
   - *schéma* — un `UPDATE pipeline.photo SET resolved_kind = 'reading'` doit
     **lever** ; la colonne est générée, PostgreSQL refuse ;
   - *cascade* — pour chacun des six rangs, `resolved_kind` vaut exactement ce
     que la table du §7.5 annonce, et un `resolved_from` inconnu est rejeté par
     le `CHECK` ;
   - *contrat* — parcours récursif de chaque corps de réponse : **aucune clé
     nommée `date` ne porte une chaîne**, et tout objet portant `start` et `end`
     porte aussi `kind`, `source` et `precision`.
2. **Un filtre ne disparaît jamais.** Pour chaque endpoint listant : un paramètre
   mal orthographié rend 400 en le nommant ; une valeur inconnue d'un vocabulaire
   ouvert rend 200 avec `total: 0` et la valeur dans `unmatchedValues` ; un `q`
   qui se réduit à rien rend `total: 0` et **jamais** la population entière.
3. **Chevauchement, jamais inclusion.** Le cas mesuré : un filtre
   `2000-12-01 → 2000-12-20` doit ramener les photos de l'album dont l'intervalle
   est `[2000-12-01, 2000-12-31]`. Une lecture stricte en rend 0 ; c'est la
   régression la plus coûteuse possible et elle est silencieuse.
4. **La clé d'un texte est le couple.** Corriger `(passage, logbook/p003/001)`
   ne doit rien changer à `(log_entry, logbook/p003/001)`, ni en base, ni dans la
   réponse de `GET /texts`.
5. **L'import ne touche pas au travail humain.** Importer, créer une tâche avec
   sélections, corrections et légendes, réimporter : tout est intact, et les
   orphelins sont **marqués** — la table n'a pas perdu une ligne.
6. **Une FK de `app` vers `pipeline` ne doit jamais apparaître.** Un test
   interroge `information_schema` et échoue si une contrainte référentielle
   traverse les deux schémas. C'est bon marché et ça empêche exactement la
   régression qui détruirait le travail humain au prochain `TRUNCATE`.
7. **L'export est idempotent.** Exporter deux fois la même tâche, comparer les
   arbres octet par octet : seule la valeur de `exported_at` diffère.
8. **Rien n'est écrit hors des racines inscriptibles.** `ORIGINALS_ROOT` et
   `THUMBS_ROOT` pointent vers des dossiers dont on relève l'empreinte avant et
   après un rendu, une pré-construction et un export complets.
9. **NFC.** Une recherche d'album tapée en NFC trouve l'album stocké depuis une
   source NFD.

### 14.4 Ce qui n'est pas testé, et pourquoi

- **Le rendu `sips`** : c'est un binaire du système. On teste que le bon appel
  est construit et que les trois échecs sont distingués, pas que macOS sait
  redimensionner une image.
- **Les chiffres du corpus réel** (3 930, 2 424, 745…) : ce sont des mesures sur
  des données vivantes, pas des invariants du code. Les figer en assertions
  rendrait la suite rouge au premier import.
- **Le modèle de légendage** : la passe est testée à modèle moqué. La qualité des
  légendes se juge sur un échantillon, à l'œil, pas dans une suite de tests.

---

## 15. Ce que le backend ne fait délibérément pas

| Absent | Pourquoi |
|:---|:---|
| **ORM** | `pg` et du SQL écrit à la main. Les requêtes intéressantes sont des jointures d'intervalles sur index GiST ; un ORM les rendrait illisibles sans rien simplifier ailleurs. |
| **Framework de migration** | Des fichiers `.sql` numérotés et une table de suivi. Vingt lignes contre un vocabulaire à apprendre. |
| **`worker_threads`** | Le seul parallélisme utile est celui des processus `sips` et de l'entrée-sortie. |
| **Cache applicatif (Redis, mémoire)** | Un utilisateur, une machine, 3 930 lignes. PostgreSQL a déjà le sien. |
| **Import incrémental** | Le rechargement complet tient dans une transaction et prend quelques minutes. Des filigranes existent en amont ; les exploiter serait de la complexité pour un gain nul. |
| **Matérialisation du recouvrement** | Il dépend de deux référentiels que l'utilisateur modifie ; un graphe d'invalidation pour économiser des microsecondes (§8.2). |
| **`pgvector`, embeddings** | Disponible non installé, `embeddings` a 0 ligne. L'axe contenu passe par la légende en texte, qui réutilise le `tsvector` déjà nécessaire. |
| **`ts_headline`** | Il rend une chaîne pré-formatée ; le contrat exige des offsets. |
| **Écriture dans le pipeline** | Sauf l'export de datation, drapeau désactivé par défaut, `kind: 'dating'` sur `target.type: 'photo'` uniquement. |
| **Lecture des catalogues Lightroom** | Le pipeline en produit des instantanés ; `photo_ui` ne s'en approche pas. |
| **Authentification, sessions, TLS** | `127.0.0.1`, un utilisateur. |
| **Détection de doublons, carte, re-datation, relance de passe** | Hors périmètre de l'application. |

---

## 16. Questions ouvertes

**1 — PostgreSQL 17.6 ou 18 ?** La consigne dit 18, la mesure dit 17.6 sur une
image TimescaleDB. Rien ici n'exige la 18.
*Recommandation : écrire pour 17.6* et n'introduire une dépendance à la 18 que si
un besoin la justifie. Trancher avant la première migration, parce que revenir en
arrière sur une base peuplée est plus coûteux que le contraire.

**2 — La transaction unique de l'import est-elle acceptable ?** Elle donne une
atomicité parfaite au prix d'un verrou de plusieurs minutes sur `pipeline`.
(a) Transaction unique. (b) Charger dans des tables temporaires puis un échange
de noms sous verrou court.
*Recommandation : (a).* L'utilisateur déclenche lui-même l'import et sait qu'il
tourne. (b) double le code pour un confort dont personne ne bénéficie.

**3 — `sharp` ou `sips` pour le hash perceptuel ?** `sharp` donne un accès direct
aux pixels bruts, au prix d'une dépendance native (libvips). `sips` est déjà
utilisé et ne demande rien, mais ne rend pas de pixels bruts — il faudrait passer
par un PNG intermédiaire et un décodeur.
*Recommandation : `sharp`*, avec les seuils re-mesurés sur le banc des 800 paires
(§11.2). À rouvrir si la dépendance native pose problème pour Capacitor.

**4 — La vue matérialisée `app.text_search` ou une colonne dénormalisée ?**
La vue est propre mais impose un `REFRESH` à chaque correction. Une colonne
`effective_text` sur `pipeline.text_unit`, mise à jour par l'écriture de la
correction, éviterait le rafraîchissement — au prix d'une donnée de `app` écrite
dans `pipeline`, ce qui brouille la frontière des deux schémas.
*Recommandation : la vue.* 2 871 lignes se rafraîchissent en quelques
millisecondes, et la frontière `pipeline` / `app` vaut plus que ça.

**5 — Que faire d'un `ref.album_span` dont l'album a disparu ?** (a) Le conserver
et le signaler, comme le reste du travail humain. (b) Le supprimer.
*Recommandation : (a)*, par cohérence avec les sélections orphelines. Mais rien
dans la spécification ne le dit, et l'écran de réglage ne prévoit pas de le
montrer.

**6 — Les liens de galerie deviennent-ils des textes exportables ?** Question
ouverte n° 11 du contrat, reportée ici parce que c'est le backend qui les
produit. Tant qu'elle n'est pas tranchée, `app.web_gallery_link` se remplit et ne
sort pas.

**7 — Faut-il conserver l'historique des imports ?** `pipeline.import_run`
s'accumule. (a) Tout garder — quelques lignes par mois. (b) Ne garder que les
vingt derniers.
*Recommandation : (a).* C'est la seule trace de l'état des sources au moment où
une décision a été prise.

---

## 17. Incertitudes

Ce que je n'ai pas pu vérifier. Rien n'y est deviné.

1. **Aucun DDL de ce document n'a été exécuté.** Les colonnes générées, les
   `CHECK` sur les bornes de mois et d'année, et la configuration `fr_unaccent`
   sont écrites d'après les règles de PostgreSQL, pas d'après un essai. Le point
   le plus susceptible de résister est l'immutabilité exigée des expressions de
   `CHECK` et de colonne générée : `extract`, `daterange` et
   `to_tsvector(regconfig, text)` la satisfont à ma connaissance, mais **la
   première migration est le vrai test** et il faut la lancer avant de bâtir
   dessus.

2. **Je n'ai ouvert aucune des quatre bases SQLite ni aucun fichier du volume.**
   Tous les schémas, formats, comptes et coûts viennent de
   `docs/pipeline-inventory.md`, `docs/pipeline-capabilities.md`,
   `docs/frontend-spec.md` et `docs/spike-dhash-galeries.md`.

3. **Le coût de l'import n'est pas mesuré.** Je dis « quelques minutes » par
   analogie avec la taille des bases (95 Mo pour l'index) et le débit d'un
   `COPY`. Ce n'est pas un chiffre relevé, et il décide de l'acceptabilité du
   verrou de la question ouverte n° 2.

4. **Le coût du recouvrement à la demande n'est pas mesuré.** L'argument repose
   sur la taille des résultats (3 à 51 candidats par passage, mesuré en amont) et
   sur le fait qu'un index GiST sert la jointure. Je n'ai pas de plan d'exécution.

5. **Les seuils du hash perceptuel ne sont pas transférables tels quels.** Le
   spike les a mesurés avec Core Image ; toute réimplémentation change la
   distribution. Le banc des 800 paires permet de les refaire, mais **ils ne
   valent rien tant qu'ils ne l'ont pas été**.

6. **Je ne sais pas si `REFRESH MATERIALIZED VIEW CONCURRENTLY` est utilisable
   dans la transaction d'écriture d'une correction.** PostgreSQL l'interdit dans
   certains contextes transactionnels ; si c'est le cas ici, il faudra le
   rafraîchir hors transaction, ou revenir à un `REFRESH` non concurrent, qui
   pose un verrou exclusif de quelques millisecondes sur 2 871 lignes — sans
   doute acceptable. À vérifier à l'implémentation.

7. **Je n'ai pas vérifié la limite de taille de corps par défaut de Fastify**
   (1 Mio de mémoire). « Tout sélectionner » sur 3 930 résultats envoie ≈ 216 Ko,
   donc sous la limite quelle qu'elle soit ; il faut néanmoins la porter
   explicitement dans la configuration plutôt que de dépendre d'un défaut.

8. **Le comportement exact de `sips` sur un TIFF de 872 Mo** n'est pas connu.
   Le périmètre n'en contient que 11, et le plus gros de la photothèque est hors
   période, mais un délai de garde sur le processus enfant est prudent — sa
   valeur reste à établir par la mesure.

9. **Je n'ai pas établi si `postgis` est nécessaire.** Aucun écran de la V1
   n'affiche de carte, et les seules requêtes géographiques envisagées sont
   « la photo a-t-elle une position ». Un couple `double precision` suffirait.
   `geography(Point,4326)` est retenu parce que l'extension est déjà installée
   et que le typage empêche d'inverser latitude et longitude — mais c'est un
   confort, pas un besoin démontré.
