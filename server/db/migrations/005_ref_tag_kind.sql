-- Le prédicat de tag de lieu (spec, commit `af2a65b`) : le classifieur IA voit
-- des ruines de pierre et sort un nom de pays — `italy` frappe 18 photos de
-- Tikal, `egypt` 30 du Maroc. Cette table dit si un NOM de tag nomme un lieu,
-- pas si un tag est vrai sur une photo donnée.
--
-- AUCUNE clé étrangère vers `pipeline.tag` : même raison que le reste de
-- `ref` (001_ref.sql) — un TRUNCATE à l'import exigerait un CASCADE qui
-- effacerait la classification et toute correction humaine dessus.
--
-- Migration séparée de `003_ref.sql` : `photo_ui` porte déjà un import réel
-- au moment où ce prédicat est ajouté, donc pas d'`ALTER TABLE` sur une table
-- existante à modifier, une table neuve dans une migration neuve — même
-- raisonnement que D11 pour `pipeline.text_unit`.
CREATE TABLE ref.tag_kind (
  tag_name   text PRIMARY KEY,        -- NFC, comme pipeline.tag.name
  kind       text NOT NULL,           -- 'place' | 'descriptive' | 'unknown'
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tag_kind_known CHECK (kind IN ('place', 'descriptive', 'unknown'))
);
