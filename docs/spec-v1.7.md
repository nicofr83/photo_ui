# photo_ui — version 1.7

*Ce que la 1.7 change, du point de vue de celui qui s'en sert. La référence des
règles invariantes reste `docs/frontend-spec.md` ; le seul endroit où la 1.7
touche à l'une d'elles est traité en premier, ci-dessous.*

---

## En bref

La 1.7 fait une seule chose, sur trois écrans à la fois : **elle rend le texte
d'époque saisissable à la main**. Sur le journal de bord, sur « Ma vie », sur les
pages du site — on lit, on prend ce qu'on veut, on le retouche, on en fait une
note.

Le reste suit de là. Le journal devient un tableau, parce qu'un registre se lit
en colonnes. « Ma vie » et le site deviennent du texte qu'on surligne à la
souris, parce qu'un récit ne se découpe pas en lignes. Les filtres de gauche
disparaissent là où ils ne servaient à rien, et l'image gagne la place qu'ils
laissent.

Deux ajouts hors de cette ligne : un commentaire demandé au moment où l'on
retient une photo, et les filtres retenus épinglés en haut de leur liste.

---

## La règle capitale — un texte retouché n'est plus une lecture

C'est le point le plus délicat de cette version, et il vaut pour les trois
sources.

### Ce qui change

Jusqu'ici, une note fabriquée depuis un texte d'époque en était une copie
exacte. La 1.7 laisse retoucher ce texte **au moment de créer la note** : couper
une phrase, corriger une transcription, joindre deux morceaux. Le résultat n'est
plus ce que la page dit. C'est ce que Nicolas dit aujourd'hui à propos de ce que
la page disait.

L'application a déjà la machinerie pour cette distinction, posée en 1.5, et la
1.7 n'en ajoute aucune : une note porte `derivedFrom` — le texte dont elle vient
— et un drapeau **« modifié »**.

### Le traitement, un seul pour les trois sources

**Le texte d'origine est lu par le serveur, jamais fourni par l'écran.** Quand
une note se crée depuis un texte, le serveur va chercher lui-même le texte
effectif de ce texte-là et le range à côté de la note. L'écran n'envoie que ce
que la personne a validé. C'est ce qui rend le drapeau infalsifiable : il ne
dépend pas de ce que le client déclare.

**Le drapeau se calcule, il ne se stocke pas.** À chaque lecture, le corps de la
note est comparé au texte d'origine. Différents ⇒ modifié. Identiques ⇒ verbatim.
Une note retouchée puis remise mot pour mot redevient verbatim, ce qui est exact.

**La comparaison ignore la mise en forme, jamais les mots.** Avant de comparer,
les deux textes sont normalisés : toute suite d'espaces, de tabulations et de
retours à la ligne devient une espace simple, et les extrémités sont rognées.
Sans cette règle, « Ma vie » lèverait le drapeau sur toutes ses notes : son écran
affiche une phrase par ligne, et une sélection verbatim y arrive avec des retours
à la ligne que la page ne contient pas. Un drapeau qui s'allume toujours
n'informe de rien.

**Une note n'est jamais un texte d'époque, retouchée ou non.** Elle part dans
`textes/notes.md`, jamais dans `journal.md`, `ma-vie.md` ou `site-web.md`. Le
manifeste porte sa provenance et son drapeau. Le LLM, seul lecteur du dossier,
lit donc trois choses distinctes : ce que la page dit, ce que Nicolas en dit, et
ce qu'une machine a décrit — dans trois fichiers.

### Ce que voit l'utilisateur

Une note modifiée porte la mention **« modifié »** à côté de son titre. La
déplier montre le texte d'origine en dessous, grisé, avec un bouton
**« Rétablir le texte d'origine »**. C'est exactement le rendu déjà en place
pour une correction de transcription : même disposition, mêmes mots, même geste.
Rien de nouveau à apprendre.

Une note verbatim ne porte aucune mention. L'absence de marque veut dire quelque
chose, et c'est pour ça qu'elle ne doit jamais apparaître à tort.

### Ce que ça n'autorise pas

Retoucher le texte d'une note **ne modifie jamais le texte d'époque**. Corriger
une transcription reste un geste séparé, sur le texte lui-même, global à toutes
les bandes dessinées. Les deux ne se confondent pas : l'un dit « la page dit
autre chose que ce qu'on a lu », l'autre dit « je reprends ce passage à ma
façon ».

---

## Le journal de bord

### Ce qui disparaît

La colonne de filtres de gauche — recherche par texte, année, plage de dates.
Elle disparaît de cet écran. La liste des pages reste, avec sa date, son numéro
et sa vignette.

**Et quand une page est ouverte, la liste des pages disparaît aussi.** L'écran
passe entièrement à la page : l'image en haut, le registre en dessous. Un bouton
**« ← Retour aux pages »** ramène à la liste, à la position qu'elle avait.

### L'image

Elle prend toute la largeur disponible, et sa hauteur va jusqu'à environ les deux
tiers de la fenêtre. Zoom et déplacement restent — 810 × 1250 pixels d'écriture
manuscrite se lisent mal autrement. Le scan reste entier : les deux moitiés,
notes en haut et registre en bas, ne sont jamais découpées.

### Le registre en tableau

Sous l'image, les lignes du registre en tableau. Quatre colonnes :

| Colonne | Largeur | Contenu |
|:--|:--|:--|
| **Date** | 9 rem, fixe | La date de la ligne, rendue selon sa nature |
| **Texte** | tout le reste | Le texte de la ligne |
| **Corriger** | 3 rem, fixe | Une icône crayon, seule |
| **Créer une note** | 11 rem, fixe | Une case à cocher |

**Le texte ne se tronque jamais.** Une remarque de dix lignes occupe dix lignes ;
la ligne du tableau grandit avec elle. Pas d'ellipse, pas de « voir plus » : un
registre se lit, et une phrase coupée au milieu oblige à un clic pour rien. Le
contenu des quatre colonnes est aligné en haut, pour qu'une longue remarque ne
fasse pas flotter sa date au milieu du vide.

**La date porte sa nature, comme partout ailleurs.** Une date lue dans le
registre est verte. Une date héritée d'une page voisine est ambre, en italique,
avec `≈`. Une ligne sans date affiche « sans date », en gris, jamais un jour
inventé. C'est le même composant qui rend toutes les dates de l'application ;
cette colonne ne fait pas exception.

Les lignes alternent un fond très léger, et la ligne survolée s'éclaircit — sur
vingt-cinq lignes serrées, c'est ce qui permet de suivre une ligne de l'œil
jusqu'à sa case à cocher.

L'icône de correction porte une infobulle « Corriger la transcription » et reste
atteignable au clavier. Sur écran étroit, le tableau défile horizontalement dans
son propre cadre plutôt que d'écraser la colonne de texte.

### La case « Créer une note »

Cocher ouvre l'éditeur **aussitôt**, sans confirmation intermédiaire : un champ
de texte pré-rempli avec le texte de la ligne, déjà modifiable, et deux boutons —
**Créer la note** et **Annuler**.

- **Créer la note** l'enregistre et laisse la case cochée.
- **Annuler** referme l'éditeur et **décoche** la case. Rien n'a été créé.
- **Décocher** une case dont la note existe demande confirmation, puis supprime
  la note.

**Une ligne, une note.** L'état coché veut toujours dire « une note existe pour
cette ligne ». Il n'y a pas d'état intermédiaire, pas de case cochée sans note,
pas de note sans case cochée.

Le titre est fabriqué comme aujourd'hui : « journal de bord, page 12 du
04/11/2003 ». Son préfixe reste verrouillé — on écrit après, jamais à la place.

---

## « Ma vie »

Même écran, même disparition des filtres de gauche, même retour à la liste. La
différence est ce qu'on affiche sous l'image.

« Ma vie » n'a pas de registre : c'est un récit. Ses passages sont donc rassemblés
dans **une seule zone de texte**, en lecture, dans l'ordre de la page.

### Une phrase par ligne

Le texte y est présenté à raison d'**une phrase par ligne**. C'est ce qui rend
une sélection à la souris précise sans zoomer : on attrape une phrase entière
sans déborder sur la suivante.

La règle exacte, pour que le découpage soit prévisible :

**On coupe** après `.`, `!`, `?` ou `…`, éventuellement suivis d'une ponctuation
fermante (`»`, `"`, `'`, `)`, `]`), lorsque vient ensuite une espace puis une
majuscule, un chiffre, un tiret de dialogue ou un guillemet ouvrant.

**On ne coupe pas** quand le point appartient à autre chose :
- une abréviation connue — `M.`, `Mme`, `Mlle`, `Dr`, `St`, `Ste`, `cf.`, `etc.`,
  `ex.`, `env.`, `art.`, `n°`, `p.`, `av.`, `bd.`, `Cap.` ;
- une initiale — une seule majuscule suivie d'un point (`J. Cuvillier`) ;
- un nombre décimal ou une heure — `12.5`, `15.32N`, `8h25` ;
- des points de suspension suivis d'une minuscule, qui prolongent la phrase.

**Un texte sans ponctuation terminale reste d'un seul tenant.** On ne coupe
jamais sur une longueur, jamais sur une virgule : mieux vaut une ligne longue
qu'une phrase coupée en deux au mauvais endroit. C'est fréquent dans ce corpus,
et c'est correct.

**Le découpage est un affichage.** Il ne modifie jamais le texte stocké, et une
correction de transcription porte toujours sur le texte d'origine, pas sur sa
version mise en lignes.

### Sélectionner et créer

On surligne à la souris — un mot, une phrase, plusieurs paragraphes. Dès que la
sélection n'est pas vide, un bouton **« Créer une note »** apparaît près d'elle.

Il ouvre le même éditeur que le journal : le texte sélectionné, pré-rempli,
modifiable, avec **Créer la note** et **Annuler**. Le titre reprend la page :
« ma vie, page 7 du 23/09/1999 ».

La sélection arrive dans l'éditeur telle qu'elle est affichée, retours à la ligne
compris. C'est précisément pour ça que la comparaison du drapeau « modifié »
ignore la mise en forme : une sélection verbatim reste verbatim.

---

## Le site web

### Cinq pages, dans l'ordre

L'onglet **Site web** de l'écran des textes ne montre plus la liste des soixante
documents. Il montre **cinq pages**, celles qui portent deux années dans leur
nom :

```
1900-1988.htm · 1998-1999.htm · 1999-2002.htm · 2003-2004.htm · 2005-2006.htm
```

Triées par ordre alphabétique, qui est ici l'ordre chronologique. **Aucun
filtre** : cinq entrées se lisent d'un coup d'œil.

L'écran de datation des passages du site n'est pas supprimé — il reste
accessible depuis son entrée propre. Seule la lecture change ici.

### La page affichée

Cliquer ouvre la page, rendue **assez grande pour être lue** : toute la largeur
disponible, la hauteur de la fenêtre moins l'en-tête, et son propre ascenseur.
Un bouton **« ← Retour aux pages »** ramène à la liste des cinq.

Les pages sont du HTML FrontPage 2003 en `windows-1252`. Le serveur les transcode
en UTF-8 et retire leurs scripts de navigation avant de les servir ; les images
et feuilles de style suivent par leur propre point d'accès. L'affichage se fait
dans un cadre isolé, sans exécution de script — la page se lit et se sélectionne,
elle ne fait rien d'autre.

Ce sont les seules pages du site que la 1.7 affiche. Si une image manque, la page
s'affiche quand même, avec son trou : une page de texte lisible vaut mieux qu'un
écran vide.

### Sélectionner et créer

Comme « Ma vie » : on surligne, un bouton **« Créer une note »** apparaît, le
même éditeur s'ouvre avec le texte pré-rempli et modifiable.

Le titre nomme la page : « site web, 1998-1999 ». Pas de numéro de page — ces
documents n'en ont pas, et on n'en invente pas.

---

## Retenir une photo, et dire pourquoi

Sur l'écran des images, retenir une photo demande maintenant un commentaire.

Au clic sur la coche, un **champ apparaît sous la vignette**, déjà au focus. On
tape, **Entrée** valide. **Échap** referme le champ et **laisse la photo
retenue**, sans commentaire.

Pas de fenêtre modale, et c'est le point qui a décidé de la forme : retenir
quarante photos d'affilée doit rester fluide. Une modale à ouvrir et fermer
quarante fois transformerait le geste principal de l'application en corvée.

Le commentaire est celui qui part avec la photo dans le dossier livré. Il reste
**visible et modifiable sur l'écran Revue**, où l'on relit ce qu'on a retenu.

Décocher une photo retire sa sélection et son commentaire ; le refaire demande
confirmation si un commentaire existait, parce qu'il ne se retrouve pas.

---

## Les filtres retenus, en haut de leur liste

Sur l'écran des images, les listes de **tags**, de **personnes** et de **lieux**
changent d'ordre.

**Ce qui est coché monte en haut**, dans un bloc épinglé qui ne défile pas avec
le reste. En dessous, la liste complète, **par ordre alphabétique** — et non plus
par sélectivité. On cherche un mot qu'on connaît ; on le cherche là où l'alphabet
le range.

**Le bloc épinglé ne peut pas manger l'écran.** Il s'arrête à **six lignes**.
Au-delà, il défile dans son propre cadre et affiche « et N autres » : la liste
principale garde toujours au moins la moitié de la hauteur du panneau. Un
sélecteur qui se réduit à une fente parce qu'on a coché douze tags serait pire
que pas d'épinglage du tout.

Décocher depuis le bloc épinglé retire l'entrée du bloc et la remet à sa place
alphabétique, sans faire sauter la liste.

---

## Comment se rendent les trois états

Comme pour les dates : au pixel, et sans avoir à réfléchir.

**Un extrait fidèle** — la note est bordée à gauche d'un filet plein, son texte en
romain, et sous elle une ligne discrète : « extrait de *journal de bord, page 12
du 04/11/2003* ». C'est le rendu d'une citation, et il dit d'où elle vient.

**Un texte réécrit** — même bloc, mais le filet est **pointillé**, et la ligne du
dessous porte la mention **« reformulé »** avant la provenance. Un bouton
« Voir le texte d'origine » déplie l'instantané, grisé, avec « Rétablir le texte
d'origine ». Le pointillé est le signal qu'on lit sans lire : ce bloc ne se cite
pas.

**Une note écrite de zéro** — aucun filet, aucune mention, aucune provenance.
L'absence de marque est elle-même l'information : cette note n'a jamais prétendu
venir d'une page.

**Une source corrigée depuis** ajoute, sur les deux premiers états, un bandeau
d'une ligne : « la source a été corrigée depuis » et le bouton « Reprendre le
texte corrigé ». Il ne remplace pas le filet, il s'ajoute — l'état de la note et
l'état de sa source sont deux informations distinctes.

Ces trois rendus ne réutilisent **ni les couleurs ni les glyphes des dates**. Le
vert, l'ambre `≈` et le violet `✓` qualifient la nature d'une date et rien
d'autre ; les emprunter pour qualifier un texte ferait deux vocabulaires d'une
seule grammaire.

---

## Ce que la 1.7 change dans le dossier livré

Deux affirmations du contrat de livraison deviennent fausses. Voici ce qui les
remplace.

### Une note peut désormais porter une voix d'époque

Le contrat dit aujourd'hui de `notes[]` : « écrites par Nicolas aujourd'hui,
pour ce que les documents ne disent pas — la seule donnée du système qui
n'existe nulle part ailleurs ». La 1.7 crée des notes pré-remplies avec un texte
d'époque. La phrase ne tient plus, et il faut la remplacer par une règle qui se
vérifie plutôt que par une catégorie qui se déclare.

**Le piège à éviter.** Le couple `text` / `text_original` avec `corrected: true`
existe déjà, mais il désigne autre chose : la correction d'une erreur de
transcription, globale à toutes les tâches, qui **rapproche** le texte de ce que
la page dit. La retouche de la 1.7 est locale à une tâche et **s'éloigne** de la
source. Les faire voisiner dans le même champ ferait citer une phrase réécrite
aujourd'hui comme voix de 1999.

**La règle, une seule, et elle se vérifie.** Une note est **citable comme voix
d'époque** quand son texte, une fois les espaces normalisés, est un extrait
contigu du texte effectif actuel de sa source. Sinon c'est une note, et rien de
plus.

Elle a trois propriétés qui valent d'être dites :

- **Elle ne se déclare pas, elle se contrôle.** Le serveur détient le texte de la
  source ; il vérifie l'affirmation au lieu de la croire. Un client ne peut pas
  faire passer une phrase réécrite pour une citation.
- **Elle tolère la coupe, pas la réécriture.** Retirer la dernière phrase d'une
  citation la laisse citable — c'est toujours un extrait fidèle. Changer un mot
  la fait sortir. C'est le bon partage : couper est un geste d'éditeur, réécrire
  est un geste d'auteur.
- **Elle règle le cas tordu sans règle supplémentaire.** Voir plus bas.

`derivedFrom` est **toujours présent** dans le manifeste, `null` compris. Son
absence ne doit jamais devenir le signal — une note écrite de zéro le dit en
portant `null`, pas en omettant le champ.

### Les trois états, et ce que le générateur a le droit d'en faire

| État | Le manifeste | Ce que le générateur peut faire |
|:--|:--|:--|
| **Note écrite de zéro** | `derived_from: null` | Elle oriente le travail. Jamais une citation d'époque. Règle inchangée. |
| **Extrait fidèle** | `derived_from` renseigné, `quotable: true` | **Citable et attribuable**, exactement comme un `texts[]`. L'attribution est le document et la page nommés par `derived_from`. |
| **Texte réécrit** | `derived_from` renseigné, `quotable: false` | **Jamais entre guillemets, jamais attribué à une voix d'époque.** Sa matière est utilisable ; ses mots ne sont pas ceux de la page. |

`derived_from` porte `{ kind, id, text }` — la référence **et** l'instantané pris
à la copie. Et l'export émet **en plus** la source dans `texts[]`. Les deux, et
ce n'est pas une redondance : ce sont les **deux points de comparaison** dont le
dossier a besoin. L'instantané dit ce qui a été copié, figé ; l'entrée de
`texts[]` dit où en est la source aujourd'hui.

**Les deux drapeaux se contrôlent chacun contre l'un des deux, jamais l'un
contre l'autre.** C'est toujours le **corps de la note** qui est l'opérande de
gauche :

| | Opérande de gauche | Opérande de droite |
|:--|:--|:--|
| `edited_since` | le corps de la note | l'**instantané** |
| `quotable` | le corps de la note | la **source actuelle** |

Comparer l'instantané à la source serait une troisième question, et personne ne
la pose. La poser à la place de `quotable` casserait le cas de la citation
tronquée : sur une sélection libre, l'instantané est un fragment de la page, donc
il ne sera jamais égal à sa source, et aucune note tirée d'une page ne serait
plus citable. Un dossier privé d'un des deux côtés rend l'un des deux drapeaux
invérifiable — c'est pour ça qu'il porte les deux.

`edited_since` et `quotable` disent deux choses différentes, et il faut les deux :

- **`edited_since`** répond « la personne a-t-elle touché au texte après l'avoir
  copié ? ». Le serveur compare le corps de la note à l'instantané pris à la
  copie.
- **`quotable`** répond « le générateur peut-il citer ceci comme voix d'époque ? ».
  Le serveur vérifie que le corps, espaces normalisés, est un extrait contigu du
  texte effectif **actuel** de la source.

Elles coïncident presque toujours, et divergent dans deux cas qui comptent. Une
citation **tronquée** est `edited_since: true` et `quotable: true` — couper reste
fidèle. Une note **intacte dont la source a été corrigée depuis** est
`edited_since: false` et `quotable: false` — c'est le cas tordu ci-dessous. C'est
`quotable` que le générateur obéit ; `edited_since` explique pourquoi.

### Le cas tordu : la source corrigée après coup

Une note est tirée d'un passage. Plus tard, une erreur de transcription est
corrigée dans ce passage, globalement. La note garde son instantané.

**La règle y répond seule** : l'instantané n'est plus un extrait du texte
effectif actuel, donc `quotable` passe à `false`. La note cesse d'être citable
comme voix d'époque — ce qui est exact, puisqu'elle reproduit mot pour mot une
lecture que Nicolas a lui-même déclarée fausse. Citer « deux ns » après avoir
corrigé en « deux ris » serait remettre l'erreur dans le livrable.

Ce n'est pas une perte : l'écran signale la note d'un **« la source a été
corrigée depuis »** avec un bouton **« Reprendre le texte corrigé »**. Un clic,
et la note redevient un extrait fidèle. Tant que Nicolas ne l'a pas fait, le
dossier reste prudent plutôt que faux.

### Ce que l'export doit émettre, et pourquoi c'est bloquant

Le manifeste ne porte aujourd'hui, pour une note, que `id`, `created_at`,
`title`, `text` et `attached_to`. **Ni la provenance, ni le drapeau.** Le
mécanisme infalsifiable du serveur s'arrête donc à la frontière de l'API : dans
le dossier que lit le générateur, une note recopiée mot pour mot d'une page de
1999 est **indiscernable** d'une note tapée ce matin.

Additionné au reste de la 1.7, c'est une régression sérieuse. Puisque la case du
registre crée une note au lieu de retenir un texte, tout le texte d'époque
arriverait en `notes[]` — dont le contrat dit « jamais une citation d'époque ».
Le générateur se verrait interdire de citer le journal de bord comme voix du
récit, ce qui est l'inverse exact du but de l'outil. La règle capitale
tomberait par la seule porte que personne ne surveillait : l'export.

Trois choses à poser, et les trois sont nécessaires.

**1. `notes[]` porte la provenance.** `derived_from: { kind, id, text } | null`,
`edited_since: boolean`, `quotable: boolean`. **Toujours présents**, `null` et
`false` compris : une note écrite de zéro les porte explicitement. Un champ dont
l'absence signifierait quelque chose se lirait un jour à l'envers.

**2. L'export émet dans `texts[]` la source de toute note qui en dérive**, même
si Nicolas ne l'a pas retenue — en plus des textes déjà attachés à la tâche.
Trois raisons, dans cet ordre :

- **`quotable` redevient auditable.** Tout le raisonnement de cette spec tient
  sur « ça se contrôle, ça ne se déclare pas ». Sans la source dans le dossier,
  le générateur reçoit un booléen qu'il doit **croire** : la garantie s'arrête au
  serveur et redevient déclarative à la sortie. Avec elle, il refait le test
  lui-même — le texte de la note est-il un extrait contigu de celui de la
  source ?
- **Sans elle, le texte d'époque arriverait sans ancrage.** Une entrée de
  `texts[]` porte sa `date` avec son `kind` et sa `source`, son `page_image`, et
  ses `covers_images` — les propositions de rapprochement texte ↔ photo, qui sont
  le produit de tout le travail de datation. Une note tirée d'une entrée de
  journal, seule, perdrait la date de cette entrée et tous ses rapprochements.
- **`journal.md` retrouve du contenu.** C'est vrai, et c'est la moindre des trois
  raisons.

Ce qui est émis dépend de ce que `derived_from` nomme. Un passage ou une ligne
de registre : cette unité. Une **page** — le cas de la sélection libre — : les
passages de cette page que la sélection recouvre, et eux seuls. Le serveur les
connaît, puisqu'il a localisé l'extrait dans le texte de la page pour le
vérifier. Une sélection de deux phrases ne fait donc pas entrer trente passages
dans le dossier.

**Un texte n'apparaît qu'une fois.** Deux notes tirées du même passage, ou un
passage à la fois retenu par Nicolas et source d'une note, ne produisent qu'une
seule entrée. `texts[]` reste une liste de textes, pas une liste de raisons de
les inclure.

Un texte émis pour cette raison est un `texts[]` ordinaire : rien ne le
distingue, et rien ne doit le distinguer. Il **est** un texte d'époque, arrivé
là par un autre chemin.

**C'est une règle d'export, invisible à l'usage.** Nicolas ne fait toujours
qu'un geste, l'écran ne change pas, et aucune case supplémentaire n'apparaît.
Le dossier, lui, reçoit les trois natures de texte à leurs trois places.

**3. La règle de citabilité, écrite pour le générateur.** C'est le tableau des
trois états ci-dessus, et il **remplace** la phrase du contrat de livraison
« une note n'est jamais une citation d'époque ». Elle ne se nuance pas, elle se
remplace : une note dont `quotable` est vrai est un texte d'époque, citable et
attribuable au même titre qu'un `texts[]`.

Une note citable ne dispense pas des autres règles : `covers_images` reste une
proposition, une date `inference` ne s'affiche pas, et la consigne de l'auteur
commande.

### La sélection libre, et pourquoi elle ne casse pas la garantie

Sur le journal, une note vient d'une ligne identifiée : le serveur va lire cette
ligne et compare. Sur « Ma vie » et sur le site, la personne surligne où elle
veut — la sélection peut couvrir deux passages, ou la moitié d'un.

`derived_from` nomme alors la **page** — `{ kind: "page", id: "ma-vie/p007" }` —
et non un passage. La vérification reste entière : le serveur détient le texte de
la page entière, et contrôle que la sélection en est bien un extrait contigu.
C'est ce qui permet une sélection libre sans que le client puisse rien affirmer
que le serveur ne vérifie.

### Le site web : identifiants, et pas de page embarquée

**Les identifiants ne changent pas.** Les cinq pages sont déjà cinq documents du
corpus : un passage porte `document: "web/1998-1999"` et `id:
"web/1998-1999/003"`. La seule correction à faire au contrat de livraison est
que `document` s'écrit `web/<chemin sans extension>` — ce qui couvre aussi bien
`web/1998-1999` que `web/1999/Transat` — et non `web/<année>/<doc>`, forme trop
étroite qui ne décrit pas les cinq pages.

**Le dossier n'embarque pas les pages du site**, et `page_image` reste `null`
pour elles. Trois raisons, dans cet ordre :

- **Une image de page sert à vérifier une transcription.** Le journal et « Ma
  vie » sont manuscrits : on confronte le texte au scan parce que la lecture peut
  se tromper. Le texte du site est extrait d'un fichier HTML — il n'y a pas de
  lecture à vérifier, donc rien à confronter.
- **Une page FrontPage n'est pas un fichier, c'est une arborescence.** Thèmes,
  gifs de navigation, feuilles de style, chemins relatifs. L'embarquer voudrait
  dire inliner tout ça, et livrer un document que le générateur serait tenté de
  *rendre* au lieu de le lire.
- **Une capture d'écran romprait l'idempotence.** Elle dépendrait d'un
  navigateur, de ses polices et de sa version ; ré-exporter une tâche inchangée
  ne redonnerait pas le même octet. La garantie vaut mieux que l'image.

Ce que le dossier gagne à la place : `textes/site-web.md` **groupe les passages
par page**, dans l'ordre des pages, avec un titre par page. La page devient une
unité lisible du dossier sans qu'aucun fichier ne soit embarqué — et
l'autosuffisance reste vraie sans effort, puisque rien ne référence une image qui
n'existe pas.

---

## Ce que la donnée et la plateforme imposent

**La sélection dans une page du site se lit depuis le document parent.** C'est
ce qui permet au bouton « Créer une note » de savoir ce qui est surligné. Ça
suppose que la page reste de même origine que l'application, ce que le cadre
isolé accorde tout en refusant l'exécution des scripts. Les deux vont ensemble :
sans la même origine, la sélection serait invisible ; sans le blocage des
scripts, du code FrontPage de 2003 tournerait dans l'application.

**Le découpage en phrases est une heuristique, et se trompera.** Sur un corpus
manuscrit transcrit, il restera des cas — une abréviation qu'on n'a pas listée,
une phrase sans point. C'est acceptable parce que la conséquence est une ligne
mal coupée à l'affichage, jamais une donnée altérée : le texte stocké est
intact, et la sélection reste libre au caractère près.

**Les lignes du registre ne portent pas toutes une date.** Une ligne qui n'en a
pas affiche « sans date », et son éventuelle note en portera un titre sans jour
— « journal de bord, page 1 ». Aucun jour n'est fabriqué pour compléter un
titre.

---

## Hors périmètre de la 1.7

**La correction du texte d'époque depuis l'éditeur de note.** Les deux gestes
restent séparés : retoucher une note ne change rien à la transcription.

**Le rendu des cinquante-cinq autres documents du site.** Seules les cinq pages
à deux années sont affichées. Les autres restent accessibles par l'écran de
datation.

**La création d'une note depuis plusieurs pages à la fois.** Une note vient
d'une page, d'une ligne ou d'une sélection ; assembler plusieurs sources dans
une même note se fait en la retouchant après coup.

**Le découpage en phrases sur le journal de bord.** Le registre est déjà découpé
en lignes par la transcription ; le redécouper n'aurait pas de sens.

---

## Les amendements au contrat

**Trois, et deux d'entre eux précisent une règle existante plutôt que d'en
ajouter une.**

**La comparaison normalise les espaces.** Le drapeau « modifié » compare les deux
textes après avoir réduit toute suite d'espaces, tabulations et retours à la ligne
à une espace simple, extrémités rognées. Sans lui, l'écran « Ma vie » marquerait
comme retouchée toute note prise verbatim : il affiche une phrase par ligne, donc
une sélection fidèle y arrive avec des retours à la ligne que la page ne contient
pas. Un drapeau qui s'allume toujours n'informe de rien.

**`derivedFrom` accepte une page comme source.** Aujourd'hui il nomme un texte
— un passage, une entrée de registre. La sélection libre de « Ma vie » et du site
peut couvrir deux passages ou la moitié d'un, et ne correspond alors à aucun.
`derivedFrom` accepte donc `{ kind: "page", id: "ma-vie/p007" }`, et le serveur
vérifie la sélection contre le texte de la page entière. **C'est le seul ajout de
vocabulaire de la 1.7**, et il est nécessaire : sans lui, une note issue d'une
sélection libre n'aurait aucune provenance vérifiable, et il faudrait croire le
client sur parole.

**Le manifeste porte la provenance d'une note, et l'export émet sa source.**
`notes[]` gagne `derived_from: { kind, id, text } | null`, `edited_since:
boolean` et `quotable: boolean` — **toujours présents**, `null` et `false`
compris. Et l'export émet dans `texts[]` la source de toute note qui en dérive,
même non retenue, dédoublonnée avec les textes déjà attachés. Les deux sont
nécessaires : l'instantané fige ce qui a été copié, l'entrée de `texts[]` porte
l'état actuel de la source avec sa date et ses rapprochements, et `quotable` est
la comparaison des deux — qu'un dossier privé de l'un des côtés ne permettrait
plus de refaire.

`quotable` est **calculé à la lecture**, jamais stocké : le texte de la note,
espaces normalisés, est-il un extrait contigu du texte effectif actuel de sa
source ? Un booléen stocké pourrait mentir après une correction de transcription
— celui-là ne le peut pas, et c'est précisément ce qui fait qu'une source
corrigée après coup retire d'elle-même la citabilité.

## Ce qui ne change pas

**Une inférence ne ressemble jamais à une lecture.** Le tableau du registre rend
ses dates par le même composant que tout le reste : vert pour une lecture, ambre
avec `≈` pour une inférence, violet pour une date arbitrée.

**Trois natures de texte, trois emplacements.** Une note reste une note, même
quand elle recopie mot pour mot.

**Ce que le geste établit décide de la nature**, pas qui a agi. Retoucher un
texte au moment d'en faire une note est un geste d'aujourd'hui ; il produit une
note, pas un texte d'époque corrigé.

---

## Le périmètre, tranché

La case du registre ne retient plus un texte : elle crée une note. C'est le
choix de Nicolas, énoncé deux fois — il a renommé la colonne lui-même, et il a
retenu « ouvre l'éditeur aussitôt » quand les deux variantes lui ont été
posées. Une seule commande, pas de seconde colonne.

Ce que cela impliquait — plus rien n'alimente `journal.md` — n'est plus vrai,
et c'est l'export qui le règle : **la note tire sa source avec elle**. Nicolas
fait un geste, le dossier reçoit les trois natures de texte à leurs trois
places, et aucune référence ne pend.
