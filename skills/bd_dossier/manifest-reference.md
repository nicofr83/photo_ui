# `manifest.json` — schéma champ par champ

Source de vérité : `photo_ui/docs/frontend-spec.md` §1.3, §5.6 et **annexe C**.
Ce fichier reprend le schéma et annote ce que chaque champ garantit.

**Statut : spécifié, non implémenté.** Aucun dossier n'a jamais été exporté.

## Le schéma

```jsonc
{
  "schema_version": 1,
  "task": {
    "slug": "1999-transat",
    "title": "La transat, septembre-octobre 1999",
    "brief": "…",
    "period": { "from": "1999-09-01", "to": "1999-11-30" },
    "created_at": "…", "exported_at": "…"
  },
  "images": [{
    "cloud_asset_id": "05b9a4fac5df4dd28dcc1002d7ec0074",
    "sha256": "…",
    "file": "images/05b9a4fac5df4dd28dcc1002d7ec0074.jpg",
    "album_path": "1998-1999/1999-10 Lisboa Madere",
    "group_name": "Lisboa Madere",

    // La date, avec SA NATURE et SA PRÉCISION. Jamais aplatie.
    "date": { "start": "1999-10-14", "end": "1999-10-14", "precision": "day",
              "kind": "decision", "source": "annotation", "bracket_hours": null },
    "position": { "lat": 32.98, "lon": -16.39, "kind": "inference",
                  "source": "logbook-interpolated" },

    "people": ["Hugo", "Gigi"],
    "place": { "city": null, "country": null },
    "user_note": "Hugo à la barre, on venait de doubler le Bugio",

    // Légende VLM, optionnelle. JAMAIS dans `texts[]` ni `notes[]`.
    "caption": { "text": "Un homme barre un voilier, mer formée, ciel couvert.",
                 "kind": "machine", "model": "claude-haiku-4-5",
                 "created_at": "…" },

    "selected_because": ["date-range", "album"]
  }],
  "texts": [{
    "id": "ma-vie/p007/002",
    "kind": "passage",              // passage | log_entry
    "document": "ma-vie",           // ma-vie | logbook | web/1999/Transat
    "page": "ma-vie/p007",
    "page_image": "pages/ma-vie-p007.jpg",
    "text": "…",                    // le texte EFFECTIF, corrigé s'il l'a été
    "text_original": "…",           // la transcription d'origine, si corrigée
    "corrected": true,
    "date": { "from": "1999-09-23", "to": "1999-09-25",
              "kind": "reading", "source": "passage.dateFrom" },
    "covers_images": ["05b9a4fac5df4dd28dcc1002d7ec0074"],
    "user_note": null
  }],
  "notes": [{
    "id": "note_01JB…", "created_at": "…",
    "title": "Ce que le journal ne dit pas",
    "text": "…",
    "attached_to": { "images": [], "texts": [] }   // vide = note générale
  }]
}
```

Noter l'asymétrie : la date d'une **image** a `start`/`end`, celle d'un **texte**
a `from`/`to`. C'est ce que dit l'annexe C, telle quelle.

## `task`

| Champ | Garantie |
|:---|:---|
| `slug` | identifiant du dossier, = nom du répertoire sous `<TASKS_ROOT>` |
| `title`, `brief` | écrits par Nicolas. `brief` est la consigne destinée au générateur |
| `period.from`/`to` | le périmètre **demandé** à la composition. Ce n'est pas une borne des dates présentes : une image peut légitimement tomber hors période (Q5, défaut : autorisé avec avertissement) |
| `created_at`, `exported_at` | horodatages de la tâche et de l'export |

`schema_version` : entier. Un consommateur qui rencontre une version inconnue
**refuse et nomme la version**, il ne parse pas au mieux.

## `images[]`

| Champ | Type | Notes |
|:---|:---|:---|
| `cloud_asset_id` | string | **la clé durable** de la photo, assignée par le catalogue Adobe, jamais réattribuée. Nomme aussi le fichier |
| `sha256` | string | clé durable du contenu |
| `file` | string | chemin **relatif au dossier**. Le fichier existe : une image qui n'a pas pu être rendue est absente du dossier *et* du manifeste |
| `album_path` | string | `<Set>/<Album>` tel qu'écrit sur disque. C'est un classement fait à la main, qui fait foi sur `photos.year` |
| `group_name` | string | le nom de la sortie, préfixe de date retiré (`Lisboa Madere`) |
| `date` | objet \| null | voir ci-dessous |
| `position` | objet \| null | `null` si aucune position. **1 064 photos sur 3 930 ont un GPS**, et deux des cinq sets en ont zéro |
| `people` | string[] | noms venus de l'index de visages. Tableau vide ≠ personne sur la photo |
| `place` | `{city, country}` | champs nullables indépendamment |
| `user_note` | string \| null | **écrit par Nicolas aujourd'hui**, pas une source d'époque |
| `caption` | objet \| null | légende machine, voir ci-dessous |
| `selected_because` | string[] | pourquoi l'image a été retenue par la sélection, **pas ce qu'elle montre**. Vocabulaire non énuméré ; exemples : `date-range`, `album` |

### `images[].date`

| Champ | Valeurs | Sens |
|:---|:---|:---|
| `start`, `end` | `YYYY-MM-DD` | **un intervalle, jamais un point.** Égaux quand `precision: day` |
| `precision` | `day` \| `month` \| `year` | l'unité la plus fine qu'on ait le droit d'écrire |
| `kind` | `reading` \| `inference` \| `decision` | la nature. **Le champ le plus important du manifeste** |
| `source` | string | d'où vient la valeur. Seul `"annotation"` est écrit dans la spec ; le reste est ouvert |
| `bracket_hours` | number \| null | la fourchette d'une proposition (« ± 96 h »). `null` = pas de fourchette, et alors on affiche « sans fourchette », **jamais un nombre non soutenu** |

La cascade de datation (§3.3) est calculée **une fois, au backend, à l'import**,
et donne une date à chacune des 3 930 photos du périmètre : 3 060 au jour, 840 au
mois, 30 à l'année. Un `date: null` reste possible hors périmètre — le traiter,
ne pas le combler.

### `images[].position`

`lat`/`lon` en degrés décimaux, plus `kind` et `source`. `kind: "inference"` +
`source: "logbook-interpolated"` = position **interpolée** entre deux relevés du
journal de bord. Ce n'est pas un relevé, c'est un calcul entre deux relevés.

### `images[].caption`

| Champ | Valeurs |
|:---|:---|
| `text` | 2 à 4 phrases, français, description factuelle de ce qui est visible |
| `kind` | `machine`, ou `human-edited` si Nicolas l'a corrigée |
| `model`, `created_at` | le modèle qui l'a produite et quand |
| `machine_original` | présent quand `kind: "human-edited"` — la production d'origine n'est jamais détruite |

La consigne du VLM lui interdit de **nommer** (les visages viennent de l'index),
de **dater** et de **localiser**, et lui demande de décrire sans raconter. Le
modèle reçoit le rendu 1400 px **sans aucune métadonnée** : lui donner le
contexte l'inciterait à le recracher comme s'il l'avait vu.

Le légendage VLM est **hors V1** : `caption` sera absent de tout dossier tant que
la passe n'a pas tourné.

## `texts[]`

| Champ | Type | Notes |
|:---|:---|:---|
| `id` | string | **la clé durable**, forme `ma-vie/p007/002` |
| `kind` | `passage` \| `log_entry` | granularité de la source |
| `document` | string | `ma-vie` \| `logbook` \| `web/<année>/<doc>` |
| `page` | string \| null | la page du document |
| `page_image` | string \| null | chemin relatif vers `pages/`. `null` pour le site web, **qui n'a pas de page** |
| `text` | string | **le texte à utiliser**, corrigé s'il l'a été |
| `text_original` | string \| null | la transcription OCR d'origine, présente quand `corrected: true` |
| `corrected` | boolean | une correction est du travail humain, globale (une erreur d'OCR est fausse dans toutes les tâches), et **ne remonte jamais au pipeline** |
| `date` | objet \| null | `from`/`to`, `kind`, `source` — **pas de `precision`**, contrairement aux images. `null` pour tout passage du site web |
| `covers_images` | string[] | `cloud_asset_id` proposés par recouvrement de dates. **Une proposition, pas un lien** |
| `user_note` | string \| null | écrit aujourd'hui |

### `texts[].date`

Les dates du journal de bord et de « Ma vie » sont **les seules dates certaines
du corpus** : écrites le jour même, sur la page. Une date transcrite peut avoir
été mal *lue*, mais la date écrite ne se discute pas.

- Un passage daté couvre `[dateFrom, dateFrom]` → `kind: "reading"`.
- Un passage non daté couvre **la fenêtre de sa page** → c'est une inférence. Les
  fenêtres de « Ma vie » font 1 à 3 jours, celles du journal jusqu'à plus de 30
  jours pour 20 pages.
- Une entrée de journal couvre `[E.date, E_suivante.date)`, la prochaine journée
  distincte portant une entrée. **241 jours renseignés sur ~1 513** : les écarts
  vont de 1 à **92 jours**. On photographie au mouillage, on tient le journal en
  mer.
- Un passage du **site web n'a aucune date** — zéro sur 569. Son seul indice est
  le chemin du document. Une association image ↔ texte web est faite **à la main**
  ou n'existe pas.

Le recouvrement se calcule **au jour civil** : le fuseau de `log_entries.time`
est inconnu et le bateau a traversé l'Atlantique.

## `notes[]`

Notes écrites par Nicolas **aujourd'hui**, pour ce que les documents ne disent
pas. `attached_to: {images: [], texts: []}` — les deux tableaux vides signifient
une note générale, et c'est un cas courant (« Gaëtan n'était plus à bord après
2002 »).

C'est la seule donnée du système qui n'existe nulle part ailleurs.

## Les fichiers

| Chemin | Contenu |
|:---|:---|
| `images/<cloud_asset_id>.jpg` | rendu **1400 px, qualité 78**. Jamais un original — les originaux montent à 872 Mo |
| `pages/<doc>-p<NNN>.jpg` | page scannée, **≈ 810 × 1 250 px**. C'est juste pour de l'écriture manuscrite ; zoom obligatoire côté affichage |
| `textes/*.md` | rendu lisible des textes, par source. Le manifeste reste la source de vérité |
| `README.md` | rendu lisible du manifeste. Ne pas parser |

**Aucune mise en évidence n'est possible sur une image de page** : `pages.region`
est NULL sur les 155 lignes, rien ne dit où un passage se trouve dans la page.

## Ce que garantit l'export

- **Autosuffisance** : tout ce qui est référencé est dans le dossier.
- **Idempotence** : ré-exporter une tâche inchangée réécrit un dossier identique.
- **Pas de référence morte** : un fichier nommé dans le manifeste existe.
- **Pas d'écrasement silencieux** : un dossier existant est renommé ou l'export
  va ailleurs, sur décision humaine.
- **Ordre** : l'ordre de `images[]` est l'ordre de lecture voulu. Chronologique
  par défaut, réordonnable à la main — et il **sera** réordonné, un tri calculé
  sur des dates faillibles à 40 % se trompant visiblement.

---

## Incertitudes du schéma

Ce que la spec ne tranche pas. Rien n'est deviné ici — c'est ouvert.

1. **Le vocabulaire de `date.source`.** L'annexe C ne montre que `"annotation"`
   (image) et `"passage.dateFrom"` (texte). Les six échelons de la cascade (§3.3)
   et les trois règles de recouvrement (§4.2) impliquent d'autres valeurs — EXIF
   arbitré, intervalle d'album, fenêtre de page, passe de datation — dont les
   littéraux ne sont écrits nulle part. Ceux de `exemple-commente.md` sont des
   placeholders.
2. **Les littéraux de `date.kind`.** L'annexe C montre `reading`, `inference`,
   `decision` ; §7.1 nomme la nature intermédiaire « proposition ». Les deux
   textes ne coïncident pas.
3. **`confidence` de transcription est absente du manifeste.** §5.6 compte « N
   textes en `confidence: uncertain` » à la revue, mais l'annexe C ne porte aucun
   `confidence` sur `texts[]`. Oubli ou choix : non tranché.
4. **`spanSource` n'est pas exporté.** §4.2 exige que `carried` — une date de
   passage héritée de sa page, donc une inférence — **se voie**. Le schéma ne
   porte pas ce champ ; seul `date.kind` peut le rendre.
5. **Le vocabulaire de `selected_because`** n'est pas énuméré.
6. **La combinaison `reading` / `month`** est cohérente avec le schéma, mais la
   cascade ne semble pas la produire : les lectures arbitrées sortent au jour, et
   le mois vient de l'album, donc en `inference`. Non vérifié.
7. **Le lien légende de galerie ↔ photo (§4.5)** est une piste non testée, sans
   place dans le schéma. Ne rien coder qui la suppose.
