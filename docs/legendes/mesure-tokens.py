#!/usr/bin/env python3
"""Compte les tokens d'entrée réels par image, par modèle et par résolution.

    python3 docs/legendes/mesure-tokens.py

Gratuit : count_tokens n'est pas facturé. À lancer avant toute inférence.
Le compte est propre au tokeniseur de chaque modèle — d'où la boucle.
"""
import base64, json, os, statistics, subprocess, sys

import anthropic

DOCS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HERE = os.path.join(DOCS, "legendes")
MODELES = ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5"]
RESOLUTIONS = (1400, 1100)
AMORCE = "Décris cette photographie."

client = anthropic.Anthropic()
data = {x["num"]: x for x in json.load(open(os.path.join(DOCS, "echantillon-legendes.data.json")))}
sub = sorted(json.load(open(os.path.join(HERE, "sous-ensemble-comparaison.json"))))
consigne = open(os.path.join(HERE, "consigne-v3.txt")).read()


def dimensions(f):
    o = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", f],
                       capture_output=True, text=True).stdout
    return (int(o.split("pixelWidth:")[1].split()[0]),
            int(o.split("pixelHeight:")[1].split()[0]))


def message(f):
    b64 = base64.standard_b64encode(open(f, "rb").read()).decode()
    return [{"role": "user", "content": [
        {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": b64}},
        {"type": "text", "text": AMORCE},
    ]}]


resultats = {"consigne_seule": {}, "par_resolution": {}}

# La consigne système seule, pour isoler la part de l'image.
for m in MODELES:
    n = client.messages.count_tokens(
        model=m, system=consigne,
        messages=[{"role": "user", "content": AMORCE}]).input_tokens
    resultats["consigne_seule"][m] = n
    print(f"consigne + amorce, sans image — {m:18s} : {n} tokens")

print()
for px in RESOLUTIONS:
    rep = os.path.join(HERE, ".rendus", str(px))
    if not os.path.isdir(rep):
        print(f"{px} px : rendus absents, lancer rendus-comparaison.py", file=sys.stderr)
        continue
    resultats["par_resolution"][str(px)] = {}
    for m in MODELES:
        comptes, aires, detail = [], [], []
        for num in sub:
            f = os.path.join(rep, data[num]["sha256"] + ".jpg")
            if not os.path.exists(f):
                continue
            w, h = dimensions(f)
            n = client.messages.count_tokens(
                model=m, system=consigne, messages=message(f)).input_tokens
            comptes.append(n); aires.append(w * h)
            detail.append({"num": num, "w": w, "h": h,
                           "ko": os.path.getsize(f) // 1024, "tokens": n})
        if not comptes:
            continue
        image_seule = statistics.mean(comptes) - resultats["consigne_seule"][m]
        resultats["par_resolution"][str(px)][m] = {
            "n": len(comptes), "min": min(comptes), "max": max(comptes),
            "median": statistics.median(comptes), "moyenne": statistics.mean(comptes),
            "part_image_moyenne": image_seule, "detail": detail}
        print(f"{px} px  {m:18s} n={len(comptes):2d}  "
              f"total min {min(comptes)} / med {int(statistics.median(comptes))} / "
              f"max {max(comptes)}  —  part image ≈ {image_seule:.0f} tokens  "
              f"(aire moyenne {statistics.mean(aires)/1e6:.2f} Mpx)")

# Extrapolation aux 3 930, en gardant la sortie inconnue à ce stade.
PRIX = {"claude-haiku-4-5": (1.00, 5.00), "claude-sonnet-5": (2.00, 10.00),
        "claude-opus-5": (5.00, 25.00)}
print("\nCoût d'entrée seul sur 3 930 photos (la sortie s'ajoutera après mesure) :")
for px, par_modele in resultats["par_resolution"].items():
    for m, r in par_modele.items():
        cout = r["moyenne"] * 3930 * PRIX[m][0] / 1e6
        print(f"  {px} px  {m:18s} {r['moyenne']:7.0f} tok/image  →  "
              f"{cout:6.2f} $   ({cout/2:5.2f} $ en Batch)")

dst = os.path.join(HERE, "comparaison", "tokens.json")
os.makedirs(os.path.dirname(dst), exist_ok=True)
json.dump(resultats, open(dst, "w"), indent=1)
print(f"\n→ {dst}")
