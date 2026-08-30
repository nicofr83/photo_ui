# Questions avant la spécification V1.5

*Relevé le 2026-08-30 sur le serveur réel (`127.0.0.1:4310`), le code de
`src/screens/`, et les fichiers de `PAGES_ROOT`. Chaque question porte une
recommandation : réponds par un choix, pas par une rédaction.*

Trois marqueurs, à lire comme un tri :

- **[Ambigu]** — ta phrase admet plusieurs lectures et je ne peux pas trancher seul.
- **[Non dit]** — un cas limite ou une absence de donnée que la V1.5 rencontrera.
- **[Tension]** — ta demande entre en conflit avec une règle déjà posée, ou avec ce
  que la donnée porte réellement. Dit maintenant plutôt que découvert à
  l'implémentation.

---

## Ce que j'ai vérifié avant d'écrire, et qui change la donne

Quatre faits, parce qu'ils contredisent ou compliquent des parties du brief.

**Les albums sont déjà triés.** `sortAlbumsByPath` (`src/domain/albumOrder.ts`)
trie sur le **chemin complet** (`2003/2003-03-everglades`), corrigé ce matin.
Mais l'écran n'affiche que la **feuille** (`2003-03-everglades`) : le set
(`1998-1999`, `2000-2001`, `2002`, `2003`, `2004`) est invisible. L'ordre est
bon, sa raison ne se voit pas. Deux entrées cassent l'illusion : `2000` (album
sans mois) et `2002-38Dec02` (préfixe abîmé, « 38 » n'est pas un mois). Et
`localeCompare` ignore la casse, donc `2003-03-everglades` passe **avant**
`2003-03-Fort Lauderdale`.

**Les pages du journal de bord ne sont pas dans l'ordre chronologique.**
Page 3 → 09/07/1998, page 4 → 05/08/1998, **page 5 → 12/04/1998**, page 8 →
13/02/1999. « Ma vie », elle, est parfaitement chronologique (103 pages, 04/08
au 18/11/1999). Une liste triée par numéro de page mélange les dates ; une
liste triée par date casse la numérotation. Les deux documents ne se comportent
pas pareil.

**Il n'existe aucune miniature de page.** `PAGES_ROOT` contient
`journal-de-bord/p001.jpg` … `p052.jpg` et `ma-vie/p001.jpg` … `p103.jpg` :
155 JPEG, ~300 Ko pièce, **49 Mo au total**, taille variable (774×1275 à
1018×1435 — pas le 810×1250 uniforme qu'annonce la spec). Le seul point d'accès
est `/pages/image?pageId=…`, qui sert le fichier entier. Afficher les 103
vignettes de « Ma vie » télécharge **31 Mo**. Il faut un point d'accès de
vignette côté serveur : c'est du travail back, pas un `width` en CSS.

**« La date de début d'une page » n'a pas une seule valeur, et les deux
candidates n'ont pas la même nature.** `TextPage.window` est une **inférence**
(`kind: "inference"`, ambre italique `≈` par la règle en vigueur), absente sur
3 pages du journal, et **héritée de la page voisine sur 22 des 103 pages de
« Ma vie »** (`spanSource: "carried"` — rien sur cette page-là ne l'affirme).
La date des passages, elle, est une **lecture** (`kind: "reading"`, vert). Les
deux diffèrent sur 5 pages du journal. C'est le point le plus lourd du brief :
voir §F.

---

## A. Tâches / Images — la sous-fenêtre Albums

**1. [Ambigu] Le filtre cherche dans quel texte ?**
Tu écris « n'importe quelle partie du texte du nom de la hiérarchie ». La
hiérarchie complète est `2003/2003-03-everglades` ; l'écran n'affiche
aujourd'hui que `2003-03-everglades`. Chercher dans un texte qu'on ne voit pas
donne des résultats qui semblent arbitraires.
→ **(a)** chercher dans le chemin complet **et l'afficher en entier** ·
**(b)** chercher dans le chemin, n'afficher que la feuille · **(c)** chercher
dans la feuille seulement.
*Recommandation : **(a)**. `matchesSearch` (`src/domain/searchFold.ts`) existe
déjà, insensible casse et accents dans les deux sens — « Alges » trouve
« Algès ». Afficher le chemin rend le tri lisible du même coup.*

**2. [Non dit] Un album coché qui ne correspond plus au filtre : il disparaît ?**
Tu tapes « Belize », tes trois albums cochés du Venezuela sortent de la liste.
Ils restent filtrants, mais tu ne les vois plus.
→ **(a)** les cochés restent épinglés en tête, hors filtre · **(b)** ils
disparaissent, le compteur de filtres actifs les rappelle · **(c)** ils
disparaissent, sans rappel.
*Recommandation : **(a)**. Les pastilles de filtre actif existent déjà en haut
du panneau, mais elles ne montrent pas la case ; épingler évite de décocher à
l'aveugle.*

**3. [Non dit] Le même champ sur Tags, Personnes, Lieu ?**
Ces trois listes sont bien plus longues que les 82 albums — **2 593 tags
distincts** sur le corpus. Le besoin y est plus fort que sur les albums.
→ **(a)** albums seulement en V1.5 · **(b)** les quatre listes, même composant.
*Recommandation : **(b)** si le coût reste un composant partagé ; **(a)**
sinon, mais alors dis-le comme un report, pas comme un choix.*

**4. [Non dit] Quelle largeur, exactement ?**
Le panneau est passé de 18 à **22 rem ce matin**, sur ton « illisible ». Tu en
demandes encore.
→ **(a)** 26 rem fixe · **(b)** redimensionnable à la souris, mémorisée ·
**(c)** un chiffre que tu donnes.
*Recommandation : **(a)** pour la V1.5, **(b)** si le confort ne suit pas.
Au-delà de 26 rem la grille de photos commence à perdre une colonne.*

**5. [Non dit] La liste d'albums garde-t-elle sa hauteur fixe ?**
La zone des albums a déjà son propre ascenseur (`max-height: 26rem`) : ton
champ de filtre, placé au-dessus, ne scrollera pas — la demande est
structurellement satisfaite. Reste à savoir si cette hauteur est la bonne.
→ **(a)** garder 26 rem · **(b)** la liste occupe toute la hauteur restante de
la colonne, le champ collé en haut.
*Recommandation : **(b)** — c'est le comportement que ta phrase décrit
vraiment, et il tient mieux sur grand écran.*

**6. [Tension] Le tri : je confirme qu'il est bon, mais deux entrées trompent.**
`2000` et `2002-38Dec02` sortent au « mauvais » endroit parce que leur préfixe
n'est pas un `AAAA-MM` valide. Les corriger serait renommer des dossiers du
disque — hors périmètre de cette application.
→ **(a)** ne rien faire, le chemin complet affiché (§A.1) explique l'ordre ·
**(b)** les marquer d'un signe discret « préfixe non reconnu ».
*Recommandation : **(a)**. Ces deux albums ont de toute façon une plage à
saisir dans Réglages.*

---

## B. En-têtes fixes — écran par écran

Tu dis « sur toutes les sous pages » et « demande en cas de doute ». Voici les
cinq écrans, un par un. Réponds par oui/non sur chaque ligne, ou valide le lot.

**7. [Ambigu] Tâches/Images** — fixes : la barre `Images | Textes | Consigne |
Revue`, et la barre des trois compteurs (résultats · sélectionnés · écartés par
le filtre). Scrollent séparément : la colonne des filtres, et la grille.
*Recommandation : oui, et les deux colonnes scrollent indépendamment — c'est
déjà la structure, il manque juste la contrainte de hauteur.*

**8. [Ambigu] Tâches/Textes** — voir §F : l'écran est refondu, la partie fixe
est à définir avec sa nouvelle forme. Proposition : le bouton global (journal /
ma vie), le compte de résultats, et le champ de recherche texte.

**9. [Ambigu] Tâches/Consigne** — écran court, il ne scrollera probablement
jamais. *Recommandation : pas d'en-tête fixe, sauf la barre de navigation.*

**10. [Ambigu] Tâches/Revue** — voir §D, c'est là que ta demande est la plus
précise et la plus coûteuse.

**11. [Ambigu] Réglages** — 82 lignes d'albums, chacune avec son formulaire :
c'est le plus long écran de l'application.
*Recommandation : fixer le titre et le champ de recherche (qui existe déjà),
laisser la liste scroller.*

**12. [Non dit] Tâches (la liste des BD) et le bandeau de volume absent.**
Le bandeau « volume démonté » est global, hors des écrans de tâche.
→ Reste-t-il visible en permanence en haut, au-dessus de tout ?
*Recommandation : oui. C'est une information qui invalide l'export ; la faire
scroller hors de vue est exactement le cas où elle sert.*

---

## C. La sous-page Consigne

**13. [Ambigu] Qu'est-ce qui déménage sur Consigne ?**
Aujourd'hui l'écran Revue porte trois choses éditables : la **consigne pour le
LLM**, la **période de la tâche** (mois/année, ajoutée ce matin), et le
**panneau Notes**.
→ **(a)** la consigne seule · **(b)** consigne + période · **(c)** consigne +
période + notes.
*Recommandation : **(b)**. La consigne et la période sont ce que la tâche
**déclare** ; les notes sont de la matière que tu écris en revoyant, elles ont
leur place à côté de ce qu'elles commentent. Mais voir §D.16 : les notes
gagneraient aussi à être joignables depuis Images et Textes.*

**14. [Non dit] L'ordre exact de la barre.**
`Images | Textes | Consigne | Revue` — c'est ce que « entre Textes et Revue »
donne littéralement.
*Recommandation : oui, et l'URL `/consigne/:slug`, comme les trois autres.*

**15. [Non dit] La consigne reste-t-elle visible en lecture sur Revue ?**
Tu exportes depuis Revue ; la consigne part dans le manifeste. La relire au
moment d'exporter a du sens.
→ **(a)** rappelée en lecture seule sur Revue · **(b)** plus du tout sur Revue.
*Recommandation : **(a)**, repliée, avec un lien vers Consigne pour l'éditer.*

---

## D. La sous-page Revue

**16. [Ambigu] « Afficher la photo sélectionnée » — laquelle, et à quelle taille ?**
La liste ne montre aujourd'hui que les 8 premiers caractères de l'identifiant.
Trois lectures possibles :
→ **(a)** une vignette sur **chaque** ligne de la liste · **(b)** **une** grande
image, celle de la ligne survolée ou sélectionnée, dans la partie fixe ·
**(c)** les deux.
*Recommandation : **(a)**. C'est ce qui rend l'ordre de lecture du LLM
vérifiable d'un coup d'œil — et réordonner à l'aveugle, ce que tu fais
aujourd'hui, est précisément le geste impossible. Les vignettes existent déjà
pour les 3 930 photos, l'affichage est instantané.*

**17. [Ambigu] Que contient exactement la partie fixe de Revue ?**
Tu la définis par « au-dessus de Consigne pour le LLM » — mais la consigne
déménage (§C). Candidats aujourd'hui présents au-dessus : le titre, le
**bandeau de contrôle** (8 compteurs), et la **chronologie**. La chronologie
est haute ; figée, elle mange la moitié de l'écran.
→ **(a)** titre + bandeau + bouton Exporter fixes ; la chronologie scrolle ·
**(b)** titre + bandeau + chronologie + bouton Exporter, tout fixe ·
**(c)** titre + bouton Exporter seulement.
*Recommandation : **(a)**. La chronologie se consulte, le bandeau et l'export
se gardent sous la main.*

**18. [Non dit] Le rapport d'export apparaît où ?**
Il s'affiche aujourd'hui **sous** le bouton, en bas de page. Bouton remonté en
haut, le rapport reste en bas : tu cliques en haut et le résultat sort hors
écran.
*Recommandation : rapport et erreurs d'export dans la partie fixe, juste sous
le bouton. Y compris « Écraser le dossier existant », qui est une décision à
prendre au moment où on la lit.*

**19. [Tension] Revue ne liste que les images.**
La spec dit « les images, les textes groupés par source, les notes ». Le code
n'affiche que les images ; les textes sélectionnés ne sont nulle part, alors
qu'ils partent dans l'export. Ce n'est pas dans ton brief.
→ **(a)** ajouter la liste des textes retenus en V1.5 · **(b)** la laisser pour
plus tard, et l'écrire comme un manque connu.
*Recommandation : **(a)**. Une revue qui ne montre pas tout ce qu'elle exporte
n'est pas une revue. Le coût est faible, la donnée est déjà dans la réponse.*

**20. [Non dit] Un défaut trouvé au passage.** Chaque bouton de retrait de la
liste Revue s'intitule littéralement « Retirer scan-0007 »
(`src/screens/ReviewScreen.tsx`, chaîne en dur, sur toutes les lignes). Je le
corrige dans la V1.5 sans poser de question, sauf avis contraire.

---

## E. Réglages

**21. [Ambigu] « Je ne vois pas bien l'intérêt du bouton Tâches/Réglages » — de
quoi parles-tu ?**
Il y a deux choses portant ce nom : le lien **Réglages** de l'en-tête global, et
l'écran qu'il ouvre. Cet écran porte aujourd'hui les **périodes des 82 albums**
(24 marqués « couvre peut-être une plage ») et les **périodes des documents du
site web**. C'est l'écran que la spec appelle « le plus petit rendement le plus
élevé » : 25 saisies redatent 421 photos.
→ **(a)** tu ne l'as pas ouvert, et il faut mieux le signaler depuis l'écran
Images · **(b)** tu l'as vu et il ne te sert pas · **(c)** tu parles d'autre
chose.
*Je ne peux pas répondre à ta place : si c'est **(b)**, l'arbitrage des dates
d'album repose sur des préfixes dont tu as toi-même dit qu'ils sont des
débuts, pas des mois — et 421 photos restent datées trop large.*

**22. [Tension] `TASKS_ROOT` modifiable depuis l'interface : ce que ça coûte.**
C'est aujourd'hui une **variable d'environnement obligatoire**, lue une seule
fois au démarrage (`server/src/runtime/config.ts`). Elle sert à deux choses
distinctes : dire où écrire, et **constituer la liste blanche d'écriture** de
`safeFs` — la garantie, testée par un invariant
(`server/src/invariants/never_writes_outside.itest.ts`), que le serveur n'écrit
nulle part ailleurs. Rendre cette valeur éditable depuis un formulaire de
navigateur transforme cette liste blanche en donnée mutable à chaud : un champ
texte de l'interface pourrait pointer le serveur sur `/` ou sur le volume des
originaux, qui ne doit jamais recevoir d'écriture.
→ **(a)** l'écran **affiche** `TASKS_ROOT` en lecture seule, avec le chemin et
sa disponibilité (`/system/status` les sert déjà) et dit qu'il se change dans
`.env` puis redémarrage · **(b)** éditable, mais **restreinte** à un
sous-dossier d'une racine autorisée fixée dans l'environnement ·
**(c)** éditable sans contrainte, l'invariant est assoupli.
*Recommandation : **(a)** pour la V1.5, **(b)** si le besoin de changer de
racine est réel. **(c)** défait une protection qui a coûté cher, pour un
réglage que tu changeras peut-être deux fois dans la vie du projet.*

**23. [Tension] Le répertoire de stockage **par tâche** n'existe pas comme
réglage persistant.**
`PATCH /tasks/:slug` n'accepte que `title`, `brief`, `period`. Le champ
`directory` existe uniquement dans le **corps de l'appel d'export**, à usage
unique ; `exportDirectory` sur la tâche est le chemin **du dernier export
réalisé**, pas une préférence. Le rendre réglable est un ajout au contrat côté
serveur (champ, validation, confinement au même titre que §E.22).
→ **(a)** on l'ajoute, confiné sous `TASKS_ROOT` · **(b)** on l'ajoute, chemin
absolu libre · **(c)** on garde le défaut `<TASKS_ROOT>/<slug>` et on offre
seulement « exporter ailleurs cette fois » au moment de l'export.
*Recommandation : **(a)**. Tu gardes le contrôle, l'invariant d'écriture tient,
et un dossier livré reste retrouvable sans chercher.*

**24. [Non dit] Le dossier déjà exporté quand on change le répertoire.**
Une tâche exportée dans `A/`, dont on change le répertoire pour `B/` : `A/`
reste sur le disque.
→ **(a)** on ne touche à rien, l'écran dit que l'ancien dossier subsiste et le
nomme · **(b)** on propose de le déplacer.
*Recommandation : **(a)**. « Supprimer une tâche ne touche pas au dossier déjà
exporté » est déjà la règle ; celle-ci en est le prolongement.*

**25. [Non dit] Que fait-on d'un répertoire qui n'existe pas encore ?**
→ **(a)** le créer à la première utilisation · **(b)** refuser tant qu'il
n'existe pas.
*Recommandation : **(a)** pour un sous-dossier de tâche, **(b)** pour une
racine — créer une racine par erreur de frappe donne un dossier fantôme qu'on
ne retrouve jamais.*

---

## F. Tâches / Textes — la refonte

*La plus grosse partie, et celle où la donnée résiste le plus. Tu dis « au plus
simple » : plusieurs des recommandations ci-dessous vont dans ce sens même
quand elles réduisent la demande.*

### F.1 — Le bouton global

**26. [Ambigu] Deux positions ou trois ? Que devient le site web ?**
Ton bouton dit « journal de bord ou ma vie ». Le corpus a une **troisième
source** que tu ne nommes pas : le site web, **569 passages sur 60 documents**,
plus **205 légendes de galerie** appariées par empreinte visuelle à des photos
de 2003-2004. Aucun de ces textes n'a de date — tes deux filtres (dates et
texte) ne s'y appliquent donc pas de la même façon. Or les légendes de galerie
sont, d'après la spec, **la seule source de texte d'époque pour 2003-2004**, la
période où le journal est muet et où il y a 2 041 photos.
→ **(a)** trois positions ; en « Site web » les filtres de date se désactivent
avec leur raison · **(b)** deux positions, le site web disparaît de l'écran ·
**(c)** deux positions + un accès séparé aux légendes de galerie.
*Recommandation : **(a)**. Faire disparaître 569 passages et 205 légendes d'un
écran nommé « Textes » est une perte silencieuse — exactement ce que la règle
« un faux négatif coûte une photo qu'on ne retrouvera jamais » cherche à
éviter.*

**27. [Tension] « Le journal de bord » désigne deux jeux de textes différents.**
Le document `logbook` porte **492 passages** et **1 012 entrées de journal**.
456 identifiants existent **dans les deux** avec un **texte différent** :
`logbook/p025/011` est « Génois tangonné bâbord (Martin 15.32N…) » en passage,
et « Spi. Il fait beau. » en entrée. Une recherche sur « le texte du journal de
bord » renvoie aujourd'hui les deux — 89 résultats sur « mouillage », dont 36
entrées et 53 passages, avec des doublons apparents qui n'en sont pas.
→ **(a)** l'écran montre les **passages** (le texte de la page tel qu'il est
écrit), les entrées restent la matière du rapprochement · **(b)** il montre les
**entrées** (une ligne = un fait daté) · **(c)** les deux, dans deux
sous-listes.
*Recommandation : **(a)**. Ta demande — afficher une page, copier son texte,
en faire une note — porte sur ce qui est **écrit sur la page**, pas sur la
version structurée. Et c'est la lecture « au plus simple ».*

### F.2 — La liste de pages

**28. [Tension] La date affichée sous chaque page : lecture ou inférence ?**
Deux valeurs disponibles, deux natures :
- `window.start` de la page — une **inférence** (`kind: "inference"`) ; absente
  sur 3 pages du journal ; **héritée de la page précédente sur 22 des 103 pages
  de « Ma vie »**, où rien de la page ne l'affirme.
- la plus petite date **lue** sur la page (les passages, `kind: "reading"`,
  précision au jour, dates exactes) ; elle diffère de `window.start` sur 5 pages
  du journal.

La règle « une inférence ne doit jamais ressembler à une lecture » impose que le
premier s'affiche en **ambre italique avec `≈`** et le second en **vert**. Une
liste où la moitié des dates est ambre est laide ; une liste où tout est vert
est fausse.
→ **(a)** afficher la **plus petite date lue** sur la page, en vert ; les pages
sans passage daté affichent « sans date » · **(b)** afficher `window.start`,
donc en ambre `≈` partout · **(c)** afficher la date lue quand elle existe,
sinon la fenêtre en ambre.
*Recommandation : **(a)**. C'est vrai, c'est vert, et ça ne demande aucune
exception à la règle. Les 22 pages « héritées » de « Ma vie » ont de toute
façon des passages datés ; ce sont les 3 pages du journal sans aucune date qui
tomberont en « sans date », et il faut qu'elles se voient.*

**29. [Tension] Dans quel ordre les pages ? Le journal n'est pas chronologique.**
Page 5 du journal = **avril 1998**, page 3 = juillet 1998, page 8 = février
1999. « Ma vie » est chronologique de bout en bout.
→ **(a)** trier par **date** par défaut, le numéro de page affiché à côté ·
**(b)** trier par **numéro de page** par défaut, la date affichée à côté ·
**(c)** un sélecteur, défaut = date.
*Recommandation : **(c)** avec défaut **date**. Tu filtres par période : une
liste qui remonte au hasard dans le temps rendrait ton propre filtre illisible.
Mais le numéro de page reste le repère physique quand tu as le cahier en main.*

**30. [Non dit] Les pages sans aucune date : où vont-elles ?**
Trois pages du journal (dont p001 et p002), zéro sur « Ma vie ».
→ **(a)** groupées à la fin, jamais dispersées à une date inventée ·
**(b)** masquées dès qu'un filtre de date est actif.
*Recommandation : **(a)**, exactement la règle déjà appliquée aux photos sans
date dans la grille. Et **(b)** est de toute façon le comportement du serveur
sous filtre (voir §F.34).*

**31. [Ambigu] « Une miniature de la page du haut pour le journal de bord » —
qu'est-ce que « la page du haut » ?**
Je ne sais pas lire cette phrase avec certitude. Trois lectures :
→ **(a)** le **haut de la page** — un cadrage sur le premier tiers, là où la
date est écrite · **(b)** la page **de gauche** d'une double page scannée ·
**(c)** la **première** page d'un groupe de pages partageant une date.
*Recommandation : **(a)** si c'est la date que tu veux reconnaître d'un coup
d'œil. Mais aucune donnée ne dit **où** se trouve quoi que ce soit sur une page
(`regionsAvailable: false` sur les 155 pages) : un cadrage serait un
pourcentage arbitraire, pas une région connue. Si c'est **(a)**, ma
recommandation est de rogner à 35 % de hauteur, à ajuster à l'œil, et de le
dire comme un cadrage aveugle.*

**32. [Tension] Les miniatures n'existent pas et coûtent 49 Mo telles quelles.**
155 JPEG, ~300 Ko pièce, servis entiers par `/pages/image`. Afficher les 103
pages de « Ma vie » télécharge **31 Mo**.
→ **(a)** un point d'accès `/pages/thumb?pageId=…&edge=…` côté serveur, avec
cache disque, comme les rendus de photos · **(b)** chargement paresseux des
images pleines au défilement · **(c)** pas de miniature en V1.5, une liste
texte.
*Recommandation : **(a)**. C'est du travail back non négligeable mais le
mécanisme existe déjà pour les photos (`RENDER_CACHE_ROOT`, sémaphore de rendu
partagé) ; **(b)** seul laisse 300 Ko par vignette visible, ce qui reste
mauvais sur 103 lignes.*

### F.3 — Les filtres de dates

**33. [Ambigu] Une seule plage, ou plusieurs simultanées ?**
Ta phrase — « une ou + année seulement, ou une ou + année/mois de début et
année/mois de fin » — se lit de deux façons : soit **plusieurs plages en même
temps** (août 1999 **et** février 2001), soit **une seule plage** dont les deux
bornes se saisissent à la granularité que tu veux. Le serveur n'accepte
aujourd'hui **qu'une seule paire** `dateFrom`/`dateTo`.
→ **(a)** une seule plage, granularité au choix (année, année/mois,
année/mois/jour) · **(b)** plusieurs plages cumulées, en OU ·
**(c)** multi-sélection d'**années** entières (cumulables) **ou** une plage
unique fine — jamais les deux à la fois.
*Recommandation : **(c)**. Elle couvre les trois usages que tu décris, ne
demande **aucun changement de contrat** pour la plage (une seule paire), et le
cumul d'années se résout côté client sur 52 et 103 pages sans aller-retour.
**(b)** oblige à N appels serveur ou à une extension du contrat, pour un besoin
que je ne t'ai pas entendu formuler.*

**34. [Tension] Un filtre de date exclut aujourd'hui tout texte non daté —
silencieusement.**
La requête serveur impose `date_start IS NOT NULL` : dès qu'une plage est
active, elle écarte **341 unités du journal**, **121 passages de « Ma vie »**
et **la totalité du site web**. Ils ne sont pas comptés comme écartés, ils
disparaissent.
→ **(a)** afficher un compteur « N textes sans date, écartés par le filtre »
avec un geste pour les ramener — comme le troisième compteur de la grille de
photos · **(b)** les laisser disparaître.
*Recommandation : **(a)**. C'est déjà la convention de l'écran Images, et
c'est ce que la règle « le doute inclut » impose.*

**35. [Ambigu] Le filtre porte sur la page ou sur les passages ?**
Filtrer les **pages** par leur fenêtre (une inférence, parfois héritée) et
filtrer les **passages** par leur date (une lecture) ne donnent pas le même
ensemble.
→ **(a)** filtrer sur les passages, une page apparaît dès qu'un de ses
passages tombe dans la plage · **(b)** filtrer sur la fenêtre de la page.
*Recommandation : **(a)**. Seul **(a)** repose sur des dates certaines, et
« une page dès qu'un passage correspond » est la version qui rappelle le plus —
la règle « le rappel prime sur la précision » du corpus.*

**36. [Non dit] Le sélecteur ne propose que ce qui existe ?**
« Ma vie » couvre **août à novembre 1999** — 4 mois, 81 jours renseignés, **une
seule année**. Le journal couvre avril 1998 à juin 2002, mais **249 journées
seulement** sur quatre ans. Un sélecteur jour ouvert sur un calendrier complet
propose 1 500 journées vides.
→ **(a)** ne proposer que les années/mois/jours réellement renseignés, avec
leur nombre de pages · **(b)** un calendrier complet.
*Recommandation : **(a)**. Sur « Ma vie » ça réduit le sélecteur d'année à un
seul bouton, et c'est une information, pas une limitation.*

### F.4 — Le filtre par texte

**37. [Non dit] La recherche est-elle restreinte à la source active ?**
Tu écris « dans ce cas on cherche dans le texte de ma vie (si sélectionné) ou
dans le texte du journal de bord » — donc oui, elle suit le bouton global. Le
serveur sait déjà le faire (`/texts?q=…&documentId=…`).
→ Confirme simplement : **(a)** toujours restreinte à la source active ·
**(b)** une case « chercher dans toutes les sources ».
*Recommandation : **(a)** en V1.5. La recherche globale existe déjà, sans
restriction, sur `/texts?q=` — on pourra l'exposer plus tard sans rien casser.*

**38. [Non dit] La recherche cherche dans le texte corrigé.**
La vue de recherche porte le texte **effectif** — corrigé si tu l'as corrigé.
Chercher un mot que l'OCR avait mal lu et que tu as réparé le trouve ; chercher
la faute d'origine ne le trouve plus.
→ **(a)** c'est le bon comportement, on n'y touche pas · **(b)** chercher aussi
dans la transcription d'origine.
*Recommandation : **(a)**.*

**39. [Non dit] Le résultat d'une recherche : des pages ou des passages ?**
Ton écran liste des pages. Une recherche renvoie des passages.
→ **(a)** les pages qui contiennent un résultat, avec « 3 correspondances » et
l'extrait surligné · **(b)** les passages, à plat, hors de la liste de pages.
*Recommandation : **(a)**. Un seul objet à l'écran, comme tu le demandes. Le
surlignage est déjà servi par le serveur (`highlights`, offsets UTF-16).*

### F.5 — Sélectionner un texte pour la BD

**40. [Tension — bloquant] La refonte supprime le geste par lequel un texte
entre dans une BD.**
L'écran actuel liste des **passages**, chacun avec sa case à cocher : c'est le
seul chemin par lequel un texte rejoint une tâche, et ce qui remplit
`journal.md` / `ma-vie.md` dans le dossier livré. Ton nouvel écran liste des
**pages**. Rien dans ton brief ne dit ce que devient la sélection.
→ **(a)** ouvrir une page déplie ses passages, chacun avec sa case — la
sélection reste au passage · **(b)** on sélectionne la **page entière** (tous
ses passages d'un coup) · **(c)** on ne sélectionne plus de texte depuis cet
écran, seule la création de note (§F.6) l'alimente.
*Recommandation : **(a)**. **(c)** viderait la section « textes » du dossier
livré, qui est la moitié de la matière que le LLM reçoit. **(b)** est
séduisant mais une page du journal porte jusqu'à 32 passages sur 11 jours.*

**41. [Non dit] Que deviennent les fonctions déjà en place sur cet écran ?**
Trois existent aujourd'hui et ton brief ne les mentionne pas : **corriger une
transcription**, **voir les N photos que ce texte recouvre** (qui ouvre la
grille pré-filtrée), et la **page scannée affichée en regard** avec zoom.
→ **(a)** toutes conservées, rattachées au passage déplié · **(b)** on en
abandonne, dis lesquelles.
*Recommandation : **(a)**. « Voir les images » est le seul pont
texte → photos de l'application ; le supprimer casserait le flux principal.*

### F.6 — Créer une note depuis le texte d'une page

**42. [Tension] Ce geste met du texte d'époque dans l'emplacement des notes
d'aujourd'hui.**
La règle en vigueur : **trois natures de texte, trois emplacements** — texte
d'époque, note humaine d'aujourd'hui, légende de machine, jamais mélangés,
parce que le LLM est le seul lecteur du dossier et ne peut pas faire la
différence. L'export écrit les notes dans `textes/notes.md` sous
`## <titre>` + texte brut. Coller le texte d'une page de 1999 dans une note
place une transcription d'époque dans le fichier réservé à ce que tu écris
aujourd'hui — et le titre que tu proposes (« journal de bord, page 5 du
12/04/1998 ») indique la provenance à un lecteur humain, pas au manifeste.
→ **(a)** la note **cite** le texte sans le recopier : elle est créée vide,
avec ton titre, **rattachée** au passage (`attachedTo.texts` existe déjà et
part dans le manifeste), et le passage est sélectionné du même geste — le texte
d'époque part dans `journal.md`, ta note dans `notes.md`, le lien est explicite ·
**(b)** on recopie le texte dans la note, et le manifeste porte un champ qui
dit « ceci est une citation, pas un souvenir » · **(c)** on recopie sans rien
marquer.
*Recommandation : **(a)**. Elle te donne exactement le geste que tu décris —
un clic, une note titrée, le texte disponible pour le LLM — sans ouvrir la
seule frontière que la spec protège explicitement. **(c)** la casse. **(b)**
est un compromis viable mais demande un amendement au contrat gelé.*

**43. [Tension] « page xx du jj/mm/aaaa » : les deux valeurs existent, mais la
seconde n'est pas celle que tu crois.**
- « page xx » : `ordinal` existe et est fiable (1…52, 1…103). Le champ `label`
  est `null` sur les 155 pages — il n'y a pas d'autre numérotation.
- « la 1ère date du document » : **elle n'existe pas**. `TextDocument.span` est
  `null` sur les 62 documents. Et prise au pied de la lettre, elle donnerait le
  **même titre à toutes les pages d'un document** — « page 5 du 12/04/1998 » et
  « page 40 du 12/04/1998 ».

Je suppose que tu veux la première date **de la page**. Mais sur le journal,
comme les pages ne sont pas chronologiques, tu obtiendras « page 3 du
09/07/1998 », « page 5 du 12/04/1998 » — correct, et déroutant.
→ **(a)** « journal de bord, page 5 du 12/04/1998 » où la date est la plus
petite date **lue sur cette page** · **(b)** la date de la page, et rien si la
page n'en a pas : « journal de bord, page 1 » · **(c)** ton titre littéral,
avec la première date du document entier.
*Recommandation : **(a)** avec le repli de **(b)** pour les 3 pages sans date.
Et le titre reste éditable avant enregistrement — c'est un défaut proposé, pas
une contrainte.*

**44. [Non dit] La note reprend quel texte ?**
→ **(a)** tous les passages de la page, dans l'ordre de lecture ·
**(b)** seulement ceux que tu as sélectionnés · **(c)** ce que tu as surligné à
la souris.
*Recommandation : **(b)**, qui se marie avec §F.40(a) : tu coches ce qui
t'intéresse, le bouton fabrique la note. **(c)** demande une gestion de
sélection de texte dont le bénéfice n'est pas clair — et la spec a déjà tranché
« passage entier en V1 » sur une question voisine.*

**45. [Non dit] Une note créée ici est rattachée à quelle tâche ?**
Les notes sont **par tâche**. L'écran Textes est déjà dans une tâche
(`/textes/:slug`), donc la réponse va de soi — sauf si tu veux pouvoir prendre
une note sans tâche ouverte.
*Recommandation : la tâche courante, et le bouton n'existe pas hors tâche.*

---

## Récapitulatif — ce qui bloque vraiment

Quatre réponses conditionnent la forme de la spécification ; les autres se
tranchent après.

1. **§F.40** — comment on sélectionne un texte pour la BD après la refonte. Sans
   réponse, la moitié du dossier livré n'a plus de source.
2. **§F.42** — la note créée depuis une page : citation rattachée, ou recopie.
   C'est la seule question qui touche une règle que la spec protège
   explicitement.
3. **§F.28 + §F.29** — la date affichée sur une page (lecture ou inférence) et
   l'ordre de la liste. Elles décident du rendu de tout l'écran.
4. **§E.22** — `TASKS_ROOT` éditable ou affiché. Elle décide si le serveur garde
   sa garantie de ne jamais écrire hors des racines déclarées.

Et une question qui n'est pas bloquante mais qui vaut une phrase de ta part :
**§F.26**, le sort du site web et de ses 205 légendes de galerie — la seule
matière textuelle d'époque pour 2003-2004.
