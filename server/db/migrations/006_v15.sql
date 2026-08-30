-- Amendement : une note peut dériver d'un texte d'époque recopié.
-- `derived_text_original` garde le texte AU MOMENT DE LA RECOPIE : le drapeau
-- « édité depuis » se calcule en le comparant au corps courant, jamais stocké
-- comme un booléen qui pourrait mentir après une écriture directe en base.
ALTER TABLE app.task_note ADD COLUMN derived_from_kind text;
ALTER TABLE app.task_note ADD COLUMN derived_from_id   text;
ALTER TABLE app.task_note ADD COLUMN derived_text_original text;
ALTER TABLE app.task_note ADD CONSTRAINT task_note_derived_complete
  CHECK (num_nonnulls(derived_from_kind, derived_from_id, derived_text_original) IN (0, 3));

-- Amendement : la période d'un document du site est une BORNE DE DÉBUT.
-- La fin est celle du document daté suivant, calculée à la lecture.
ALTER TABLE ref.web_span ALTER COLUMN date_to DROP NOT NULL;
ALTER TABLE ref.web_span DROP CONSTRAINT web_span_ordered;
ALTER TABLE ref.web_span ADD CONSTRAINT web_span_ordered
  CHECK (date_to IS NULL OR date_from <= date_to);

-- La date résolue d'une page, dérivée par photo_ui et jamais par la pipeline
-- amont : `pipeline.page.window_*` reste la copie fidèle de ce que la pipeline
-- a calculé, cette table porte la cascade de la 1.5.
--
-- PAS de clé étrangère vers `pipeline.page` (invariant 6 : aucune FK d'`app`
-- ou `ref` vers `pipeline`) — `import_service.ts` fait un `TRUNCATE` NU des
-- tables `pipeline.*` (`RESTART IDENTITY`, sans `CASCADE`) ; une FK ici
-- ferait échouer TOUT import suivant. Une ligne orpheline après un import
-- est un état transitoire normal, recalculé en fin d'import (Task 8).
CREATE TABLE app.page_date (
  page_id    text PRIMARY KEY,
  date_start date NOT NULL,
  date_end   date NOT NULL,
  source     text NOT NULL CHECK (source IN ('register', 'notes', 'carried')),
  CONSTRAINT page_date_ordered CHECK (date_start <= date_end)
);
