# photo_ui — version 1.5

*Ce que la 1.5 change, du point de vue de celui qui s'en sert. La référence des
règles invariantes reste `docs/frontend-spec.md` ; rien ici ne les contredit.*

---

## En bref

Quatre choses changent.

**L'écran des textes est refondu.** On n'y liste plus des passages à la file :
on liste des **pages**, avec leur date et leur image en vignette, on filtre par
période et par mot, on ouvre celle qu'on veut. Le site web y entre comme
troisième source, à côté du journal de bord et de « Ma vie ».

**Un écran apparaît** pour donner une date aux pages du site, qui n'en portent
aucune. Il s'ouvre sur des dates proposées, déduites des photos que ces pages
contiennent.

**Une sous-page « Consigne »** s'installe entre Textes et Revue, et la Revue
montre enfin les photos qu'elle exporte.

**On peut fabriquer une note à partir du texte d'une page.** C'est le pont qui
manquait entre lire et écrire.

Le reste est de l'ajustement : un panneau d'albums utilisable, des en-têtes qui
ne défilent plus, des réglages qui disent où les choses sont écrites.

---

## La navigation

Une tâche a maintenant quatre sous-pages :

```
Images | Textes | Consigne | Revue
```

Chacune garde son URL propre — `/images/:slug`, `/textes/:slug`,
`/consigne/:slug`, `/revue/:slug` — rechargeable et partageable seule.

---

## Les en-têtes fixes

Partout, ce qui sert à se repérer et à agir reste à l'écran ; ce qui se consulte
défile.

| Écran | Reste fixe | Défile |
|:--|:--|:--|
| **Images** | la barre des quatre sous-pages, les trois compteurs (résultats, sélectionnés, écartés) | la colonne des filtres et la grille, indépendamment l'une de l'autre |
| **Textes** | la barre, le choix de la source, le champ de recherche, le compteur de résultats | la colonne des filtres et la liste des pages, indépendamment |
| **Consigne** | la barre seule — l'écran est court | tout le reste |
| **Revue** | la barre, le titre, le bandeau des huit compteurs, le bouton d'export et son rapport | la chronologie et les listes |
| **Réglages** | le titre et le champ de recherche | les listes |

Le bandeau « volume absent » est global : il reste en tête de toutes les pages,
au-dessus de tout. C'est une information qui invalide l'export ; la faire
défiler hors de vue serait la cacher précisément quand elle sert.

---

## L'écran des images

Seul le panneau de gauche change.

**Les albums s'affichent avec leur chemin complet** — « 1998-1999 / 1998-02-
Maison rose Algès » — et non plus la seule feuille. La liste est triée sur ce
chemin ; l'afficher rend l'ordre lisible, et les albums nommés simplement
« 2000 » cessent d'être énigmatiques. Le tri passe à une comparaison qui
respecte la casse, pour que `2003-03-everglades` et `2003-03-Fort Lauderdale` ne
s'inversent plus selon leur majuscule.

**Un champ de filtrage** coiffe la liste. Il cherche n'importe quelle portion du
chemin, insensible à la casse et aux accents dans les deux sens : « Alges »
trouve « Algès », « BVI » trouve les trois albums BVI. Il ne défile pas avec la
liste. Les albums cochés restent épinglés en tête même quand le filtre les
exclut, pour qu'on ne décoche jamais à l'aveugle.

Le panneau passe à 26 rem et la liste occupe toute la hauteur restante de la
colonne, le champ collé en haut.

Le même champ coiffe les listes de tags, de personnes et de lieux : elles sont
bien plus longues que les 82 albums — 2 593 tags distincts — et le besoin y est
plus fort.

---

## L'écran des textes

C'est la refonte principale.

### Trois sources, un bouton

Un bouton global choisit la source : **journal de bord**, **Ma vie**, **site
web**. Une seule à la fois. Chacune a sa granularité de date et son statut ;
elles ne se mélangent jamais.

### La liste de pages

L'écran liste des pages : sa date, sa vignette, son numéro, le nombre de textes
qu'elle porte. On clique pour l'ouvrir.

**La date d'une page** est celle que la page porte elle-même — une lecture,
rendue en vert. Quand la page ne dit rien, la date vient de la page précédente —
une inférence, rendue en ambre italique avec `≈`. Toujours une date, toujours sa
nature visible.

Le détail par source, parce qu'elles ne se ressemblent pas :

- **Journal de bord.** Un scan porte deux pages séparées par la reliure : en
  haut des notes libres et des souvenirs collés, en bas le registre réglé avec
  ses colonnes *Date · Cap · Vent · Loc. · Baro · Moteur · Position ·
  Remarques*. **C'est le registre qui date la page** : il fait autorité, c'est
  le document officiel, tenu dans l'ordre. Les notes du haut ne déplacent jamais
  cette date — un billet de musée collé après coup n'étire pas la période d'une
  page. Une page sans aucune ligne de registre prend la date lue dans ses notes ;
  à défaut, elle hérite de la page précédente. En pratique 49 pages ont un
  registre et 3 ont des notes datées : l'héritage ne se déclenche jamais ici,
  mais la règle reste la même que sur les deux autres sources.
- **Ma vie.** La date vient des passages de la page. Vingt-deux pages sur 103
  n'en portent aucun : elles héritent de la page d'avant, et s'affichent donc en
  ambre.
- **Site web.** Aucune page n'est datée nativement. La date vient de l'écran de
  datation, et se propage à la page suivante par le même héritage. Une page que
  rien ne date reste sans date, et le dit.

L'héritage ne remonte jamais le temps : une page hérite de la précédente, jamais
de la suivante. Les pages antérieures à la première date connue d'une source
restent donc sans date.

**L'ordre par défaut est chronologique**, avec une bascule vers l'ordre du
cahier — utile quand on travaille le document ouvert devant soi et qu'on cherche
« la page 12 ». La bascule est mémorisée par source.

**La vignette est le scan entier, réduit.** Pas de rognage : on voit le haut et
le bas. Elle est produite par le serveur, jamais servie en pleine taille avec
une largeur CSS — les 155 scans font 300 Ko pièce, et une liste entière de
« Ma vie » représenterait 31 Mo.

Le site web n'a pas de scan. Sa liste montre le titre du document et son nombre
de passages, et dit que la page d'origine n'existe pas en image.

### La page ouverte

L'image entière à droite, avec zoom et déplacement. À gauche, les textes,
**séparés par nature**.

Sur le journal, deux blocs : **« Registre »** et **« Notes de bord »**, chacun
avec sa numérotation de ligne. C'est ce qui explique que la ligne 11 existe deux
fois avec un contenu différent : c'est la ligne 11 du haut et celle du bas.

Chaque texte garde tout ce qu'il avait : sa coche de sélection, son bouton de
correction, sa confiance de transcription, et le nombre d'images qu'il recouvre —
cliquable, il ouvre la grille pré-filtrée. C'est le seul pont texte → photos de
l'application.

**La sélection reste au texte**, pas à la page. La liste de pages sert à
naviguer ; on ouvre, on coche ce qu'on veut. C'est ce qui remplit `journal.md`,
`ma-vie.md` et `site-web.md` dans le dossier livré.

### Les filtres

Une colonne à gauche, deux axes.

**Par date.** Une multi-sélection d'**années** entières, cumulables, ou une
**plage unique** plus fine (année/mois, ou année/mois/jour) — jamais les deux à
la fois. Le sélecteur ne propose que ce que la source contient réellement : sur
« Ma vie », qui couvre d'août à novembre 1999, l'année n'a qu'un bouton et les
jours proposés sont les 81 renseignés. Une année vide n'est pas offerte.

Le filtre porte sur les **textes** : une page apparaît dès qu'un de ses textes
tombe dans la plage. C'est la lecture qui rappelle le plus, et la seule qui
s'appuie sur des dates certaines.

Un compteur dit combien de textes sans date le filtre a écartés, avec un geste
pour les ramener — 341 dans le journal, 121 dans « Ma vie », et la totalité du
site tant qu'il n'est pas daté. Rien ne disparaît en silence.

Sur le site web, tant qu'aucune date n'est saisie, le bloc des filtres de date
est désactivé et dit pourquoi : aucun de ses textes n'est daté. Un filtre
désactivé qui donne sa raison enseigne quelque chose ; un filtre masqué laisse
croire qu'on a mal cherché.

**Par texte.** La recherche porte sur la source active. Elle cherche dans le
texte **effectif**, corrigé s'il l'a été. Le résultat reste une liste de pages :
celles qui contiennent une correspondance, avec leur nombre d'occurrences et
l'extrait surligné.

Sur le site web, la recherche par texte est le filtre principal, et l'écran le
présente comme tel plutôt que comme une source diminuée.

Les passages du site de moins de 40 caractères — titres, fragments de menu
FrontPage — sont masqués derrière un compteur « N fragments masqués » avec un
geste pour les montrer. Un menu de navigation n'est pas un texte d'époque.

### Créer une note depuis un texte

On coche un ou plusieurs textes, un bouton fabrique une note qui **recopie** le
texte. Elle reste éditable ensuite, comme n'importe quelle note.

**Le titre porte l'attribution** : « journal de bord, page 12 du 04/11/2003 »,
où la date est celle de la page. Sur le site, qui n'a pas de page :
« site web, Vers Trinidad », avec la plage entre parenthèses si elle a été
saisie. Jamais un jour fabriqué.

Ce préfixe est **verrouillé**. On écrit ce qu'on veut à la suite, on ne peut pas
l'effacer. Le verrou est tenu par le serveur, qui refuse une modification
l'altérant : `PATCH /tasks/:slug/notes/:noteId` accepte aujourd'hui n'importe
quel titre, et un verrou d'interface ne protégerait rien.

La note **recopie et rattache** : le lien vers le texte d'origine reste, ce qui
permet de retrouver l'original même après l'avoir retravaillé.

Créer une note **ne coche pas** le texte d'origine. Sous la recopie, la note
*est* le texte ; l'envoyer aussi dans `journal.md` ferait lire au LLM un doublon
comme deux sources concordantes.

Une note appartient à la tâche courante. Le bouton n'existe pas hors tâche.

### Les légendes de galerie

Deux cent cinq textes du site sont rattachés à une photo précise par empreinte
visuelle, et non par date. Elles sont **indicatives** : elles ne se filtrent
pas, ne se relisent pas, ne se sélectionnent pas, ne partent pas dans le dossier
livré.

Elles servent deux fois : dans l'écran de datation, pour reconnaître une page,
et **au survol d'une photo**, qui montre sa légende d'époque et rien d'autre.

La légende produite par une machine, quand le légendage existera, vit dans le
panneau de détail et porte son origine. Les deux ne se croisent jamais.

---

## L'écran de datation du site

Accessible depuis la page principale. Il donne une date aux pages du site, qui
n'en portent aucune — ce qui ouvre 2003-2004, la période où le journal est muet
devant 2 041 photos.

**Une seule date par page**, celle du début. La fin est donnée par la page datée
suivante ; les pages non datées entre les deux héritent de la dernière datée
avant elles. C'est le même mécanisme que sur les deux cahiers, appliqué à une
source qui n'a aucune date.

**Ce sont les dates saisies qui font l'ordre.** Le site n'a pas de numéro de
page, et l'ordre de ses fichiers n'est pas celui du temps : une page rangée dans
`1999/` date de décembre 2001, une autre rangée dans `2005/` date de mai 2003.
On date ce qu'on reconnaît, la suite se déduit de ces dates. Les rebuts,
gabarits vides et fichiers hors sujet restent sans date et sortent d'eux-mêmes.

**L'écran propose une date** pour 27 pages, déduite des photos qu'elles
contiennent — 227 liens vers 224 photos, dont 221 vers des photos datées.

La proposition n'est **jamais écrite dans le champ**. Elle s'affiche à côté,
avec un bouton « adopter cette date » qui la recopie en un clic. C'est la règle
de tout l'outil : les indices d'aide à la saisie sont présentés comme des
indices, jamais pré-remplis, parce que ce sont exactement les données que
l'arbitrage a jugées peu fiables.

**Elle dit sur quoi elle repose**, parce que sa qualité varie énormément :
combien de photos la soutiennent, combien sont datées au jour, et la largeur de
leur fourchette. « 20 photos, toutes au jour, sur 9 jours » n'est pas
« 1 photo, au mois ». Les onze galeries de 2003-2004 sont soutenues à 100 % par
des dates lues au jour, sur des fourchettes de 0 à 21 jours ; les sept pages de
1999-2002 s'appuient presque uniquement sur des dates calculées au mois.

**La date saisie est une inférence**, en ambre italique avec `≈`. Poser une date
sur un document qui n'en porte aucune comble un vide : c'est une conjecture,
même informée par une proposition. Ce qui distingue « proposé » de « saisi » est
un état affiché, pas une couleur.

L'écran ne liste que les pages du **périmètre 1998-2004** ; le reste est derrière
un « voir tout ». Sur les 60 documents, seize sont une liste de noms, un est un
fichier de vérification Google, un autre s'appelle « bidon » et porte un seul
passage, et une vingtaine sont hors corpus. Une vingtaine de lignes est le seul
format dans lequel la saisie se fera vraiment.

Chaque page montre son texte à gauche et ses photos liées à droite, avec leur
légende au survol — la disposition de l'écran des textes, déjà connue.

Cet écran **remplace** la section « Site web » des Réglages. Deux écrans qui
écrivent la même donnée avec deux modèles différents finiraient par se
contredire.

Seule la borne de début est stockée. La fin se calcule à la lecture, comme le
système le fait déjà pour les fenêtres de page. La stocker obligerait à réécrire
la page précédente à chaque saisie, et les deux valeurs finiraient par diverger
sans que rien ne le signale.

---

## La sous-page Consigne

Elle porte ce que la tâche **déclare** : la consigne pour le LLM, et sa période
en mois/année.

La Revue en garde un rappel en lecture seule, replié, avec un lien pour
l'éditer : on relit la consigne au moment d'exporter, c'est le bon moment.

---

## La sous-page Revue

**Chaque ligne porte la vignette de sa photo.** C'est ce qui rend l'ordre de
lecture du LLM vérifiable d'un coup d'œil ; réordonner à l'aveugle, avec huit
caractères d'identifiant pour tout repère, ne l'était pas.

**La Revue liste aussi les textes retenus**, groupés par source. Ils partent
dans le dossier livré et n'apparaissaient nulle part : une revue qui ne montre
pas tout ce qu'elle exporte n'est pas une revue.

La partie fixe porte le titre, le bandeau des huit compteurs, le bouton
d'export, et **le rapport d'export juste en dessous** — y compris la proposition
d'écraser un dossier existant, qui est une décision à prendre au moment où on la
lit. La chronologie défile : elle se consulte.

---

## Les réglages

**Les racines de stockage s'affichent**, avec leur chemin et leur disponibilité :
originaux, vignettes, pages, tâches, cache de rendu. Elles ne sont pas
modifiables depuis l'interface — elles se changent dans `.env`, suivi d'un
redémarrage. `TASKS_ROOT` ne dit pas seulement où écrire : elle **constitue la
liste blanche d'écriture** du serveur, garantie qu'il n'écrit nulle part
ailleurs. Un champ de formulaire qui la modifierait à chaud rendrait cette
garantie révocable depuis un navigateur.

**Le répertoire de livraison d'une tâche devient réglable**, confiné sous
`TASKS_ROOT`. Le défaut reste `<TASKS_ROOT>/<slug>`. Changer le répertoire d'une
tâche déjà exportée ne touche pas au dossier existant : l'écran le nomme et dit
qu'il subsiste. Un sous-dossier absent est créé à la première utilisation ; une
racine absente est refusée, parce qu'une racine créée sur une faute de frappe
donne un dossier fantôme qu'on ne retrouve jamais.

La section « Site web » disparaît, remplacée par l'écran de datation.

Les périodes d'album restent où elles sont. C'est le plus petit écran de
l'application et celui qui rend le plus : vingt-cinq saisies redatent 421 photos.

---

## Ce que la donnée ne permet pas

Dit franchement, pour que personne ne le découvre à l'implémentation.

**Le site web n'a pas de pages.** Ses 60 documents portent `hasPages: false` et
leurs 569 passages `pageId: null` ; la table des pages contient 155 lignes, 52
pour le journal et 103 pour « Ma vie », aucune pour le site. Un document du site
tient lieu de page par convention d'affichage, pas par la donnée : il n'a ni
numéro, ni image, ni date native. C'est pourquoi le titre d'une note tirée du
site nomme le document et ne dit jamais « page 1 ».

**Les deux moitiés d'un scan ne sont pas repérées géométriquement.** La page ne
connaît qu'une image entière, sans étiquette ni coordonnées de région. La
distinction haut/bas se lit dans la nature des textes — le registre porte 807
heures et 711 positions GPS, les notes n'en portent aucune — mais rien ne dit où
elles se trouvent sur l'image. C'est pourquoi la vignette est le scan entier et
qu'aucun découpage n'est tenté : la reliure ne tombe pas au même endroit d'un
scan à l'autre, et un rognage aveugle finirait par couper dans le texte.

**Trois pages du journal n'ont aucune ligne de registre** — les pages 1, 2 et 31.
Elles prennent la date lue dans leurs notes. La page 1 porte « Journal du bord.
8 juillet 1998 » écrit à la main, ce que la transcription confirme.

**Douze pages du registre couvrent plus de soixante jours, l'une exactement un
an.** Sur un registre qui tient une vingtaine de lignes, c'est physiquement
improbable. Sept pages reculent aussi dans le temps par rapport à la précédente,
de 12 à 351 jours. Les deux signes pointent vers une année mal lue à la
transcription. Ces pages portent un signe discret dans la liste. Ce sont des
dates réputées exactes, sur lesquelles tout le rapprochement photo-texte
s'appuie : une année fausse déplace une page entière de rapprochements d'un an.

**Aucun texte du site n'est daté** — zéro sur 569 — et le filtre par date du
serveur écarte tout texte sans date. D'où le filtre désactivé avec sa raison,
tant que l'écran de datation n'a pas été rempli.

**Les pages du site n'existent pas en image.** Les fichiers HTML d'origine sont
des pages FrontPage en encodage d'époque, avec des chemins relatifs, et ils
vivent sur le volume externe — un aperçu s'éteindrait au démontage du disque,
alors que les scans, eux, sont sur le disque interne. La 1.5 affiche leur texte
seul, et le dit.

---

## Hors périmètre de la 1.5

**Le rendu des pages HTML du site.** Texte seul, pour les raisons ci-dessus. À
rouvrir si le besoin de voir la mise en page d'origine se confirme.

**La relecture des appariements de galerie.** Les 205 liens photo↔légende n'ont
jamais été relus par un humain. Comme les légendes deviennent purement
indicatives et n'entrent dans aucun dossier livré, leur qualité inégale cesse
d'être un risque : il n'y a plus de geste de validation à construire.

**La reprise des dates de transcription suspectes.** Les douze pages larges et
les sept pages qui reculent sont signalées, pas corrigées. C'est un chantier de
transcription, pas d'affichage.

**Plusieurs plages de dates simultanées** dans le filtre des textes. Une
multi-sélection d'années ou une plage unique couvre les usages décrits ; le
cumul de plages hétérogènes demanderait soit N appels au serveur, soit une
extension du contrat, pour un besoin qui n'a pas été formulé.

**La détection automatique de la reliure** pour découper les scans. À rouvrir si
la vignette entière déçoit.

Et une conséquence à connaître, qui n'est pas un manque mais un arbitrage :
**2003-2004 n'a plus aucun texte d'époque sélectionnable.** Les 103 légendes de
ces deux années étaient la seule matière contemporaine de 2 041 photos ; comme
elles sont indicatives, le dossier livré pour cette période contiendra des notes
et rien d'autre côté texte. Recopier une légende dans une note reste possible et
la fait partir avec la photo.

---

## Les amendements au contrat

Quatre, à annoncer aux deux agents d'implémentation avant d'être écrits, comme
les trois précédents.

**Sur les notes** — deux champs. La **source** : la référence du texte recopié,
qui distingue une note dérivée d'une note écrite de zéro. Et un drapeau **« édité
depuis »**, que le serveur calcule en comparant le texte enregistré à celui
d'origine. Sans eux, l'attribution que porte le titre n'est vérifiable par rien,
et une note retravaillée cesse d'être une citation sans cesser d'y ressembler.

**Sur les notes, encore** — le **verrou de préfixe de titre**, tenu au serveur.
`PATCH /tasks/:slug/notes/:noteId` doit refuser une modification qui altère le
préfixe d'attribution.

**Sur les tâches** — un **répertoire de livraison** persistant, confiné sous
`TASKS_ROOT`. `PATCH /tasks/:slug` n'accepte aujourd'hui que le titre, la
consigne et la période ; le répertoire n'existe que dans le corps de l'appel
d'export, à usage unique.

**Sur les périodes du site** — passage de deux bornes à une **borne de début
unique**, la fin étant calculée à la lecture depuis la page datée suivante.

Et deux ajouts qui n'amendent rien, mais qu'il faut construire :

**Un point d'accès de vignette de page**, avec cache disque, sur le modèle des
rendus de photos. Sans lui la liste de pages télécharge les scans en pleine
taille.

**Une date proposée par page du site**, avec ce qui la soutient : nombre de
photos, combien datées au jour, largeur de la fourchette.

---

## Ce qui ne change pas

Les règles qui gouvernent tout le reste tiennent, et la 1.5 ne les entame nulle
part.

**Une inférence ne ressemble jamais à une lecture.** Trois natures de date,
trois rendus distincts. Les dates du registre et des passages sont des lectures,
en vert. Les dates héritées d'une page voisine et les dates saisies pour le site
sont des inférences, en ambre avec `≈`. Corriger la date d'une photo reste la
seule chose qui produise du violet.

**Trois natures de texte, trois emplacements.** Le texte d'époque, la note
d'aujourd'hui et la légende de machine ne se mélangent pas. La note créée depuis
un texte recopie, mais porte sa source et son attribution.

**Ce que le geste établit décide de la nature**, pas qui a agi.

**Rien d'humain n'est effacé par un import**, et le volume des originaux ne
reçoit jamais d'écriture.
