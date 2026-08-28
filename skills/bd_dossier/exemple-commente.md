# Exemple commenté — ce qu'un manifeste autorise à écrire

À ouvrir au moment de rédiger. Les règles sont dans `SKILL.md` ; ce fichier les
montre à l'œuvre sur un manifeste complet.

## Référence rapide : champ → ce qu'il autorise

| Champ | Autorise |
|:---|:---|
| `date.kind` | `reading`/`decision` → affirmer ; `inference` → approximer ou taire |
| `date.precision` | la granularité **maximale** affichable (jour / mois / année) |
| `date.bracket_hours` | la marge d'une inférence ; `null` = sans fourchette |
| `date.source` | traçabilité. Ne pas la citer dans la BD |
| `text` | citation, attribution, voix du récit |
| `text_original` | rien. Vérification interne |
| `caption.text` | savoir ce que montre l'image. Aucune citation |
| `notes[].text`, `user_note` | orienter le récit, dire ce que l'auteur sait |
| `covers_images` | rapprocher, ordonner. Pas légender |
| `people[]` | nommer les personnes présentes — pas dire qui y fait quoi |
| `position`, `place` | situer **si** non nul, et selon `position.kind` |
| `album_path`, `group_name` | contexte de rangement, pas un lieu ni une date |

## Le manifeste

Deux images, une entrée de journal, une note.

```json
{
  "task": { "title": "La transat, septembre-octobre 1999",
            "brief": "Trois planches sur la traversée Lisbonne-Madère. Ton sobre, pas d'héroïsme.",
            "period": { "from": "1999-09-01", "to": "1999-11-30" } },
  "images": [
    { "cloud_asset_id": "05b9…", "file": "images/05b9….jpg",
      "album_path": "1998-1999/1999-10 Lisboa Madere",
      "date": { "start": "1999-10-14", "end": "1999-10-14", "precision": "day",
                "kind": "reading", "source": "exif", "bracket_hours": null },
      "position": { "lat": 32.98, "lon": -16.39, "kind": "inference", "source": "logbook-interpolated" },
      "people": ["Hugo"], "place": { "city": null, "country": null },
      "caption": { "text": "Un homme barre un voilier, mer formée, ciel couvert.",
                   "kind": "machine", "model": "claude-haiku-4-5" },
      "user_note": null, "selected_because": ["date-range", "album"] },
    { "cloud_asset_id": "7f3c…", "file": "images/7f3c….jpg",
      "album_path": "1998-1999/1999-10 Lisboa Madere",
      "date": { "start": "1999-10-01", "end": "1999-10-31", "precision": "month",
                "kind": "inference", "source": "album", "bracket_hours": null },
      "position": null, "people": [], "place": { "city": null, "country": null },
      "caption": null, "user_note": null, "selected_because": ["album"] }
  ],
  "texts": [
    { "id": "logbook/1999-10-14", "kind": "log_entry", "document": "logbook",
      "page_image": "pages/logbook-p041.jpg",
      "text": "14 octobre. Vent de nord-est force 6, on réduit à deux ris. Hugo à la barre toute la matinée.",
      "text_original": "14 octobre. Vent de nord-est force 6, on réduit à deux ns. Hugo à la barre toute la matinée.",
      "corrected": true,
      "date": { "from": "1999-10-14", "to": "1999-10-16", "kind": "reading", "source": "log_entries.date" },
      "covers_images": ["05b9…", "7f3c…"], "user_note": null },
    { "id": "web/1999/Transat/003", "kind": "passage", "document": "web/1999/Transat",
      "text": "L'arrivée à Funchal s'est faite de nuit, les lumières de la ville étagées sur la montagne.",
      "text_original": null, "corrected": false,
      "date": null, "covers_images": [], "user_note": null }
  ],
  "notes": [
    { "id": "note_01JB7", "title": "Ce que le journal ne dit pas",
      "text": "Gaëtan n'était plus à bord après 2002. Sur cette traversée on était trois, mais je ne retrouve pas de photo du troisième.",
      "attached_to": { "images": [], "texts": [] } }
  ]
}
```

Les littéraux `"exif"`, `"album"` et `"log_entries.date"` sont **illustratifs** :
le vocabulaire de `date.source` n'est pas arrêté par la spec (voir les
incertitudes de `manifest-reference.md`).

## Ce que ça autorise à écrire

> **Case 1** — *image `7f3c…`* — Le voilier au loin sous un ciel bas.
> Cartouche : **Octobre 1999**.
> *(inference au mois : le mois, jamais le jour ; pas de météo affirmée, l'image
> n'a pas de caption — décrire ce qu'on voit, sans plus.)*
>
> **Case 2** — *page `pages/logbook-p041.jpg`* — La page du journal.
> Récitatif, cité : « Vent de nord-est force 6, on réduit à deux ris. »
> Cartouche : **14 octobre 1999**.
> *(texte d'époque, date `reading` au jour : citable et datable.)*
>
> **Case 3** — *image `05b9…`* — Hugo à la barre, mer formée, ciel couvert.
> Récitatif : « Hugo à la barre toute la matinée. »
> *(la caption machine dit ce que montre l'image, elle n'est pas citée ;
> `people` donne le nom ; la phrase citée vient du journal, pas de la photo.)*

## Ce que ça n'autorise pas

| Écrit | Pourquoi c'est faux |
|:---|:---|
| Case 1 : « Le 14 octobre 1999 » | la date de cette image est une `inference` au mois |
| « Comme le raconte le journal, sur cette photo, Hugo… » | `covers_images` est un recouvrement de dates, pas une légende |
| Récitatif : « Un homme barre un voilier, mer formée. » | citation d'une caption machine — personne n'a écrit ça |
| « Le carnet portait "deux ns" » | `text_original` n'apparaît jamais dans le livrable |
| « Nous étions trois, ce jour-là. » | la note dit « sur cette traversée », pas ce jour-là |
| « Je ne sais plus quel jour c'était. » | l'incertitude est celle du dossier, pas de la mémoire du narrateur |
| « Au large du Bugio » | `position.kind: "inference"`, et `place.city` est nul |
| Une case sur l'arrivée à Funchal datée du 16 octobre | le passage web n'a aucune date |
| « Hugo affronte la tempête » | le journal dit force 6 et deux ris — pas de tempête, et le brief dit « pas d'héroïsme » |
