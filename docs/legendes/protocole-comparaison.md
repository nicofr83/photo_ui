# Protocole — la consigne v3 tient-elle sur un modèle bon marché ?

**À lancer dès que la clé API a des crédits. Rien ici n'a été exécuté.**

Le spike (`docs/spike-legendes.md`) laisse une seule question ouverte : les 60
légendes de l'échantillon viennent d'Opus 5. La consigne v3 est exigeante —
distinguer lire de déduire, tenir une réserve explicite, nommer un gréement, ne
pas confondre un carré de voilier avec une cuisine. **Rien ne dit qu'un modèle
bon marché la tienne**, et c'est ce qui décide du coût de la passe sur 3 930
photos.

Les critères de réussite sont écrits **avant** d'avoir vu le moindre résultat.
C'est le point de méthode qui donne sa valeur à la comparaison : lus après, ils
justifieraient ce qu'on observe au lieu de le juger.

---

## 1. Le sous-ensemble : 20 photos, choisies pour être difficiles

Figé dans `docs/legendes/sous-ensemble-comparaison.json`. Une comparaison sur
des photos faciles ne prouverait rien : 18 des 20 sont là parce qu'elles
piègent quelque chose, 2 sont des témoins.

| # | Ce qu'elle met à l'épreuve |
|:--|:---|
| 03 | intérieur de voilier tagué `kitchen`, `home`, `bathroom` |
| 21 | deux garçons aux Lego tagués `couple`, `cafe`, `drink` + lit « Météorologie Marine » |
| 25 | trois enfants tagués `woman`, `beauty`, `attractive`, `bathroom` + lit « ducros », « LE PIRATE » |
| 31 | écran de navigation : position, cap, date « 5/20/2002 » ; tagué `business`, `internet`, `3d` |
| 50 | horodatage d'appareil « 2004 1 24 » + poisson découpé ; tagué `girl`, `woman`, `sailor` |
| 55 | horodatage « 2004 3 9 » ; tagué `chichen itza`, `asia` alors que c'est un autre site |
| 46 | bannière datée « 11 12 13 18 19 OCTOBRE 2003 » ; tagué `europe`, `london` au Québec |
| 48 | panneau intégralement lisible ; tagué `sign`, `text`, `dictionary`, `definition` |
| 05 | plaque « LARGO DE SANTA LUZIA » ; tagué `business`, `businesswoman` |
| 20 | enseigne « BODEGA MOSNANDA » ; hameau de terre battue tagué `city`, `urban` |
| 38 | moteur-fusée tagué `factory` + écusson « SCHIRRA » |
| 18 | homme au poisson tagué `worker`, `paint`, `home` ; aucun tag de poisson ; tirage scanné |
| 27 | homme à la barre tagué `woman`, `female`, `girl` |
| 09 | paysage volcanique tagué `spain`, `beach`, `desert` ; aucun tag de volcan ; basse définition |
| 41 | skyline tagué `chicago` en Floride ; voilé et granuleux |
| 04 | très sous-exposé ; nom de coque douteux « Funicula » |
| 59 | étendue quasi vide et voilée ; tagué `beach`, `sunset` |
| 28 | animal marin ambigu ; les tags arrosent `dolphin`, `whale`, `fish` |
| **45** | **témoin facile** — vol d'oiseaux, les tags sont corrects |
| **49** | **témoin facile** — catamaran sous génois, image nette et bien exposée |

Couverture : les 5 ensembles (4/3/4/6/3), les 3 natures de date (13 EXIF,
5 humaines, 2 album), 7 des 8 situations, 6 photos du décile esthétique bas,
6 portant un défaut technique, 11 portant un texte lisible.

**Les deux témoins servent à détecter le faux positif** : un modèle qui échoue
partout est peut-être simplement mal configuré. S'il rate 45 et 49, le problème
est dans le harnais, pas dans le modèle.

---

## 2. Les critères de réussite, écrits d'avance

Notation par photo, sur les six critères ci-dessous. Chacun vaut **0, 1 ou 2** :
0 = manqué, 1 = partiel, 2 = tenu. Le maximum par photo est 12.

### C1 — La réserve explicite est tenue (photos 04, 28, 53-like, 59)
Quand le sujet est ambigu, la légende **nomme quand même le candidat le plus
précis** et **marque le doute** : « vraisemblablement un grand animal marin,
dauphin ou tortue », « quelque chose comme "Funicula" ».
*0* si elle tranche sans réserve, ou si elle se réfugie dans le vague
(« un animal », « une forme »). *2* si elle fait les deux.

### C2 — Le type d'embarcation est nommé (03, 04, 18, 27, 49, 50)
`voilier monocoque`, `catamaran`, `vedette`, `annexe pneumatique` — et à
l'intérieur, `carré`, `table à cartes`, `couchette`, jamais `salon`, `cuisine`,
`chambre`. *0* si l'intérieur passe pour une pièce d'habitation (photo 03 est
le test décisif).

### C3 — Le texte est transcrit entre guillemets sans devenir une affirmation (05, 20, 21, 25, 31, 38, 46, 48, 50, 55)
Deux moitiés, 1 point chacune :
- la transcription est **présente et exacte** ;
- elle reste **attribuée à son support** (« une plaque porte… », « l'écran
  affiche… ») et **ne devient pas** un fait sur la photo.

*0 immédiat* si le modèle écrit « photo prise à Santa Luzia » ou date la photo
depuis l'horodatage. **C'est le critère le plus important** : c'est là que se
joue la règle §7.1, et un modèle qui le rate est disqualifié même s'il excelle
partout ailleurs.

### C4 — Le défaut technique est signalé (04, 09, 18, 28, 41, 59)
Annoncé **dès la première phrase**, puis le contenu décrit malgré tout ; et
`defauts` rempli depuis le vocabulaire fermé. *0* si la photo ratée est décrite
comme si elle était bonne. *1* si le défaut n'apparaît que dans `defauts` et
pas dans la légende.

### C5 — Aucun lieu, aucune date, aucune identité déduits (toutes)
**Binaire, 0 ou 2.** Une seule occurrence de « aux Antilles », « au Portugal »,
« en 2002 », « Nicolas », « son fils », « sa famille » met la photo à 0 sur ce
critère. Les toponymes cités comme lecture (C3) ne comptent pas ici.

### C6 — Le mot est précis et cherchable (toutes)
Les mots-clés sont en français, au singulier, concrets, et contiennent ce qu'on
taperait pour retrouver *cette* photo. *0* si la liste est générique au point de
convenir à cinquante autres photos du corpus (`mer`, `bateau`, `ciel`, `voyage`).

### Seuils de décision, fixés maintenant

| Résultat sur les 20 photos | Décision |
|:---|:---|
| **C3 et C5 à 2 partout**, total ≥ 90 / 240 | le modèle convient, lancer la passe avec lui |
| **C3 ou C5 à 0 sur ne serait-ce qu'une photo** | **disqualifié**, quel que soit le total — c'est la règle invariante |
| C3 et C5 tenus, total 70–90 | acceptable si l'écart avec le modèle du dessus coûte plus de 30 $ sur la passe |
| total < 70 | insuffisant, monter d'un cran |

**Comparer aussi à l'existant** : les 20 légendes d'Opus 5 sont déjà dans
`captions.json` et servent de référence haute. La question n'est pas « le
modèle bon marché est-il aussi bon » mais « **est-il assez bon pour les deux
usages** » — retrouver la photo, et la décrire au scénariste.

---

## 3. Modèles et tarifs

Repris du skill `claude-api` (table datée du 2026-06-24), pas de mémoire. **À
revérifier au moment de lancer** : la table est un cache.

| Modèle | Identifiant exact | Contexte | Entrée $/MTok | Sortie $/MTok |
|:---|:---|---:|---:|---:|
| Claude Haiku 4.5 | `claude-haiku-4-5` | 200K | 1,00 | 5,00 |
| Claude Sonnet 5 | `claude-sonnet-5` | 1M | 2,00 | 10,00 |
| Claude Opus 5 | `claude-opus-5` | 1M | 5,00 | 25,00 |

Ne jamais suffixer d'une date (`claude-haiku-4-5-20251001` est faux ici : les
identifiants du tableau sont complets tels quels).

**Configuration par modèle** — elle diffère, et s'y tromper fausse la
comparaison :

- **Haiku 4.5** : aucun paramètre de réflexion. `output_config.effort` **n'existe
  pas** sur ce modèle et renvoie une erreur ; la réflexion y passerait par
  l'ancien `thinking: {type:"enabled", budget_tokens:N}`, inutile pour du
  légendage. On l'appelle nu.
- **Sonnet 5** : `thinking: {type:"disabled"}` est accepté et c'est la
  configuration la moins chère qui convienne à cette tâche.
- **Opus 5** : la réflexion est **active par défaut**. Ne pas la désactiver —
  sur Opus 5 c'est une source connue d'appels d'outils écrits en texte clair et
  de balises qui fuient. Utiliser `output_config: {effort: "low"}`.
- **Aucun prefill** sur les trois : il est refusé par un 400 sur cette
  génération. La consigne n'en utilise pas.

**Ce que coûtera la comparaison** : 20 photos × 3 modèles, plus le comptage de
tokens (gratuit). En prenant large — 2 000 tokens d'entrée et 400 de sortie par
image — cela donne ≈ 0,08 $ en Haiku, ≈ 0,16 $ en Sonnet, ≈ 0,40 $ en Opus,
soit **moins de 0,70 $ au total**. Les 2 $ de crédits couvrent largement, y
compris une deuxième passe si la consigne doit bouger.

**Pour la passe complète**, l'API Batch (`client.messages.batches.create`)
divise la facture par deux et convient parfaitement : le légendage n'est pas
interactif.

---

## 4. Le comptage de tokens, aux deux résolutions

C'est le chiffre qui rend l'extrapolation honnête, et il n'a jamais été mesuré.
L'estimation de la spec — ~1 500 tokens d'entrée par image — est une supposition.

`docs/legendes/mesure-tokens.py` compte, pour **chaque modèle** (le compte est
propre au tokeniseur de chacun) et pour **chaque résolution**, le total réel
d'un appel complet : consigne système + image + amorce. Il isole aussi le coût
de la consigne seule, pour connaître la part de l'image.

Résolutions à comparer : **1400 px** (la valeur de la spec, celle qu'ont vue
les 60 légendes) et **1100 px**. Les rendus pèsent respectivement 380 Ko et
248 Ko en moyenne ; si l'écart de tokens est du même ordre, il vaut plusieurs
dizaines de dollars sur 3 930 photos et la question du 1100 px mérite d'être
posée — mais **seulement si la qualité tient à 1100 px**, ce que la même
comparaison permettra de vérifier en relançant le meilleur modèle sur les deux
tailles.

---

## 5. Comment lancer

```bash
cd /Users/nico/projects/photo_ui
export ANTHROPIC_API_KEY=...          # ou: ant auth login

# 0. les rendus 1400 px et 1100 px du sous-ensemble
python3 docs/legendes/rendus-comparaison.py

# 1. le comptage de tokens — gratuit, à faire en premier
python3 docs/legendes/mesure-tokens.py

# 2. les trois modèles sur les 20 photos, à 1400 px
python3 docs/legendes/legende.py claude-haiku-4-5 1400
python3 docs/legendes/legende.py claude-sonnet-5  1400
python3 docs/legendes/legende.py claude-opus-5    1400

# 3. si un modèle bon marché tient : la même chose à 1100 px
python3 docs/legendes/legende.py <le modèle retenu> 1100
```

Chaque exécution écrit `docs/legendes/comparaison/<modèle>-<px>.json` avec les
légendes, les tokens réellement consommés, la durée par image et le coût. La
notation §2 se fait ensuite à la main, photo par photo, en regardant les images.

---

## 6. Ce que la comparaison ne dira pas

- **Le rappel réel en recherche.** Aucune requête n'aura été lancée sur ces
  légendes. Qu'« la maison rose » ou « le bateau au sec sur son ber » remontent
  effectivement en `tsvector` français reste l'incertitude 9 bis de la spec, et
  20 légendes n'y répondront pas.
- **La tenue sur 3 930 photos.** Un modèle qui tient sur 20 cas difficiles peut
  dériver sur un corpus entier, notamment sur les albums très homogènes où la
  tentation de la légende passe-partout est forte.
- **L'exactitude des transcriptions.** Personne n'aura recoupé « 025°34.3058 N »
  ou « BODEGA MOSNANDA » avec l'original en pleine résolution. Un modèle moins
  capable se trompera davantage, et une transcription fausse est pire qu'une
  absence : **ne jamais alimenter une date ou un lieu depuis une transcription
  sans arbitrage humain.**
