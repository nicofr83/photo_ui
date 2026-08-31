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

**Un seul, et il précise une règle existante plutôt que d'en ajouter une :** la
comparaison qui lève le drapeau « modifié » **normalise les espaces** des deux
côtés avant de comparer — toute suite d'espaces, tabulations et retours à la
ligne devient une espace simple, extrémités rognées. Sans lui, l'écran « Ma vie »
marquerait comme retouchée toute note prise verbatim.

Le reste s'appuie sur ce qui existe déjà : `derivedFrom` et le drapeau (1.5), le
commentaire par photo retenu (1.6), et les trois points d'accès aux pages du
site livrés par le serveur.

---

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

## Question restée ouverte

Une seule, et elle est de périmètre, pas de conception.

**Sur le journal de bord, la case à cocher change de sens.** Elle voulait dire
« retenir ce texte pour la bande dessinée » — c'est elle qui remplit `journal.md`
dans le dossier livré. Elle veut maintenant dire « créer une note », et la note
part dans `notes.md`.

La conséquence : **plus rien, sur cet écran, n'alimente `journal.md`**. Le texte
d'époque du journal n'arrivera au LLM que recopié dans des notes, avec leur
provenance et leur drapeau — ce qui est fidèle, mais range tout le corpus dans
un seul fichier au lieu de trois.

Deux lectures possibles, et je ne tranche pas seul :

- **(a)** C'est voulu. Les notes deviennent le seul canal, `journal.md` et
  `ma-vie.md` se vident, et le dossier livré porte le texte d'époque dans
  `notes.md` avec sa provenance. *C'est cohérent, et le manifeste garde tout ce
  qu'il faut pour distinguer une citation d'un commentaire.*
- **(b)** Les deux gestes coexistent : la case crée une note, et une seconde
  commande — un bouton par ligne, ou une sélection multiple — retient le texte
  pour le dossier sans en faire une note.

*Ma recommandation : **(a)** pour la 1.7.* La 1.5 avait déjà décidé que créer
une note ne coche pas le texte, précisément pour qu'un même passage ne parte
jamais deux fois. Faire de la note le canal unique va dans le même sens, et une
deuxième commande par ligne alourdirait un tableau qu'on vient de dessiner pour
qu'il soit lisible. Si `(b)` est retenu, il faut dire où vit la seconde commande
avant que `front` ne dessine le tableau.
