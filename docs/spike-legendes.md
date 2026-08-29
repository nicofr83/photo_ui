# Spike — légendage automatique des photos du périmètre

**Question posée.** Faut-il légender les 3 930 photos du périmètre ? Les tags IA
d'Adobe couvrent déjà 100 % de ces photos et ne coûtent rien. La vraie question
n'est donc pas « une légende est-elle utile » mais **qu'apporte une légende que
les 2 593 tags n'apportent pas**.

**Livrable à juger sur pièces.** `docs/echantillon-legendes.html` — 60 photos,
chacune avec ses tags Adobe à gauche et sa légende à droite. Ouvrir le fichier
dans un navigateur ; il est autonome, les images sont intégrées.

**Réponse courte.** Oui, et l'écart est plus large que ce que la spec
anticipait. Les tags et les légendes ne répondent pas à la même question : les
tags disent *de quoi ça a l'air*, la légende dit *ce que c'est*. Sur ce corpus
précis — un voilier, une famille, des escales — les tags se trompent
systématiquement sur les trois choses qui comptent le plus. Détail en §5,
recommandation en §6.

---

## 1. Ce qui a été fait, et ce qui n'a pas pu l'être

**Fait.** Échantillon de 60 photos construit et stratifié (§3), consigne de
légendage écrite et itérée trois fois (§2), 60 légendes produites, page de
confrontation construite, analyse tags contre légendes (§5).

**Non fait : toute la partie chiffrée.** Aucune mesure de tokens, aucun coût
mesuré, aucune extrapolation, aucune comparaison entre modèles.

La cause est un blocage net et pas une omission. La seule clé API de la machine
(`ANTHROPIC_API_KEY`, exportée depuis `~/.zshrc`) est valide mais sans crédit :

```
400 invalid_request_error — Your credit balance is too low to access the
Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.
(request_id req_011CeVVFwZKu6KC7sW17wont)
```

Il n'y a ni CLI `ant`, ni profil OAuth, ni seconde clé sur la machine.
`count_tokens` est refusé au même titre que l'inférence, donc même la mesure
gratuite était hors d'atteinte. **Les légendes de l'échantillon ont donc été
produites par le modèle de la session d'agent (Opus 5) lisant les rendus
directement**, pas par un appel API facturé. Elles valent pour juger la
consigne et l'écart aux tags ; elles ne disent rien du coût ni de ce que
produirait un modèle moins cher.

**Ce qu'il reste à faire avant d'engager une passe** — c'est court, ~2 $ de
crédits suffisent :

1. `count_tokens` sur une dizaine d'images **à 1400 px et à 1100 px**. C'est le
   paramètre qui pilote toute la dépense et l'estimation de la spec
   (~1 500 tokens/image) n'a jamais été vérifiée. La spec dit 1400 px partout
   (§6.4, §9) ; le rendu 1400 px produit ici pèse 380 Ko en moyenne contre
   248 Ko à 1100 px, l'écart de coût n'est donc pas marginal.
2. Rejouer la consigne §2 sur **Haiku 4.5 et Sonnet 5** sur ces mêmes 60 photos,
   et comparer à ce qui est dans la page. C'est le seul point qui reste
   réellement ouvert : la consigne est exigeante, et rien ne dit qu'un modèle
   bon marché la tienne.

**Mesuré au passage, sans API.** Le pré-rendu `sips` à 1400 px qualité 78 coûte
**54 ms par image** sur le volume Thunderbolt (60 images en 3,3 s, en série),
ce qui confirme les 59 ms de la spec.

---

## 2. La consigne retenue

Version finale : **`docs/legendes/consigne-v3.txt`**, reproduite intégralement
dans l'en-tête de la page HTML. C'est le vrai livrable technique du spike :
c'est elle qu'on rejouerait sur un modèle bon marché.

Le modèle ne reçoit **que les pixels** — un rendu 1400 px, sans date, sans
album, sans nom de fichier, sans tag. C'est délibéré : lui donner le contexte
l'inciterait à le recracher comme s'il l'avait vu.

### Ce que les itérations ont corrigé

**v1 → v2 : la distinction lire / déduire.** La v1 interdisait tout nom propre.
Erreur, et coûteuse : sur les 60 photos, **22 portent un texte lisible dans
l'image** — plaque de rue, nom sur une coque, écran de navigation, panneau,
bannière, horodatage d'appareil. Interdire de le transcrire, c'est jeter
l'information la plus dense du corpus. La v2 sépare donc deux régimes :

> **LIRE** est autorisé et précieux : un texte écrit dans l'image se transcrit
> entre guillemets, en disant où on le lit. **DÉDUIRE** reste interdit : une
> plage n'est pas « les Antilles », un bâti n'est pas « le Portugal ».

Et surtout : **une lecture ne devient jamais une affirmation sur la photo.** La
légende dit « une plaque murale porte "LARGO DE SANTA LUZIA" », jamais « photo
prise à Santa Luzia ». C'est exactement la règle invariante §7.1 appliquée au
texte : on a lu une inscription, on n'a pas identifié un lieu.

**v2 : le doute se dit, il ne se supprime pas.** Première version, le modèle
avait le choix entre le mot précis risqué et le mot vague sûr, et prenait le
vague — ce qui tue la recherche. La v2 impose la réserve explicite : « un
poisson de type thonidé », « vraisemblablement des pélicans », « quelque chose
comme "GROYABADA" ». Le mot précis rend la photo trouvable, la réserve empêche
la légende de mentir. 11 légendes sur 60 portent une réserve de ce type.

**v2 → v3 : trois manques révélés par l'échantillon.**

- **Nommer le type d'embarcation.** La photo 03 est le carré d'un voilier ; les
  tags disent `kitchen`, `home`, `bathroom`, `house`, `furniture`. Sans
  instruction explicite, une légende générique aurait pu commettre la même
  erreur. La v3 impose : voilier monocoque, catamaran, vedette, annexe
  pneumatique, gréement carré — et, à l'intérieur, « le carré et la table à
  cartes d'un voilier ne sont pas le séjour et le bureau d'une maison ».
- **Le vocabulaire précis plutôt que le générique**, avec une liste d'amorce
  maritime et technique (barre à roue, taud, filière, pare-battage, lazy-bag,
  guindeau, ber, caténaire, azulejos).
- **La lumière n'est pas un défaut.** La v2 faisait classer tout contre-jour
  en raté. Un contre-jour, une lumière rasante, une scène de nuit se décrivent
  — le dessinateur en a besoin — et `defauts` ne garde que le raté technique.

### Ce que produit la consigne, mesuré sur les 60

| | valeur |
|:---|:---|
| longueur de légende | médiane 683 caractères (528–939) |
| mots-clés par photo | médiane 8 (min 6, max 10) |
| légendes citant un texte lu dans l'image | **22 / 60** |
| légendes signalant au moins un défaut technique | **27 / 60** |
| légendes portant une réserve explicite | 11 / 60 |
| légendes nommant le support (tirage scanné, vidéo, reproduction) | 11 / 60 |
| légendes nommant un type d'embarcation précis | 23 / 60 |

Le vocabulaire fermé de `defauts` est effectivement utilisé et discriminant :
`cadrage` 7, `surexpose` 6, `bord-scan` 5, `dominante-couleur` 5,
`basse-definition` 5, `voile` 4, `flou` 2, `sous-expose` 2, `illisible` 2,
`tache` 1, `granuleux` 1.

---

## 3. Comment l'échantillon a été construit

60 photos, **60 albums distincts** sur les 82 du périmètre. Choisies pour être
représentatives, pas pour être belles. Données : `mcp-index.db` et `dating.db`
dans `/Volumes/OWC Envoy Ultra/Pictures/lightroom/work/`, ouvertes en lecture
seule (`sqlite3 "file:<chemin>?mode=ro" -readonly`).

**Le périmètre**, qui donne bien 3 930 photos et 82 albums :

```sql
-- l'ensemble d'albums est le premier segment de albumPath
SELECT substr(albumPath,1,instr(albumPath||'/','/')-1) AS ens, count(*)
FROM photos
WHERE substr(albumPath,1,instr(albumPath||'/','/')-1)
      IN ('1998-1999','2000-2001','2002','2003','2004')
GROUP BY ens;
-- 1998-1999 326 | 2000-2001 806 | 2002 757 | 2003 861 | 2004 1180
```

**Trois axes de stratification, plus un quatrième correctif.**

*Les 5 ensembles d'albums* — obtenu : 10 / 14 / 13 / 12 / 11.

*Les 3 natures de date*, dérivées comme suit et obtenues 31 / 14 / 15 :

```sql
-- décision humaine : une proposition manuelle dans dating.db
ATTACH 'file:.../dating.db?mode=ro' AS d;
SELECT count(*) FROM photos p JOIN d.proposals pr ON pr.photoId = p.cloudAssetId
WHERE pr.confidence = 'manual';        -- 521 sur le périmètre
-- lecture EXIF   : photos.dateSource = 'capture-date'                    (2 862)
-- album seul     : dateSource IN ('folder-sequence','folder-month',
--                  'folder-month-assumed','folder-year','none')            (547)
```

*Les 8 situations*, assignées depuis les tags IA par jeux de mots-clés, une
photo tombant dans le premier jeu dont elle porte au moins deux tags
(`documents-objets`, `interieur-vie`, `port-mouillage`, `mer-navigation`,
`ville-escale`, `gens`, `paysage-nature`, sinon `autre`). Obtenu : mer 16,
gens 11, ville 9, paysage 8, intérieur 6, port 6, document 3, autre 1.

*Le décile esthétique bas* — 16 photos avec `aestheticsScore <= 49`, le seuil
étant le 10ᵉ centile mesuré sur le périmètre (score Adobe, étendue 34–94,
moyenne 59,9), pour forcer la présence de photos peu réussies.

**La sélection** est un glouton qui maximise à chaque tirage le déficit restant
sur les quotas des trois axes, avec bonus pour le décile bas et pénalité forte
sur les albums déjà tirés — d'où les 60 albums distincts. Graine fixée
(`random.seed(20260828)`), donc l'échantillon est reproductible.
L'échantillon retenu, avec toutes ses métadonnées et ses tags, est figé dans
**`docs/echantillon-legendes.data.json`** : il n'y a pas besoin du volume pour
le rejouer, seulement pour refabriquer les images.

**Le légendage a été fait en aveugle.** Les images ont été lues depuis des
rendus nommés par leur `sha256` — jamais par leur chemin, qui contient le nom
de l'album (« 2004-03- visite de Tikal », « 2002-02-Guadeloupe »). C'était
indispensable : l'agent qui légende connaît le contexte du corpus, et un nom
d'album sous les yeux aurait contaminé la légende avec un lieu que l'image ne
montre pas. Le rendu vu par le modèle fait **1400 px** de côté long, la valeur
de la spec.

### Une limite de la stratification, à dire

**Le score esthétique d'Adobe ne détecte pas les photos ratées.** Croisement du
décile bas avec les défauts techniques réellement constatés en regardant les
images :

| | avec défaut technique | sans |
|:---|---:|---:|
| décile esthétique bas (16) | 6 | 10 |
| reste (44) | 21 | 23 |

Le score mesure l'agrément, pas la réussite technique : la photo 27 (un homme à
la barre, parfaitement nette) est notée 46, et la 41 (voilée et granuleuse) est
hors décile. **Il n'existe donc aucun signal existant pour « photo ratée ».**
C'est en soi un argument pour la légende, qui en produit un — voir §5.5.

---

## 4. Sur quoi juger la page

Ouvrir `docs/echantillon-legendes.html` et regarder en priorité :

| Regarder | Photos | Ce qui s'y joue |
|:---|:---|:---|
| **Le texte lu dans l'image** | 31, 46, 50, 55, 48, 05, 20 | une date ou un lieu écrits, que rien d'autre dans le système ne capte |
| **Les intérieurs de bateau** | 03, 21, 32, 25 | les tags les lisent comme une maison |
| **Les photos presque vides** | 28, 45, 59, 56 | la légende sait-elle dire qu'il n'y a presque rien ? |
| **Les erreurs franches des tags** | 18, 27, 43, 30, 38 | sexe, activité, nature du lieu |
| **Les lieux inventés par les tags** | 41, 46, 55, 09 | `chicago`, `london`, `asia`, `spain` — non marqués comme inférences |
| **Les photos ratées** | 04, 12, 13, 15, 59 | le défaut est-il annoncé avant la description ? |

**Ce qui distingue une légende utile d'une légende creuse.** Une légende creuse
paraphrase les tags en phrases : « une belle photo de bateau sur une mer bleue
avec des gens heureux ». Une légende utile fait trois choses que les tags ne
font pas : elle **nomme l'objet précis** (barre à roue, table à cartes, bouée
tractée, tuyère), elle **dit l'état et le support de l'image**, et elle **sait
dire qu'elle ne sait pas**. Si en lisant une légende vous n'apprenez rien que
les tags ne disaient, elle est creuse — et il faut le signaler, c'est le
critère qui décide.

---

## 5. Tags contre légendes, exemple par exemple

Rappel du terrain, mesuré sur le périmètre entier : **2 593 tags IA distincts**,
24 à 25 par photo, confiance moyenne 63,5 ; 2 217 de ces tags portent moins de
1 % des photos, 820 ne portent qu'une seule photo. Le vocabulaire est donc
large. Le problème est ailleurs.

### 5.1 Les tags sont en anglais, la recherche sera en français

**Zéro tag français sur 5 528.** Pas de `bateau`, pas de `voilier`, pas de
`mer`, pas de `enfant`, pas de `maison`, pas de `plage`. Nicolas cherchera
« la maison rose » et « le bateau au sec sur son ber ». C'est un fait
structurel que la spec ne relève pas et qui, à lui seul, disqualifie les tags
comme axe de recherche principal — sauf à taper en anglais dans sa propre
photothèque. Les 60 légendes produisent **397 mots-clés français distincts**.

### 5.2 Les tags décrivent l'apparence, la légende dit ce que c'est

C'est le cœur de l'affaire, et c'est spectaculaire sur les intérieurs.

**Photo 03** — le carré d'un voilier, table à cartes, pendule et baromètre de
laiton, couchette de la cabine arrière.
Tags : `interior, kitchen, home, table, design, modern, house, furniture,
chair, room, bathroom, sink`.
Les tags décrivent une **maison**. Aucune requête « à bord », « le carré »,
« la table à cartes » ne remontera cette photo, et un scénariste à qui on
donne ces tags écrira une scène d'appartement.

**Photo 38** — la tuyère d'un moteur-fusée exposée sous un hangar, avec un
écusson portant « SCHIRRA ».
Tags : `industry, steel, metal, engine, equipment, machine, factory,
industrial, technology, engineering, machinery, old`.
Les tags décrivent une **usine**. Le mot `rocket` n'apparaît pas.

**Photo 31** — un écran d'ordinateur portable affichant un logiciel de
navigation maritime, une carte au 1:100 000, une position, un cap, une vitesse.
Tags : `computer, laptop, technology, business, notebook, pc, screen, internet,
monitor, background, isolated, communication, display, keyboard, concept,
mobile, tablet, network, digital, 3d`.
Les tags décrivent un **objet bureautique**. Ils ne voient ni la mer, ni la
carte, ni la navigation.

### 5.3 Les tags se trompent, et pas à la marge

**Photo 27** — un homme torse nu tient la barre à roue d'un voilier. Aucune
femme dans l'image.
Tags : `woman, sea, boat, female, girl, yacht, young, man, summer, sailing,
water, beautiful, travel, blue`. Quatre tags de genre faux sur quatorze.

**Photo 18** — un homme brandit un grand poisson au bout de son bras, sur le
pont d'un voilier.
Tags : `man, male, young, adult, worker, woman, boy, work, guy, people,
caucasian, home, isolated, paint`. Ni `fish`, ni `fishing`. Le tag `fish`
existe pourtant et porte 185 photos du périmètre : le vocabulaire est là,
**l'assignation ne l'est pas**.

**Photo 30** — une bouée tractée derrière une vedette, un garçon au premier
plan.
Tags : `car, boat, water, blue, vehicle, outdoors, automobile, sea, travel,
people, transportation, auto`. Quatre synonymes de voiture sur une photo de
bateau.

**Photo 09** — un paysage volcanique, coulée de lave noire, cônes de scories.
Tags : `desert, landscape, mountain, sky, mountains, beach, travel, sand,
clouds, blue, nature, hill, summer, spain`. Ni `volcano`, ni `lava`, ni
`crater` — qui existent pourtant dans le vocabulaire (42, 14 et 6 photos).

**Photo 20** — un village rural, maisons de torchis, galerie de bois.
Tags : `people, street, city, urban, town, road, ...` : `city` et `urban` pour
un hameau de terre battue.

### 5.3 bis Les tags affirment des lieux, et se trompent

C'est le point le plus grave, parce qu'il touche directement la règle
invariante §7.1. **883 photos du périmètre — 22,5 % — portent au moins un tag
de lieu nommé**, et ces tags sont indiscernables d'une lecture : rien ne les
marque comme des inférences.

Ils sont souvent faux. Le recoupement ci-dessous utilise le nom d'album comme
témoin — une information dont l'analyste dispose mais que le modèle de
légendage n'a jamais vue :

| Photo | Album | Tags de lieu portés |
|:---|:---|:---|
| 41 | `2003-05 Keys Stephane` | **`chicago`** |
| 46 | `2003-10-Sorel 2 - Laurentides` | **`europe`, `london`** |
| 55 | `2004-05-visite de Tulum` | `mexico`, **`chichen itza`**, **`asia`** |
| 09 | `1999-11 Mad CapVert` | **`spain`** |

Et sur l'ensemble du périmètre, le vocabulaire de lieu comprend `egypt` (61
photos), `asia` (125), `china` (32), `thailand` (23), `india` (12), `japan` (8)
— sur un corpus qui va du Portugal aux Caraïbes.

Un tag `chicago` sur une photo de Floride, versé tel quel dans le dossier remis
au scénariste, produit exactement ce que §7.1 interdit : **une inférence de
machine qu'on ne peut pas distinguer d'une lecture**. La consigne de légendage
interdit explicitement ce geste, et aucune des 60 légendes ne nomme un lieu
autrement qu'en citant un texte lu dans l'image.

### 5.4 Ce que seule la légende capte : le texte inscrit dans l'image

**22 photos sur 60.** C'est l'apport le plus inattendu du spike, et il touche
directement le problème de datation qui domine ce corpus.

- **Photo 50** — un horodatage d'appareil incrusté en orange : **« 2004 1 24 »**.
- **Photo 55** — un horodatage rouge : **« 2004 3 9 »**.
- **Photo 46** — une bannière de festival portant ses dates :
  **« 11 12 13 18 19 OCTOBRE 2003 »**.
- **Photo 31** — l'écran de navigation affiche une position
  **« 025°34.3058 N / 079°12.3011 W »**, une route, une vitesse fond, et la
  barre des tâches porte **« 5/20/2002 »**. Or cette photo est aujourd'hui
  `≈ sans date (none)` dans l'index.
- **Photo 05** — une plaque murale : **« LARGO DE SANTA LUZIA »**.
- **Photo 20** — une enseigne peinte : **« BODEGA MOSNANDA »**.
- **Photo 48** — un panneau entièrement lisible : **« ELBOW REEF LIGHTHOUSE /
  Built in 1864 / … / 101 Steps to Lantern »**.
- **Photos 04, 11, 40, 53** — des noms de coque : « Funicula » (douteux),
  « DEUXIÈME VIE », « Islander », « GROYABADA » (douteux).

**Aucun tag ne porte jamais le contenu d'un texte.** Les tags savent parfois
qu'il y en a un — la photo 48 est taguée `sign, text, paper, book, dictionary,
page, word, definition` — mais s'arrêtent là : ils disent qu'il y a des mots,
jamais lesquels. `dictionary` et `definition` montrent d'ailleurs que le
tagueur a pris ce panneau de phare pour une page de dictionnaire. **233 photos du
périmètre n'ont aucune date d'origine et 745 en portaient une fausse** : une
légende qui transcrit un horodatage ou une plaque de rue fabrique une **preuve
lisible et vérifiable par un humain**, sur un axe qui ne dépend d'aucune
cascade. C'est un usage que ni la spec ni le brief n'avaient anticipé.

Réserve importante : ces transcriptions restent des **lectures machine**. Elles
doivent rester marquées `kind: "machine"` comme le reste de la légende, et ne
jamais alimenter automatiquement `photos.captureDate`. Elles sont une piste
qu'un humain arbitre, pas une date.

### 5.5 Ce que seule la légende capte : l'état de l'image

27 légendes sur 60 signalent un défaut technique, avec un vocabulaire fermé
exploitable en filtre. Aucun tag ne dit jamais qu'une photo est ratée — et §3
montre que le score esthétique d'Adobe ne le dit pas non plus.

Sur les photos presque vides, la différence porte sur l'aveu d'incertitude
plutôt que sur le contenu. **Photo 28** : une mer turquoise et une forme sombre
sous la surface. Ici les tags ne sont pas muets — ils disent `dolphin`, mais
aussi `whale`, `fish`, `mammal`, `animal`, `swimming`, `sport`. C'est-à-dire
qu'ils **arrosent** : quatre identifications mutuellement exclusives, toutes
présentées avec la même confiance apparente (59 à 72), sans qu'on puisse savoir
laquelle croire. La légende dit qu'il y a vraisemblablement un grand animal
marin, dauphin ou tortue, **sans pouvoir trancher**, et que le reste du cadre
est vide. Les deux sont incertains ; un seul le dit. Pour composer une BD,
savoir qu'une photo ne montre presque rien vaut autant que savoir ce qu'elle
montre — et savoir qu'on n'est pas sûr vaut mieux que quatre hypothèses
silencieuses.

### 5.6 Ce que les tags font mieux

Il faut le dire : les tags sont **gratuits, déjà là, et couvrent 100 %** du
périmètre. Ils sont denses (24–25 par photo) et corrects sur les catégories
larges — `sea`, `boat`, `beach`, `landscape` sont rarement faux. Pour un
filtre grossier « montre-moi les photos de mer », ils suffisent, et la légende
n'apporte rien.

Ils sont aussi parfois **plus rapides à l'identification** qu'une légende
prudente : sur la photo 28, `dolphin` est probablement la bonne réponse là où
la légende hésite entre dauphin et tortue. Le prix de cette rapidité est
qu'aucun tag ne dit son degré de certitude, et que `whale` et `fish` sont
proposés à côté avec le même aplomb.

Ils restent aussi un bon **complément lexical anglais** dans un index plein
texte : les deux axes cohabitent, comme la spec le dit, et il n'y a aucune
raison de les retirer.

---

## 6. Recommandation

**Lancer la passe. La légende n'est pas un doublon des tags, elle répond à une
autre question.** Trois raisons, par ordre de force :

1. **Les tags ne sont pas cherchables en français**, et c'est rédhibitoire pour
   un outil dont l'unique utilisateur cherche en français.
2. **Les tags décrivent l'apparence, pas la nature.** Un carré de voilier tagué
   `kitchen, home, bathroom` n'est pas une imprécision, c'est une erreur qui
   empoisonnerait le dossier remis au scénariste. Sur ce corpus, où presque
   tout se passe à bord, le défaut est structurel et pas anecdotique.
3. **La légende produit deux signaux que rien d'autre ne produit** : le texte
   inscrit dans l'image (22/60, dont des dates et des positions sur un corpus
   dont c'est la faiblesse principale) et l'état technique de la photo (27/60,
   là où le score esthétique d'Adobe ne prédit rien).
4. **Les tags violent la règle invariante §7.1**, la légende non. 883 photos
   du périmètre portent un tag de lieu nommé, souvent faux (`chicago` en
   Floride, `london` au Québec, `asia` au Yucatán), et rien ne les marque comme
   des inférences. Si les tags partent dans le dossier remis au scénariste, ils
   y portent des affirmations de lieu que personne n'a faites.

**Avec quel modèle : indéterminé, et c'est la seule question qui reste.** La
comparaison n'a pas pu être faite. Ce que le spike permet de dire, c'est que la
consigne est **exigeante** — elle demande de distinguer lire de déduire, de
tenir une réserve explicite, de nommer un gréement, de ne pas confondre un
carré avec une cuisine. Rien ne garantit que Haiku 4.5 la tienne. **Ne pas
choisir sur le prix seul** : rejouer `consigne-v3.txt` sur ces 60 photos avec
Haiku 4.5 et Sonnet 5, comparer aux légendes de la page, et regarder d'abord
les cas de §4. Deux dollars de crédits et une heure suffisent.

**Deux ajustements à la spec §6.4, appuyés sur ce qui précède :**

- La spec demande « deux à quatre phrases ». C'est **trop court** pour les
  photos qui portent du texte : la 31 et la 48 ont besoin de place pour
  transcrire. Prévoir deux à cinq phrases, et laisser filer sur les
  reproductions et les écrans.
- La spec dit « ne pas dater ni localiser ». À **préciser** : ne pas *déduire*
  une date ni un lieu, mais **transcrire** ceux qui sont écrits dans l'image.
  La v1 de la consigne interdisait les deux et perdait le plus précieux.

**Si la passe est lancée**, le stockage prévu par la spec convient tel quel
(`app`, clé `sha256`, `caption` / `keywords` / `model` / `prompt_version`), avec
`prompt_version = "v3"` pour pouvoir re-légender un sous-ensemble quand la
consigne bougera. Ajouter `defauts` comme colonne indexée : c'est un filtre
utile pour la composition (« ne me propose pas les ratées ») et il sort
gratuitement de la même passe.

---

## 7. Incertitudes

1. **Aucun chiffre de coût n'a été mesuré.** Clé API sans crédit (§1). Les
   tokens par image, le coût de l'échantillon, l'extrapolation aux 3 930 et la
   durée d'une passe restent tous inconnus. L'estimation de la spec
   (~1 500 tokens d'entrée par image, ≈ 10 $ en Haiku, ≈ 20 $ en Sonnet,
   ≈ 49 $ en Opus) **reste non vérifiée**, et la résolution — 1400 px selon la
   spec — n'a pas été confrontée à un comptage réel.

2. **Un seul modèle a produit les légendes, et c'est le plus capable.** Elles
   viennent d'Opus 5 en session d'agent. Elles montrent ce qu'une bonne légende
   apporte ; elles **ne montrent pas** ce que produirait le modèle qu'on
   utiliserait réellement pour 3 930 photos. C'est le principal angle mort du
   spike, et le brief demandait explicitement cette comparaison.

3. **Le juge est aussi l'auteur.** J'ai écrit la consigne, produit les légendes
   et conduit l'analyse tags contre légendes. Le biais est réel. Il est atténué
   par le fait que les défaillances des tags sont vérifiables à l'œil sur la
   page — un carré de voilier tagué `kitchen` se constate — mais la sélection
   des exemples de §5 reste la mienne.

4. **Le légendage en aveugle n'élimine pas tout.** Les rendus ont été lus par
   `sha256`, sans nom d'album. Mais je connaissais le corpus (voilier, famille,
   traversée) avant de commencer, et je ne peux pas garantir que cette
   connaissance n'a pas orienté une formulation. Aucune légende n'affirme de
   lieu, de date ni d'identité — ça, c'est vérifiable — mais le choix des
   détails décrits a pu en être teinté.

5. **Les transcriptions de texte n'ont pas été vérifiées.** « LARGO DE SANTA
   LUZIA », « BODEGA MOSNANDA », « 025°34.3058 N », « 2004 1 24 » sont ce que
   je lis sur un rendu 1400 px. Deux sont explicitement marquées douteuses
   (« Funicula », « GROYABADA »). Personne n'a recoupé les autres avec les
   originaux en pleine résolution, et un modèle moins capable se trompera
   davantage. **Ne jamais alimenter une date depuis une transcription sans
   arbitrage humain.**

6. **Le taux de rappel réel n'est pas mesuré.** L'incertitude 9 bis de la spec
   reste entière : je n'ai lancé aucune requête réelle sur ces 60 légendes.
   Que « la maison rose » ou « le bateau au sec sur son ber » remontent
   effectivement en `tsvector` français reste à établir, et c'est ce qui dira
   si les embeddings de §8.2 méritent d'être repris.

7. **60 photos sur 3 930, soit 1,5 %.** La stratification couvre les axes
   connus, mais 22 albums du périmètre ne sont pas représentés, et les
   situations rares (documents : 3 photos, autre : 1) le sont trop peu pour
   qu'on en tire quoi que ce soit de solide.

8. **Le seuil du décile esthétique est un choix, pas une mesure.**
   `aestheticsScore <= 49` force la présence de photos peu flatteuses, mais §3
   montre que ce score ne prédit pas le raté technique. Les photos réellement
   ratées de l'échantillon y sont donc par hasard, pas par construction.

---

## Fichiers

| Fichier | Contenu |
|:---|:---|
| `docs/echantillon-legendes.html` | **la page à ouvrir** — 60 photos, tags contre légendes, autonome |
| `docs/echantillon-legendes.data.json` | l'échantillon figé : métadonnées, dates, tags, chemins |
| `docs/legendes/consigne-v3.txt` | **la consigne retenue**, à rejouer sur un autre modèle |
| `docs/legendes/consigne-v2.txt` | l'étape précédente, conservée pour la trace des itérations |
| `docs/legendes/captions.json` | les 60 légendes, `legende` / `mots_cles` / `defauts` |
| `docs/legendes/build.py` | reconstruit la page depuis les deux JSON (`python3 docs/legendes/build.py`) |
