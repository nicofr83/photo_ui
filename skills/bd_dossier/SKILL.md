---
name: bd_dossier
description: À utiliser quand on lit un dossier de tâche livré par photo_ui — un manifest.json accompagné de images/, pages/ et textes/ — pour en tirer un scénario, un découpage, des récitatifs ou des légendes de bande dessinée, ou quand on construit ou appelle le serveur MCP local qui sert ces dossiers. Symptômes du dossier : dates portant kind et precision, covers_images, caption kind machine, text_original, et le doute sur ce qu'on a le droit d'affirmer.
---

# Le dossier de tâche `photo_ui` — contrat pour le générateur de BD

**Statut : spécifié, rien n'est implémenté.** `photo_ui` n'est pas écrit, donc
**aucun dossier n'existe encore** ; le serveur MCP n'a aucune ligne de code. Ne
codez rien qui suppose qu'un dossier est là — vérifiez.

## Le dossier

`photo_ui` compose des **tâches** — images choisies, extraits de textes d'époque,
notes écrites aujourd'hui — et exporte chacune en un dossier autosuffisant qu'un
projet à venir lit pour écrire une bande dessinée avec un LLM.

```
<TASKS_ROOT>/<slug>/
  manifest.json     le contrat — la seule source de vérité
  README.md         rendu lisible, jamais une source
  images/<cloud_asset_id>.jpg      rendu 1400 px, qualité 78
  pages/<doc>-p<NNN>.jpg           page scannée du passage
  textes/journal.md · ma-vie.md · site-web.md · notes.md
```

Autosuffisant et idempotent : rien ne pointe hors du dossier, un fichier
référencé existe, et ré-exporter une tâche inchangée réécrit le même dossier.

## Où aller

| Fichier | Quand l'ouvrir |
|:---|:---|
| [manifest-reference.md](manifest-reference.md) | un champ précis du manifeste : son type, ses valeurs, ce qu'il garantit, et les incertitudes du schéma |
| [exemple-commente.md](exemple-commente.md) | au moment de rédiger : un manifeste complet, case par case, avec ce qu'il autorise et ce qu'il interdit |
| [mcp-server.md](mcp-server.md) | construire ou appeler le serveur MCP : outils, paramètres, réponses, refus |

---

# Les règles de provenance

Le dossier est une matière **documentaire, pas un récit** : la provenance de
chaque fait décide de ce que la BD a le droit d'affirmer. Vous êtes le seul
consommateur, rien en aval ne rattrapera une approximation.

## 1. Une inférence ne ressemble jamais à une lecture

Chaque date porte un `kind`, et les dates d'image une `precision`. *(Les dates de
texte n'ont pas de `precision`, et valent `null` pour tout passage du site web.)*

| `kind` | Ce que c'est | Exemple → ce que vous écrivez |
|:---|:---|:---|
| `reading` | lu sur une source d'époque : EXIF retenu, date du journal | `day`, 1999-10-14 → **« le 14 octobre 1999 »** |
| `decision` | un humain a tranché, aujourd'hui, en connaissance de cause | idem — la date s'affirme |
| `inference` | calculé : intervalle d'album, fenêtre de page, gazetteer | `month`, oct. 1999 → **« vers octobre 1999 »**, « cet automne-là », ou rien |

`precision` est la granularité **maximale** affichable : `month` interdit le
jour, `year` interdit le mois et la saison. `bracket_hours` est la marge d'une
inférence ; `null` = sans fourchette, donc incertitude non bornée. Une date
`inference` sert à **ordonner** les cases, jamais à afficher un chiffre.

**Pourquoi** : le préfixe `aaaa-mm` d'un album a été tapé à la main des années
après la prise de vue, et **40 % des dates ne sont pas des mesures**.

`position` porte le même `kind` : une position `inference` est une interpolation
entre deux relevés du journal, pas un relevé.

## 2. Trois natures de texte, trois emplacements

| Emplacement | Nature | Statut dans la BD |
|:---|:---|:---|
| `texts[]` | texte d'époque, écrit sur le moment | **citable, attribuable** — la voix du récit |
| `notes[]` avec `quotable: true` | texte d'époque recopié, coupé mais pas réécrit | **citable, attribuable** — l'attribution est le document et la page que nomme `derived_from` |
| `notes[]` avec `quotable: false`, `user_note` | note humaine d'aujourd'hui | oriente votre travail. Jamais une citation d'époque |
| `images[].caption` (`kind: "machine"`) | description produite par une machine | dit ce que **montre** l'image. Jamais citée, jamais attribuée |

Exemple : « Un homme barre un voilier, mer formée » est une caption ; la passer en
récitatif fabrique un souvenir que personne n'a eu. *(Hors V1 : `caption` sera
`null` tant que la passe n'a pas tourné.)* Et une note ne se resserre pas : « on
était trois sur cette traversée » ne devient pas « nous étions trois ce jour-là ».

**Une phrase des versions précédentes est remplacée, pas nuancée** : « une note
n'est jamais une citation d'époque » n'est plus vraie. Nicolas peut désormais
sélectionner un texte d'époque à l'écran et en faire une note, en le modifiant ou
non. C'est `quotable` qui tranche, et lui seul — voir `manifest-reference.md`.

## 3. `text` et `text_original` coexistent

Citez **`text`** — le texte effectif, corrigé si `corrected: true`.
`text_original` est la transcription OCR d'origine, conservée pour vérification,
jamais dans le livrable. Exemple : le journal corrigé dit « deux ris », l'original
« deux ns » ; vous écrivez « deux ris » sans mentionner l'autre.

## 4. `covers_images` est une proposition, pas un lien

Aucune donnée ne relie un texte à une photo. Le rapprochement est calculé par
recouvrement d'intervalles de dates, sans plafond de largeur, sur des dates dont
40 % ne sont pas des mesures : une photo « octobre 1999 » chevauche les 31 jours
du mois.

- ✅ « Le journal parle de ce mois-là », ou juxtaposer les deux dans une planche.
- ❌ « Comme le raconte le journal, sur cette photo… » — un texte qui couvre une
  photo n'en est pas la légende.

`covers_images` vide veut souvent dire « pas de date exploitable », pas « sans
rapport ».

## 5. Absent n'est pas zéro

`position: null`, `place.city: null`, `people: []`, `caption: null`,
`date: null` sont des trous, et un trou ne se comble pas : aucun lieu, météo ni
heure inventés, aucune personne hors `people[]`. Un manque peut devenir une case,
mais comme **silence** — le dossier ignore, le personnage non.

## 6. La consigne de l'auteur commande

`task.brief` prime sur toute inclination narrative. L'ordre de `images[]` est
celui voulu par l'auteur. `selected_because` dit pourquoi l'image est là, **pas
ce qu'elle montre**. `task.period` est le périmètre *demandé à la composition*,
pas une borne : une image peut légitimement tomber hors période, ne vous en
servez pas pour exclure. **On ratisse large, on ne raconte pas large** — la
sélection en amont est permissive, ce qu'on affirme ne l'est pas.

## Drapeaux rouges

- un jour précis → vérifiez `kind` **et** `precision`
- une phrase entre guillemets → elle vient de `texts[].text`, de nulle part ailleurs
- « comme le dit le journal, sur cette photo » → c'est `covers_images`
- un nom → vérifiez `people[]`
- un lieu, une météo, une heure → vérifiez que le champ existe
- un doute prêté au narrateur → c'est le dossier qui doute, pas lui
- le récit vous paraît plat → relisez `task.brief` avant de l'étoffer

---

# Le serveur MCP

Local, lecture seule, stdio, expose `<TASKS_ROOT>` ; conventions de
`adobe_mcp/mcp_spec.md`. Sept outils : `list_tasks` · `get_task` ·
`search_texts` · `search_images` · `get_image` · `get_page_image` · `timeline`.

Il n'écrit rien, ne sert jamais un original, ne sort jamais de `<TASKS_ROOT>`, ne
touche jamais au pipeline, et ne retourne **aucune date sans son `kind`**.
Paramètres, réponses et refus : [mcp-server.md](mcp-server.md).

## Incertitudes

Vocabulaire de `date.source` et `selected_because`, littéral de la nature
« proposition », absence de `confidence` et `spanSource` : ouverts, détaillés
dans [manifest-reference.md](manifest-reference.md). Le serveur MCP entier est
une proposition non validée. Ce skill n'a pas été testé sur un agent au sens de
`superpowers:writing-skills` : ma consigne de session interdit les sous-agents.
