#!/usr/bin/env python3
"""Produit les rendus 1400 px et 1100 px du sous-ensemble de comparaison.

    python3 docs/legendes/rendus-comparaison.py

Lecture seule sur le volume ; n'écrit que dans docs/legendes/.rendus/<px>/.
Les fichiers sont nommés par sha256 : le nom d'album ne doit jamais atteindre
le modèle, ni par le chemin ni autrement.
"""
import json, os, subprocess, sys, time

DOCS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HERE = os.path.join(DOCS, "legendes")
RESOLUTIONS = (1400, 1100)
QUALITE = 78                      # la valeur de la spec §9

data = {x["num"]: x for x in json.load(open(os.path.join(DOCS, "echantillon-legendes.data.json")))}
sub = json.load(open(os.path.join(HERE, "sous-ensemble-comparaison.json")))

for px in RESOLUTIONS:
    out = os.path.join(HERE, ".rendus", str(px))
    os.makedirs(out, exist_ok=True)
    t0, faits, absents = time.time(), 0, []
    for num in sorted(sub):
        p = data[num]
        dst = os.path.join(out, p["sha256"] + ".jpg")
        if os.path.exists(dst):
            continue
        if not os.path.exists(p["path"]):
            absents.append(num); continue
        subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", str(QUALITE),
                        "-Z", str(px), p["path"], "--out", dst], capture_output=True, check=True)
        faits += 1
    dt = time.time() - t0
    poids = sum(os.path.getsize(os.path.join(out, data[n]["sha256"] + ".jpg"))
                for n in sub if os.path.exists(os.path.join(out, data[n]["sha256"] + ".jpg")))
    n = len(sub) - len(absents)
    print(f"{px} px : {faits} rendus produits, {n} disponibles, "
          f"{poids/n/1024:.0f} Ko en moyenne" + (f", {dt/faits*1000:.0f} ms/image" if faits else ""))
    if absents:
        print(f"  volume absent pour : {' '.join(absents)}", file=sys.stderr)
