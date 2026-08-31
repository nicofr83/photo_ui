import { execFileSync } from 'node:child_process';

export interface CommitInfo {
  readonly sha: string;
  readonly dirty: boolean;
}

type GitRunner = (args: readonly string[]) => string;

function runGit(args: readonly string[]): string {
  return execFileSync('git', [...args], { encoding: 'utf8' });
}

/**
 * Calculé UNE SEULE FOIS, au démarrage (`bootstrap.ts`) — jamais par
 * requête, jamais mis en cache puis rafraîchi. `sha` répond à « sur quel
 * commit cette instance a-t-elle démarré », PAS « quel commit tourne en ce
 * moment » : un commit fait APRÈS le démarrage ne se reflète JAMAIS ici
 * tant que le processus n'est pas relancé (team-lead, deux instances
 * périmées le même jour) — c'est correct et suffisant, quiconque compare
 * `sha` à `git log -1` voit l'écart lui-même.
 *
 * `dirty` est une INFORMATION, jamais une alerte — l'arbre a des
 * changements non commités presque tout le temps en développement actif,
 * ce n'est pas un défaut à signaler comme tel. `sha` reste le champ qui
 * répond à la question qu'on se pose.
 *
 * `null` si git est indisponible (déploiement packagé sans `.git`, par
 * exemple) — jamais une erreur qui empêcherait le serveur de démarrer.
 */
export function getCommitInfo(run: GitRunner = runGit): CommitInfo | null {
  try {
    const sha = run(['rev-parse', 'HEAD']).trim();
    const status = run(['status', '--porcelain']);
    return { sha, dirty: status.trim() !== '' };
  } catch {
    return null;
  }
}
