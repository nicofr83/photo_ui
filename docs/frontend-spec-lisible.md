# photo_ui — ce que fait l'application

*Version de lecture. La référence normative des agents reste
`docs/frontend-spec.md` ; les deux disent la même chose, celle-ci se lit.*

Tous les chiffres ont été relevés le 2026-08-28 sur les bases réelles.

---

## En bref

Tu choisis une bande dessinée à faire. L'application te sert la photothèque de
1998-2004 et les documents transcrits — le journal de bord, « Ma vie », l'ancien
site web. Tu retiens des photos, tu retiens des morceaux de texte, tu ajoutes
ce que les documents ne disent pas. Elle produit un dossier.

Ce dossier est la sortie du système. Un LLM le lit et écrit le scénario. Tout
le reste de l'application existe pour le fabriquer.

Elle ne dessine rien, ne met rien en page, et ne touche à rien dans le pipeline
`adobe_mcp`. Un utilisateur, sur ton Mac, à côté du disque externe. Le serveur
écoute en local. L'interface est pensée tactile dès le départ parce qu'iOS et
macOS suivront via Capacitor.

---

## Le corpus

**3 930 photos, 82 albums**, répartis sur les cinq sets `1998-1999`,
`2000-2001`, `2002`, `2003`, `2004`. Le plus gros album en compte 286, la
médiane tourne autour de 30.

Le périmètre est défini par la hiérarchie, pas par les dates : c'est un
classement que tu as fait à la main, alors que la date calculée par le pipeline
se trompe 745 fois sur cette période. 373 photos datées 1998-2004 traînent
ailleurs, dans les albums fourre-tout ; elles restent accessibles par un filtre.

Les vignettes existent déjà, toutes les 3 930. La grille est instantanée.

### Ce qui couvre bien

Les tags automatiques d'Adobe couvrent 100 % des photos, avec 2 593 mots
distincts. Le score esthétique aussi. Le nom de sortie, 99 %.

### Ce qui couvre mal

Le GPS : 27 %. Et la répartition est brutale — zéro sur les 326 photos de
1998-1999, zéro sur les 1 180 de 2004, 546 sur 806 pour 2000-2001. Les
appareils de l'époque n'avaient pas de GPS. Le pays et la ville n'existent que
là où il y a du GPS.

Les visages nommés : 782 photos, 46 personnes. Hugo 249, toi 148, Gigi 135,
Gaëtan 94.

Le texte imprimé dans les images : 614 photos, dont 165 avec plus de 25
caractères. Marginal, mais c'est le seul moyen d'atteindre une enseigne ou un
panneau.

Inutilisables : la note (300 photos), le drapeau (zéro), le titre (deux
photos), et la description — 1 019 photos en ont une, ce sont 1 019 fois la
chaîne `OLYMPUS DIGITAL CAMERA`.

### Les textes

Le journal de bord tient 1 012 lignes sur 241 jours distincts, du 12 avril 1998
au 2 juin 2002. Il s'arrête là.

« Ma vie » fait 798 passages, et couvre du 4 août au 18 novembre 1999. Trois
mois et demi. Ce n'est pas un mémoire de la période, c'est le récit de la
transat.

Le site web fait 569 passages répartis sur 60 documents. Aucun n'est daté. Zéro
sur 569. Le seul indice temporel est dans le chemin du fichier.

Les 155 pages scannées existent toutes sur le disque, en 810 × 1 250 pixels.
Les 60 fichiers HTML du site aussi.

### Le problème central

Le journal s'arrête en juin 2002. C'est exactement là que les photos deviennent
nombreuses : **2 041 photos sur 2003 et 2004, contre zéro ligne de journal**.

Le texte est dense en 1999, les photos sont denses en 2003-2004. Les deux
corpus ne se recouvrent presque pas.

---

## Les dates

C'est le sujet le plus délicat, et c'est toi qui l'as posé : sur les photos
anciennes le datage a été fait à la main et comporte parfois des erreurs.

Les faits le confirment. Les 82 dossiers du disque sont exactement les 82
albums, et le préfixe `aaaa-mm` que le pipeline analyse est le nom que quelqu'un
a tapé sur un dossier des années après la prise de vue. Aujourd'hui, sur les
3 930 photos : 2 350 ont une date EXIF plausible, 512 ont une date EXIF fausse
— celle du scanner —, 835 tiennent leur date d'un nom de dossier, et 233 n'ont
aucune date.

### La règle appliquée

Ta règle, formalisée. Dans l'ordre :

1. Si quelqu'un a daté la photo à la main, cette date gagne. 728 photos.
2. Sinon, si l'EXIF tombe à moins de six mois de la période de l'album, on
   prend l'EXIF, au jour. 2 424 photos.
3. Sinon l'EXIF est une date de scan et on prend la période de l'album, au
   mois. 970 photos.
4. Une photo sans EXIF prend aussi la période de son album. 375 photos.
5. Les albums qui ne nomment qu'une année donnent une année. 161 photos.

Ces nombres ne s'additionnent pas à 3 930, et c'est normal : les 728 datées à la
main se superposent aux autres règles plutôt que de s'y ajouter. Les quatre
règles suivantes, elles, se partagent les 3 930.

Résultat : **les 745 photos mal datées sont toutes réparées, et plus aucune
photo n'est sans date.** À l'arrivée, 3 060 photos sont datées au jour, 840 au
mois, 30 à l'année.

Le seuil de six mois n'est pas un réglage délicat. Les écarts entre l'EXIF et
l'album se répartissent en deux tas nets : 2 415 photos à trois mois ou moins,
puis plus rien jusqu'à 874 photos à plus de cinq ans. N'importe quel seuil entre
quatre et douze mois donne le même résultat.

### Le piège que tu as signalé

`1998-02-Maison rose Algès` couvre février 1998 à fin juin 1999. Le préfixe
nomme un début, pas un mois. Dix-neuf des vingt-deux fichiers de cet album
s'appellent d'ailleurs `98-99 maison rose Lisbonne`.

Ce n'est pas un cas isolé. 25 albums sur 82 portent un nom qui annonce une durée
ou un trajet — `3mois`, `Fort Lauderdale - Belize`,
`Sorel-Beaufort-Fort Lauderdale`. La moitié des photos datées au mois s'y
trouvent : 421 sur 840.

D'où un écran de réglage où tu saisis la période réelle d'un album. Vingt-cinq
saisies corrigent 421 photos. Tant qu'un album n'y est pas, sa période est celle
de son préfixe, et c'est marqué comme une supposition.

---

## Rapprocher les textes des photos

Le mécanisme que tu voulais, et il faut être franc sur ce qu'il rend.

Rien dans les données ne relie un texte à une photo. Aucune table ne porte les
deux. Le rapprochement se calcule donc par la date, seul signal partagé.

Une photo datée « octobre 1999 » n'est pas un point sur l'axe du temps, c'est un
intervalle. Un texte aussi : une entrée de journal couvre jusqu'à la suivante,
un passage couvre sa page. On croise deux intervalles, et on affiche les deux
largeurs.

Une nuance qui compte : la date qu'un texte affirme et la fenêtre qu'il couvre
sont deux choses différentes. Une entrée du 14 octobre 1999 affirme ce jour-là —
c'est exact, c'est écrit sur la page. Qu'elle couvre ensuite jusqu'à la journée
suivante renseignée, parfois trois mois plus tard, ne change rien à ce qu'elle
affirme. Les deux sont stockés séparément, et seule la première s'affiche comme
une date.

Pas de plafond : même un rapprochement à quarante jours est proposé. La raison
est que 40 % des dates de photo ne sont pas des mesures — un seuil calculé
dessus écarterait autant de bons rapprochements que de mauvais, et le ferait en
silence. Le tri fait le travail : du plus serré au plus large.

### Ce que ça donne vraiment

Sur les 3 930 photos, 2 851 tombent hors de la plage du journal. Parmi celles
qui y tombent, 67 ont une fourchette de deux jours ou moins, 236 de trois à sept
jours, et 436 de plus d'un mois.

Autrement dit : environ 300 photos avec un rapprochement serré. « Ma vie » n'en
touche que 55, mais serré — ses pages couvrent un à trois jours.

Le site web, lui, ne se rapproche de rien automatiquement. Aucune de ses pages
n'a de date. Tu pourras leur en donner une à la main, une fois, dans l'écran de
réglage : vingt-cinq documents pour la période.

### L'asymétrie qui change tout

Les dates du journal et de « Ma vie » sont exactes. Elles ont été écrites le
jour même, sur la page. L'incertitude est entièrement du côté des photos.

Ce n'est donc pas « faire coïncider deux sources floues », c'est positionner des
images mal datées contre une référence sûre. C'est plus favorable, mais ça ne
suffit pas : une photo datée « octobre 1999 » chevauche tout le mois, et rien
dans les données ne dira laquelle des trente et une journées est la bonne.

**C'est un œil humain qui reconnaît le mouillage.** Le flux principal de
l'application est donc humain : tu navigues dans les images, tu navigues dans
les textes, tu associes. Le calcul trie et propose, il n'établit rien.

---

## Les écrans

### 1. Choisir ou créer une bande dessinée

Une liste, la plus récente en tête. Titre, période, nombre d'images, de textes
et de notes, date du dernier export, et un état : brouillon, exportée, ou
exportée puis modifiée.

Tu ouvres, tu crées, tu dupliques, tu renommes, tu supprimes. À la création :
un titre, une période pré-remplie, et une consigne libre pour le LLM. Le nom du
dossier livré se fige à la création.

Si le dossier de destination est inaccessible, un bandeau te le dit et la
création est désactivée — pas de tâche qu'on ne pourra pas exporter. Supprimer
une tâche ne touche pas au dossier déjà exporté, et l'écran le précise.

### 2. Sélectionner des images

L'écran principal. Filtres à gauche, grille au centre, détail à droite.

Chaque vignette porte une coche de sélection et sa date. La date est rendue
selon ce qu'elle vaut : vert quand elle est lue, ambre en italique avec un `≈`
quand elle est calculée, violet en gras avec un `✓` quand tu l'as tranchée à la
main. Une photo sans date affiche « sans date ». Un liseré discret indique
qu'elle est déjà retenue dans une autre BD — information, pas interdiction.

En haut, trois compteurs : les résultats, les sélectionnés, et **ce que le
filtre courant a écarté**, avec un geste pour le ramener.

Tu filtres, tu sélectionnes par intervalle — appui, puis appui long sur la
dernière —, tu ouvres une photo pour la voir en 1400 pixels avec tous ses axes,
sa date, sa fourchette, et les textes qui la recouvrent. Chaque photo a un champ
note : c'est la légende qui partira avec elle.

Le tri par date range les photos sans date à la fin, groupées, jamais dispersées
à une date inventée.

Si le volume externe est démonté en cours de route, un bandeau global apparaît ;
ce qui est déjà chargé reste utilisable, l'export est bloqué. L'application
distingue toujours « le volume est absent » — un problème de configuration — de
« ce fichier manque » — un problème de cette photo.

### 3. Lire le texte, la page scannée en regard

Deux panneaux. Le texte transcrit à gauche, l'image de la page à droite. Sur
mobile, deux onglets.

Trois sources, trois sections, jamais mélangées : le journal, « Ma vie », le
site. Elles n'ont ni la même granularité de date ni le même statut.

Chaque passage porte son texte, sa date, la confiance de la transcription, une
coche, un bouton corriger, et le nombre d'images qu'il recouvre — cliquable, ça
ouvre la grille pré-filtrée.

La page se cale sur le passage courant. Zoom et déplacement sont obligatoires :
810 × 1 250 pixels, c'est juste pour de l'écriture manuscrite. Le passage est
surligné dans le texte, mais pas sur l'image : rien dans les données ne dit où
un passage se trouve sur la page. On ne promet pas ce qui n'existe pas.

Les pages du site web n'existent pas — ces documents n'ont jamais été scannés.
Le panneau droit le dit.

### 4. Corriger une transcription

C'est un mode de l'écran précédent. Le passage devient éditable, la page reste
affichée à côté, et le texte d'origine reste visible en dessous, grisé, avec un
bouton pour le rétablir.

La correction est globale, pas par bande dessinée : une erreur d'OCR est fausse
partout.

Elle ne remonte pas au pipeline, et c'est vérifié dans son code : une correction
de texte y serait lue, validée, puis ignorée sans un mot. Elle reste donc chez
nous. Si le pipeline re-découpe une page et que le texte d'origine ne correspond
plus, ta correction est conservée et marquée « à revoir » — jamais appliquée en
douce, jamais effacée.

### 5. Écrire une note

Du texte libre, en Markdown, rattachable à des images ou à des passages, ou à
rien. Une note sans rattachement est une note générale sur la BD, et c'est un
cas courant : « Gaëtan n'était plus à bord après 2002 ».

On peut en écrire une depuis la grille ou depuis l'écran texte, sans quitter le
contexte. C'est la seule donnée de l'application qui n'existe nulle part
ailleurs : le brouillon survit côté navigateur jusqu'à confirmation
d'enregistrement.

### 6. Revoir et exporter

Tout ce que tu as retenu : les images, les textes groupés par source, les notes.
Et une chronologie qui place les deux sur un même axe — c'est le seul endroit
où l'on voit qu'on a deux cents photos de 2004 et pas une ligne de texte pour
les accompagner.

Un bandeau signale sans bloquer : combien d'images sans date, combien avec une
date calculée, combien de textes incertains, combien d'images qu'aucun texte ne
recouvre.

Tu retires, tu réordonnes — l'ordre est celui que le LLM lira —, tu ajustes la
consigne, tu exportes. Deux cents images s'exportent en quatre secondes.

Si le dossier existe déjà, on te propose de l'écraser en le nommant, ou
d'exporter ailleurs. Jamais d'écrasement silencieux. Si une image ne rend pas,
l'export continue et elle est absente du dossier *et* du manifeste : un
manifeste qui référence un fichier absent serait pire qu'un manifeste incomplet.

### 7. Réglages — à faire une fois, tôt

Trois référentiels que personne d'autre ne peut remplir.

Les périodes d'albums : les 25 albums suspects en tête de liste, avec leur
période actuelle et son origine — saisie ou supposée. Tu édites deux dates.
L'écran te montre ce que racontent les noms de fichiers de l'album et la plage
des dates EXIF écartées, comme des indices, sans jamais pré-remplir les champs.

Les périodes des documents web : les vingt-cinq du périmètre, avec un extrait
pour les reconnaître.

Les noms de pays, à fusionner quand ils font doublon — « Republique de Trinite
et Tobago » et « Trinité-et-Tobago » désignent le même endroit.

L'écran porte aussi l'état du système : dernier import, disponibilité du volume,
avancement des rendus, sélections orphelines.

---

## Les décisions prises, et pourquoi

**Le périmètre est la hiérarchie d'albums, pas les dates.** Le classement à la
main est plus fiable que la date calculée, qui se trompe 745 fois.

**La cascade des dates arbitre EXIF contre album à six mois.** Elle répare les
745 dates fausses ou absentes, et ne laisse aucune photo sans date.

**Une période d'album se corrige à la main.** Parce qu'un préfixe nomme un
début, pas un mois.

**Aucun plafond sur le rapprochement texte-image.** Les dates étant faillibles,
un seuil masquerait autant de bons rapprochements que de mauvais.

**Le rappel prime sur la précision.** Un faux positif coûte un coup d'œil, un
faux négatif coûte une photo qu'on ne retrouvera jamais. Concrètement : sur une
quinzaine de décembre 2000, une lecture stricte renvoie zéro photo là où le
chevauchement en renvoie 273.

**Une inférence ne doit jamais ressembler à une lecture.** Trois couleurs, trois
préfixes, jusque dans le dossier livré. La règle vaut aussi pour les textes :
un texte d'époque, une note d'aujourd'hui et une légende produite par une
machine occupent trois emplacements distincts. Le LLM est le seul consommateur
du dossier et ne peut pas faire la différence tout seul.

**Les tags automatiques portent la recherche par contenu dès le premier jour.**
2 593 mots, dont 1 001 assez sélectifs pour être utiles, et chaque photo en
porte au moins un. Le vocabulaire colle au corpus : `maya` 93 photos, `ruins`
184, `fortress` 83, `gator` 16 pour les Everglades.

**Les légendes générées viennent ensuite, et c'est ton idée.** Décrire chaque
image en une phrase, stocker la phrase, chercher dedans. Moins cher que les
embeddings — pas tant en dollars qu'en infrastructure : la recherche plein texte
française est déjà nécessaire pour les documents, les légendes s'y branchent
sans rien ajouter. Et une légende sert deux fois : elle indexe la photo, et elle
décrit la photo au LLM qui écrira la BD. Un vecteur ne sert qu'une fois.
Compte 10 à 20 dollars pour les 3 925 photos, moitié moins en traitement par
lots.

**Le volume des originaux ne reçoit jamais d'écriture.** Ni lui, ni les bases du
pipeline. Les rendus et les caches vivent sur le disque interne.

**Rien d'humain n'est jamais effacé par un import.** Une sélection dont la photo
a disparu est marquée orpheline et signalée, pas supprimée.

---

## Ce que l'application ne fera pas

**Générer la bande dessinée.** Elle prépare la matière, un LLM écrit.

**Re-dater les photos.** L'outil existe déjà dans `adobe_mcp` et a produit les
758 datations manuelles. Le doubler serait du gâchis. Un export explicite,
déclenché à la main et désactivé par défaut, permettra de renvoyer une datation
vers le pipeline.

**Une carte.** Elle serait vide pour 73 % des photos, et totalement vide pour
1998-1999 et 2004.

**La recherche « plus comme celle-ci ».** Elle demande des vecteurs, donc un
sidecar Python, des poids de modèle et une extension Postgres. Le terrain est
prêt si le besoin se confirme, mais on ne le saura qu'après avoir vécu avec les
légendes.

**Le multi-utilisateur, le partage, le mode hors ligne.** Un utilisateur, une
machine, le serveur à côté.

**L'historique des sélections.** Désélectionner suffit.

---

## Ce qu'il reste à décider

Chacune peut attendre : une valeur par défaut est appliquée, et changer d'avis
plus tard ne casse rien.

**Les 2 041 photos de 2003-2004 que le journal ne couvre pas.** On accepte
qu'elles partent avec tes seules notes, ou tu dates les vingt-cinq documents web
pour ouvrir un rapprochement grossier. *Je ferais les deux : la table est prévue
et vide, la remplir est un geste, pas un prérequis.* Une troisième voie est en
cours d'évaluation : les galeries du site de 2003 associent une légende à une
image précise, et un appariement visuel donnerait un lien direct là où le
journal manque. Rien n'est établi.

**Sélectionner un passage entier, ou seulement une portion surlignée ?** *Entier
en V1 : 1 731 des 1 859 passages font moins de 400 caractères. Passer à la
portion plus tard n'invalide rien.*

**Une date que tu as saisie à la main doit-elle l'emporter sur un EXIF
plausible ?** Le cas est réel : 92 photos portent les deux, et ta date diffère
de l'EXIF sur 69 d'entre elles. *Je dis oui, la main l'emporte : tu voyais
l'EXIF affiché quand tu as tapé, le contredire était le geste. On peut aussi
signaler les 69 désaccords pour que tu les revoies.*

**Quelle période donner à un album « suspect » tant que tu ne l'as pas saisie ?**
Le mois de son préfixe, précis mais trop étroit ; ou son année entière, large
mais qui n'écarte rien à tort. *Le mois, plus la liste des vingt-cinq à revoir.
L'année entière est le repli si la saisie traîne.*

**Faut-il exploiter les dates cachées dans les noms de fichiers ?** 297 fichiers
en portent une — `98-99 maison rose Lisbonne`, `99-03 Les Maldives` — tantôt un
mois, tantôt une plage d'années. Le pipeline les ignore complètement. *Je les
utiliserais comme indice à l'écran de réglage, pas comme règle automatique : la
distinction mois/année est ambiguë sur quelques cas et tu trancheras mieux
qu'une heuristique.*

**Que faire d'une correction d'OCR dont le passage a changé côté pipeline ?**
*La conserver et la marquer à revoir. C'est du travail humain.*

**Afficher les pages du site web ?** Ce sont des fichiers FrontPage, encodage
d'époque et chemins relatifs. *Texte seul en V1 ; à rouvrir si l'appariement
visuel des galeries aboutit.*

**Une bande dessinée peut-elle contenir des photos hors 1998-2004 ?** *Oui, avec
un avertissement. Une photo de 2005 peut légitimement conclure un récit.*

**L'ordre du dossier livré : chronologique ou manuel ?** *Chronologique par
défaut, réordonnable. Avec une réserve : un ordre calculé sur des dates
faillibles se trompera visiblement, donc le réordonnancement manuel mérite
d'arriver tôt.*

Une dernière chose, moins une question qu'un préalable. Avant de lancer le
légendage sur les 3 925 photos, il faut légender vingt photos avec deux ou trois
modèles et comparer. Ça coûte moins d'un dollar et ça tranche le choix du modèle
sur pièces plutôt qu'à l'aveugle — l'écart entre le moins cher et le plus cher
est d'une quarantaine de dollars sur la passe complète, et la légende sert deux
fois.

---

## Annexe — le dossier livré

Un dossier par bande dessinée :

```
<racine>/<nom>/
  manifest.json     le contrat — tout s'y rattache
  README.md         version lisible du manifeste
  images/           les photos retenues, rendues en 1400 px
  pages/            les pages scannées des textes retenus
  textes/           journal.md · ma-vie.md · site-web.md · notes.md
```

Le dossier est autosuffisant : les images et les pages y sont copiées, il
s'envoie tel quel. Ré-exporter une BD inchangée réécrit un dossier identique.

`manifest.json`, réduit à l'essentiel :

```jsonc
{
  "task": {
    "title": "La transat, septembre-octobre 1999",
    "brief": "Trois planches sur Lisbonne-Madère. Ton sobre.",
    "period": { "from": "1999-09-01", "to": "1999-11-30" }
  },
  "images": [{
    "file": "images/05b9a4fa….jpg",
    "album_path": "1998-1999/1999-10 Lisboa Madere",

    // la date, avec ce qu'elle vaut et ce qu'elle sait
    "date": { "start": "1999-10-14", "end": "1999-10-14",
              "precision": "day", "kind": "reading", "source": "exif" },
    "position": { "lat": 32.98, "lon": -16.39, "kind": "inference" },

    "people": ["Hugo"],
    "user_note": "Hugo à la barre, on venait de doubler le Bugio",

    // description produite par une machine — jamais un souvenir
    "caption": { "text": "Un homme barre un voilier, mer formée.",
                 "kind": "machine", "model": "claude-haiku-4-5" }
  }],
  "texts": [{
    "id": "ma-vie/p007/002",
    "document": "ma-vie",
    "page_image": "pages/ma-vie-p007.jpg",
    "text": "…",                 // le texte effectif, corrigé si tu l'as corrigé
    "text_original": "…",        // la transcription d'origine, conservée
    // ce que le texte affirme
    "date": { "from": "1999-09-23", "to": "1999-09-23", "kind": "reading" },
    // la fenêtre qu'il couvre — calculée, jamais affichée comme une date
    "overlap": { "from": "1999-09-23", "to": "1999-09-25", "rule": "B" },
    "covers_images": ["05b9a4fa…"]   // un rapprochement, pas une légende
  }],
  "notes": [{
    "title": "Ce que le journal ne dit pas",
    "text": "…"
  }]
}
```

Trois choses à savoir en le lisant. La date porte toujours sa nature — lue,
calculée, ou décidée par toi — et sa précision. Le texte corrigé et le texte
d'origine coexistent, une correction ne détruit rien. Et `covers_images` dit
qu'un texte et une photo sont contemporains, pas que le texte légende la photo.
