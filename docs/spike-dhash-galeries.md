# Spike — Appariement des galeries web 2003 par hash perceptuel

**Statut :** investigation de faisabilité terminée. Aucun code produit ici n'est destiné à
être conservé ; tout ce qui a servi est jetable et vit dans un répertoire temporaire.

**Périmètre d'écriture :** ce fichier uniquement. `adobe_mcp` et le volume
`OWC Envoy Ultra` ont été lus, jamais modifiés.

---

## 1. La question

Le dump FrontPage du site personnel contient des galeries où chaque image est
accompagnée de sa légende d'époque, écrite au moment du voyage. Ces images sont des
copies redimensionnées et recompressées de photos de la photothèque, renommées : aucun
nom de fichier ne permet le rapprochement.

Peut-on les rapprocher par hash perceptuel, et ainsi obtenir un lien
« légende écrite en 2003 » ↔ « photo de la bibliothèque » sur la période 2003-2004, où
2 041 photos n'ont aucun texte ?

**Réponse courte : oui, mais pas avec le dhash tel qu'il est actuellement calculé par le
pipeline.** Il faut recalculer le hash avec un filtre de réduction correct. Le coût est
faible et la donnée existe déjà pour le faire.

---

## 2. L'algorithme du pipeline, tel qu'il est écrit dans le code

Source : `/Users/nico/projects/adobe_mcp/packages/photo-index/tools/contentpass.swift`,
fonctions `render()` et `dhash()`.

| Élément | Valeur |
|---|---|
| Chargement | `CIImage(contentsOf:options:[.applyOrientationProperty: true])` — les pixels sont redressés selon l'orientation EXIF avant tout calcul |
| Réduction | 9 × 8, **sans respect du rapport d'aspect** (l'image est écrasée sur la grille) |
| Filtre | `CGAffineTransform(scaleX:y:)` puis `CIContext.render(...)` — c'est le rééchantillonnage par défaut de Core Image pour une transformation affine, **pas** une moyenne de surface |
| Espace colorimétrique | rendu en `CGColorSpace.sRGB`, format `RGBA8` |
| Niveaux de gris | luminance entière sur les valeurs sRGB **encodées** (non linéarisées) : `R*299 + G*587 + B*114` |
| Comparaison | par voisin horizontal : bit à 1 si `L(x) > L(x+1)` |
| Ordre des bits | `y` en boucle externe (0→7), `x` en boucle interne (0→7), compteur `bit` incrémenté à chaque pas, `hash |= 1 << bit`. **Le bit 0 est le poids faible et correspond à (y=0, x=0).** |
| Sérialisation | `String(format: "%016llx", …)` — 16 caractères hexadécimaux, non signé, gros-boutiste textuel |

Stockage : `pass.ts` relit la chaîne via `BigInt("0x…")`, `schema.ts` déclare
`dhash INTEGER NOT NULL`. SQLite stocke donc un **entier signé 64 bits** : toute valeur
≥ 2⁶³ est en base sous forme négative. `duplicates.ts` le confirme en appliquant
`& 0xffffffffffffffffn` à la lecture. Vérifié en base :
`c68e8e848c9cd416` est stocké `-4139214307560991722`.

### Point clé, décisif pour la suite

Le filtre de réduction n'est pas une moyenne de surface. Passer d'une image de
1600 × 1200 à une grille de 9 × 8 par échantillonnage affine revient à prélever
quelques pixels quasi ponctuels. C'est extrêmement sensible au repliement
(*aliasing*) : deux rééchantillonnages différents de la même prise de vue ne
tombent pas sur les mêmes pixels et ne donnent pas le même hash. C'est exactement la
situation d'une copie web redimensionnée.

---

## 3. Preuve que le calcul est reproduit exactement

Je n'ai **pas** réimplémenté l'algorithme : j'ai réutilisé le binaire du pipeline
lui-même, `packages/photo-index/tools/bin/contentpass`, en exécution seule, avec les
vignettes redirigées vers mon répertoire temporaire. C'est plus fort qu'une
réimplémentation — c'est le même code.

Contrôle sur 5 photos de la bibliothèque, dhash recalculé depuis le fichier original et
comparé à la valeur stockée dans `visual` :

| `sha256` (12 car.) | recalculé | en base | |
|---|---|---|---|
| `69e68e4d3aba` | `8feeeeed682c4000` | `8feeeeed682c4000` | identique |
| `acc228e8069a` | `feeeedfff7933f01` | `feeeedfff7933f01` | identique |
| `9f8edde7415a` | `487035b13191f1e8` | `487035b13191f1e8` | identique |
| `7fac93be1278` | `a8dc9fa5edebb8ee` | `a8dc9fa5edebb8ee` | identique |
| `eebc62116988` | `7d5f6b66665e5ebe` | `7d5f6b66665e5ebe` | identique |

**5/5 exacts.** Les hashes calculés sur les images du site sont donc directement
comparables aux 41 913 hashes de la base.

---

## 4. Extraction des galeries

Le dump comporte 790 fichiers HTML et 2 195 JPEG hors répertoires de thème
(`_derived`, `_overlay`, `_themes`, `_fpclass`, `_borders`). Le périmètre réel est plus
large que les seules galeries 2003 : les sections `1999/`, `2003/`, `2005/` et `Astro/`
suivent toutes le même gabarit FrontPage.

Motif exploité :

```html
<a href="2003_gal_1/FortLaud.JPG">
  <img src="2003_gal_1/FortLaud_small.JPG" alt="Funfun2 a Fort Lauderdale (Floride)">
</a>
<p align="center"><b>Dernier préparatif en rush, comme d'habitude.<br>…</b></p>
```

L'image pleine taille est la cible du `<a href>`, la vignette `_small` est l'`<img>`, et
la légende est le texte qui suit l'ancre jusqu'à l'ancre image suivante. Les fichiers
sont lus en `cp1252` — décodés en UTF-8 ils produisent des accents corrompus.

Résultat : **863 images de galerie distinctes** résolues sur disque, réparties sur
51 pages ; **343 portent une légende** (`alt` et/ou paragraphe voisin), sur 37 pages —
14 pages en `2003/`, 9 en `Astro/`, 6 en `1999/`, 6 en `2005/`. Longueur médiane de
légende : 55 caractères.

L'heuristique de légende est correcte sur la quasi-totalité des pages de galerie ; une
page de gabarit (`2005/images/2005_4.htm`) laisse fuir du HTML dans le texte. Détail
d'industrialisation, pas un obstacle.

---

## 5. Distribution des distances — hash du pipeline

Distance de Hamming au meilleur candidat parmi les 41 913 hashes, force brute
(863 × 41 913 comparaisons, 9 secondes).

```
d= 0  107   ####################
d= 1   11   ##
d= 2   11   ##
d= 3    9   #
d= 4   23   ####
d= 5   24   ####
d= 6   33   ######
d= 7   31   #####
d= 8   24   ####
d= 9   36   ######
d=10   52   #########
d=11   75   #############
d=12   90   ################
d=13  108   ####################
d=14   87   ################
d=15   95   #################
d=16   41   #######
d=17    6   #
```

**Il n'y a pas de coupure nette.** Un pic franc à 0, puis un creux, puis une remontée
continue qui se fond dans la bosse de bruit centrée sur 13. Le signal et le bruit se
recouvrent entre d = 7 et d = 12.

### Le second discriminant : la marge

La distance seule ne suffit pas, mais l'écart entre le meilleur et le deuxième meilleur
candidat (la **marge**) sépare bien mieux. Précisions mesurées visuellement :

| Bande | vérifiés | vrais | précision | population |
|---|---:|---:|---:|---:|
| d = 0 | 19 | 19 | **100 %** | 107 |
| d = 1-6, marge ≥ 4 | 16 | 16 | **100 %** | 71 |
| d = 1-6, marge < 4 | 13 | 3 | 23 % | 40 |
| d = 7-10, marge ≥ 4 | 13 | 12 | 92 % | 39 |
| d = 7-10, marge < 4 | 5 | 1 | 20 % | 104 |
| d ≥ 11 | 6 | 0 | 0 % | 502 |

Règle `d = 0 ou (d ≤ 10 et marge ≥ 4)` : **217 appariements**, dont 191 portent une
légende — soit **56 % de rappel** sur les images légendées.

---

## 6. Pourquoi le rappel plafonne : mesure directe

Le site contient, pour presque chaque image, sa propre vignette `_small` : le **même
cadrage, la même source**, seulement réduit et recompressé. C'est un banc d'essai gratuit
de la sensibilité du hash au redimensionnement — 800 paires.

Distance entre une image et sa propre vignette, hash du pipeline :

```
d ≤ 2 : 18 %      d ≤ 4 : 42 %      d ≤ 6 : 68 %      d ≤ 10 : 96 %
```

**Un simple redimensionnement, sans recadrage ni retouche, coûte déjà 5 bits en
médiane.** Ce n'est pas le recadrage ni le rapport d'aspect qui limitent la méthode :
c'est le filtre de réduction du pipeline. Le hash n'est pas invariant à l'échelle, ce
qu'un dhash est pourtant censé être.

### La variante qui corrige le problème

Deux variantes testées sur les mêmes 800 paires, en ne changeant **que** l'étape de
réduction (luminance, sens de comparaison et ordre des bits inchangés) :

| Variante de réduction | d ≤ 2 | d ≤ 4 | d ≤ 6 | d ≤ 10 |
|---|---:|---:|---:|---:|
| Pipeline (transformation affine) | 18 % | 42 % | 68 % | 96 % |
| `CILanczosScaleTransform` vers 9 × 8 | 63 % | 74 % | 77 % | 85 % |
| **Moyenne de surface** (rendu 72 × 64, puis moyenne de blocs 8 × 8) | **74 %** | **90 %** | **96 %** | **100 %** |

La moyenne de surface est la bonne réponse, et de loin. C'est ce qu'un dhash de
référence fait normalement.

### Distribution avec la moyenne de surface

Côté bibliothèque, les vignettes 224 px existent déjà pour les 41 913 photos
(`work/content-thumbs/<sha256>.jpg`). Contrôle préalable : le hash « moyenne de surface »
calculé depuis la vignette 224 px et depuis l'original ne diffère que de 0 à 1 bit sur
les photos testées — la vignette est un substitut valide. Recalcul complet de la
bibliothèque : **2 min 13 s**.

```
d= 0   61   ###########
d= 1   94   #################
d= 2   55   ##########
d= 3   29   #####
d= 4   22   ####
d= 5    4   #
d= 6    7   #
d= 7   13   ##
d= 8   20   ###
d= 9   18   ###
d=10   23   ####
d=11   64   ###########
d=12   82   ###############
d=13  115   #####################
d=14  116   #####################
d=15   88   ################
d=16   41   #######
d=17    7   #
d=18    4
```

**Voilà la coupure nette qui manquait :** un mode compact de 0 à 4 (261 images), un
creux quasi vide à 5-6 (11 images), puis le bruit qui remonte. Sur l'ensemble retenu par
la règle du pipeline, la variante désigne **la même photo de bibliothèque dans 215 cas
sur 217** — les deux méthodes sont d'accord sur les réponses, la variante en trouve
simplement davantage.

---

## 7. Vérifications visuelles

**94 paires ouvertes et comparées réellement**, en planches contact deux à deux.

Avec le hash du pipeline (72 paires) :

- **d = 0, 19/19 vraies.** Dont `2003/2003_gal_11.htm:Img033.jpg` ↔
  `1998-1999/1999-12 Capvert Guadeloupe/DV00059.jpg` — noms totalement différents,
  hash identique. C'est exactement le cas d'usage visé.
  Également vérifiées : `DSCN4698.JPG`, `DSCN0366.JPG`, `DSCN0530.JPG`, `DV00007.jpg`,
  `DV00031.jpg`, `DSCN2849.JPG`, `DSCN0180.JPG` ↔ `DSCN0180-2.JPG`, `DV00140.jpg`,
  `DSC00562.JPG`.
- **d = 1-6 marge ≥ 4, 16/16 vraies.** `planche.JPG` ↔ `2003/2003-11-Abacos/DSCN3835.JPG`,
  `Coulees.JPG` ↔ `2003/2003-10-Sorel 3-Forges de Sorel/DSCN3375.JPG`,
  `Fraijelones.JPG` ↔ `2000-2001/…/p2010016-2.jpg`, `DanslePont.JPG` ↔ `DSCN3405.JPG`, etc.
- **d = 7-10 marge ≥ 4, 12/13 vraies.** Le seul faux positif : `S3010121.JPG` (4×4 dans
  les dunes) ↔ `3X3B1858.JPG` (voiliers) — deux images à horizon haut et ciel uniforme.
- **d = 1-6 marge < 4, 3/13 vraies.** Faux positifs typiques : `000_0011.jpg` (plage
  désertique) ↔ `eVscope-20210203-172749.png` (nébuleuse d'Orion) ;
  `ecl0.jpg` (éclipse partielle) ↔ `IMG_0854.PNG` (capture d'écran) ;
  `saomartinho.jpg` (plage dans la brume) ↔ une capture d'écran de tableau.
- **d ≥ 12, 0/6.** Bruit pur, aucune ressemblance.

Avec la variante moyenne de surface (22 paires) :

- **12/12 vraies** parmi les 36 appariements que seule la variante trouve :
  `Michel.JPG` ↔ `DSCN3724.JPG` (pipeline d = 11, variante d = 1),
  `golf.JPG` ↔ `2003/2003-10-Sorel 2/DSCN3174.JPG` (pipeline d = 12, variante d = 2),
  `altalmira2.JPG` ↔ `P1009010.jpg` (pipeline d = 15, variante d = 2),
  `vue.JPG` ↔ `P1009055.jpg` (pipeline d = 14, variante d = 4),
  `RivNord.JPG` ↔ `DSCN3208.JPG`, `americaines.JPG` ↔ `DSCN3764.JPG`,
  `Lucien.JPG` ↔ `DSCN3029.JPG`, `Maracaibo.JPG` ↔ `p2020026.jpg`, etc.
- **5/10 vraies** dans la bande faible marge (d ≤ 4, marge < 4) : ce qui justifie de
  garder le filtre de marge. **Les 5 faux positifs sont tous des images
  d'astronomie** — un disque clair sur fond noir, éclipse solaire ou lunaire,
  indistinguables les unes des autres pour un dhash.

### Le mode de défaillance, nommément

Les faux positifs ne sont pas répartis au hasard : ce sont des **images dégénérées** —
quasi uniformes ou à très faible contraste. Ciel nocturne, éclipse, brume, capture
d'écran. Leur hash est presque constant, donc proche de tous les autres hashes du même
type. La section `Astro/` du site en est saturée. C'est une raison de la traiter à part,
pas de renoncer.

---

## 8. Taux de couverture

Règle retenue pour ces chiffres : hash moyenne de surface, `d ≤ 6` et `marge ≥ 4`.

| | |
|---|---:|
| Images de galerie distinctes | 863 |
| dont portant une légende | 343 |
| Appariées | 237 |
| **Appariées et porteuses d'une légende** | **209** |
| Photos de bibliothèque distinctes atteintes (avec légende) | 207 |
| **Rappel sur les images légendées** | **61 %** |

Répartition des 209 liens légendés par date de prise de vue :

| Année | Liens |
|---|---:|
| 2003 | 48 |
| 2004 | 62 |
| 2005 | 35 |
| 2006 | 10 |
| 2000 | 5 |
| `2017` (date erronée, voir ci-dessous) | 37 |
| inconnue | 12 |

**Sur la période cible 2003-2004 :** 108 liens, 108 photos distinctes de la
bibliothèque, issues de 12 pages de galerie (`2003_gal_1` à `2003_gal_16`). Rapporté
aux 2 037 photos des albums `2003/` et `2004/`, cela représente **5,3 % de couverture**.

Exemples réels du couple produit :

> `2003/2003_gal_11.htm` → `2004/2004-03- visite de Tikal/DSCN4583.JPG` (2004-02-20)
> « Le fameux temple V, qui sort de nulle part au milieu de la forêt tropicale, et au
> milieu des cris des singes hurleurs... Très impressionnant. »

> `2003/2003_gal_11.htm` → `2004/2004-02-Belize/Long Bogue-021.JPG` (2004-02-14)
> « Une des nombreuses soirées, et comme la chasse à la langouste était encore ouverte,
> devinez le menu ??? »

> `2003/2003_gal_8.htm` → `2003/2003-11-Sorel-Beaufort-Fort Lauderdale/IMG_1388.JPG` (2003-11-04)
> « Mardi 4 Novembre, ca y'est Funfun2 flotte sous un coucher de soleil. »

### Les 39 % non appariés

134 images légendées ne trouvent pas de correspondant fiable : 43 en `1999/`, 42 en
`2003/`, 29 en `Astro/`, 17 en `2005/`. Deux causes distinctes :

- **Absentes de la bibliothèque** (majorité) : distance minimale ≥ 11, donc aucun
  candidat. Les originaux n'ont jamais été importés, ou n'existent plus.
- **Ambiguës** (26 cas) : distance ≤ 4 mais marge < 4. Écartées par prudence. Une partie
  sont de vrais appariements où deux photos quasi identiques de la bibliothèque
  (rafales, doublons) se disputent la place — auquel cas la légende serait quand même
  correctement attribuée à la scène.

### Une anomalie relevée au passage

37 liens tombent sur des photos dont `photos.captureDate` indique **2017** alors que
l'album est `2000-2001/2000-12-viree au Venezuela-3mois`. Ce n'est pas un défaut de
l'appariement — les images sont visuellement identiques et vérifiées. C'est la date de
la bibliothèque qui est fausse sur ce lot. Hors périmètre de ce spike, mais à signaler :
l'appariement par galerie est aussi, incidemment, un détecteur de dates aberrantes.

---

## 9. Recommandation

**Exploitable — à condition de recalculer le hash avec une moyenne de surface.**

Tel quel, le `dhash` en base donne 56 % de rappel et une distribution sans coupure
franche, où il faut un second critère (la marge) pour éviter les faux positifs. Avec la
réduction corrigée, la distribution présente un creux net à 5-6 bits, le rappel passe à
61 % et les appariements sont plus sûrs. Ce n'est pas un réglage : c'est le même
algorithme avec le filtre qu'il aurait dû avoir.

Le rapport bénéfice/coût est bon. La couverture 2003-2004 est de 5,3 %, mais ces 108
photos sont **la seule source de texte d'époque** pour cette période, et chaque légende
est un texte écrit par Nicolas sur le moment, daté, nommant des lieux et des personnes.

### Ce que coûterait l'industrialisation

- **Hash de raccordement.** Ajouter au binaire Swift une seconde fonction de hash à
  moyenne de surface (rendu 72 × 64 puis moyenne de blocs 8 × 8) et une colonne
  `matchhash` à côté de `dhash`. Ne pas toucher à `dhash` : `duplicates.ts` en dépend et
  la détection de doublons exacts fonctionne très bien avec. Recalcul de la bibliothèque
  depuis les vignettes 224 px déjà présentes : **2 min 13 s mesurées**, pas une heure.
- **Extraction du site.** Parcours des 790 HTML en `cp1252`, motif
  `<a href="…jpg"><img …></a>` + paragraphe suivant. Robuste sur les pages de galerie ;
  il faut durcir le cas du gabarit `2005/images/`. Une demi-journée.
- **Appariement.** Force brute, 863 × 41 913, 9 secondes. Aucune structure d'index
  nécessaire.
- **Garde-fous obligatoires.** Filtre de marge (≥ 4) ; exclusion ou traitement séparé de
  la section `Astro/` et plus généralement des images à faible variance, où le hash
  dégénère. Sans cela on injecte des légendes d'éclipse sur des photos de bateau.
- **Relecture humaine.** Avec ~210 liens à confirmer et une précision mesurée
  au-dessus de 90 %, une passe de validation visuelle est réaliste et donnerait une
  donnée de confiance totale.

### Forme de la donnée produite

Une table de liens, jamais une écriture dans l'index photo :

| colonne | contenu |
|---|---|
| `sha256` | photo de la bibliothèque |
| `page` | page HTML source, ex. `2003/2003_gal_11.htm` |
| `imagePath` | chemin de l'image du site |
| `caption` | texte d'époque, décodé depuis `cp1252` |
| `alt` | attribut `alt` quand il existe |
| `distance`, `margin` | traçabilité de l'appariement |
| `verified` | drapeau de relecture humaine |

Le texte reste attribuable et réversible : on sait toujours de quelle page il vient et
avec quelle confiance il a été rattaché.

---

## 10. Ce qui reste incertain

- La précision au-delà de d = 4 avec la variante n'a pas été mesurée aussi finement
  qu'avec le hash du pipeline : le seuil `d ≤ 6` est extrapolé du creux de la
  distribution et de 22 paires vérifiées, pas de 70.
- Les 26 cas « distance faible, marge faible » n'ont été échantillonnés qu'à 10. La part
  exacte de vrais appariements récupérables par une règle plus fine (accepter une marge
  faible quand les deux candidats sont eux-mêmes à distance nulle l'un de l'autre)
  n'est pas établie.
- L'extraction des légendes n'a pas été validée page par page. Le taux de légendes
  tronquées ou polluées par du HTML est faible mais non quantifié.
- La couverture de 5,3 % vaut pour les galeries du site telles qu'elles ont été
  trouvées. D'autres sources d'images légendées peuvent exister dans le dump hors du
  motif FrontPage repéré ici.
