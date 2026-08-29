import { ApiError, ContractError } from '../../api/client';

import styles from './ErrorBanner.module.css';

/**
 * Spec §9.6.1: a refused filter is an error, never an empty result. The three
 * failures are named distinctly on purpose — a contract breach and a server
 * refusal call for different actions, and blurring them hides a backend change
 * behind what looks like a server error.
 */
export function ErrorBanner({ error }: { readonly error: unknown }): React.JSX.Element {
  return (
    <p className={styles['banner']} role="alert">
      {describe(error)}
    </p>
  );
}

function describe(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof ContractError) {
    return (
      `La réponse du serveur ne respecte pas le contrat, au champ « ${error.path} ». ` +
      `L'affichage est interrompu plutôt que d'inventer la valeur manquante.`
    );
  }
  if (error instanceof Error) return `Échec de la requête : ${error.message}`;
  return 'Échec de la requête.';
}
