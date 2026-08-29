-- `pipeline` — la copie des données amont et la cascade résolue.
-- TRUNCATE et rechargé intégralement à chaque import.

-- ---------------------------------------------------------------- photo
CREATE TABLE pipeline.photo (
  cloud_asset_id      char(32) PRIMARY KEY,
  sha256              char(64) NOT NULL,
  -- Relatif à ORIGINALS_ROOT : le volume est déplaçable.
  relative_path       text NOT NULL,
  file_name           text NOT NULL,
  album_path          text,                -- NFC, toujours
  group_name          text,
  format              text NOT NULL,
  file_size           bigint,
  width               int,
  height              int,
  aesthetics_score    int,

  -- ---- les colonnes BRUTES, intactes : un désaccord doit rester constatable
  raw_date_source     text NOT NULL,       -- photos.dateSource amont, 7 valeurs
  raw_year            int,
  raw_month           int,
  raw_day             int,
  -- 76 % des captureDate n'ont AUCUN fuseau et six formats coexistent dans une
  -- seule colonne amont. Un cast en timestamptz décalerait silencieusement des
  -- milliers de photos. NULL et 0 ne sont PAS la même chose sur l'offset :
  -- NULL = aucun fuseau n'était écrit, 0 voudrait dire UTC. 32 140 lignes sont
  -- dans le premier cas.
  capture_date_local  timestamp,
  capture_offset_min  int,
  capture_date_raw    text,

  -- ---- la cascade RÉSOLUE, matérialisée à l'import
  resolved_from       text,
  resolved_start      date,
  resolved_end        date,
  resolved_precision  text,
  arbitration_gap_months int,
  arbitration_outcome text,                -- 'accepted' | 'rejected' | NULL
  bracket_hours       real,                -- rang 3 seulement
  evidence_entry_ids  text[],              -- rang 3 seulement

  -- ---- LA RÈGLE CAPITALE, TENUE PAR LE SCHÉMA
  -- PostgreSQL REFUSE toute écriture visant une colonne GENERATED ALWAYS. Un
  -- UPDATE qui poserait resolved_kind = 'reading' sur une photo datée par son
  -- album échoue avec une erreur, pas en silence. La règle « une inférence ne
  -- doit jamais ressembler à une lecture » cesse d'être une consigne de revue.
  --
  -- `annotation` est la SEULE source de nature `decision` : ce qui sépare une
  -- décision d'une inférence n'est pas qui a agi mais ce que le geste établit.
  -- Une annotation ARBITRE ; une plage saisie COMBLE UN VIDE.
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

  -- L'intervalle comme OPÉRANDE, pour que « chevauche » soit un opérateur.
  resolved_range daterange GENERATED ALWAYS AS (
    CASE WHEN resolved_start IS NULL THEN NULL
         ELSE daterange(resolved_start, resolved_end, '[]') END
  ) STORED,

  -- ---- géographie
  position         geography(Point, 4326),
  position_source  text,                   -- 'exif' | 'logbook_interpolated'
  altitude_m       real,
  city             text,
  state            text,
  country_raw      text,                   -- tel qu'Adobe l'a écrit
  sublocation      text,

  camera_make text, camera_model text, lens text,
  iso int, aperture real, shutter text, focal_length real,
  title text, description text,
  ocr_text text,

  -- Sans ce CHECK, une sixième valeur de resolved_from produirait un
  -- resolved_kind NULL — une date sans nature, exactement ce que la règle
  -- interdit. Le CHECK la refuse à l'insertion.
  CONSTRAINT photo_resolved_from_known CHECK (
    resolved_from IS NULL OR resolved_from IN
      ('annotation','exif_arbitrated','logbook_bracket','album_month','album_year')),
  CONSTRAINT photo_precision_known CHECK (
    resolved_precision IS NULL OR resolved_precision IN ('day','month','year')),
  CONSTRAINT photo_arbitration_outcome_known CHECK (
    arbitration_outcome IS NULL OR arbitration_outcome IN ('accepted','rejected')),
  CONSTRAINT photo_bounds_ordered CHECK (
    resolved_start IS NULL OR resolved_start <= resolved_end),
  CONSTRAINT photo_bounds_complete CHECK (
    (resolved_start IS NULL) = (resolved_end IS NULL)
    AND (resolved_start IS NULL) = (resolved_from IS NULL)),

  -- Ces deux CHECK testent l'ALIGNEMENT DES BORNES, pas la largeur de
  -- l'intervalle — parce que `precision` qualifie CHAQUE BORNE (contrat §2.2).
  -- Un test de largeur rejetait `ref.album_span` sur `1998-02-Maison rose
  -- Algès`, qui couvre dix-sept mois, alors que ses deux bornes sont bien
  -- connues au mois. Ce qu'ils refusent toujours, et c'est leur raison d'être :
  -- une date au mois transmise comme un jour arbitraire.
  CONSTRAINT photo_month_is_whole_month CHECK (
    resolved_precision <> 'month' OR (
      extract(day from resolved_start) = 1
      AND resolved_end = (date_trunc('month', resolved_end::timestamp)
                          + interval '1 month' - interval '1 day')::date)),
  CONSTRAINT photo_year_is_whole_year CHECK (
    resolved_precision <> 'year' OR (
      extract(doy from resolved_start) = 1
      AND resolved_end = (date_trunc('year', resolved_end::timestamp)
                          + interval '1 year' - interval '1 day')::date)),

  CONSTRAINT photo_bracket_only_rank3 CHECK (
    bracket_hours IS NULL OR resolved_from = 'logbook_bracket')
);

-- Fusionner OCR et métadonnées serait une faute MESURABLE : l'OCR contient du
-- texte de panneaux sur 614 photos, qui ferait remonter du bruit sur des
-- recherches sans rapport, sans que l'utilisateur puisse savoir lequel des deux
-- a répondu — alors que le contrat exige précisément de le dire (matchedOn).
ALTER TABLE pipeline.photo
  ADD COLUMN search_meta tsvector GENERATED ALWAYS AS (
    to_tsvector('public.fr_unaccent',
      coalesce(album_path,'')   || ' ' || coalesce(group_name,'') || ' ' ||
      coalesce(file_name,'')    || ' ' || coalesce(city,'')       || ' ' ||
      coalesce(state,'')        || ' ' || coalesce(country_raw,'') || ' ' ||
      coalesce(sublocation,''))
  ) STORED,
  ADD COLUMN search_ocr tsvector GENERATED ALWAYS AS (
    to_tsvector('public.fr_unaccent', coalesce(ocr_text,''))
  ) STORED;

-- `photo_by_album` et non `photo_album` : dans PostgreSQL une table et un index
-- partagent le même espace de noms, et `pipeline.photo_album` est une table.
CREATE INDEX photo_by_album     ON pipeline.photo (album_path);
CREATE INDEX photo_sha          ON pipeline.photo (sha256);
-- Le pivot de toute l'application : le filtre de dates, le recouvrement et la
-- chronologie s'appuient tous sur l'opérateur && via cet index.
CREATE INDEX photo_range        ON pipeline.photo USING gist (resolved_range);
CREATE INDEX photo_position     ON pipeline.photo USING gist (position)
                                 WHERE position IS NOT NULL;
CREATE INDEX photo_search_meta  ON pipeline.photo USING gin (search_meta);
CREATE INDEX photo_search_ocr   ON pipeline.photo USING gin (search_ocr);
CREATE INDEX photo_album_trgm   ON pipeline.photo USING gin (album_path gin_trgm_ops);
CREATE INDEX photo_group_trgm   ON pipeline.photo USING gin (group_name gin_trgm_ops);
CREATE INDEX photo_aesthetics   ON pipeline.photo (aesthetics_score DESC);

-- ---------------------------------------------------------------- album
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

-- ---------------------------------------------------------------- tags, personnes
CREATE TABLE pipeline.tag (
  name        text NOT NULL,
  kind        text NOT NULL,               -- 'ai' | 'user'
  photo_count int NOT NULL DEFAULT 0,
  PRIMARY KEY (name, kind),
  CONSTRAINT tag_kind_known CHECK (kind IN ('ai','user'))
);

CREATE TABLE pipeline.photo_tag (
  cloud_asset_id char(32) NOT NULL REFERENCES pipeline.photo ON DELETE CASCADE,
  tag_name       text NOT NULL,
  tag_kind       text NOT NULL,
  -- 48..98 pour 'ai', NULL pour 'user'. NULL n'écarte JAMAIS un tag.
  confidence     int,
  PRIMARY KEY (cloud_asset_id, tag_name, tag_kind),
  FOREIGN KEY (tag_name, tag_kind) REFERENCES pipeline.tag ON DELETE CASCADE
);
CREATE INDEX photo_tag_by_tag ON pipeline.photo_tag (tag_name, tag_kind)
  WHERE tag_kind = 'ai';

CREATE TABLE pipeline.person (
  name        text PRIMARY KEY,
  photo_count int NOT NULL DEFAULT 0
);
CREATE TABLE pipeline.photo_person (
  cloud_asset_id char(32) NOT NULL REFERENCES pipeline.photo ON DELETE CASCADE,
  person_name    text NOT NULL REFERENCES pipeline.person ON DELETE CASCADE,
  PRIMARY KEY (cloud_asset_id, person_name)
);

-- ---------------------------------------------------------------- rang 3
-- Proposition et doute, SÉPARÉS, jamais fondus dans la date.
CREATE TABLE pipeline.dating_proposal (
  cloud_asset_id  char(32) PRIMARY KEY REFERENCES pipeline.photo ON DELETE CASCADE,
  proposed_date   date NOT NULL,
  -- Portées VERBATIM depuis `dating.db proposals` (dateSource, confidence).
  -- La faille qu'elles ferment : sans cette colonne, rien ne distingue une
  -- ligne `logbook-bracket` — la machine a rapproché un lieu du journal —
  -- d'une ligne `manual` — quelqu'un a tapé cette date dans l'UI de la
  -- pipeline, une DÉCISION, pas une inférence. Servir la seconde comme un
  -- rang 3 rendrait une décision humaine pour une conjecture : la règle
  -- capitale, violée par le schéma plutôt que par un oubli de code.
  -- VOCABULAIRE OUVERT — aucun CHECK, même raison que `dating_doubt.reason` :
  -- c'est amont, et amont a déjà changé de vocabulaire sous le projet.
  date_source     text NOT NULL,     -- 'logbook-bracket' | 'manual'
  confidence      text NOT NULL,     -- 'proposed' | 'manual'
  position        geography(Point, 4326),
  position_source text,
  evidence_entry_ids text[] NOT NULL DEFAULT '{}',
  span_hours      real
);

CREATE TABLE pipeline.dating_doubt (
  cloud_asset_id char(32) PRIMARY KEY REFERENCES pipeline.photo ON DELETE CASCADE,
  -- VOCABULAIRE OUVERT — aucun CHECK, délibérément. Il a déjà changé sous le
  -- projet : l'index connaît `album-not-in-logbook` que dating.db ne produit
  -- plus, et ignore `several-visits` et `place-not-on-track` qu'il produit. Un
  -- CHECK ferait échouer l'import à la prochaine évolution amont.
  reason         text NOT NULL,
  album_path     text NOT NULL,
  candidates     jsonb NOT NULL DEFAULT '[]'
);
CREATE INDEX dating_doubt_reason ON pipeline.dating_doubt (reason);

-- ---------------------------------------------------------------- documents
CREATE TABLE pipeline.document (
  id         text PRIMARY KEY,             -- 'logbook', 'web/1999/Transat'
  kind       text NOT NULL,                -- 'handwritten' | 'html'
  title      text NOT NULL,
  page_count int,
  has_pages  boolean NOT NULL,
  CONSTRAINT document_kind_known CHECK (kind IN ('handwritten','html'))
);

CREATE TABLE pipeline.page (
  id            text PRIMARY KEY,          -- 'logbook/p001'
  document_id   text NOT NULL REFERENCES pipeline.document ON DELETE CASCADE,
  ordinal       int NOT NULL,
  label         text,
  -- Relatif à PAGES_ROOT, TEL QU'AMONT : trois orthographes coexistent pour le
  -- même document — `logbook` (id), `journal de bord/` (PDF), `journal-de-bord/`
  -- (images). Le chemin vient de la colonne, jamais reconstruit depuis l'id.
  image_relpath text NOT NULL,
  width int NOT NULL, height int NOT NULL,
  window_start  date, window_end date,
  window_range  daterange GENERATED ALWAYS AS (
    CASE WHEN window_start IS NULL THEN NULL
         ELSE daterange(window_start, window_end, '[]') END) STORED,
  span_source   text,                      -- 'passages' | 'entries' | 'carried'
  UNIQUE (document_id, ordinal),
  CONSTRAINT page_span_source_known CHECK (
    span_source IS NULL OR span_source IN ('passages','entries','carried'))
);

-- Passages ET entrées de journal dans une seule table.
-- LA CLÉ PRIMAIRE EST LE COUPLE : 456 identifiants existent dans les deux
-- espaces de noms amont (vérifié). PRIMARY KEY (id) écraserait un texte par un
-- autre, silencieusement, sur 456 cas.
CREATE TABLE pipeline.text_unit (
  kind        text NOT NULL,               -- 'passage' | 'log_entry'
  id          text NOT NULL,               -- 'ma-vie/p007/002'
  document_id text NOT NULL REFERENCES pipeline.document ON DELETE CASCADE,
  page_id     text REFERENCES pipeline.page ON DELETE CASCADE,
  ordinal     int NOT NULL,
  body        text NOT NULL,               -- la transcription AMONT, jamais corrigée ici
  confidence  text NOT NULL,               -- 'transcribed' | 'reviewed' | 'uncertain'

  -- ---- (1) LA DATE QUE LE TEXTE AFFIRME. Un texte affirme un JOUR, ou rien.
  -- Une fenêtre de page ou un web_span est ce qu'on a CALCULÉ autour du texte,
  -- pas ce qu'il dit : ça vit dans covers_*, où page_span_source le qualifie.
  -- Conséquence : toute date de texte du système est une lecture, et la base
  -- le garantit.
  date_source text,
  date_start  date,
  date_end    date,
  date_kind   text GENERATED ALWAYS AS (
    CASE date_source
      WHEN 'passage_date_from' THEN 'reading'
      WHEN 'log_entry_date'    THEN 'reading'
      ELSE NULL
    END) STORED,

  -- ---- (2) LA FENÊTRE DE RECOUVREMENT. Autre chose, et c'est essentiel.
  -- Une entrée du 14 octobre 1999 AFFIRME ce jour-là — écrit le jour même sur
  -- la page — mais COUVRE jusqu'à la veille de la journée suivante renseignée,
  -- soit parfois 92 jours. Écrire cette extension dans date_end transformerait
  -- une lecture exacte en une affirmation de trois mois.
  covers_start date,
  covers_end   date,
  covers_range daterange GENERATED ALWAYS AS (
    CASE WHEN covers_start IS NULL THEN NULL
         ELSE daterange(covers_start, covers_end, '[]') END) STORED,
  covers_rule  text,                       -- 'logbook_entry' | 'passage' | 'web_span'

  -- Dénormalisé depuis page.span_source : le client en a besoin dans les
  -- résultats de recouvrement et de recherche, où la page n'est pas chargée.
  -- Les 121 fenêtres `carried` sont une inférence sur une inférence.
  page_span_source text,

  -- champs propres aux entrées de journal
  entry_time     text,                     -- 'HH:MM' tel qu'écrit — fuseau INCONNU
  entry_position geography(Point, 4326),
  raw_position   text,                     -- degrés-minutes, littéral, jamais reconverti
  place_name     text,
  heading text, wind text, baro real, engine_hours real,
  fix_confidence text, remark_confidence text,

  PRIMARY KEY (kind, id),
  CONSTRAINT text_kind_known CHECK (kind IN ('passage','log_entry')),
  CONSTRAINT text_date_source_is_a_reading CHECK (
    date_source IS NULL OR date_source IN ('passage_date_from','log_entry_date')),
  CONSTRAINT text_date_is_a_single_day CHECK (date_start = date_end),
  CONSTRAINT text_date_complete CHECK ((date_source IS NULL) = (date_start IS NULL)),
  CONSTRAINT text_covers_ordered CHECK (covers_start IS NULL OR covers_start <= covers_end),
  CONSTRAINT text_covers_complete CHECK ((covers_start IS NULL) = (covers_end IS NULL)),
  CONSTRAINT text_covers_rule_known CHECK (
    covers_rule IS NULL OR covers_rule IN ('logbook_entry','passage','web_span')),
  CONSTRAINT text_page_span_source_known CHECK (
    page_span_source IS NULL OR page_span_source IN ('passages','entries','carried'))
);
CREATE INDEX text_unit_range    ON pipeline.text_unit USING gist (covers_range);
CREATE INDEX text_unit_document ON pipeline.text_unit (document_id, ordinal);
CREATE INDEX text_unit_page     ON pipeline.text_unit (page_id, ordinal);

-- ---------------------------------------------------------------- journal d'import
CREATE TABLE pipeline.import_run (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_id   text NOT NULL UNIQUE,        -- ULID, celui qu'expose ListEnvelope
  started_at  timestamptz NOT NULL,
  finished_at timestamptz,
  status      text NOT NULL,               -- 'running' | 'succeeded' | 'failed'
  -- Pour chaque source : chemin, mtime, taille au moment de la lecture. C'est
  -- ce qui permet de dire plus tard sur quelles données une décision a été
  -- prise, et de détecter qu'une base a bougé pendant l'import.
  sources     jsonb NOT NULL,
  counts      jsonb NOT NULL DEFAULT '{}',
  cascade     jsonb NOT NULL DEFAULT '{}',
  error       text,
  CONSTRAINT import_status_known CHECK (status IN ('running','succeeded','failed'))
);
