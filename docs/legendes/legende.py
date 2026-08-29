#!/usr/bin/env python3
"""Légende le sous-ensemble de comparaison avec un modèle donné.

    python3 docs/legendes/legende.py <modele> [px] [workers]
    python3 docs/legendes/legende.py claude-haiku-4-5 1400

Écrit docs/legendes/comparaison/<modele>-<px>.json : légendes, tokens réellement
consommés, durée par image, coût. Le modèle ne reçoit que les pixels et la
consigne — aucune date, aucun album, aucun nom de fichier, aucun tag.
"""
import base64, json, os, re, sys, time
from concurrent.futures import ThreadPoolExecutor

import anthropic

DOCS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HERE = os.path.join(DOCS, "legendes")

MODELE = sys.argv[1] if len(sys.argv) > 1 else "claude-haiku-4-5"
PX = int(sys.argv[2]) if len(sys.argv) > 2 else 1400
WORKERS = int(sys.argv[3]) if len(sys.argv) > 3 else 6
AMORCE = "Décris cette photographie."

# Tarifs $/MTok — skill claude-api, table du 2026-06-24. À revérifier.
PRIX = {"claude-haiku-4-5": (1.00, 5.00),
        "claude-sonnet-5": (2.00, 10.00),
        "claude-opus-5": (5.00, 25.00)}

# La configuration diffère par modèle et s'y tromper fausse la comparaison.
#   Haiku 4.5 : output_config.effort n'existe pas et renvoie une erreur.
#   Sonnet 5  : thinking désactivable, c'est le moins cher pour du légendage.
#   Opus 5    : réflexion active par défaut ; ne pas la désactiver (elle fait
#               fuir des balises et des appels d'outils en texte clair),
#               baisser l'effort à la place.
CONFIG = {"claude-haiku-4-5": {},
          "claude-sonnet-5": {"thinking": {"type": "disabled"}},
          "claude-opus-5": {"output_config": {"effort": "low"}}}

if MODELE not in PRIX:
    sys.exit(f"modèle inconnu : {MODELE} (attendus : {', '.join(PRIX)})")

client = anthropic.Anthropic(max_retries=4)
data = {x["num"]: x for x in json.load(open(os.path.join(DOCS, "echantillon-legendes.data.json")))}
sub = json.load(open(os.path.join(HERE, "sous-ensemble-comparaison.json")))
consigne = open(os.path.join(HERE, "consigne-v3.txt")).read()
REP = os.path.join(HERE, ".rendus", str(PX))


def analyser(txt):
    """La consigne demande du JSON nu ; on tolère un bloc de code par sécurité."""
    t = re.sub(r"^```(?:json)?|```$", "", txt.strip(), flags=re.M).strip()
    try:
        return json.loads(t), None
    except Exception:
        m = re.search(r"\{.*\}", t, re.S)
        if m:
            try:
                return json.loads(m.group(0)), None
            except Exception as ex:
                return None, f"JSON invalide : {ex}"
        return None, "aucun JSON dans la réponse"


def une(num):
    f = os.path.join(REP, data[num]["sha256"] + ".jpg")
    b64 = base64.standard_b64encode(open(f, "rb").read()).decode()
    t0 = time.time()
    r = client.messages.create(
        model=MODELE, max_tokens=1500, system=consigne,
        messages=[{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64",
                                         "media_type": "image/jpeg", "data": b64}},
            {"type": "text", "text": AMORCE}]}],
        **CONFIG[MODELE])
    dt = time.time() - t0
    txt = "".join(b.text for b in r.content if b.type == "text")
    d, err = analyser(txt)
    pin, pout = PRIX[MODELE]
    return {"num": num, "legende": (d or {}).get("legende"),
            "mots_cles": (d or {}).get("mots_cles"), "defauts": (d or {}).get("defauts"),
            "brut": txt if err else None, "erreur": err, "stop_reason": r.stop_reason,
            "input_tokens": r.usage.input_tokens, "output_tokens": r.usage.output_tokens,
            "secondes": dt,
            "cout_usd": r.usage.input_tokens * pin / 1e6 + r.usage.output_tokens * pout / 1e6}


if not os.path.isdir(REP):
    sys.exit(f"rendus absents dans {REP} — lancer rendus-comparaison.py")

nums = sorted(n for n in sub if os.path.exists(os.path.join(REP, data[n]["sha256"] + ".jpg")))
print(f"{MODELE} · {PX} px · {len(nums)} photos · {WORKERS} en parallèle · "
      f"config {CONFIG[MODELE] or 'aucune'}")

t0 = time.time()
with ThreadPoolExecutor(max_workers=WORKERS) as ex:
    res = list(ex.map(une, nums))
mur = time.time() - t0

ok = [r for r in res if not r["erreur"]]
tin = sum(r["input_tokens"] for r in res)
tout = sum(r["output_tokens"] for r in res)
cout = sum(r["cout_usd"] for r in res)
lat = sorted(r["secondes"] for r in res)
tronques = [r["num"] for r in res if r["stop_reason"] == "max_tokens"]

bilan = {
    "modele": MODELE, "px": PX, "n": len(res), "json_valide": len(ok),
    "config": CONFIG[MODELE], "workers": WORKERS,
    "input_tokens_moyen": tin / len(res), "output_tokens_moyen": tout / len(res),
    "cout_total_usd": cout, "cout_par_image_usd": cout / len(res),
    "extrapolation_3930_usd": cout / len(res) * 3930,
    "extrapolation_3930_batch_usd": cout / len(res) * 3930 / 2,
    "duree_totale_s": mur, "latence_mediane_s": lat[len(lat) // 2], "latence_max_s": lat[-1],
    "tronques_max_tokens": tronques,
}
dst = os.path.join(HERE, "comparaison", f"{MODELE}-{PX}.json")
os.makedirs(os.path.dirname(dst), exist_ok=True)
json.dump({"bilan": bilan, "resultats": res}, open(dst, "w"), indent=1, ensure_ascii=False)

print(json.dumps(bilan, indent=1, ensure_ascii=False))
if tronques:
    print(f"ATTENTION — coupées par max_tokens : {' '.join(tronques)}", file=sys.stderr)
if len(ok) < len(res):
    print(f"ATTENTION — {len(res)-len(ok)} réponses non analysables, "
          f"voir le champ 'brut'", file=sys.stderr)
print(f"\n→ {dst}")
