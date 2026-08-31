import { ErrorCode } from '@shared/enums';
import { AppError } from '../contract/error_interface.ts';
import type { AppliedFilter } from '../contract/filter_interface.ts';

/**
 * L'allowlist stricte, et il n'en existe qu'UNE implémentation.
 *
 * C'est elle qui garantit qu'un nom inconnu est un 400 nommé et non un filtre
 * qui disparaît — la faute qui, en amont, a deux fois renvoyé la bibliothèque
 * entière.
 *
 * La tranche est nette :
 *   nom de paramètre absent de l'allowlist  → 400 UNKNOWN_PARAMETER
 *   valeur hors d'un vocabulaire FERMÉ      → 400 INVALID_PARAMETER
 *   valeur absente d'un vocabulaire OUVERT  → PAS une erreur : elle restreint
 *                                             à zéro, et `unmatchedValues` le dit
 */
export type ParamRule =
  | { readonly kind: 'closed'; readonly values: readonly string[]; readonly fallback?: string }
  | { readonly kind: 'openList' }
  | { readonly kind: 'open' }
  | { readonly kind: 'isoDate' }
  | { readonly kind: 'boolean'; readonly fallback?: boolean }
  | { readonly kind: 'integer' };

export type ParamSpec = Record<string, ParamRule>;

export interface ParsedParams extends Record<string, unknown> {
  readonly applied: readonly AppliedFilter[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Query values arrive as strings, or numbers/booleans once Fastify's own
 * schema coercion has run. `no-base-to-string` rightly distrusts a bare
 * `String(value)` on something typed `unknown` — this is the one place that
 * decides what counts as text, and an unexpected shape is a named 400 rather
 * than a silent `"[object Object]"`.
 */
function toText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  throw new AppError(
    ErrorCode.INVALID_PARAMETER,
    `type de valeur inattendu pour un paramètre : ${typeof value}`,
    400,
    { receivedType: typeof value },
  );
}

/** `1999-02-30` a le bon format et n'est pas un jour — partagé avec les corps de requête (`texts_controller.ts`, V1.6), pas seulement les paramètres de requête. */
export function isRealCalendarDay(raw: string): boolean {
  if (!ISO_DATE.test(raw)) return false;
  const [year, month, day] = raw.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function parseQueryParams(
  raw: Record<string, unknown>,
  spec: ParamSpec,
): ParsedParams {
  const accepted = Object.keys(spec).sort();

  // `Object.hasOwn` et non `in` : `'constructor' in spec` serait vrai, et une
  // clé de prototype passerait pour un paramètre déclaré.
  const unknown = Object.keys(raw).filter((name) => !Object.hasOwn(spec, name));
  if (unknown.length > 0) {
    throw new AppError(
      ErrorCode.UNKNOWN_PARAMETER,
      `paramètre inconnu : ${unknown.join(', ')}`,
      400,
      { parameters: unknown, accepted },
    );
  }

  const invalid = (parameter: string, received: string, values: readonly string[] | null): never => {
    throw new AppError(
      ErrorCode.INVALID_PARAMETER,
      `valeur invalide pour ${parameter} : ${received}`,
      400,
      { parameter, received, accepted: values },
    );
  };

  const out: Record<string, unknown> = {};
  const applied: AppliedFilter[] = [];
  const record = (parameter: string, values: readonly string[]): void => {
    applied.push({ parameter, values, broadened: false });
  };

  for (const [name, rule] of Object.entries(spec)) {
    const value = Object.hasOwn(raw, name) ? raw[name] : undefined;

    if (value === undefined) {
      // Un défaut n'est PAS un filtre appliqué : personne ne l'a demandé.
      if (rule.kind === 'closed' && rule.fallback !== undefined) out[name] = rule.fallback;
      if (rule.kind === 'boolean' && rule.fallback !== undefined) out[name] = rule.fallback;
      continue;
    }

    switch (rule.kind) {
      case 'closed': {
        const text = toText(value);
        if (!rule.values.includes(text)) invalid(name, text, rule.values);
        out[name] = text;
        record(name, [text]);
        break;
      }
      case 'openList': {
        const list = (Array.isArray(value) ? value : [value]).map(toText);
        out[name] = list;
        record(name, list);
        break;
      }
      case 'open': {
        const text = toText(value);
        out[name] = text;
        record(name, [text]);
        break;
      }
      case 'isoDate': {
        const text = toText(value);
        if (!isRealCalendarDay(text)) invalid(name, text, null);
        out[name] = text;
        record(name, [text]);
        break;
      }
      case 'boolean': {
        const text = toText(value);
        if (text !== 'true' && text !== 'false') invalid(name, text, ['true', 'false']);
        out[name] = text === 'true';
        record(name, [text]);
        break;
      }
      case 'integer': {
        const text = toText(value);
        if (!/^\d+$/.test(text)) invalid(name, text, null);
        out[name] = Number(text);
        record(name, [text]);
        break;
      }
    }
  }

  return { ...out, applied };
}
