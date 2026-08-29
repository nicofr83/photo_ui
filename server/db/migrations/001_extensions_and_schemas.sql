-- Extensions, configuration de recherche, et les trois schémas.
-- Trois schémas, trois cycles de vie :
--   pipeline : copie des données amont + cascade — TRUNCATE et rechargé à chaque import
--   app      : le travail humain — JAMAIS touché par l'import
--   ref      : les référentiels saisis à la main — jamais touché non plus

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- La forme à DEUX arguments de to_tsvector, avec un nom de configuration
-- littéral, est obligatoire dans une colonne générée : to_tsvector(text) est
-- STABLE — elle dépend de default_text_search_config — et PostgreSQL la refuse.
--
-- Piège à connaître : to_tsvector(regconfig, text) est DÉCLARÉE immutable alors
-- que fr_unaccent s'appuie sur un dictionnaire lu sur disque. Si les règles
-- d'unaccent changent, les vecteurs stockés ne se régénèrent PAS tout seuls.
-- Sans conséquence ici — l'import réécrit tout — mais à savoir.
-- Créée seulement si absente, comme les extensions et les schémas ci-dessus.
-- Pas de DROP préalable : il échouerait dès qu'une colonne générée dépend de la
-- configuration. Il n'existe pas de `CREATE TEXT SEARCH CONFIGURATION IF NOT
-- EXISTS`, d'où le bloc.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_ts_config
     WHERE cfgname = 'fr_unaccent' AND cfgnamespace = 'public'::regnamespace
  ) THEN
    CREATE TEXT SEARCH CONFIGURATION public.fr_unaccent (COPY = french);
    ALTER TEXT SEARCH CONFIGURATION public.fr_unaccent
      ALTER MAPPING FOR hword, hword_part, word WITH unaccent, french_stem;
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS pipeline;
CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS ref;
