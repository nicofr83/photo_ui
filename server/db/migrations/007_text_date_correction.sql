-- V1.6 : corriger la date d'un texte est le MÊME geste que corriger son
-- texte — une ligne, un `revert` unique qui efface les deux. Jamais une
-- seconde table de correction.
--
-- `corrected_date_start`/`corrected_date_end` : la correction elle-même,
-- ensemble ou absents (une paire, jamais un seul bout).
-- `original_date_start_at_correction`/`_end` : le TÉMOIN — la lecture amont
-- TELLE QU'ELLE ÉTAIT au moment de corriger, comme `original_at_correction`
-- pour le texte. `NULL` quand le texte n'avait originellement AUCUNE date :
-- une correction qui AJOUTE une date ne détruit rien, il n'y a rien à
-- préserver. Ne peut exister QUE si une correction de date existe.
--
-- Un jour seul (D11) : une date corrigée reste `start = end`, comme toute
-- date de texte amont.
ALTER TABLE app.text_correction ADD COLUMN corrected_date_start date;
ALTER TABLE app.text_correction ADD COLUMN corrected_date_end   date;
ALTER TABLE app.text_correction ADD COLUMN original_date_start_at_correction date;
ALTER TABLE app.text_correction ADD COLUMN original_date_end_at_correction   date;

ALTER TABLE app.text_correction ADD CONSTRAINT text_correction_date_pair
  CHECK ((corrected_date_start IS NULL) = (corrected_date_end IS NULL));
ALTER TABLE app.text_correction ADD CONSTRAINT text_correction_date_witness_pair
  CHECK ((original_date_start_at_correction IS NULL) = (original_date_end_at_correction IS NULL));
ALTER TABLE app.text_correction ADD CONSTRAINT text_correction_date_witness_requires_correction
  CHECK (corrected_date_start IS NOT NULL OR original_date_start_at_correction IS NULL);
ALTER TABLE app.text_correction ADD CONSTRAINT text_correction_date_single_day
  CHECK (corrected_date_start IS NULL OR corrected_date_start = corrected_date_end);
