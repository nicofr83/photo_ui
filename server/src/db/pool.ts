import pg from 'pg';

/**
 * Une `date` PostgreSQL est un JOUR CIVIL, jamais un instant.
 *
 * Par défaut node-postgres la convertit en `Date`, construit dans le fuseau
 * LOCAL : `2000-12-01` devient `2000-11-30T23:00:00Z` à Paris, et une borne au
 * 1er du mois recule d'un jour. Tout le recouvrement se calcule au jour civil,
 * donc on garde la chaîne telle que le serveur l'a écrite.
 */
const DATE_OID = 1082;
pg.types.setTypeParser(DATE_OID, (value: string) => value);

/**
 * Un `timestamp` sans fuseau est une heure de prise de vue, délibérément sans
 * zone : 76 % des `captureDate` amont n'en ont aucune. Le convertir en `Date`
 * lui en inventerait une.
 */
const TIMESTAMP_OID = 1114;
pg.types.setTypeParser(TIMESTAMP_OID, (value: string) => value);

/**
 * `bigint` (ex. `pipeline.photo.file_size`, jusqu'à 872 Mo mesurés) revient
 * en `string` par défaut — le driver refuse de risquer une perte de précision
 * sur un `int8` proche de `Number.MAX_SAFE_INTEGER`. Aucune colonne `bigint`
 * du schéma n'en approche (des tailles de fichier, deux clés `IDENTITY`
 * internes jamais exposées) : convertir ici plutôt qu'au site d'appel évite
 * qu'un contrat qui promet `number` mente au premier gros TIFF.
 */
const BIGINT_OID = 20;
pg.types.setTypeParser(BIGINT_OID, (value: string) => Number(value));

export type Pool = pg.Pool;
export type PoolClient = pg.PoolClient;

export function createPool(databaseUrl: string): Pool {
  return new pg.Pool({ connectionString: databaseUrl, max: 10 });
}
