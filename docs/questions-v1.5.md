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

Les questions marquées **TRANCHÉ** portent ta réponse et ne se rouvrent pas ;
elles restent là parce que ce qu'elles ouvrent est numéroté juste en dessous.
La numérotation ne suit pas l'ordre de lecture : elle est stable, pour qu'une
réponse « §F.54 : (a) » désigne toujours la même question.

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

**Le site web n'a pas de pages du tout.** Tu as confirmé qu'il rejoint le
bouton global comme troisième source. Mais les 569 passages de ses 60 documents
portent `pageId: null`, et les 60 documents portent `hasPages: false` et
`pageCount: null`. Il n'y a **aucun objet page** de ce côté : ni numéro, ni
date de page, ni image à mettre en vignette. Tout le modèle d'écran que tu
décris — une liste de pages, leur date de début, leur miniature, un titre de
note « page xx du jj/mm/aaaa » — n'a pas de contrepartie sur cette source. Ce
n'est pas seulement « il manque les dates » : c'est l'objet lui-même qui
manque. Voir §F.1bis.

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

**6. [Ambigu] « Vérifie que les noms de hiérarchie sont bien triés » — ils le
sont. Je pense que ta vraie demande est de **voir** le chemin.**
Je l'ai vérifié : `sortAlbumsByPath` trie sur le **chemin complet**
(`2003/2003-03-everglades`), corrigé hier matin, et l'ordre est juste. Mais
l'écran n'affiche que la **feuille** (`2003-03-everglades`) : le set qui donne
l'ordre — `1998-1999`, `2000-2001`, `2002`, `2003`, `2004` — est invisible. On
regarde une liste triée sur une clé qu'on ne voit pas, ce qui est exactement
l'impression d'une liste mal triée. Trois choses achèvent de la donner :
`2000` (album sans mois) et `2002-38Dec02` (préfixe abîmé, « 38 » n'est pas un
mois) tombent à des places qui semblent fausses, et `localeCompare` ignore la
casse, donc `2003-03-everglades` passe **avant** `2003-03-Fort Lauderdale`.
→ **(a)** afficher le **chemin complet** sur chaque ligne : la clé de tri
devient visible et le problème disparaît de lui-même · **(b)** afficher le set
en tête de groupe, les albums en dessous sans leur préfixe · **(c)** garder la
feuille seule, et je cherche un vrai défaut de tri ailleurs.
*Recommandation : **(a)**, qui répond du même coup à §A.1 — même geste, un seul
changement. Si après ça un album te paraît encore mal placé, ce sera un vrai
défaut et je le traiterai comme tel : dis-moi lequel.*

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
**TRANCHÉ — (a) : affiché, pas modifiable.** L'écran Réglages montre
`TASKS_ROOT` avec son chemin et sa disponibilité (`/system/status` les sert
déjà) ; le changer reste un geste de configuration dans `.env` suivi d'un
redémarrage. La liste blanche d'écriture de `safeFs` reste immuable et
l'invariant tient. Rien à décider de plus ici — mais §E.23 en dépend.

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

**26. TRANCHÉ — trois positions.** Tu as répondu d'avance : « ajoute en effet le
site web dans la liste des sources avec journal de bord, et ma vie ». Le bouton
global a donc trois positions. Ce que cette réponse **ouvre** fait l'objet de
§F.1bis ci-dessous : la troisième source ne se comporte comme aucune des deux
autres, et six décisions en découlent.

### F.1bis — La source « site web », puisqu'elle entre

*Elle entre, et elle ne rentre pas dans le moule. Ces questions ne rouvrent pas
ta décision : elles règlent ce qu'elle implique. La numérotation continue celle
du document.*

**46. [Tension] Cette source n'a pas de pages : que liste l'écran quand elle est
active ?**
Les 60 documents ont `hasPages: false`, `pageCount: null`, et leurs 569
passages ont tous `pageId: null`. Il n'y a **pas d'objet page** à lister, à
dater, à numéroter ni à mettre en vignette. Ton écran est construit autour de la
page.
→ **(a)** la liste devient une liste de **documents** (titre, nombre de
passages), qu'on déplie sur ses passages — même geste que §F.40(a), un cran
plus haut · **(b)** une liste de **passages** à plat, sans niveau intermédiaire ·
**(c)** on force un objet « page » artificiel par document.
*Recommandation : **(a)**. Le document web joue le rôle de la page : c'est
l'unité qu'on ouvre, et « Transat » ou « Vers Trinidad » se reconnaît par son
titre comme une page du journal se reconnaît par sa date. **(c)** fabriquerait
un numéro de page qui n'existe nulle part.*

**47. [Tension] Le filtre par date, sur une source où zéro texte est daté.**
`0 / 569`. Et le filtre serveur exige `date_start IS NOT NULL` : activé sur
cette source, il renvoie **zéro résultat**, aujourd'hui sans dire pourquoi.
→ **(a)** griser le bloc de filtres de date avec sa raison — « aucun texte du
site n'est daté », comme le fait déjà le filtre Lieu sur l'écran Images quand
aucune photo n'a de position · **(b)** le laisser actif et afficher zéro ·
**(c)** le masquer entièrement.
*Recommandation : **(a)**. L'application a déjà cette convention et elle est
bonne : un filtre désactivé **qui dit pourquoi** enseigne quelque chose sur le
corpus ; un filtre masqué laisse croire qu'on a mal cherché.*

**48. [Tension] `ref.web_span` est la vraie réponse, et elle est vide.**
La table existe, l'écran Réglages sait déjà l'éditer (`PUT /ref/web-span`,
section « Site web »), et **0 des 60 documents porte une plage**. Si tu les
saisis, tes filtres de date fonctionnent sur cette source et ces textes se
rapprochent des photos — la seule voie ouverte pour 2003-2004, où le journal
est muet devant 2 041 photos.
Deux obstacles concrets à te signaler avant que tu décides :
- **L'écran liste les 60 documents, pas les 25 du périmètre.** Il y a **24
  documents sous `2005/`** plus `web/2005-2006` (hors corpus), et des déchets :
  `web/1999/bidon` (1 passage, « Nouvelle page 1 »),
  `web/googlea0ccc7e24963cc5e` (un fichier de vérification Google),
  `web/test`, `web/usr/…`. Tu trierais à la main dans du bruit.
- **L'extrait censé te faire reconnaître un document est identique à son titre
  sur 45 des 60.** « Caraibes », « Funfun1 », « 1998-1999 » : il n'aide en rien.
**TRANCHÉ — tu saisis, et tu ajoutes un écran pour ça.** Tes mots : « ajoute une
option pour aller sur un écran de saisie des dates pour le site web », avec une
seule date de début par document puisque « la date de début du suivant est la
date de fin ». Tout ce que cet écran implique est en **§G**, et les deux
obstacles ci-dessus y reviennent : le périmètre de la liste (§G.62) et
l'extrait inutile (§G.66).

**49. [Tension] Ce qu'on affiche en regard, puisqu'il n'y a pas de page scannée.**
La décision « texte seul en V1 » tient toujours — `docs/frontend-spec.md` et
`docs/api-contract.md` (Q4, défaut (a)), jamais rouverte. Ses raisons sont
vérifiées sur disque : **305 fichiers HTML**, arborescence FrontPage complète
(`_themes`, `_borders`, `_derived`, `_fpclass`), et `file` rapporte bien un
encodage non-ISO avec des fins de ligne `NEL` — du `cp1252` d'époque.
S'y ajoute une raison que la spec ne mentionne pas : **`WEB_GALLERY_ROOT` est
sur le volume externe** (`/Volumes/OWC Envoy Ultra/…`), alors que `PAGES_ROOT`
est sur le disque interne. Un aperçu du site s'éteindrait dès que tu démontes le
disque, là où les pages scannées resteraient lisibles.
→ **(a)** texte seul, et le panneau droit dit pourquoi — la décision tient ·
**(b)** une iframe isolée sur le HTML d'origine · **(c)** les **images** de la
galerie du document, sans le HTML — elles sont déjà lues par l'appariement.
*Recommandation : **(a)** pour la V1.5. **(c)** est le compromis intéressant
si tu veux voir quelque chose, mais il dépend du volume externe et vaut d'être
posé séparément, une fois les liens de galerie relus (§F.51).*

**50. [Ambigu] Le titre de note pour un texte du site : « page xx du jj/mm/aaaa »
n'a ni page ni date.**
Ni numéro de page, ni date, sur cette source. Ton gabarit ne s'applique pas.
→ **(a)** « site web, Vers Trinidad » — le titre du document, rien d'inventé ·
**(b)** « site web, Vers Trinidad (1999-2002) » si tu as saisi une plage
(§F.48), sans parenthèse sinon · **(c)** un numéro d'ordre du passage dans le
document : « site web, Vers Trinidad, passage 12 ».
*Recommandation : **(b)**. Elle donne la seule information temporelle
disponible quand elle existe, et se tait quand elle n'existe pas — jamais un
jj/mm/aaaa fabriqué. Le sort de ce titre une fois posé se règle en §F.54,
comme pour les deux autres sources.*

**51. [Tension] Les 205 légendes de galerie — leur place est réglée, leur
fiabilité ne l'est pas.**
**Le registre est tranché** : ce ne sont pas une quatrième source. Ce sont des
passages du site portant **en plus** un lien vers une photo. Elles servent
d'abord à dater le document (§G) ; une fois le document daté, elles redeviennent
du texte d'époque, filtrable et sélectionnable comme le reste, avec leur photo
en regard. Rien à ajouter au modèle — c'est la bonne réponse et elle ferme la
tension de registre que j'avais signalée.

Reste ce qui n'est pas réglé, et qui est à toi : **aucune n'a été relue**, et
leur qualité est très inégale. Trois faits mesurés :
- **Aucune n'est vérifiée** : les 205 sortent avec `verified: false`. La spec
  prévoyait « une relecture visuelle des 209 liens avant de les tenir pour
  acquis » — elle n'a pas eu lieu. Et le champ ne distingue pas, en sortie,
  « pas encore relu » de « relu et rejeté ».
- **La moitié seulement est dans ta période** : 103 sur 2003, 53 sur 1999,
  **33 sur 2005-2006**, 16 ailleurs — dont **13 sur une page d'astronomie**
  (`web/Astro/misc/meade`), qui n'a rien à voir avec le bateau.
- **47 d'entre elles font plus de 400 caractères**, une atteint **10 363** :
  ce sont des paragraphes de page entiers, pas des légendes. 137 seulement
  tiennent en 120 caractères.
→ **(a)** un geste « ce lien est bon / ce lien est faux » **dans l'écran de
datation** (§G), là où tu regardes déjà la photo à côté de son texte — la
validation ne coûte alors rien de plus que ce que tu fais déjà ·
**(b)** le même geste, mais dans l'écran Textes · **(c)** aucun geste, elles
restent marquées « appariement machine, non relu » pour toujours.
*Recommandation : **(a)**. Tu ouvres l'écran de datation, tu regardes la photo
et sa légende pour trouver la date : à ce moment-là tu **sais** si le lien est
bon, et le dire est un clic. C'est le seul endroit où la relecture des 209
liens que la spec réclamait se fait sans être une corvée séparée. Sans elle,
ces textes restent servis comme des faits alors qu'aucun humain ne les a
regardés.*

**52. [Non dit] La recherche par texte sur cette source, elle, marche déjà.**
`/texts?q=…&documentId=web/…` fonctionne sans date. C'est le seul de tes deux
filtres qui s'applique tel quel au site.
→ Confirme simplement que l'écran doit le dire : quand « Site web » est actif,
la recherche texte reste le filtre principal et les dates sont grisées (§F.47).
*Recommandation : oui, et l'afficher comme tel plutôt que comme une source
diminuée.*

**53. [Non dit] Les 569 passages du site sont de tailles très inégales.**
Sur « Transat » : des passages de 7 et 10 caractères (« Transat », « Caraibes »
— des titres et des fragments de menu FrontPage) à côté de vrais paragraphes de
230 à 310 caractères.
→ **(a)** tout afficher, y compris les fragments · **(b)** masquer sous un seuil
(par exemple 40 caractères) avec un compteur « N fragments masqués » et un geste
pour les montrer.
*Recommandation : **(b)**. Un menu de navigation FrontPage n'est pas un texte
d'époque, et le seuil se voit et se défait — jamais un filtre silencieux.*

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
et **la totalité du site web** (voir §F.47, qui traite ce dernier cas à part).
Ils ne sont pas comptés comme écartés, ils disparaissent.
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

**40. TRANCHÉ — la sélection reste au passage, dans la page ouverte.** La liste
de pages sert à **naviguer** ; on ouvre une page, on voit ses passages, on coche
ceux qu'on veut. Le geste actuel survit intact, l'écran gagne l'entrée par page
et par date. `journal.md` et `ma-vie.md` gardent leur source. La question qui
suit reste ouverte, et devient plus simple sous cette réponse.

**41. [Non dit] Que deviennent les fonctions déjà en place sur cet écran ?**
Trois existent aujourd'hui et ton brief ne les mentionne pas : **corriger une
transcription**, **voir les N photos que ce texte recouvre** (qui ouvre la
grille pré-filtrée), et la **page scannée affichée en regard** avec zoom.
→ **(a)** toutes conservées, rattachées au passage déplié · **(b)** on en
abandonne, dis lesquelles.
*Recommandation : **(a)**. « Voir les images » est le seul pont
texte → photos de l'application ; le supprimer casserait le flux principal.*

### F.6 — Créer une note depuis le texte d'une page

**42. TRANCHÉ — la note recopie le texte.** Tes mots : « La note recopie, et
pourra être éditée plus tard, comme une édition de notes qui existe
actuellement. » Tu as lu ma recommandation de citer plutôt que recopier et tu
choisis l'autre, parce que tu veux retravailler le texte ensuite comme
n'importe quelle note. Je ne rouvre pas.

Mais recopier fait entrer un texte d'époque dans `textes/notes.md`, le fichier
réservé à ce que tu écris aujourd'hui. Le titre que tu as spécifié — « journal
de bord, page xx du jj/mm/aaaa » — est **ce qui empêche le LLM de t'attribuer
une phrase de 1999**. Il devient une pièce de sécurité, pas une commodité.
Trois questions en découlent, §F.54 à §F.56.

**54. [Tension] Le titre porte l'attribution : peut-il se perdre ?**
Deux choses à savoir avant de répondre. L'export écrit `## <titre>` puis le
texte brut dans `notes.md` — **le rattachement `attachedTo` n'apparaît pas dans
ce fichier**, seulement dans `manifest.json`. Pour qui lit le Markdown, le titre
est donc le **seul** porteur de provenance. Et `PATCH /tasks/:slug/notes/:noteId`
accepte déjà `title` : le rendre non modifiable à la création ne suffirait pas,
il faut aussi décider du sort de l'édition ultérieure.
→ **(a)** le préfixe d'attribution (« journal de bord, page 5 du 12/04/1998 »)
est **verrouillé** ; tu peux ajouter du texte à la suite, jamais l'effacer ·
**(b)** le titre est librement éditable, mais l'écran **prévient** quand ton
édition fait disparaître l'attribution · **(c)** librement éditable, sans rien.
*Recommandation : **(a)**. Tu as choisi la recopie pour pouvoir retravailler le
**texte** — le verrou ne porte que sur le préfixe du titre et ne te gêne pas
sur ce que tu voulais faire. **(c)** rend la protection facultative au moment
précis où on l'oublie.*

**55. [Tension] Une note recopiée puis éditée n'est plus verbatim, et rien ne le
dira.**
C'est la conséquence directe de ton choix, et elle est réelle : tu recopies un
passage, tu le retouches, tu en coupes la moitié. Le résultat cesse d'être une
citation **sans cesser d'y ressembler** — même titre, même apparence. Le
manifeste ne porte aujourd'hui, pour une note, que `id`, `createdAt`, `title`,
`text`, `attachedToImages`, `attachedToTexts` : **aucun champ ne dit d'où vient
le texte, ni s'il a bougé**.
→ **(a)** deux champs au manifeste : la **source** (`derivedFrom`, la référence
du passage recopié) et un drapeau **« édité depuis la recopie »** ·
**(b)** la source seulement, sans le drapeau · **(c)** rien, le titre suffit.
*Recommandation : **(a)**. Deux champs, calculables sans rien te demander —
le drapeau est une comparaison de chaînes à l'enregistrement. C'est un
amendement au contrat gelé, annoncé aux deux agents comme les trois
précédents. **(c)** laisse le LLM lire une phrase que tu as réécrite comme si
elle sortait du cahier.*

**56. [Non dit] Recopier **et** rattacher, tant qu'à faire.**
`attachedTo.texts` existe déjà au contrat et part dans le manifeste. Recopier
le texte **et** rattacher la note à son passage d'origine coûte presque rien et
rend le lien réversible : on retrouve toujours l'original, même après que tu as
retravaillé la note.
→ **(a)** oui, les deux · **(b)** recopie seule.
*Recommandation : **(a)**. C'est ce qui rend §F.55 vérifiable plutôt que
déclaratif.*

**57. [Non dit] Et le passage d'origine, on le sélectionne aussi ?**
Créer une note depuis un passage ne le fait pas entrer dans la tâche. Le texte
partirait donc dans `notes.md` (par ta recopie) sans être dans `journal.md`.
→ **(a)** créer la note coche aussi le passage · **(b)** non, les deux gestes
restent séparés · **(c)** on te le propose, décoché par défaut.
*Recommandation : **(b)**. Sous §F.42 tel que tu l'as tranché, la note **est**
le texte — le sélectionner en plus le ferait partir deux fois dans le dossier
livré, une fois dans `journal.md` et une fois dans `notes.md`. C'est
exactement le doublon que le LLM lirait comme deux sources concordantes.*

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
Ce titre n'est plus un simple défaut proposé : depuis que tu as tranché la
recopie (§F.42), c'est lui qui porte l'attribution — voir §F.54 pour savoir
s'il se modifie.*

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

## G. Le nouvel écran — saisir les dates du site web

*Tu l'ajoutes, accessible depuis la page principale, avec une seule date par
document : « tout est écrit de façon chronologique donc une date de début va
suffire (la date de début du suivant est la date de fin) ». Et l'écran montre
le texte du document plus **les photos liées avec leur légende**, pour t'aider
à trouver la date.*

*J'ai refait la mesure sur ta base avant d'écrire. Elle tient — **227 liens
vers 224 photos sur 27 pages**, dont 221 liens vers des photos datées (le
relevé qu'on m'a transmis disait 228 et 225 ; l'écart est sans effet). Ce qui
suit vient de cette mesure, et une bonne partie contredit la simplification que
tu proposes. Je le dis maintenant.*

**La bonne nouvelle d'abord, parce qu'elle est vraie et importante : la
proposition est excellente là où tu en as le plus besoin.** Les onze galeries
2003-2004 sont soutenues à **100 % par des dates lues, au jour près**, sur des
fourchettes de 0 à 21 jours. C'est exactement la période où le journal est muet
devant 2 041 photos. En face, les sept pages de 1999-2002 sont soutenues par des
dates **inférées ou arbitrées, presque jamais lues** — `Venez01` s'appuie sur
21 photos dont **21 datées au mois seulement**, et `VersTrinidad` sur une
fourchette de **259 jours**. La proposition vaut donc beaucoup là où tu es
aveugle, et peu là où le journal te couvre déjà.

**58. [Tension] « Tout est écrit de façon chronologique » — le récit peut-être,
l'ordre des fichiers non.**
C'est la mesure qui contredit le plus directement ta simplification. Triés par
date proposée, les documents ne sont pas dans l'ordre de leurs noms :
- `2003_gal_7` (09/10/2003) tombe **avant** `2003_gal_5` (13/10/2003) ;
- `2003_gal_16` (04/05/2004) tombe **avant** `2003_gal_13` (08/08/2004) ;
- `web/1999/funfun1`, rangé dans `1999/`, propose **16/12/2001** ;
- `web/2005/images/2005_4`, rangé dans `2005/`, propose **16/05/2003**.

« Le suivant » n'est donc pas le suivant dans l'arborescence.
→ **(a)** « le suivant » = le document dont la **date saisie** est la plus
proche au-dessus : la chaîne se réordonne toute seule à mesure que tu saisis ·
**(b)** tu ranges les documents dans un ordre manuel, et la chaîne suit cet
ordre · **(c)** l'ordre des chemins, tel quel.
*Recommandation : **(a)**. Elle est la seule qui ne te demande aucun travail
supplémentaire et la seule que la mesure ne contredit pas. **(c)** produirait
des intervalles négatifs sur les quatre cas ci-dessus.*

**59. [Non dit] Le dernier document de la chaîne n'a pas de suivant, donc pas de
fin.**
→ **(a)** il reste ouvert : « à partir du 05/10/2004 », rendu comme une borne
et jamais comme un intervalle · **(b)** il se ferme sur la fin du périmètre
(31/12/2004) · **(c)** tu saisis une date de fin pour celui-là seulement.
*Recommandation : **(c)**. Une seule saisie de plus dans toute la série, et
elle évite qu'un document se voie attribuer en silence une fin que tu n'as pas
choisie. **(a)** est le repli acceptable si tu ne veux rien saisir de plus.*

**60. [Tension] Un document laissé vide au milieu — le cas existe déjà, mesuré.**
`web/2003/2003_gal_9` porte 2 passages et **zéro photo liée** : aucune
proposition possible. Il est assis entre `2003_gal_8` (29/10/2003) et
`2003_gal_10` (11/11/2003). Sous la règle « la fin est le début du suivant », si
tu ne le dates pas, la période de `gal_8` s'étend **jusqu'au 11/11** et avale
silencieusement celle de `gal_9`, qui n'a lui-même aucun intervalle.
→ **(a)** un document non daté est **sauté** par la chaîne et reste sans date —
ses textes ne se rapprochent d'aucune photo, et l'écran le signale comme un trou
· **(b)** il hérite de l'intervalle du trou (du 29/10 au 11/11) · **(c)** il
bloque la chaîne tant qu'il n'est pas saisi.
*Recommandation : **(a)**. **(b)** fabrique une date que personne n'a posée, sur
un document dont on ne sait rien — c'est précisément ce que la règle des trois
natures interdit. Le trou doit se voir, pas se combler tout seul.*

**61. [Tension] Trois documents proposent exactement la même date.**
`web/photo`, `web/1999/Venez01` et `web/1999/Venez02` proposent tous les trois
**01/12/2000 → 31/12/2000**, parce que leurs photos sont datées au mois. Sous
« la fin est le début du suivant », au moins deux d'entre eux reçoivent un
intervalle de **largeur nulle**.
→ **(a)** deux documents peuvent porter la même date de début : la chaîne les
traite comme un seul segment partagé · **(b)** l'écran refuse deux dates
identiques et te demande de les départager · **(c)** l'écran te prévient sans
refuser.
*Recommandation : **(c)**. Deux pages web écrites le même jour, c'est
plausible ; un intervalle de largeur nulle qui fait disparaître un document du
rapprochement, non. Le prévenir te laisse trancher sans t'imposer une précision
que tu n'as pas.*

**62. [Tension] Sur quels documents la chaîne court-elle ? Il y en a 60, et la
majorité n'a rien à y faire.**
Mesuré : sur les 60, **16 sont `web/2005/3/raiders/*`** (2 passages chacun, une
liste de noms), plus `web/googlea0ccc7e24963cc5e` (vérification Google),
`web/test/map`, `web/1999/bidon` (« Nouvelle page 1 »), `web/favorite`, et
**une vingtaine de documents `2005/`-`2006/` hors corpus**. Une chaîne qui les
traverse tous produit des segments absurdes entre deux vrais documents.
→ **(a)** la chaîne ne court que sur les documents du **périmètre 1998-2004**,
les autres sont masqués derrière un « voir tout » · **(b)** elle court sur les
60 · **(c)** tu coches toi-même les documents qui entrent dans la chaîne.
*Recommandation : **(a)**. Ça ramène l'écran à une vingtaine de lignes, ce qui
est le seul format dans lequel la saisie se fera vraiment.*

**63. [Tension] Pré-remplir la date proposée contredit une règle écrite.**
Le contrat dit, en nommant explicitement `WebDocumentRow` : les indices d'aide
à la saisie sont présentés **« COMME DES INDICES et jamais pré-remplis dans les
champs de saisie »** (`docs/api-contract.md`), « ce sont exactement les données
que l'arbitrage a jugées peu fiables ». L'écran des périodes d'album applique
cette règle à la lettre depuis le début : il montre les motifs de noms de
fichiers et la plage EXIF écartée, et laisse les champs vides.
→ **(a)** la date proposée s'affiche **à côté** du champ vide, avec un bouton
« adopter cette date » qui la recopie en un clic · **(b)** le champ est
pré-rempli, la règle est amendée pour ce cas · **(c)** indice pur, sans bouton.
*Recommandation : **(a)**. Tu obtiens l'ergonomie du pré-remplissage — un clic
sur les 22 documents proposés — sans toucher à la règle : le champ reste vide
tant que tu n'as pas agi, et c'est ton geste qui pose la date. **(b)** demande
un amendement au contrat gelé pour un gain d'un seul clic.*

**64. [Tension] La nature de la date que tu saisis : une décision close dit
« inférence », et ce nouvel écran pourrait la rouvrir.**
Le 29/08 tu as tranché toi-même, après trois allers-retours entre agents, que
`ref.web_span` est une **inférence** — ambre italique avec `≈` — et non une
décision. Le motif retenu : poser une plage sur un document qui ne porte aucune
date, c'est *combler un vide*, une conjecture ; alors que corriger la date d'une
photo, c'est *arbitrer* contre un EXIF qu'on avait sous les yeux. La décision est
marquée « ne pas rouvrir ».

Ce nouvel écran change une chose : **il te met une date proposée sous les yeux**.
Ton geste ressemble alors davantage à l'arbitrage qu'à la conjecture. On m'a
transmis la lecture inverse de la mienne — « la proposition est une inférence,
sa saisie est une décision » — et je ne la trancherai pas à ta place, parce
qu'elle contredit une décision que tu as prise.
→ **(a)** rien ne change : ta date reste une **inférence** en ambre `≈`, et ce
qui distingue la proposition de ta saisie est un **état** (« proposé, non
validé » / « saisi »), pas une couleur · **(b)** ta date devient une
**décision** en violet dès lors qu'une proposition était affichée — la décision
du 29/08 est amendée pour ce cas.
*Recommandation : **(a)**. Contredire une proposition qui dérive elle-même de
photos inférées ne transforme pas ta conjecture en lecture — et sur les sept
documents de 1999-2002, la proposition s'appuie sur des dates au mois, pas sur
des faits. Deux états suffisent à ne pas confondre proposé et saisi, sans
toucher au seul endroit du système qui produit du violet.*

**65. [Non dit] La proposition doit dire sur quoi elle repose — elle est très
inégale.**
Mesuré, par document : `2003_gal_15` s'appuie sur **20 photos toutes datées au
jour et lues**, fourchette 9 jours. `web/photo` s'appuie sur **une seule photo,
datée au mois**. `Caraibe` sur 11 photos dont 9 inférées, fourchette **181
jours**. Une même ligne « date proposée » recouvre ces trois cas.
→ **(a)** afficher sous chaque proposition : le nombre de photos, combien sont
datées au jour, et la largeur de la fourchette — « 20 photos, toutes au jour,
sur 9 jours » contre « 1 photo, au mois » · **(b)** un simple indicateur de
confiance · **(c)** la date seule.
*Recommandation : **(a)**. C'est la même exigence que partout ailleurs dans
cette application : une valeur calculée dit ce qu'elle vaut. Et la différence
entre les deux exemples ci-dessus est exactement celle qui te fera valider d'un
clic ou aller vérifier.*

**66. [Non dit] Les documents qui ont le plus besoin d'une date n'ont aucune
proposition.**
Les 27 pages proposées sont surtout des galeries. Les documents **narratifs**,
ceux qui portent le plus de texte, n'ont aucune photo liée : `web/1999-2002`
(17 passages), `web/2005-2006` (10), `web/index` (9), `web/2003-2004` (8),
`web/1999/vie_a_bord` (7), `web/1998-1999` (6), `web/1900-1988` (4). Ce sont
ceux dont le titre annonce une période, et ceux que la chaîne aidera le moins.
→ **(a)** trier l'écran par **besoin** : d'abord les documents sans proposition
et à fort volume de texte, ensuite les proposés à valider · **(b)** trier par
date proposée · **(c)** trier par chemin.
*Recommandation : **(b)** comme ordre principal — c'est une chaîne
chronologique, la voir dans l'ordre est ce qui te permet de repérer une date
aberrante — avec les non proposés intercalés à leur place présumée et marqués.
**(a)** casse la lecture de la chaîne, qui est justement l'intérêt de ta
simplification. Et pour ces documents-là, l'aide n'est pas la photo mais le
titre : « 1999-2002 » se date presque tout seul.*

**67. [Non dit] Une page porte 14 photos liées et n'existe comme document nulle
part.**
`Astro/misc/meade/meade.htm` — 14 liens vers des photos datées de décembre 2005,
et **aucun passage** : elle n'est pas dans les 60 documents du corpus texte.
Elle apparaîtrait dans un écran construit sur les liens de photos, et nulle part
ailleurs.
→ **(a)** l'écran ne liste que les documents du corpus texte : elle n'apparaît
pas · **(b)** elle apparaît, comme page sans texte.
*Recommandation : **(a)**. C'est une page de matériel d'astronomie, hors sujet
et hors période ; §G.62 l'écarte déjà par le périmètre.*

**68. [Ambigu] « Sinon on n'utilise pas la légende » — jusqu'où ?**
Ta phrase se lit de deux façons : soit **la légende ne sert qu'ici**, comme aide
au datage, et n'apparaît nulle part ailleurs ; soit elle sert **d'abord** ici, et
redevient ensuite du texte comme un autre une fois le document daté — ce qui est
la lecture qu'on m'a transmise, et celle qui fait des légendes du texte d'époque
utilisable pour 2003-2004.
→ **(a)** aide au datage **et** texte sélectionnable ensuite, dans l'écran
Textes, avec sa photo en regard · **(b)** aide au datage seulement ; elles
n'apparaissent pas dans l'écran Textes.
*Recommandation : **(a)**. Sous **(b)**, 2003-2004 perd sa seule source de
texte d'époque au moment précis où on vient de lui donner une date. Mais dis-le
explicitement : c'est ta phrase qui décide.*

**69. [Non dit] Le nouvel écran et la section « Site web » des Réglages font la
même chose.**
Les Réglages portent déjà une section « Site web » qui édite exactement ça
(`PUT /ref/web-span`), avec deux dates au lieu d'une.
→ **(a)** le nouvel écran **remplace** cette section, qui disparaît des
Réglages · **(b)** les deux coexistent · **(c)** les Réglages n'en gardent qu'un
lien vers le nouvel écran.
*Recommandation : **(a)**, ou **(c)** si tu tiens à retrouver tous les
référentiels au même endroit. Deux écrans qui écrivent la même donnée avec deux
modèles différents — un intervalle ici, une borne là — finiront par se
contredire.*

**70. [Non dit] Une seule date saisie, mais l'API en exige deux : qui calcule la
fin, et quand ?**
`PUT /ref/web-span` prend `dateFrom` **et** `dateTo`. Sous ta règle, la fin d'un
document est le début du suivant : saisir une date ne modifie donc pas une
ligne, mais **deux** — celle que tu saisis et la fin de celle d'avant.
→ **(a)** la fin n'est **jamais stockée** : seule la borne de début l'est, et la
fin se calcule à la lecture, à partir du voisin · **(b)** la fin est stockée, et
chaque saisie réécrit aussi la ligne précédente.
*Recommandation : **(a)**. Sous **(b)**, une date recalculée peut diverger de
la date stockée dès qu'un document est inséré, supprimé ou redaté — et les
intervalles se contrediraient sans que rien ne le signale. C'est un changement
au contrat, à annoncer comme les trois amendements précédents.*

---

## Récapitulatif — ce qui bloque vraiment

**Six tranchées, merci — elles sont intégrées :** §F.26 (le site web est une
troisième source), §F.40 (la sélection reste au passage, dans la page ouverte),
§F.42 (la note recopie le texte), §E.22 (`TASKS_ROOT` affiché, pas modifiable),
§F.48 (tu saisis les dates du site, dans un écran dédié), §F.51 (les légendes de
galerie ne sont pas une quatrième source : elles datent d'abord, puis
redeviennent du texte).

**Ce qui bloque encore**, par ordre de portée :

1. **§F.28 + §F.29** — la date affichée sur une page (lecture ou inférence) et
   l'ordre de la liste. Elles décident du rendu de tout l'écran Textes, et
   §F.28 demande une exception à une règle en vigueur si tu réponds (b).
2. **§G.58 + §G.60 + §G.61** — la chaîne « la fin est le début du suivant ». La
   mesure montre qu'elle ne peut pas suivre l'ordre des fichiers, qu'un
   document non daté au milieu se fait avaler par son voisin, et que trois
   documents proposent déjà la même date. Trois réponses courtes, mais sans
   elles l'écran ne peut pas être spécifié.
3. **§G.64** — la nature de la date que tu saisis dans ce nouvel écran.
   Inférence (ta décision du 29/08, inchangée) ou décision (ce que
   l'affichage d'une proposition changerait) ? C'est le seul point de toute la
   V1.5 qui toucherait une décision marquée « ne pas rouvrir ».
4. **§F.46** — le site web n'a **aucun objet page** : l'écran Textes doit y
   lister des **documents** là où il liste des pages ailleurs.
5. **§F.54 + §F.55** — les deux conséquences de la recopie. Le titre porte
   désormais seul l'attribution dans `notes.md`, et une note recopiée puis
   retravaillée cesse d'être une citation sans cesser d'y ressembler.
6. **§A.6** — ta demande de vérifier le tri des albums. Il **est** correct ; je
   pense que tu veux voir le chemin. Une phrase suffit, et si tu vois encore un
   album mal placé, nomme-le.

**Une tension que je n'aplanis pas**, parce qu'on m'a demandé de les remonter :
§G.63 et §G.64 vont tous deux contre une règle déjà écrite — pré-remplir les
champs, et requalifier `ref.web_span` en décision. Mes recommandations
proposent chaque fois une voie qui donne le bénéfice recherché sans toucher à
la règle. Si tu préfères amender, c'est ton droit ; ce sont alors deux
amendements au contrat gelé, à annoncer aux deux agents d'implémentation avant
d'être écrits.

Deux questions non bloquantes, mais qui décident de ce que la V1.5 rend
possible :

**§F.48** — acceptes-tu de saisir les plages de dates des documents du site ?
C'est le seul geste qui ouvre 2003-2004, où 2 041 photos font face à zéro ligne
de journal. Vingt-cinq saisies, une fois. Ma recommandation est oui, **mais
après** avoir réparé l'écran Réglages, qui te présente aujourd'hui 60 lignes
dont 24 hors période et plusieurs vides de sens, avec un extrait identique au
titre sur 45 d'entre elles.

**§F.51** — les 205 légendes de galerie sont servies comme des faits alors
qu'**aucune n'a été relue par un humain**, qu'un tiers est hors période et
qu'un quart n'est pas une légende mais un paragraphe de page. Elles sont
pourtant la seule matière textuelle d'époque pour 2003-2004. Il faut soit le
geste de validation, soit assumer de les afficher comme des suppositions.
