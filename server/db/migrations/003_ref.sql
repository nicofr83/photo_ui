-- `ref` — les référentiels saisis à la main. JAMAIS touché par l'import.
--
-- AUCUNE clé étrangère vers `pipeline` : un TRUNCATE avec une FK entrante
-- exigerait CASCADE, qui supprimerait le travail humain. La contrainte
-- protégerait exactement l'inverse de ce qu'on veut protéger. L'orphelinat se
-- CONSTATE après chaque import par une jointure, puis se SIGNALE — jamais ne
-- supprime.

-- La donnée la plus rentable du projet : 25 saisies corrigent l'intervalle de
-- 421 photos. Consultée AVANT tout le reste de la cascade (rang 0).
CREATE TABLE ref.album_span (
  album_path text PRIMARY KEY,             -- NFC. Aucune FK vers pipeline.
  date_from  date NOT NULL,
  date_to    date NOT NULL,
  note       text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT album_span_ordered CHECK (date_from <= date_to)
);

-- Règle C du recouvrement. Aucun des 569 passages du site ne porte de date ;
-- leur seul intervalle possible vient d'ici. Marqué `inference` partout où il
-- sert : une plage COMBLE UN VIDE, elle n'arbitre pas.
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

-- Vocabulaire OUVERT : rempli PAR l'import (ON CONFLICT DO NOTHING), libellé
-- À LA MAIN. Une valeur inédite en amont enrichit le référentiel au lieu de
-- casser l'import.
CREATE TABLE ref.doubt_reason (
  reason text PRIMARY KEY,
  label  text                              -- français, NULL tant que personne n'a écrit
);
