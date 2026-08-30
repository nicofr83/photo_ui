# V1.5 — ce qui est décidé, et ce qui attend une réponse

*Relevé le 2026-08-30 sur ton serveur (`127.0.0.1:4310`), ta base, le code, et
les scans de `PAGES_ROOT`. Rien ici ne vient d'une supposition : chaque chiffre
a été mesuré.*

## Comment lire ce document

**Tu n'as pas à le lire en entier.** Il est organisé pour que tu ailles droit à
ce qui a besoin de toi :

1. **« Déjà tranché »** ci-dessous — tes réponses, rassemblées. Rien à y faire,
   c'est là pour que tu ne les relises pas.
2. **« Ce qui a besoin de toi »** — **plus rien**. Tu as répondu à tout ce qui
   change quelque chose de visible.
3. **« Ce que tu peux ignorer »** — **48 questions**. Des cas limites et des
   choix d'implémentation. **Sans réponse de ta part, j'applique ma
   recommandation.** Tu peux les survoler ou les sauter entièrement.

Le corps du document, sections A à G, garde le détail de chacune : la mesure,
les options, le raisonnement. Va y voir seulement si une ligne t'arrête.

La numérotation est **stable** — « §F.54 : d'accord » désignera toujours la même
question, même si le document est réorganisé. Une seule exception, faite avant
que tu n'aies répondu à aucune d'elles : la section G a été renumérotée quand
j'ai compris que j'avais mal lu ton modèle de chaînage (les numéros 69 et 70 ne
servent plus).

---

## Déjà tranché — rien à relire

| | Décision |
|:--|:--|
| **§A.6** | Afficher le **chemin complet** des albums (« 1998-1999 / 1998-02-Maison rose Algès ») |
| **§E.22** | `TASKS_ROOT` **affiché**, pas modifiable ; il se change dans `.env` |
| **§F.26** | Le **site web** est une troisième source, à côté du journal et de « Ma vie » |
| **§F.28** | Date d'une page : la **lue** d'abord (vert), la **calculée** en repli (ambre `≈`) |
| **§F.29** | Tri **par date** par défaut, avec une bascule vers l'ordre du cahier |
| **§F.40** | La sélection reste **au passage**, dans la page ouverte |
| **§F.42** | La note **recopie** le texte, et reste éditable ensuite |
| **§F.46** | Un **document du site vaut une page** — mais le titre de note nomme le document, jamais « page 1 » |
| **§F.48** | Tu saisis les dates du site, dans un **écran dédié** (section G) |
| **§F.51** | Les **légendes de galerie sont indicatives** : ni filtrées, ni relues, ni sélectionnables |
| **§F.54** | Titre de note : **préfixe verrouillé**, ajout libre à la suite |
| **§F.55** | Le manifeste distingue une note **dérivée** d'une note écrite de zéro |
| **§F.56** | La note **recopie et rattache** |
| **§F.57** | Créer une note **ne coche pas** le passage |
| **§G.63** | La date proposée s'affiche **à côté** du champ, avec un bouton « adopter » — jamais pré-remplie |
| **§G.64** | La date que tu saisis reste une **inférence** (ambre `≈`) — ta décision du 29/08, inchangée |
| **§G.60** | Le **registre date la page** ; une page sans registre hérite de la précédente. Les notes du haut ne déplacent jamais cette date |
| **§F.72** | Au survol d'une photo, la **légende d'époque seulement** ; la légende de machine vit dans le détail |
| **§G.58** | **Tes dates font l'ordre** du site ; les rebuts restent sans date et sortent d'eux-mêmes |
| **§F.27** | Le **scan entier** affiché, registre et notes libres séparés dessous — aucun découpage d'image |
| **§F.31** | La vignette est le **scan entier réduit** — plus de rognage à 48 % |

Deux conséquences de ces décisions valent d'être sues, parce qu'elles se
paieraient tard :

- **§F.54 doit être tenu par le serveur**, pas par l'interface :
  `PATCH /notes/:id` accepte déjà un titre libre.
- **§F.51 a un coût** : sous cette règle, **2003-2004 n'a plus aucun texte
  d'époque sélectionnable**. Les 103 légendes de ces deux années étaient la
  seule matière contemporaine de 2 041 photos. Le dossier livré y contiendra
  tes notes, et rien d'autre côté texte.

---

## Ce qui a besoin de toi — plus rien

Tu as répondu à tout ce qui changeait quelque chose de visible. Les questions
restantes ont chacune une recommandation, appliquée par défaut.

---

## Ce que tu peux ignorer — 48 questions

*Sans réponse, j'applique la recommandation. Elles sont dans le corps du
document, groupées par écran, chacune avec sa mesure et son raisonnement.*

- **Écran Images (§A.1 à §A.5)** — largeur du panneau, comportement du filtre
  d'albums, albums cochés qui sortent du filtre, filtre sur les tags.
- **En-têtes fixes (§B.7 à §B.12)** — ce qui reste figé sur chaque écran. Tu
  avais dit « demande en cas de doute » : la liste est là, écran par écran, et
  mes réponses sont uniformes.
- **Sous-page Consigne (§C.13 à §C.15)** — ce qui déménage sur cette page.
- **Sous-page Revue (§D.16 à §D.20)** — vignettes dans la liste, contenu de la
  partie fixe, place du rapport d'export.
- **Réglages (§E.21, §E.23 à §E.25)** — répertoire par tâche, dossiers
  existants. **§E.21 est une vraie question** si tu as un avis : tu as dit ne
  pas voir l'intérêt de l'écran Réglages, et je ne sais pas si tu l'as ouvert —
  c'est lui qui porte les périodes d'album, 25 saisies pour redater 421 photos.
- **Écran Textes (§F.30 à §F.39, §F.41, §F.43 à §F.45, §F.47, §F.49, §F.52,
  §F.53, §F.68, §F.71, §F.73 à §F.75)** — miniatures et leur coût, filtres de
  dates, recherche, titres de notes, fragments de menu du site, pages du
  registre qui reculent dans le temps.
- **Écran de datation (§G.59, §G.61, §G.62, §G.65 à §G.68)** — pages
  antérieures à ta première date, ce que la proposition doit dire, périmètre de
  la liste, doublon avec les Réglages, disposition de l'écran.

---

## Ce que j'ai mesuré, et qui contredisait le brief

*Cinq constats. Les trois premiers ont déjà changé une décision ; les deux
derniers restent des contraintes à connaître.*

**Un scan du journal contient deux pages.** Ta remarque — « la page du bas est
en ordre chronologique car c'est un document officiel » — m'a fait ouvrir les
images. En haut : notes libres, photos collées, billets de musée. En bas : le
**registre réglé** avec ses colonnes imprimées *Date · Cap · Vent · Loc. · Baro
· Moteur · Position · Remarques*. La reliure à spirale sépare les deux. La donnée
le confirme : les 1 012 `log_entry` portent **807 heures et 711 positions GPS**,
les 492 `passage` en portent **zéro**.

**Et donc je m'étais trompé sur l'ordre du journal.** J'avais écrit que ses
pages ne sont pas chronologiques ; je l'avais mesuré **en mélangeant les deux
moitiés**. Sur le registre seul, **42 des 49 pages avancent dans le temps**. Les
sept qui reculent le font de 12 à 351 jours, et douze pages couvrent plus de
60 jours dont une exactement un an : ce sont des **erreurs de transcription**
probables, pas du désordre (§F.75).

**Il n'existe aucune miniature de page.** 155 JPEG sous `PAGES_ROOT`, ~300 Ko
pièce, **49 Mo au total**, tailles variables (774×1275 à 1018×1435). Le seul
point d'accès sert le fichier entier : afficher les 103 pages de « Ma vie »
téléchargerait **31 Mo**. Il faut un point d'accès de vignette côté serveur —
du travail back, pas un `width` en CSS (§F.32).

**Le site web n'a aucun objet page.** Ses 569 passages portent `pageId: null`
et ses 60 documents `hasPages: false`. Tu as tranché que le document tiendrait
lieu de page (§F.46) ; la contrainte reste que rien en dessous ne porte de
numéro ni d'image.

**L'écran des Réglages liste 60 documents web, pas les 25 du périmètre.** Dont
16 pages `raiders/*`, un fichier de vérification Google, une page « bidon »,
et une vingtaine hors corpus. Et **l'extrait censé te faire reconnaître un
document est identique à son titre sur 45 des 60** (§G.62).

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

**6. TRANCHÉ — afficher le chemin complet.** « 1998-1999 / 1998-02-Maison rose
Algès ». La clé de tri devient visible, donc l'ordre s'explique de lui-même, et
les albums nommés simplement « 2000 » cessent d'être énigmatiques. Ça répond du
même coup à §A.1 — un seul changement pour les deux.

*Il reste un vrai défaut de tri à corriger dans le même geste : `localeCompare`
ignore la casse, donc `2003-03-everglades` passe **avant**
`2003-03-Fort Lauderdale`. Deux albums du même mois qui s'inversent selon leur
majuscule. Je le corrige — **tu peux ignorer ce point**.*

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

**22. TRANCHÉ — `TASKS_ROOT` affiché, pas modifiable.**
*Le contexte, pour mémoire :*
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

**46. TRANCHÉ — un document du site vaut une page.** Tu choisis l'uniformité des
trois sources : la liste montre des documents web au même niveau que les pages
du journal et de « Ma vie », et on les ouvre de la même façon.

*Une conséquence a été verrouillée pour que la fiction ne devienne pas un
mensonge : **le titre d'une note tirée du site ne dit jamais « page 1 »**, parce
qu'il n'y a pas de page. Il nomme le document — « site web, Vers Trinidad ».
Voir §F.50, réécrite en ce sens.*

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

**48. TRANCHÉ — tu saisis les dates, dans un écran dédié (§G).**
*Le contexte, pour mémoire :*
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
l'extrait inutile (§G.62).

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

**50. TRANCHÉ, par la conséquence posée en §F.46 — le titre nomme le document.**
« site web, Vers Trinidad », jamais « page 1 » : la liste est uniforme, mais
l'attribution reste exacte.
→ Reste un choix mineur : ajoute-t-on la plage quand tu l'as saisie (§G) —
« site web, Vers Trinidad (1999-2002) » — ou jamais ?
*Recommandation : l'ajouter quand elle existe, se taire sinon. Jamais un
jj/mm/aaaa fabriqué. **Tu peux ignorer cette question** : sans réponse,
j'applique ça.*

**51. TRANCHÉ — les légendes sont indicatives, et rien de plus.** Tes mots :
« Le contenu des légendes est là à titre indicatif. donc pas de filtre sur les
légendes de photos, pas de relecture, juste l'afficher quand la page du site web
est affichée (ou le voir quand le curseur est sur la photo) ».

C'est la simplification la plus économique de tout ce document, et elle règle
d'un coup les trois problèmes que j'avais mesurés : **une légende de galerie
n'est plus une unité de texte sélectionnable.** Elle n'entre dans aucune tâche,
ne se filtre pas, ne se relit pas, ne part pas dans le dossier livré. Sa qualité
inégale — 33 hors période, 13 sur une page d'astronomie, 47 qui font plus de 400
caractères dont une de 10 363 — cesse d'être un problème, puisqu'elle n'est plus
servie comme un fait. Il n'y a donc plus ni écran de relecture, ni filtrage, ni
geste de validation : j'ai retiré ces questions.

Deux usages lui restent : **aide visuelle quand tu dates un document du site**
(§G) et **affichage au survol d'une photo**. Deux vérifications faites, et une
question qui reste :

- **Rien à casser.** La table `app.task_text` est **vide** — aucune tâche n'a
  jamais sélectionné le moindre texte, donc encore moins une légende. Retirer la
  case à cocher que l'écran Textes leur donne aujourd'hui ne perd rien.
- **La donnée du survol existe déjà.** `GET /photos/:id/texts` renvoie bien les
  `web_caption` d'une photo — mesuré sur une photo appariée. Rien à ajouter au
  contrat pour l'affichage au survol.

**72. TRANCHÉ — au survol, la légende d'époque seulement.** Le survol d'une photo
montre sa légende de 2003 et rien d'autre. La légende produite par une machine,
quand elle existera, vit dans le panneau de détail et porte son origine. Les
deux ne se croisent jamais, donc aucune confusion possible — et le survol reste
court, ce qui compte puisque 47 légendes dépassent 400 caractères et l'une
atteint 10 363.

**73. [Non dit] Au survol, la légende est un lien direct ; ce qui l'entoure ne
l'est pas.**
`GET /photos/:id/texts` a renvoyé **44 unités** pour la photo que j'ai testée :
une `web_caption` — rattachée à **cette photo précise, par empreinte visuelle** —
et 43 passages et entrées qui ne sont là que parce que **leurs dates se
recouvrent**. Servies dans la même liste, elles se ressemblent, alors que
l'une dit « ce texte parle de cette photo » et les autres « ce texte est
contemporain de cette photo ».
→ **(a)** au survol, **seulement** la légende de galerie : c'est le seul texte
qui parle vraiment de cette photo · **(b)** la légende en tête, nettement
détachée, les textes contemporains en dessous · **(c)** tout ensemble.
*Recommandation : **(a)** pour le survol, qui doit rester bref, et **(b)** dans
le détail de la photo, où la place existe. La distinction lien direct /
coïncidence de dates est la même que celle que le manifeste protège déjà avec
`covers_images` : « contemporain » n'est pas « légende ».*

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

**27. TRANCHÉ — le scan entier, les deux jeux de textes séparés dessous.**
L'écran montre **l'image complète telle qu'elle existe**, et sous elle le
registre d'un côté, les notes libres de l'autre. **Aucun découpage d'image.**

*Le contexte, parce qu'il explique la donnée :* ta remarque m'a fait ouvrir les
scans, et tu as raison — un scan porte **deux pages séparées par la reliure à
spirale** : en haut des notes libres, des photos collées, des billets de musée ;
en bas le **registre réglé**, colonnes imprimées *Date · Cap · Vent · Loc. ·
Baro · Moteur · Position · Remarques*. La donnée le confirme sans ambiguïté :
les **1 012 `log_entry` portent 807 heures et 711 positions GPS**, les **492
`passage` en portent zéro**. Les 456 identifiants partagés ne sont donc pas des
doublons : c'est la ligne 11 du haut et la ligne 11 du bas. Rien de tout cela
n'est enregistré géométriquement — `pipeline.page` ne connaît qu'une image,
`label` est `null` sur les 155 pages, `regionsAvailable` vaut `false` — mais le
`kind` suffit à nommer chaque texte, et c'est ce que ta réponse demande.

### F.2 — La liste de pages

**28. TRANCHÉ — la lue d'abord, en vert ; la calculée en repli, en ambre `≈`.**
Toujours une date, toujours sa nature visible. J'ai vérifié ce que la règle
donne sur les 155 pages, et elle est meilleure que ce que j'annonçais :

- **Aucune page ne reste sans date.** Zéro page sur 155 n'a ni date lue ni
  fenêtre. En particulier les 3 pages du journal sans fenêtre **ont bien des
  passages datés** : elles seront en vert, pas en « sans date ». Ma
  recommandation précédente se trompait sur ce point.
- **Les 22 pages « héritées » de « Ma vie » n'ont effectivement aucune date
  lue** — vérifié, aucune des 22 ne porte un passage daté. Elles tombent en
  ambre `≈`, ce qui est exact.
- Bilan à l'écran : **133 pages en vert, 22 en ambre**. La liste n'est ni
  uniformément verte ni à moitié ambre.

**29. TRANCHÉ — tri par date par défaut, avec une bascule vers l'ordre du
cahier**, mémorisée par source.

**Et je te dois une correction sur le chiffre qui a motivé cette question.**
J'avais écrit que les pages du journal ne sont pas chronologiques — page 5 en
avril 1998, page 3 en juillet 1998. C'était mesuré **en mélangeant les deux
moitiés du scan**, ce que ta remarque sur le registre m'a fait voir (§F.27).
Mesuré sur le **registre seul**, ton cahier est bien tenu :

- **42 des 49 pages du registre avancent dans le temps.** Sept reculent.
- Et ces sept-là ne ressemblent pas à du désordre, mais à des **erreurs de
  transcription** : la page 19 recule de **351 jours** et couvre exactement un
  an (16/11/1998 → 16/11/1999), la page 40 recule de **316 jours**, la page 26
  de **215**. Un « 1998 » lu là où « 1999 » était écrit produit exactement ça.

La bascule reste donc utile — tu travailles parfois le cahier ouvert devant toi
et tu cherches « la page 12 » — mais sur le journal, les deux ordres coïncident
presque. Voir §F.75, qui propose d'en faire quelque chose.

**71. [Non dit] Faut-il signaler quand la date lue et la fenêtre divergent ?
Attention : ce n'est pas 5 pages, c'est 85.**
On m'a demandé de t'instruire ce point parce qu'une divergence peut trahir une
erreur de transcription. J'ai mesuré, et le chiffre que j'avais donné était
incomplet : la divergence touche **5 pages du journal et 80 des 103 pages de
« Ma vie »** — 85 sur 155, plus de la moitié du corpus.

Mais elle n'a pas la même cause des deux côtés :
- Sur **« Ma vie », elle est structurelle** : dans 61 des 80 cas la fenêtre
  commence exactement à la **dernière date lue de la page précédente** — c'est
  la continuité du récit, pas une anomalie. L'écart vaut **1 jour dans 57 cas,
  2 jours dans 20, 3 jours dans 3. Jamais plus.**
- Sur **le journal, deux pages sortent vraiment du lot** : la page 35 (lue
  22/04/2000, fenêtre 24/06/2000 — **63 jours**) et la page 9 (lue 01/07/1999,
  fenêtre 04/08/1999 — **34 jours**). Les trois autres écarts valent 1, 1 et 4
  jours.

Un signal qui se déclenche sur toute divergence s'allumerait donc sur 55 % des
pages, dont l'immense majorité pour une raison de construction. Il ne
signalerait rien.
→ **(a)** signaler seulement **au-delà d'un seuil** (7 jours) : deux pages dans
tout le corpus, `logbook/p035` et `logbook/p009`, qui méritent en effet un coup
d'œil · **(b)** signaler toute divergence · **(c)** ne rien signaler.
*Recommandation : **(a)**. Deux pages à vérifier est une liste qu'on traite ;
85 est une liste qu'on ignore. Et le seuil se dit à l'écran, il ne se cache
pas.*

**74. TRANCHÉ par §F.27 — deux blocs distincts sous l'image.** « Registre » d'un
côté, notes libres de l'autre. C'est ce qui explique les 456 identifiants
partagés — ligne 11 en haut, ligne 11 en bas — au lieu de les laisser passer
pour un défaut.

**75. [Non dit] Sept pages du registre reculent dans le temps : on te les
signale ?**
Mesuré en §F.29 : sur les 49 pages du registre, sept reculent, de 12 à
**351 jours**. Et **12 pages couvrent plus de 60 jours**, l'une exactement
365 — sur un registre qui tient une vingtaine de lignes par page, c'est
physiquement improbable. Les deux signes pointent vers la même cause : une
année mal lue à la transcription.
→ **(a)** une liste « pages à revérifier » dans les Réglages, avec le motif —
recul de N jours, ou page couvrant N jours — et un lien vers la page pour la
corriger · **(b)** un signe discret sur la page concernée dans la liste ·
**(c)** rien.
*Recommandation : **(b)** pour la V1.5, **(a)** si tu veux vraiment reprendre
ces dates. Ce sont des dates **lues**, donc réputées exactes, et sur lesquelles
tout le rapprochement photo-texte s'appuie : une année fausse déplace une page
entière de rapprochements d'un an. Mais c'est un chantier de correction de
transcription, pas de l'affichage — il ne doit pas retarder la V1.5.*

**30. SANS OBJET — le cas n'existe pas.** Je demandais où ranger les pages sans
aucune date. La mesure dit **zéro sur 155** : sous la règle de repli que tu
viens de trancher, chaque page porte une date. La question tombe.

**31. TRANCHÉ, par conséquence de §F.27 — la vignette est le scan entier
réduit.** Si l'image ne se coupe pas à l'ouverture, elle ne se coupe pas non
plus dans la liste. Tu vois le haut, et tu vois aussi le bas.

*C'est la meilleure issue, et elle supprime un risque que je signalais : j'allais
te recommander un rognage fixe à 48 % de la hauteur, parce que la reliure passe
par là — mais elle n'est pas au même endroit d'un scan à l'autre et les 52
images n'ont pas la même taille (774×1275 à 830×1282). Un rognage aveugle aurait
fini par couper dans le texte. La question disparaît.*

**32. [Tension] Les miniatures n'existent pas et coûtent 49 Mo telles quelles.**
*Cette question survit à §F.31 et compte davantage depuis : « le scan entier
réduit » veut dire **réduit par le serveur**, pas servi tel quel avec une
largeur CSS.*
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

**54. TRANCHÉ — préfixe verrouillé, ajout libre à la suite.** « journal de bord,
page 12 du 04/11/2003 » reste ; tu écris ce que tu veux après.
*Une conséquence à ne pas manquer : `PATCH /tasks/:slug/notes/:noteId` accepte
déjà `title`. Le verrou doit donc être posé **au serveur**, qui refuse une
modification altérant le préfixe — pas seulement dans l'interface, sans quoi il
ne protège rien.*

**55. TRANCHÉ — le manifeste distingue une note dérivée d'une note écrite de
zéro.** Un champ de **source** (la référence du passage recopié) et un drapeau
**« édité depuis »**, que le serveur calcule par comparaison à l'enregistrement.
Sans lui, l'attribution que porte le titre n'est vérifiable par rien.
*Amendement au contrat gelé, à annoncer aux deux agents d'implémentation avant
d'être écrit — comme les trois précédents.*

**56. TRANCHÉ — recopier **et** rattacher.** `attachedTo.texts` existe déjà au
contrat. Le lien reste réversible : on retrouve l'original même après que tu as
retravaillé la note, et c'est ce qui rend §F.55 vérifiable plutôt que
déclaratif.

**57. TRANCHÉ — créer une note ne coche pas le passage.** Sous la recopie, la
note **est** le texte : l'envoyer aussi dans `journal.md` ferait lire au LLM un
doublon comme deux sources concordantes.

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

## G. Le nouvel écran — saisir les dates des pages du site

*J'avais mal lu ton modèle, et je m'en excuse : j'avais compris une chaîne
courant entre les 60 documents du site, dans l'ordre des fichiers. Tes mots
disent autre chose : « le document suivant correspondait à la page suivante du
journal de bord, ou à la page suivante de ma vie, ou à la suite du site web,
pas aux autres documents ». Le chaînage est **à l'intérieur d'une source, dans
l'ordre des pages**, et « les no de pages servent à grouper les pages sur les
dates précédentes ».*

**Ton modèle est déjà celui du système, et je l'ai vérifié.** Sur « Ma vie », 22
des 103 pages ne portent aucune date propre : le système leur donne celle de la
page précédente, et j'ai mesuré que les **22 sur 22** héritent bien de la page
d'avant, jamais de celle d'après. C'est exactement « une page sans date se
rattache à la dernière page datée qui la précède ». Je le signalais comme une
faiblesse ; c'était le mécanisme.

Du coup **trois de mes quatre objections tombent**, et je les retire : le
document vide au milieu n'avale plus rien (il hérite), deux pages peuvent porter
la même date sans conséquence (elles se groupent), et le dernier de la série n'a
besoin d'aucune saisie supplémentaire (son groupe court jusqu'au bout). La
quatrième change de nature — c'est §G.58 ci-dessous.

**Ce qui reste vrai de tes deux sources écrites**, mesuré : « Ma vie » est
chronologique de bout en bout, et le registre du journal l'est à **42 pages sur
49**. Ton modèle tient sur les deux.

**58. TRANCHÉ — tes dates font l'ordre du site.** Tu dates ce que tu reconnais,
la suite se déduit de ces dates, aucun rangement préalable des 60 documents. Les
rebuts, gabarits vides et fichiers hors sujet restent sans date et sortent
d'eux-mêmes.

*Pourquoi il fallait trancher : ton modèle repose sur « les pages sont
chronologiques », vrai de tes deux cahiers parce qu'un numéro de page vient de
l'ordre où tu tournes les feuilles. **Le site n'a pas ça** — `pipeline.page`
contient 155 lignes, 52 pour le journal, 103 pour « Ma vie », **zéro pour le
site**. Et l'ordre des fichiers n'est pas celui du temps : mesuré,
`2003_gal_7` vient avant `2003_gal_5`, un document rangé dans `1999/` date de
décembre 2001, un autre rangé dans `2005/` date de mai 2003. Ta saisie remplace
l'ordre qui manque.*

**59. TRANCHÉ — les pages antérieures à ta première date restent sans date.**
L'héritage ne remonte jamais le temps, nulle part : les 22 pages de « Ma vie »
héritent toutes de la précédente, jamais de la suivante.

**60. TRANCHÉ — le registre date la page ; l'héritage comble les trous.**
La partie basse fait autorité : c'est le document officiel, tenu dans l'ordre.
Une page sans aucune ligne de registre hérite de la page précédente, comme sur
« Ma vie ». Les trois sources se comportent alors pareil, et **les notes du haut
ne peuvent jamais déplacer une date que le registre établit** — un billet de
musée collé après coup n'étire pas la période d'une page.

*Un cas à trancher dans la spécification, et je le note ici : les trois pages du
journal sans registre sont les pages **1, 2 et 31**, et les deux premières n'ont
aucune page précédente dont hériter. Elles portent des dates lues dans leurs
notes — 08/07/1998 pour les deux premières, ce que le scan confirme puisque la
page 1 porte « Journal du bord. 8 juillet 1998 » de ta main, et 02/03/2000 pour
la page 31. La spécification retient donc : **registre d'abord, à défaut les
dates lues dans les notes, à défaut l'héritage.** Sur le journal l'héritage ne
se déclenche jamais — 49 pages ont un registre, 3 ont des notes datées, aucune
n'a ni l'un ni l'autre — mais la règle reste la même pour les trois sources.*

**61. [Non dit] Ce que la date proposée doit dire, parce qu'elle est très
inégale.**
27 documents du site reçoivent une date proposée, dérivée de leurs photos liées
(227 liens vers 224 photos, dont 221 vers des photos datées). Mais la qualité
varie énormément : `2003_gal_15` s'appuie sur **20 photos toutes lues au jour**,
fourchette 9 jours. `web/photo` s'appuie sur **une seule photo datée au mois**.
`Caraibe` sur 11 photos dont 9 inférées, fourchette **181 jours**.

Et la coupure est nette : les **onze galeries 2003-2004 sont soutenues à 100 %
par des dates lues au jour**, sur 0 à 21 jours — c'est excellent, et c'est
exactement la période où le journal est muet devant 2 041 photos. Les sept pages
de 1999-2002, elles, s'appuient presque uniquement sur des dates inférées au
mois.
→ **(a)** afficher sous chaque proposition : nombre de photos, combien datées au
jour, largeur de la fourchette — « 20 photos, toutes au jour, sur 9 jours »
contre « 1 photo, au mois » · **(b)** un indicateur de confiance · **(c)** la
date seule.
*Recommandation : **(a)**. Même exigence que partout ailleurs ici : une valeur
calculée dit ce qu'elle vaut. Et c'est cette différence-là qui te fera valider
d'un clic ou aller vérifier.*

**62. [Non dit] L'écran liste 60 documents, dont une bonne moitié n'a rien à y
faire.**
Mesuré : **16 sont `web/2005/3/raiders/*`** (2 passages chacun, une liste de
noms), plus `web/googlea0ccc7e24963cc5e` (un fichier de vérification Google),
`web/test/map`, `web/1999/bidon` (1 passage, « Nouvelle page 1 »),
`web/favorite`, et une vingtaine de documents `2005/`-`2006/` hors corpus. Ils
resteront sans date puisque tu ne les dateras pas — mais tu devras les
traverser des yeux à chaque fois.
→ **(a)** limiter au **périmètre 1998-2004**, le reste derrière un « voir tout »
· **(b)** les 60, tels quels.
*Recommandation : **(a)**. Ça ramène l'écran à une vingtaine de lignes, seul
format dans lequel la saisie se fera vraiment.*

**63. RÉGLÉ — la proposition à côté du champ, pas dedans.** Un bouton « adopter
cette date » la recopie en un clic. Le contrat interdit de pré-remplir les
champs de saisie **en nommant `WebDocumentRow`** (« ce sont exactement les
données que l'arbitrage a jugées peu fiables »), et l'écran des périodes
d'album applique cette règle depuis le début. Cette variante donne le même clic
unique sans rien amender. *Le pilote, qui proposait le pré-remplissage, s'est
rangé à cette lecture.*

**64. RÉGLÉ — ta date saisie reste une inférence, en ambre `≈`.** Ta décision du
29/08 s'applique inchangée : poser une date sur un document qui n'en porte
aucune comble un vide, c'est une conjecture, même informée par une proposition.
Ce qui distingue « proposé » de « saisi » est un **état**, pas une couleur.
*Rien à rouvrir.*

**65. [Non dit] Une page du site porte 14 photos liées et n'existe comme
document nulle part.**
`Astro/misc/meade/meade.htm` — 14 liens vers des photos de décembre 2005, et
**aucun passage** : elle n'est pas dans les 60. Elle apparaîtrait dans un écran
construit sur les liens de photos, et nulle part ailleurs.
→ **(a)** l'écran ne liste que les documents du corpus texte : elle n'apparaît
pas · **(b)** elle apparaît, comme page sans texte.
*Recommandation : **(a)**. Page de matériel d'astronomie, hors sujet et hors
période ; §G.62 l'écarte déjà.*

**66. [Non dit] Le nouvel écran et la section « Site web » des Réglages font la
même chose.**
Les Réglages portent déjà une section « Site web » qui édite cette donnée
(`PUT /ref/web-span`), avec deux dates au lieu d'une.
→ **(a)** le nouvel écran **remplace** cette section · **(b)** les deux
coexistent · **(c)** les Réglages n'en gardent qu'un lien.
*Recommandation : **(a)**, ou **(c)** si tu tiens à retrouver tous les
référentiels au même endroit. Deux écrans qui écrivent la même donnée avec deux
modèles différents finiront par se contredire.*

**67. [Non dit] Une seule date saisie : que stocke-t-on ?**
`PUT /ref/web-span` prend aujourd'hui `dateFrom` **et** `dateTo`. Sous ton
modèle, la fin d'un groupe est donnée par la page datée suivante — elle se
déduit, elle ne se saisit pas.
→ **(a)** ne stocker que la **borne de début** ; la fin se calcule à la lecture,
comme le système le fait déjà pour les fenêtres de page · **(b)** stocker les
deux, et réécrire la ligne précédente à chaque saisie.
*Recommandation : **(a)**. Sous **(b)**, une date recalculée peut diverger de la
date stockée dès qu'un document est ajouté, supprimé ou redaté, et les
intervalles se contrediraient sans que rien ne le signale. C'est un changement
au contrat, à annoncer comme les précédents.*

**68. [Non dit] L'écran montre le texte et les photos liées — dans quel ordre de
lecture ?**
Tu veux « le texte du site web » plus « la photo et la légende » comme aide.
Un document comme `VersTrinidad` porte 58 passages et 8 photos liées.
→ **(a)** le texte à gauche, les photos liées en bande à droite avec leur
légende au survol · **(b)** les photos d'abord, le texte en dessous ·
**(c)** seulement les photos, le texte sur demande.
*Recommandation : **(a)**. C'est la disposition de l'écran Textes — texte à
gauche, image à droite — et tu la connais déjà. Les légendes restent
indicatives (§F.51) : elles s'affichent, elles ne se sélectionnent pas.*

## En une phrase

**Deux questions attendent une réponse** — §G.60 et §F.72, en tête de ce
document, une ligne chacune. Les **quarante-huit** autres ont une
recommandation que j'applique sans réponse de ta part.

Une seule conséquence mérite d'être sue avant la spécification, parce qu'elle
se paierait tard : sous §F.51, **2003-2004 n'a plus aucun texte d'époque
sélectionnable**. Les 103 légendes de ces deux années étaient la seule matière
contemporaine de 2 041 photos ; le dossier livré y contiendra tes notes, et rien
d'autre côté texte. Si tu veux qu'une légende parte avec sa photo, le geste
existe — la recopier dans une note (§F.42).
