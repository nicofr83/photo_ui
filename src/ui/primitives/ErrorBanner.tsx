import { ApiError, ContractError } from '../../api/client';

import styles from './ErrorBanner.module.css';

/**
 * Spec §9.6.1: a refused filter is an error, never an empty result. The three
 * failures are named distinctly on purpose — a contract breach and a server
 * refusal call for different actions, and blurring them hides a backend change
 * behind what looks like a server error.
 *
 * `details` is not decoration: the contract carries it so a screen can say
 * WHICH directory already exists, WHICH task holds the slug, WHICH parameter
 * was refused. A banner that shows only `message` throws that away, and the
 * user is left with an instruction they cannot act on.
 */
export function ErrorBanner({ error }: { readonly error: unknown }): React.JSX.Element {
  return (
    <p className={styles['banner']} role="alert">
      {describe(error)}
    </p>
  );
}

function field(details: unknown, name: string): string | null {
  if (typeof details !== 'object' || details === null) return null;
  const value = (details as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : null;
}

function list(details: unknown, name: string): string | null {
  if (typeof details !== 'object' || details === null) return null;
  const value = (details as Record<string, unknown>)[name];
  return Array.isArray(value) ? value.filter((v) => typeof v === 'string').join(', ') : null;
}

function enrich(error: ApiError): string | null {
  switch (error.code) {
    case 'TARGET_DIRECTORY_EXISTS':
      return field(error.details, 'directory');
    case 'SLUG_TAKEN':
      return field(error.details, 'existingTaskTitle');
    case 'VOLUME_UNAVAILABLE': {
      const root = field(error.details, 'root');
      const envVar = field(error.details, 'envVar');
      return root === null ? null : envVar === null ? root : `${root} (${envVar})`;
    }
    case 'SOURCE_FILE_MISSING':
      return field(error.details, 'expectedPath');
    case 'NOT_FOUND':
      return field(error.details, 'id');
    case 'UNKNOWN_PARAMETER':
      return list(error.details, 'parameters');
    case 'INVALID_PARAMETER':
      return field(error.details, 'parameter');
    default:
      return null;
  }
}

function describe(error: unknown): string {
  if (error instanceof ApiError) {
    const detail = enrich(error);
    return detail === null ? error.message : `${error.message} — ${detail}`;
  }
  if (error instanceof ContractError) {
    return (
      `La réponse du serveur ne respecte pas le contrat, au champ « ${error.path} ». ` +
      `L'affichage est interrompu plutôt que d'inventer la valeur manquante.`
    );
  }
  if (error instanceof Error) return `Échec de la requête : ${error.message}`;
  return 'Échec de la requête.';
}
