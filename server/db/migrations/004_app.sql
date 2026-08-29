-- `app` — le travail humain. JAMAIS touché par l'import.
--
-- Comme `ref`, AUCUNE clé étrangère vers `pipeline`. Les tables portent des
-- cloud_asset_id, des (kind, id) de texte et des album_path LIBRES. À
-- l'intérieur du schéma, les FK sont normales et utiles.

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
    period_from IS NULL OR period_to IS NULL OR period_from <= period_to),
  -- Le slug est le nom du dossier livré : il ne contient jamais de séparateur.
  CONSTRAINT task_slug_is_a_folder_name CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$')
);

CREATE TABLE app.task_image (
  task_slug      text NOT NULL REFERENCES app.task ON DELETE CASCADE,
  cloud_asset_id char(32) NOT NULL,        -- pas de FK : pipeline est tronqué
  position       int NOT NULL,
  note           text,
  -- ADDITIF, jamais remplacé : un second geste ajoute sa raison par
  -- array(SELECT DISTINCT unnest(existing || new)). Sinon la re-sélection
  -- efface la trace du premier geste.
  selected_because text[] NOT NULL DEFAULT '{}',
  selected_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_slug, cloud_asset_id)
);
CREATE INDEX task_image_by_photo ON app.task_image (cloud_asset_id);

CREATE TABLE app.task_text (
  task_slug    text NOT NULL REFERENCES app.task ON DELETE CASCADE,
  text_kind    text NOT NULL,
  text_id      text NOT NULL,
  position     int NOT NULL,
  start_offset int, end_offset int,        -- nullables dès aujourd'hui
  selected_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_slug, text_kind, text_id),
  CONSTRAINT task_text_kind_known CHECK (text_kind IN ('passage','log_entry'))
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
  note_id        text NOT NULL REFERENCES app.task_note ON DELETE CASCADE,
  cloud_asset_id char(32) NOT NULL,
  PRIMARY KEY (note_id, cloud_asset_id)
);
CREATE TABLE app.task_note_text (
  note_id   text NOT NULL REFERENCES app.task_note ON DELETE CASCADE,
  text_kind text NOT NULL,
  text_id   text NOT NULL,
  PRIMARY KEY (note_id, text_kind, text_id)
);

-- GLOBALE, jamais par tâche : une erreur d'OCR est fausse dans toutes les
-- tâches. CLÉE SUR LE COUPLE — une clé sur l'id seul écraserait la correction
-- d'un passage par celle d'une entrée de journal, sur 456 cas possibles.
CREATE TABLE app.text_correction (
  text_kind             text NOT NULL,
  text_id               text NOT NULL,
  corrected_text        text NOT NULL,
  -- LE TÉMOIN DE DÉRIVE. La clé d'un texte est POSITIONNELLE (<pageId> +
  -- ordinal/seq) : une re-dérivation de documents.db qui recoupe une page
  -- décale tous les ids suivants de cette page, et la correction se
  -- retrouverait silencieusement sur le mauvais texte. Ce témoin l'attrape.
  original_at_correction text NOT NULL,
  corrected_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (text_kind, text_id),
  CONSTRAINT correction_not_empty CHECK (btrim(corrected_text) <> ''),
  CONSTRAINT correction_kind_known CHECK (text_kind IN ('passage','log_entry'))
);

-- `array_to_string` est marquée STABLE — par prudence, parce qu'elle dépend en
-- général des fonctions de sortie des éléments — et PostgreSQL refuse donc de
-- l'employer dans une colonne générée : « generation expression is not
-- immutable ». Sur du `text[]` elle est pourtant déterministe. On l'enveloppe
-- dans une fonction déclarée IMMUTABLE, qui est la façon canonique de le dire.
-- (`array_out` est STABLE pour la même raison : un cast `::text` ne marche pas
-- davantage.)
CREATE FUNCTION app.caption_tsv(caption text, keywords text[])
  RETURNS tsvector
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
    SELECT to_tsvector('public.fr_unaccent',
                       caption || ' ' || array_to_string(keywords, ' '))
  $$;

-- Clé sha256 : c'est le CONTENU qui est décrit, pas la ligne d'index. 949
-- groupes de photos partagent un sha256, et légender deux fois le même fichier
-- serait payer deux fois pour la même image.
CREATE TABLE app.photo_caption (
  sha256          char(64) PRIMARY KEY,
  caption         text NOT NULL,
  keywords        text[] NOT NULL DEFAULT '{}',
  model           text NOT NULL,
  prompt_version  text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- Une correction humaine passe la légende en `human-edited` et CONSERVE la
  -- production d'origine : `caption` n'est jamais écrasée.
  edited_caption  text,
  edited_keywords text[],
  edited_at       timestamptz,
  -- Corriger une légende ré-indexe la photo sans une ligne de code.
  search_caption tsvector GENERATED ALWAYS AS (
    app.caption_tsv(coalesce(edited_caption, caption),
                    coalesce(edited_keywords, keywords))
  ) STORED
);
CREATE INDEX caption_search ON app.photo_caption USING gin (search_caption);

-- Appariement des galeries web. Une table de LIENS, jamais une écriture amont.
CREATE TABLE app.web_gallery_link (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sha256     char(64) NOT NULL,
  page       text NOT NULL,                -- '2003/2003_gal_11.htm'
  image_path text NOT NULL,
  caption    text,
  alt        text,
  distance   int NOT NULL,
  margin     int NOT NULL,
  verified   boolean,                      -- NULL = pas encore relu par un humain
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sha256, image_path)
);

-- Le texte cherché est le texte CORRIGÉ s'il existe, jamais la transcription
-- seule. Il dépend donc de app.text_correction, qui vit dans un autre schéma et
-- change à tout moment — d'où une vue matérialisée plutôt qu'une colonne
-- générée de `pipeline`, qui brouillerait la frontière des deux schémas.
CREATE MATERIALIZED VIEW app.text_search AS
  SELECT t.kind, t.id,
         coalesce(c.corrected_text, t.body) AS effective_text,
         to_tsvector('public.fr_unaccent', coalesce(c.corrected_text, t.body)) AS tsv
    FROM pipeline.text_unit t
    LEFT JOIN app.text_correction c
           ON c.text_kind = t.kind AND c.text_id = t.id;

-- L'index UNIQUE est ce qui rend REFRESH ... CONCURRENTLY possible.
CREATE UNIQUE INDEX text_search_key ON app.text_search (kind, id);
CREATE INDEX text_search_tsv ON app.text_search USING gin (tsv);
