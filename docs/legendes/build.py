#!/usr/bin/env python3
"""Construit docs/echantillon-legendes.html — page autonome, images intégrées.

    python3 docs/legendes/build.py

Lit echantillon-legendes.data.json (l'échantillon et ses métadonnées) et
legendes/captions.json (les légendes). Les rendus web sont produits par sips
depuis les originaux du volume, en lecture seule, et mis en cache dans
legendes/.rendus/ (ignoré par git).
"""
import base64, html, json, os, subprocess, sys

DOCS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HERE = os.path.join(DOCS, "legendes")
CACHE = os.path.join(HERE, ".rendus")
OUT = os.path.join(DOCS, "echantillon-legendes.html")
PX, Q = 800, 68                      # rendu d'affichage ; le légendage a vu 1400 px

data = json.load(open(os.path.join(DOCS, "echantillon-legendes.data.json")))
caps = json.load(open(os.path.join(HERE, "captions.json")))
consigne = open(os.path.join(HERE, "consigne-v3.txt")).read()
e = html.escape

os.makedirs(CACHE, exist_ok=True)
missing = []
for p in data:
    dst = os.path.join(CACHE, p["sha256"] + ".jpg")
    if os.path.exists(dst):
        continue
    if not os.path.exists(p["path"]):
        missing.append(p["num"]); continue
    subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", str(Q),
                    "-Z", str(PX), p["path"], "--out", dst],
                   capture_output=True, check=True)
if missing:
    print(f"volume absent, {len(missing)} rendus manquants: {' '.join(missing)}", file=sys.stderr)

BUCKET_FR = {"mer-navigation": "mer / navigation", "port-mouillage": "port / mouillage",
             "gens": "gens", "ville-escale": "ville / escale",
             "paysage-nature": "paysage / nature", "interieur-vie": "intérieur / vie",
             "documents-objets": "document / objet", "autre": "autre"}
DATE_FR = {"d-lect": "lecture EXIF", "d-prop": "proposition", "d-hum": "décision humaine"}
NAT = {"d-lect": "exif", "d-prop": "album", "d-hum": "humaine"}
TAGS_INLINE = 12

cards = []
for p in data:
    c = caps.get(p["num"], {})
    f = os.path.join(CACHE, p["sha256"] + ".jpg")
    img = (f'<img loading=lazy alt="" src="data:image/jpeg;base64,'
           f'{base64.standard_b64encode(open(f,"rb").read()).decode()}">'
           if os.path.exists(f) else '<div class=noimg>rendu absent</div>')
    tags = p["tags"]
    head = " ".join(f"<span class=tag>{e(n)}<i>{c_}</i></span>" for n, c_ in tags[:TAGS_INLINE])
    rest = " ".join(f"<span class=tag>{e(n)}<i>{c_}</i></span>" for n, c_ in tags[TAGS_INLINE:])
    more = (f"<details class=more><summary>+ {len(tags)-TAGS_INLINE} autres tags</summary>"
            f"<div>{rest}</div></details>") if rest else ""
    kw = " ".join(f"<span class=kw>{e(k)}</span>" for k in c.get("mots_cles") or [])
    df = " ".join(f"<span class=df>{e(k)}</span>" for k in c.get("defauts") or [])
    cards.append(f"""
<article class=card id="p{p['num']}" data-ens="{e(p['ens'])}" data-bucket="{e(p['bucket'])}"
         data-date="{NAT[p['date_cls']]}" data-low="{int(bool(p['low']))}">
  <div class=img>{img}</div>
  <div class=body>
    <div class=hdr>
      <span class=num>{p['num']}</span>
      <span class=album>{e(p['album'])}</span>
      <span class=file>{e(p['file'])}</span>
    </div>
    <div class=facts>
      <span class="date {p['date_cls']}" title="{DATE_FR[p['date_cls']]}">{e(p['date_txt'])}</span>
      <span class=chip>{BUCKET_FR.get(p['bucket'], p['bucket'])}</span>
      <span class="chip{' low' if p['low'] else ''}">esthétique {p['aesth']}</span>
      <span class=chip>{e(p['dim'])}</span>
    </div>
    <div class=cols>
      <section class=col-tags>
        <h4>Tags IA d'Adobe <span class=n>{len(tags)}</span></h4>
        <div class=tagbox>{head}</div>{more}
      </section>
      <section class=col-leg>
        <h4>Légende</h4>
        <p class=leg>{e(c.get('legende') or '—')}</p>
        <div class=kws>{kw}</div>
        {f'<div class=dfs><span class=lbl>défauts</span>{df}</div>' if df else ''}
      </section>
    </div>
  </div>
</article>""")

CSS = """
*{box-sizing:border-box}
body{margin:0;background:#f5f5f3;color:#1b1b1d;
 font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
header{background:#fff;border-bottom:1px solid #dcdcd8;padding:28px 34px 20px}
h1{margin:0 0 8px;font-size:23px;letter-spacing:-.01em}
.sub{margin:0 0 4px;color:#5a5a5e;max-width:80ch}
.sub b{color:#1b1b1d}
details.doc{margin-top:16px;font-size:13px;max-width:80ch}
details.doc summary{cursor:pointer;color:#4a4a70;font-weight:500}
details.doc pre{white-space:pre-wrap;background:#fafaf8;border:1px solid #e4e4e0;
 border-radius:5px;padding:14px;max-height:400px;overflow:auto;font-size:12.5px;line-height:1.5}
details.doc p{color:#5a5a5e}
nav{position:sticky;top:0;z-index:9;background:#fffffff2;backdrop-filter:blur(8px);
 border-bottom:1px solid #dcdcd8;padding:9px 34px;display:flex;gap:6px;flex-wrap:wrap;
 align-items:center;font-size:12.5px}
nav b{color:#77777c;font-weight:500;margin:0 2px 0 6px}
nav b:first-child{margin-left:0}
nav button{font:inherit;border:1px solid #d0d0cc;background:#fff;border-radius:13px;
 padding:3px 10px;cursor:pointer;color:#333}
nav button:hover{border-color:#999}
nav button[aria-pressed=true]{background:#1b1b1d;color:#fff;border-color:#1b1b1d}
nav .sep{width:1px;height:17px;background:#dcdcd8;margin:0 4px}
main{padding:20px 34px 70px;display:flex;flex-direction:column;gap:16px}
.card{display:grid;grid-template-columns:330px minmax(0,1fr);gap:20px;background:#fff;
 border:1px solid #e4e4e0;border-radius:7px;padding:16px}
.card[hidden]{display:none}
.img img{width:100%;height:auto;display:block;border-radius:4px;background:#eee}
.noimg{aspect-ratio:4/3;display:grid;place-items:center;background:#f0f0ee;color:#999;
 border-radius:4px;font-size:13px}
.hdr{display:flex;gap:9px;align-items:baseline;flex-wrap:wrap;margin-bottom:7px}
.num{font-variant-numeric:tabular-nums;color:#a5a5a8;font-size:12px;font-weight:600}
.album{font-weight:600}
.file{color:#a5a5a8;font-size:11.5px;font-family:ui-monospace,Menlo,monospace}
.facts{display:flex;gap:6px;flex-wrap:wrap;font-size:12px;margin-bottom:12px}
.date{padding:2px 8px;border-radius:4px;font-variant-numeric:tabular-nums;white-space:nowrap}
.d-lect{color:#1a6b2f;background:#e7f4eb}
.d-prop{color:#8a5800;background:#fdf2df;font-style:italic}
.d-hum{color:#68219f;background:#f4eafd;font-weight:700}
.chip{color:#66666a;background:#f1f1ef;padding:2px 8px;border-radius:4px}
.chip.low{color:#a0271f;background:#fceceb}
.cols{display:grid;grid-template-columns:minmax(0,0.85fr) minmax(0,1.15fr);gap:18px}
.cols h4{margin:0 0 7px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;
 color:#8c8c90;font-weight:600;display:flex;gap:6px;align-items:center}
.cols h4 .n{color:#b5b5b8;font-weight:400;letter-spacing:0;text-transform:none}
.col-tags{border-right:1px solid #ededea;padding-right:18px}
.tagbox{display:flex;flex-wrap:wrap;gap:4px}
.tag{background:#eef1f6;color:#3d5378;border-radius:4px;padding:2px 6px;font-size:12px;
 white-space:nowrap}
.tag i{color:#98a6bd;font-style:normal;font-size:9.5px;margin-left:3px;vertical-align:1px}
details.more{margin-top:7px;font-size:11.5px}
details.more summary{cursor:pointer;color:#9a9a9e}
details.more>div{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
.leg{margin:0 0 8px;font-size:14.5px}
.kws,.dfs{display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.dfs{margin-top:6px}
.kw{background:#e8f1e9;color:#2c5735;border-radius:4px;padding:2px 7px;font-size:12px}
.df{background:#fceceb;color:#a0271f;border-radius:4px;padding:2px 7px;font-size:12px}
.lbl{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:#b08a86;margin-right:2px}
@media(max-width:1100px){.cols{grid-template-columns:1fr}
 .col-tags{border-right:0;border-bottom:1px solid #ededea;padding:0 0 14px}}
@media(max-width:820px){.card{grid-template-columns:1fr}}
"""

JS = """
const F={ens:null,bucket:null,date:null,low:false};
const cards=[...document.querySelectorAll('.card')];
function apply(){
  cards.forEach(c=>{c.hidden =
    (F.ens && c.dataset.ens!==F.ens) || (F.bucket && c.dataset.bucket!==F.bucket) ||
    (F.date && c.dataset.date!==F.date) || (F.low && c.dataset.low!=='1');});
  document.getElementById('n').textContent=cards.filter(c=>!c.hidden).length;
  document.querySelectorAll('nav button').forEach(b=>{
    const k=b.dataset.k;
    b.setAttribute('aria-pressed', k==='low' ? F.low : (k in F && F[k]===b.dataset.v));
  });
}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{
  const k=b.dataset.k;
  if(k==='reset') Object.assign(F,{ens:null,bucket:null,date:null,low:false});
  else if(k==='low') F.low=!F.low;
  else F[k] = F[k]===b.dataset.v ? null : b.dataset.v;
  apply();
});
apply();
"""

def btns(k, vals, label=str):
    return "".join(f'<button data-k={k} data-v="{e(v)}">{e(label(v))}</button>' for v in vals)

ENS = ["1998-1999", "2000-2001", "2002", "2003", "2004"]
BUCK = [b for b in BUCKET_FR if any(p["bucket"] == b for p in data)]
DATN = [("exif", "EXIF"), ("album", "album seul"), ("humaine", "décision humaine")]
nlow = sum(1 for p in data if p["low"])

doc = f"""<!doctype html><html lang=fr><head><meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1">
<title>Échantillon de légendes — photo_ui</title><style>{CSS}</style></head><body>
<header>
<h1>Légendage automatique : {len(data)} photos, tags contre légendes</h1>
<p class=sub>Échantillon stratifié tiré des <b>3 930 photos</b> du périmètre (82 albums,
5 ensembles) : {len(data)} albums distincts, trois natures de date, huit situations,
et {nlow} photos du décile esthétique bas. Chaque photo porte à gauche <b>ses tags IA
d'Adobe</b>, à droite <b>la légende</b>. La question n'est pas « la légende est-elle
jolie » mais <b>ce qu'elle apporte que les tags n'apportent pas</b>.</p>
<p class=sub>Le modèle n'a reçu <b>que les pixels</b> — un rendu 1400 px, sans date, sans
album, sans nom de fichier, sans tag. Tout nom propre qui apparaît dans une légende est
donc une <b>lecture</b> d'un texte inscrit dans l'image, citée entre guillemets, jamais
une déduction.</p>
<details class=doc><summary>La consigne de légendage (version 3, celle qu'on rejouerait
sur un modèle bon marché)</summary><pre>{e(consigne)}</pre></details>
<details class=doc><summary>Comment lire cette page</summary>
<p>Regardez d'abord les photos <b>28, 45, 59</b> (sujet minuscule ou absent), <b>03, 21,
32</b> (intérieurs de bateau que les tags lisent comme une maison), <b>31, 46, 50, 55</b>
(du texte ou une date inscrits dans l'image), et <b>18, 43, 27</b> (les tags se trompent
de sexe ou d'activité). Une légende utile nomme l'objet précis, dit le support et l'état
de l'image, et sait dire qu'elle ne sait pas. Une légende creuse paraphrase les tags.</p>
</details>
</header>
<nav>
<b>ensemble</b>{btns('ens', ENS)}<span class=sep></span>
<b>situation</b>{btns('bucket', BUCK, lambda b: BUCKET_FR[b])}<span class=sep></span>
<b>date</b>{''.join(f'<button data-k=date data-v={v}>{l}</button>' for v, l in DATN)}
<span class=sep></span>
<button data-k=low data-v=1>esthétique basse</button>
<button data-k=reset data-v=1>tout</button>
<span class=sep></span><span style="color:#77777c"><b id=n>{len(data)}</b> photos</span>
</nav>
<main>{''.join(cards)}</main>
<script>{JS}</script></body></html>"""

open(OUT, "w").write(doc)
print(f"{OUT} — {os.path.getsize(OUT)/1e6:.1f} Mo, {len(data)} photos, "
      f"{sum(1 for p in data if p['num'] in caps)} légendes")
