# Serveur MCP « dossiers de tâche »

**Statut : spécifié ici, aucune ligne de code.** Ce fichier *est* la
spécification. Le nom des outils, leur découpage et la forme des réponses sont
une proposition alignée sur `adobe_mcp/mcp_spec.md`, pas un existant validé.

## But

Donner au projet générateur de BD tout ce qu'une tâche `photo_ui` contient : le
manifeste, les pixels des images, les pages scannées, les textes — **sans que le
générateur ait à connaître le disque**. Il parle au serveur, pas au système de
fichiers.

Le serveur ne sert **que** `<TASKS_ROOT>`. Il ne connaît ni le pipeline
`adobe_mcp`, ni les bases SQLite, ni les catalogues Lightroom, ni le volume des
originaux. C'est tout l'intérêt d'un dossier autosuffisant : la chaîne s'arrête
au dossier.

## Conventions, reprises de `adobe_mcp/mcp_spec.md`

- Outils `snake_case`, verbe d'abord : `list_*`, `get_*`, `search_*`.
- Arguments `camelCase` (`maxEdge`, `dateFrom`, `imageLimit`).
- `get_image` renvoie du **base64**, jamais un chemin seul, jamais un original.
- **Absent n'est pas zéro** : les champs manquants remontent `null`.
- **La confiance voyage avec la donnée** : chez `adobe_mcp` c'est la confidence
  d'un tag IA ; ici c'est le `kind` d'une date. Même règle, même interdiction de
  l'aplatir.
- Chaque réponse portant un fichier porte son chemin relatif, pour qu'un appelant
  puisse agir sur le vrai fichier.
- Lecture seule, de bout en bout.

## Outils

### `list_tasks`

| Argument | Type | Défaut |
|:---|:---|:---|
| `q` | string? | — filtre plein texte sur `slug`, `title`, `brief` |
| `limit` | number? | 50 |
| `offset` | number? | 0 |

Retourne, par tâche : `slug`, `title`, `period`, `created_at`, `exported_at`,
`schema_version`, et `counts: { images, texts, notes, images_with_caption,
images_date_inferred, texts_corrected }`.

`images_date_inferred` est là pour que l'appelant sache **avant de lire** quelle
part de la tâche repose sur des dates calculées.

### `get_task`

| Argument | Type | Défaut |
|:---|:---|:---|
| `slug` | string | requis |
| `sections` | `("task"\|"images"\|"texts"\|"notes")[]?` | toutes |
| `imageLimit` / `imageOffset` | number? | 100 / 0 |
| `textLimit` / `textOffset` | number? | 100 / 0 |

Retourne **le manifeste tel qu'il est sur disque**, restreint aux sections
demandées et paginé. Aucun champ n'est renommé, aucun objet `date` n'est aplati,
rien n'est calculé en plus.

**L'ordre de `images[]` est préservé** — c'est l'ordre de lecture voulu.
La pagination ajoute `counts` et un booléen `truncated` par section : un appelant
doit pouvoir savoir qu'il n'a pas tout vu.

Une tâche de 200 images produit un manifeste de l'ordre de 100 Ko. La pagination
n'est pas cosmétique.

### `search_texts`

| Argument | Type | Défaut |
|:---|:---|:---|
| `slug` | string | requis |
| `q` | string | requis |
| `field` | `"text" \| "text_original" \| "both"` | `"text"` |
| `document` | string? | — `ma-vie`, `logbook`, `web/…` |
| `dateFrom` / `dateTo` | `YYYY-MM-DD`? | — chevauchement, jamais inclusion |
| `limit` / `offset` | number? | 50 / 0 |

Retourne, par extrait : `id`, `kind`, `document`, `page`, `page_image`, l'objet
`date` **complet**, `covers_images`, `corrected`, et un `snippet` avec le terme
mis en évidence.

**`text` et `text_original` sont deux questions différentes**, et l'appelant
choisit — exactement comme `text` et `inImage` chez `adobe_mcp`. Chercher dans
`text` c'est chercher ce que le document dit ; chercher dans `text_original`
c'est chercher ce que l'OCR avait lu, ce qui sert à retrouver une correction ou à
diagnostiquer une transcription. Les fusionner par défaut ferait remonter des
coquilles corrigées comme si elles étaient dans le texte.

Le filtre de dates fonctionne par **chevauchement d'intervalles**
(`Pd ≤ Tf ET Td ≤ Pf`), jamais par inclusion stricte : un intervalle qui déborde
est retenu. Mesuré côté images, une lecture stricte sur
`2000-12-01 → 2000-12-20` rend **0 photo** là où le chevauchement en rend **273**.

### `search_images`

| Argument | Type | Défaut |
|:---|:---|:---|
| `slug` | string | requis |
| `dateFrom` / `dateTo` | `YYYY-MM-DD`? | — chevauchement |
| `dateKind` | `"reading" \| "inference" \| "decision"`? | — |
| `datePrecision` | `"day" \| "month" \| "year"`? | — |
| `person` | string? | — |
| `album` | string? | — préfixe de `album_path` |
| `hasCaption` / `hasPosition` | boolean? | — |
| `limit` / `offset` | number? | 50 / 0 |

Retourne des résumés : `cloud_asset_id`, `file`, `album_path`, `group_name`,
`date` (objet complet), `position` (objet complet ou `null`), `people`, `place`,
`selected_because`, et `has_caption`.

`dateKind` existe pour que le générateur puisse **isoler ce qu'il a le droit
d'affirmer** : `dateKind: "reading"` rend les images dont la date se cite telle
quelle. C'est le filtre qui rend la règle 1 exploitable plutôt que déclarative.

### `get_image`

| Argument | Type | Défaut |
|:---|:---|:---|
| `slug` | string | requis |
| `cloudAssetId` | string | requis |
| `maxEdge` | number? | 1400 |

Retourne `{ data: <base64>, mediaType: "image/jpeg", width, height, file,
cloud_asset_id, sha256 }`.

Le dossier contient **déjà** un JPEG 1400 px qualité 78. Le cas nominal est donc
une lecture de fichier et un encodage base64, sans traitement. `maxEdge` **ne
sert qu'à réduire** : une valeur supérieure à 1400 est ramenée à 1400 et la
réponse le dit. Le serveur ne suréchantillonne pas, et n'a de toute façon accès à
aucun original.

Un JPEG 1400 px pèse quelques centaines de Ko ; en base64 c'est un ordre de
grandeur qui compte dans un contexte. Demander plusieurs images à la suite est un
choix de l'appelant, pas un défaut du serveur — d'où l'absence de tout
`get_images` en lot.

### `get_page_image`

| Argument | Type | Défaut |
|:---|:---|:---|
| `slug` | string | requis |
| `page` | string | requis — `ma-vie/p007` |
| `maxEdge` | number? | natif (≈ 1 250) |

Retourne `{ data, mediaType, width, height, file, page }`.

Les pages font **≈ 810 × 1 250 px**, ce qui est juste pour de l'écriture
manuscrite : le serveur ne réduit pas par défaut. Un passage du site web n'a pas
de page — la réponse est une erreur explicite « ce document n'a pas de page
scannée », pas un résultat vide.

**Aucune région n'est retournée.** `pages.region` est NULL sur les 155 lignes :
rien dans les données ne dit où un passage se trouve dans sa page. Ne pas
promettre ce qui n'existe pas.

### `timeline`

| Argument | Type | Défaut |
|:---|:---|:---|
| `slug` | string | requis |
| `granularity` | `"month" \| "year"` | `"month"` |

Par bucket : `images`, `images_date_inferred`, `texts`, et
`images_uncovered` (images qu'aucun texte de la tâche ne recouvre).

C'est l'outil qui montre les trous avant qu'ils ne deviennent des inventions :
**le journal s'arrête au 2 juin 2002**, et il y a **2 041 photos sur 2003-2004
pour zéro ligne**. Un générateur qui voit ce creux écrit autrement qu'un
générateur qui le découvre image par image.

## Ce que le serveur refuse, et pourquoi

| Refus | Raison |
|:---|:---|
| **Toute écriture.** Aucun outil ne crée, modifie ou supprime une tâche, une image, une note, une correction | Le dossier est un livrable, pas un espace de travail. Composer une tâche est le rôle de `photo_ui`, avec un humain devant |
| **Servir un original.** Seuls les fichiers présents dans le dossier sont servis | Les originaux atteignent 872 Mo, et le serveur n'a de toute façon pas accès au volume |
| **Sortir de `<TASKS_ROOT>`.** `slug` est validé contre les répertoires existants, jamais concaténé tel quel ; pas de chemin absolu en argument, pas de `..`, pas de lien symbolique suivi hors racine | Un serveur MCP local exécute ce qu'un LLM lui demande. La racine est la seule frontière |
| **Toucher au pipeline** : bases SQLite, catalogues Lightroom, `/Volumes/OWC Envoy Ultra`, `adobe_mcp/data/` | Interdit d'écriture (§7.2), et inutile : le dossier est autosuffisant. Si un outil a besoin du pipeline, c'est que le dossier est incomplet — corriger l'export, pas le serveur |
| **Retourner une date sans son `kind`.** Aucun champ « date » plat, dans aucune réponse | La règle capitale. Elle tient structurellement ou elle ne tient pas |
| **Combler une valeur absente** | Absent n'est pas zéro. `null` remonte tel quel |
| **Présenter `covers_images` comme un lien** | C'est une proposition calculée sur des dates dont 40 % ne sont pas des mesures. Le serveur la sert sous son nom, sans score de confiance fabriqué |
| **Fusionner `caption` dans les textes.** Aucun outil ne retourne une caption dans une réponse de `search_texts` | Trois natures de texte, trois emplacements. Un serveur qui les mélange annule la règle 2 |
| **Parser un `schema_version` inconnu** | Erreur nommant la version lue et la version attendue. Un parse « au mieux » sur un schéma qui a bougé produit des champs silencieusement faux |
| **Renvoyer un vide là où il y a une erreur** | Un fichier référencé mais absent, un slug inconnu, une page qui n'existe pas : erreur explicite nommant le chemin attendu. Un résultat vide se lit comme « il n'y a rien », ce qui est un mensonge |

## Implémentation

TypeScript sur Node, `@modelcontextprotocol/sdk`, transport **stdio**, mode
strict, pas de `any`. Vitest, tests colocalisés.

Couches, sans saut :

```
dossier/   le seul code qui sait que des fichiers existent — lecture, validation
           de chemin, encodage base64
domain/    types du manifeste, validation de schéma, arithmétique d'intervalles
           de dates
tools/     la surface MCP
```

Deux endroits méritent des tests unitaires serrés, parce qu'une erreur y serait
silencieuse et coûteuse :

1. **La validation de `slug` et de chemin.** Chaque forme hostile (`..`,
   absolu, symlink, slug inexistant) a son cas.
2. **Le chevauchement d'intervalles**, avec les précisions `day` / `month` /
   `year` et les bornes. C'est lui qui décide ce que le générateur voit ; une
   inclusion stricte glissée à la place d'un chevauchement fait disparaître des
   images sans que rien ne le signale.

L'index n'a pas lieu d'être : un manifeste de tâche tient en mémoire, et
`<TASKS_ROOT>` contiendra des dizaines de dossiers, pas des dizaines de milliers.
Lire et parser à la demande, avec un cache par `mtime` si le besoin se mesure —
pas avant.

## Hors périmètre

Générer la BD, écrire quoi que ce soit, produire de nouveaux rendus au-delà d'une
réduction pour `get_image`, l'appariement visuel légende ↔ photo (§4.5, non
testé), la recherche sémantique et les embeddings (hors V1 côté `photo_ui`, zéro
ligne dans le pipeline), et tout ce qui dépend d'autre chose que des fichiers du
dossier.

## Incertitude

**Ce document entier est une proposition.** Les outils, leur découpage, la
pagination et la forme des réponses sont mes choix, alignés sur les conventions
de `adobe_mcp/mcp_spec.md`. Rien n'a été validé par Nicolas, ni confronté à un
dossier réel — il n'en existe aucun.
