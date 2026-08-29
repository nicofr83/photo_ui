/**
 * Le service de log. Injecté comme toute autre dépendance — JAMAIS
 * `console.log`, sauf le chemin d'amorçage avant que ce service existe.
 *
 * Ce qui n'est JAMAIS journalisé : le contenu des textes et des notes. Ce sont
 * des mémoires personnelles ; un niveau `debug` ne doit pas les recopier dans
 * un fichier de log.
 */

export const LogLevel = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
} as const;
export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

export type LogFields = Record<string, unknown>;

export interface Log {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  /** Un journal enfant porte des champs constants — l'id de corrélation d'une requête. */
  child(fields: LogFields): Log;
}

const RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** `Object.hasOwn` et non `in` : `'toString' in RANK` serait vrai. */
export function isLogLevel(raw: string): raw is LogLevel {
  return Object.hasOwn(RANK, raw);
}

function writeLine(line: string): void {
  process.stdout.write(`${line}\n`);
}

export function createLog(
  level: LogLevel,
  base: LogFields = {},
  sink: (line: string) => void = writeLine,
): Log {
  const emit = (at: LogLevel, message: string, fields?: LogFields): void => {
    if (RANK[at] < RANK[level]) return;
    sink(JSON.stringify({ at: new Date().toISOString(), level: at, message, ...base, ...fields }));
  };

  return {
    debug: (message, fields) => { emit(LogLevel.DEBUG, message, fields); },
    info: (message, fields) => { emit(LogLevel.INFO, message, fields); },
    warn: (message, fields) => { emit(LogLevel.WARN, message, fields); },
    error: (message, fields) => { emit(LogLevel.ERROR, message, fields); },
    // Un objet neuf à chaque fois : l'enfant ne mute jamais son parent.
    child: (fields) => createLog(level, { ...base, ...fields }, sink),
  };
}
