# État des travaux — point de reprise

**Établi le 2026-08-28 à 18:57**, à la demande de Nicolas, pour que l'épuisement
des crédits n'entraîne aucune perte.

Ce fichier n'est pas une spécification. C'est le document qu'on lit **froid**
pour reprendre. Il est écrit par `contrat-api` faisant fonction de coordinateur.

---

## Ce qu'il faut savoir d'abord

**Aucun agent ne peut détecter l'épuisement des crédits, ni se réveiller quand
ils reviennent.** Il n'existe aucun outil qui rapporte le quota. Quand les
crédits tombent, l'appel échoue au milieu du tour et l'agent s'arrête net — il
n'y a pas de fin de tour propre, donc pas de « mise en attente » qu'un agent
pourrait exécuter au dernier moment.

**Conséquence, et c'est tout le protocole :** la mise en attente ne peut pas
être un comportement d'exécution, seulement un **état durable écrit d'avance**.
Un travail qui n'est que dans le contexte d'un agent est perdu si le tour meurt.
Un travail commité ne l'est pas.

La reprise est une action de Nicolas — relancer la session. Ce qu'on contrôle,
c'est qu'elle soit sans perte et sans re-décision.

---

## Où en est chaque chantier

| Chantier | Agent | État | Durabilité |
|:---|:---|:---|:---|
| Contrat d'API | `contrat-api` | **GELÉ** sur la forme des types | **commité** — `docs/api-contract.md` |
| Spécification backend | `contrat-api` | **terminée** | **commité** — `docs/backend-spec.md` |
| Spécification frontend | `spec-frontend` | vivante, amendée en continu | **commité** — `docs/frontend-spec.md` |
| Plan frontend | `impl-frontend` | établi | **commité** — `docs/superpowers/plans/2026-08-28-frontend.md` |
| Implémentation frontend T1 | `impl-frontend` | **en vol** | ⚠️ **4 fichiers non suivis sous `src/ui/`** |
| Échantillon de légendes | *(agent non nommé)* | en cours | `docs/echantillon-legendes.html` est commité |
| Plan d'implémentation backend | *(agent à lancer)* | **pas commencé** | — |

Dernier commit : `c107907 feat: the resolved-date domain and the capital rule`,
2026-08-28 18:56, branche `test_dev`.

**Le seul travail réellement à risque** est `src/ui/` : `tokens.css`,
`date/ResolvedDate.tsx`, `date/ResolvedDate.module.css`,
`date/ResolvedDate.test.tsx`. Ils appartiennent à `impl-frontend`, qui seul sait
s'ils sont dans un état commitable.

---

## Le protocole de mise en attente

Il tient en une règle : **ne jamais laisser une décision vivre uniquement dans
un contexte d'agent.**

1. **Commiter ce qui compile ou se lit.** Sur `test_dev`, jamais sur `main`,
   jamais de push. Un commit intermédiaire nommé `wip:` vaut mieux qu'un
   contexte perdu.
2. **Écrire les décisions, pas seulement le code.** Une décision prise et non
   écrite est à refaire — et sera refaite différemment.
3. **Ce qui est en cours de négociation entre agents va dans un document**, pas
   dans un fil de messages : les messages ne survivent pas.
4. **Mettre à jour la ligne de ce tableau qui vous concerne** avant de vous
   arrêter, si vous en avez le temps. Si vous ne l'avez pas, le commit suffit.

---

## Reprendre — dans cet ordre

1. `git log --oneline -5` et `git status` sur `test_dev` : voir ce qui a été
   laissé en vol.
2. Lire ce fichier, puis le document du chantier concerné.
3. **Ne pas rouvrir ce qui est gelé.** Le contrat est stable sur la forme des
   types ; `impl-frontend` a écrit son client contre lui. Les questions encore
   ouvertes sont listées en §11 du contrat et ne portent que sur du comportement
   serveur.
4. Reprendre à la première ligne non faite du plan concerné.

---

## Ce qui reste ouvert et qui bloquerait une reprise

Rien ne bloque. Les questions ouvertes sont documentées à leur place et chacune
porte un défaut appliqué en attendant :

- **Contrat, §11** — 11 questions, toutes de comportement serveur. Aucune ne
  change une interface. Les n° 1, 3, 4, 5, 6 et 7 sont tranchées.
- **Spec backend, §16** — 7 questions. La n° 1 (PostgreSQL 17.6 ou 18) est la
  seule à trancher **avant la première migration**, parce que revenir en arrière
  sur une base peuplée coûte plus cher que le contraire.
- **Légendage VLM** — décision de Nicolas : échantillon de 50 à 100 photos
  d'abord. Les champs restent dans le contrat, la passe complète n'est pas
  engagée, aucune UI n'est en V1.
- **Un point en attente de réponse** : `GET /tasks/:slug/review` reste dans le
  contrat, mais `impl-frontend` calcule la chronologie côté client. S'il dérive
  tout, l'endpoint se retire sans que rien d'autre bouge.

---

## Ce qu'on ne fait pas

**Pas de tâche planifiée (`cron`) pour reprendre automatiquement.** Une tâche
qui se déclenche pendant que les crédits sont épuisés échoue ; une tâche qui se
déclenche quand ils reviennent ferait tourner du travail de spécification
**sans personne pour le relire**, et ce travail-là se juge. La reprise reste un
geste de Nicolas.

---

## Les décisions de Nicolas, dans l'ordre où il les a prises

*Ajouté par la session pilote. Ce fil n'existait que dans son contexte de
conversation : aucun document ne le portait. Chaque ligne est une décision
tranchée par Nicolas lui-même, pas une inférence d'agent.*

| Décision | Ce qu'il a choisi | Pourquoi ça compte |
|:---|:---|:---|
| Topologie | Backend sur son Mac pour le développement, déplaçable en fin de projet | Impose : aucun chemin en dur, tout par variables d'environnement |
| Périmètre fonctionnel | Navigateur complet **et** revue de datation, d'un bloc — puis **pivot complet** vers l'atelier de composition de BD | La spec antérieure au pivot est morte ; seule la règle des trois dates en a survécu |
| Store | Postgres local plutôt que SQLite en lecture seule | Le pipeline reconstruit tout à zéro : une correction écrite dans ses bases meurt à la passe suivante |
| Retour vers `adobe_mcp` | Export explicite, à la main, jamais automatique, derrière un drapeau désactivé | Il a vu deux écrivains sur `annotations.jsonl` à la même minute |
| Stack | React + Vite + TypeScript strict | Web d'abord, iOS et macOS différés via Capacitor — le différé ne coûte rien si le web est fait correctement |
| Périmètre de travail | Les **82 albums** (3 930 photos), pas `photos.year` (3 558) | La hiérarchie qu'il a rangée à la main fait foi ; `photos.year` se trompe 745 fois |
| Plafond de fourchette | **Aucun** | Les dates étant faillibles, un plafond calculé dessus écarterait autant de vrai que de bruit |
| Galeries web ↔ photothèque | Investiguer avant de coder l'écran texte | Spike fait : exploitable, 108 liens sur 2003-2004 |
| Légendage VLM | **Un échantillon d'abord**, 50-100 photos, avant d'engager les 3 930 | Ni la spec ni le contrat ne peuvent trancher par le raisonnement si les légendes valent quelque chose |
| Reprise automatique | **Refusée** — pas de tâche planifiée | De la spécification qui tourne sans relecteur ne vaut rien |

### La règle des dates, telle qu'il l'a énoncée

Elle est le mécanisme central et elle vient de lui, mot pour mot :

> Quand il y a une date de capture dans l'EXIF qui ne diffère pas de plus de
> 6 mois avec la date dans le dernier niveau de hiérarchie, c'est cette date qui
> est bonne. Sinon prendre la date du dernier niveau de la hiérarchie, ou celle
> modifiée dans l'UI de la pipeline. Si besoin et si possible faire un
> rapprochement du lieu avec le contenu du journal de bord / « Ma vie », leurs
> dates sont exactes. Sinon on garde la date modifiée par l'UI du pipeline, ou
> année/mois du dernier niveau de la hiérarchie.

Et sa mise en garde, qui gouverne tout le reste : **« sur les photos récentes le
datage est correct, mais sur les anciennes il a été fait à la main, et des fois
comporte des erreurs. »** 40,2 % des dates du périmètre ne sont pas des mesures.

---

## Les agents, nommément

*Complète le tableau plus haut, qui en désignait deux comme « non nommés ».*

| Agent | Mandat | Joignable par `SendMessage` |
|:---|:---|:---|
| `spec-frontend` | Spécification fonctionnelle, vivante | oui |
| `contrat-api` | Contrat d'API **et** spec backend — mandat terminé | oui |
| `impl-frontend` | Plan **et** implémentation du frontend | oui |
| `impl-backend` | Plan puis implémentation du backend — **lancé** | oui |
| `spike-legendes` | Échantillon de légendes — c'est l'« agent non nommé » | oui |
| `inventaire-schemas`, `digest-specs`, `spike-dhash`, `skill-dossier-bd` | Mandats terminés, livrables commités | oui |

`ListAgents` n'est pas disponible dans toutes les sessions : passer par la
session pilote pour un relais.

---

## Deux choses acquises hors dépôt

- **La base `photo_ui` existe** : `localhost:5432`, conteneur Docker
  `timescaledb`, utilisateur `nico`, collation ICU `fr-FR`, extensions
  `postgis` 3.5.3, `pg_trgm`, `unaccent` installées. Vide de schéma applicatif.
- **Le skill `bd_dossier` est actif globalement** : symlink créé par Nicolas
  depuis `~/.claude/skills/bd_dossier` vers `photo_ui/skills/bd_dossier`. Le
  modifier est un changement du dépôt.

**La clé API Anthropic de la machine est sans crédit.** Le spike des légendes
s'en passe : un agent Claude Code voit les images qu'il ouvre. À savoir avant de
planifier quoi que ce soit qui appelle l'API directement.
