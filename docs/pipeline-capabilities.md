# Pipeline capabilities — what `adobe_mcp` already produces, and what it constrains

Reference document for `photo_ui`, the client/server application (Fastify REST +
React/Vite) built over the data produced by the `adobe_mcp` pipeline. It is
self-contained: nothing here requires reading `adobe_mcp` itself.

Written 2026-08-28. Every figure below is either **measured by this document**
against the live stores (marked *measured here*) or **quoted from a spec** with
its own measurement date. Where the two disagree, the measurement here wins and
says so.

---

## 1. What the pipeline is

Four phases, all complete except one deliberately deferred stage.

| Phase | What it produced | State |
|---|---|---|
| 1 — export | 42 910 photos pulled out of Adobe Lightroom cloud onto an external volume, the two-level album hierarchy preserved as directories, every piece of metadata carried over. Re-exported 2026-08-28 after a hierarchy reorganisation. | done |
| 2 — photo index | `mcp-index.db`, a derived SQLite flattening the cloud catalog + face index + Lightroom Classic catalog, plus an MCP server over stdio | done |
| 3 — content index | `mcp-content.db`: OCR, perceptual hash, dominant colour. Stage B (embeddings) **not started** | stage A done |
| 4 — corpus and dating | `documents.db` (transcribed logbook and memoir) and `dating.db` (dates/positions *proposed* for undated photos), plus a review prototype | stage 1 done |

Everything lives under one root, `LR_TARGET`, currently
`/Volumes/OWC Envoy Ultra/Pictures/lightroom`:

```
originals/           the 42 911 photo files, NEVER written to
manifests/export.jsonl   the join key: cloud assetId <-> absolute file path
catalog/             the Lightroom Classic catalog
work/                the four derived SQLite stores + raw-decoded/ + caches
```

---

## 2. The four stores

All four are SQLite. `photo_ui` will import into Postgres, so what matters is
their content and their **lifecycle**, which is what dictates what may and may
not be copied.

### `mcp-index.db` — 95 MB, rebuilt from scratch by `build-index`

**Disposable.** `build-index` deletes the file and writes it again. Nothing that
cannot be recomputed may live here — and by the same token, nothing the app
writes here survives.

Measured here, 2026-08-28:

| Table | Rows | Holds |
|---|---|---|
| `photos` | 42 911 | one row per photograph |
| `photo_tags` | 971 097 | auto-tags with confidence + keywords |
| `photo_albums` | 89 036 | membership, many-to-many |
| `photo_people` | 13 612 | named faces with normalised boxes |
| `tags` | 8 024 | vocabulary — 5 528 `ai`, 2 496 `user` |
| `albums` | 675 | the two-level hierarchy |
| `people` | **133** | named face clusters |
| `photo_proposals` | 85 | copied from `dating.db` (**stale**, see §7.1) |
| `photo_doubts` | 933 | copied from `dating.db` (**stale**, see §7.1) |
| `photos_fts` | — | FTS5, contentless, over 8 columns |
| `meta` | 2 | `cloudWatermark`, `photoCount` |

`photos` columns: `id, cloudAssetId, path, folder, albumPath, groupName, year,
month, day, sequence, dateSource, captureDate, rating, flag, format, fileSize,
sha256, width, height, aestheticsScore, cameraMake, cameraModel, lens, iso,
aperture, shutter, focalLength, latitude, longitude, altitude, city, state,
country, countryCode, sublocation, title, description, hasDevelop`.

### `mcp-content.db` — 19 MB, **no build ever deletes it**

Keyed by `sha256`, because the corpus is immutable: exported photos are never
edited or removed, the only permitted change is new photos appearing under
`originals/_root/`. Each signal is therefore a permanent fact about a byte
sequence. It holds 43 GB and ~1 h of decoding work.

| Table | Rows (measured here) | Holds |
|---|---|---|
| `ocr` | 41 913 | `sha256, text, lang, blocks, createdAt` — `text` is `''` when the image carries none |
| `visual` | 41 913 | `sha256, dhash (64-bit), r, g, b, colorName, createdAt` |
| `embeddings` | **0** | stage B, never run |
| `content_meta` | 0 | |

The 40 rows missing against 41 953 distinct `sha256` are the `.m4v` videos,
skipped by design.

### `documents.db` — 1.3 MB, **the only irreplaceable database**

`page_replies` holds 205 verbatim model readings of 155 scanned pages: $12 of
API and two hours of work. Everything else in it is re-derivable from those
replies with `npm run reparse`, at no cost. It is snapshotted on every git push.

| Table | Rows (measured here) | Holds |
|---|---|---|
| `log_entries` | 1 012 | one ruled line of the ship's logbook — `id, pageId, seq, date, time, latitude, longitude, rawPosition, placeName, heading, wind, baro, engineHours, remark, fixConfidence, remarkConfidence`. **711 carry a coordinate** |
| `passages` | 1 859 | prose, with the day it names when the text gives one |
| `page_replies` | 205 | the irreplaceable part |
| `page_passes` | 206 | resume state |
| `pages` | 155 | scanned sheets, with `startAt/endAt` and `spanSource` |
| `documents` | 62 | `logbook`, `ma-vie`, and 60 web gallery pages |
| `passages_fts` | — | FTS5 over the prose |

The logbook runs **9 July 1998 → 24 December 2002** and is Funiculi Funicula's
only. Nothing after 2002 brackets against it.

### `dating.db` — 229 KB, **proposals, never facts**

| Table | Rows (measured here) | Holds |
|---|---|---|
| `proposals` | 68 | `photoId (= cloudAssetId), date, dateSource, latitude, longitude, positionSource, evidence (JSON array of log-entry ids), spanHours, confidence` |
| `unresolved` | 483 | `photoId, albumPath, reason, candidates (JSON or NULL), createdAt` |

A photograph is in exactly one of the two tables, never both.

`unresolved.reason`, measured here:

| Reason | Rows | Means |
|---|---|---|
| `several-visits` | 242 | the boat called at the place more than once that year; `candidates` holds the stays |
| `place-not-on-track` | 138 | the place is located and the boat never sailed into its box (Maldives, France) |
| `no-place-in-name` | 46 | nothing in the album name names anywhere the gazetteer knows |
| `not-a-stay` | 46 | the boat was there, logged too thinly to bracket |
| `out-of-logbook-period` | 11 | the album's years lie outside 1998-2002 |

`candidates` is `[{place, from, to, fixes}]` and is NULL for every reason but
`several-visits`. Sample: `[{"place":"Cap Vert","from":"1999-01-20","to":"1999-01-21","fixes":9},{"place":"Cap Vert","from":"1999-11-12","to":"1999-11-16","fixes":6}]`.

`proposals` sample (measured here):
`dateSource='logbook-bracket'`, `positionSource='logbook-interpolated'`,
`spanHours=407.75`, `confidence='proposed'`,
`evidence=["logbook/p003/019","logbook/p004/003"]`. One row has
`confidence='manual'` with NULL span and NULL position — that is a hand decision
read back from the annotations.

**Both tables are emptied and rewritten on every pass.** Nothing human may live
there.

### Joining across the stores

`photos.id` is minted by `build-index` and **reassigned on every run**. Anything
crossing a store boundary joins on:

- **`cloudAssetId`** — the catalog's own id, assigned by Adobe, never reassigned.
  This is the only stable photo identity in the system.
- **`sha256`** — for the content store.

`photo_ui`'s Postgres import must carry `cloudAssetId` and `sha256` and must not
use `photos.id` as a durable key.

---

## 3. The MCP tools that exist

Implemented in TypeScript, `@modelcontextprotocol/sdk`, stdio transport,
read-only. 64 tests. Registered in `.mcp.json`.

| Tool | Arguments | Returns |
|---|---|---|
| `search_photos` | `text`, `inImage`, `year`, `month`, `dateFrom`, `dateTo`, `group`, `album`, `person`, `city`, `country`, `bbox` `[S,W,N,E]`, `camera`, `lens`, `isoMin`, `isoMax`, `ratingMin`, `flag` (`pick`/`reject`), `tag`, `tagConfidenceMin`, `aestheticsMin`, `format`, `hasFaces`, `hasGps`, `doubt`, `limit` (≤200, default 25), `offset`, `sort` (`date`/`rating`/`aesthetics`/`path`) | `{total, photos[]}` — each `{id, path, date, year, month, group, album, rating, aesthetics, place, people}` |
| `get_photo` | `id` | every `photos` column, plus `people[]` (name + normalised box `x,y,w,h`), `keywords[]`, `aiTags[]` (`{name, confidence}`), `albums[]`, and — **as separate top-level fields** — `proposal` and `doubt` |
| `get_image` | `id`, `maxEdge` (64–2048, default 1024) | base64 JPEG, quality 70. Never the original |
| `list_people` | `q?`, `limit?` (≤500) | `{name, photos}` ordered by count |
| `list_albums` | `set?`, `year?` | `{path, setName, albumName, groupName, year, month, photos}` |
| `list_groups` | `year?` | `{group, firstYear, lastYear, photos}` |
| `list_places` | `level` (`city`/`state`/`country`) | `{place, country, photos}` |
| `stats` | `by` = `year`/`camera`/`lens`/`country`/`group`/`format`/`person`/`duplicates` | `{key, photos}`; `duplicates` returns `{sha256, copies, paths}` |
| `timeline` | `granularity` (`year`/`month`) + every `search_photos` filter | `{bucket, photos}` |
| `find_duplicates` | `maxDistance?` (0–20, default 0), `limit?` (≤200, default 50) | `{distance, photos:[{id,path},{id,path}]}` pairs, nearest first |

**Not implemented despite being specified** in `content_index_spec.md`:
`describe` (semantic query), `similarTo` (more-like-this), and
`sort: 'relevance'`. They depend on embeddings, which were deliberately not
started. `embeddings` has 0 rows.

### The SQL behind them, directly transposable

Everything `search_photos` does is a `WHERE` clause over `photos p` plus three
`EXISTS` subqueries (people, tags, doubts) and two FTS subqueries. Notable
shapes worth copying:

- **Person:** `EXISTS (SELECT 1 FROM photo_people pp JOIN people pe ON pe.id = pp.personId WHERE pp.photoId = p.id AND pe.name LIKE @person)`
- **Tag with confidence floor:** `EXISTS (SELECT 1 FROM photo_tags pt JOIN tags t ON t.id = pt.tagId WHERE pt.photoId = p.id AND t.name LIKE @tag AND (@min IS NULL OR pt.confidence IS NULL OR pt.confidence >= @min))` — note the `confidence IS NULL OR`: a user keyword has no confidence and must not be excluded by a floor meant for auto-tags.
- **Date display:** `CASE WHEN day IS NOT NULL THEN printf('%04d-%02d-%02d',…) WHEN month IS NOT NULL THEN printf('%04d-%02d',…) WHEN year IS NOT NULL THEN printf('%04d',…) END` — the precision of the display follows the precision of what is known.
- **Place:** `nullif(trim(coalesce(city,'') || ' ' || coalesce(country,'')), '')`
- **Sorts:** `date` → `year DESC, month DESC, day DESC, path`; `rating` → `rating DESC NULLS LAST, year DESC, path`; `aesthetics` → `aestheticsScore DESC NULLS LAST, path`.

### The `review` prototype's queries

`packages/review` is a `node:http` server on 127.0.0.1:4173, no framework,
`better-sqlite3` only, three stores opened `readonly: true`. Its four data
functions transpose directly:

1. **`albumsInReview`** — `SELECT albumPath, reason, count(*) FROM unresolved GROUP BY albumPath, reason`, then the proposals' albums fetched from the index by `cloudAssetId`, merged into one list sorted by `doubts + proposals` descending.
2. **`albumPhotos(albumPath)`** — `SELECT cloudAssetId, path, captureDate, dateSource FROM photos WHERE albumPath = ? ORDER BY path`, then proposals and doubts fetched by `cloudAssetId IN (…)` and attached as **separate fields**, never merged into `captureDate`.
3. **`evidenceFor(ids)`** — `SELECT id, date, time, latitude, longitude, remark FROM log_entries WHERE id IN (…) ORDER BY date, coalesce(time,'00:00')`.
4. **`candidatesFor(albumPath)`** — `SELECT DISTINCT candidates FROM unresolved WHERE albumPath = ? AND candidates IS NOT NULL`, JSON-parsed.

Its HTTP surface: `GET /api/albums`, `GET /api/album?path=`, `GET /img?id=&full=1`,
`POST /api/stay`, `POST /api/annotation`, `POST /api/reprocess`.

---

## 4. The search and filter axes that actually exist

All coverage measured here on 2026-08-28 against `mcp-index.db` (42 911 photos)
and `mcp-content.db` (41 913 rows).

| Axis | Column / table | Photos covered | % | Quality |
|---|---|---|---|---|
| **Album** | `photos.albumPath` (primary), `photo_albums` (all) | 38 187 primary / 38 187 in ≥1 album | 89 % | 4 724 photos are in **no** album at all. Membership is many-to-many: 8 436 in 1, 9 418 in 2, 19 568 in 3, 765 in 4 |
| **Outing (group)** | `photos.groupName` | 36 143 | 84 % | The album name with its date prefix stripped. NULL for synthetic buckets (`_root`, `a_deplacer`) |
| **Year** | `photos.year` | 42 491 | 99.0 % | But see §5.1 — the source varies wildly |
| **Full date (day)** | `photos.day` via `dateSource='folder-exact'` | 14 104 | 33 % | Only `folder-exact` gives a trustworthy day for scanned material |
| **captureDate (EXIF)** | `photos.captureDate` | 42 081 | 98.1 % | **Unreliable on scanned film** — carries the scan date. 3 401 photos have a capture year that disagrees with their folder year |
| **Position (GPS)** | `latitude`/`longitude` | 18 059 | 42.1 % | Split by era: 12 917/29 113 (44 %) for 2012+, 4 230/7 303 (58 %) for 2005-2011, **710/6 075 (11.7 %) for pre-2005** |
| **Place (reverse-geocoded)** | `city` / `state` / `country` / `sublocation` | city 15 263 (35.6 %), country 18 052 (42.1 %) | | Done by Adobe, not by us. Present only where GPS is |
| **Person** | `photo_people` + `people` | 9 723 photos carry ≥1 named face | 22.7 % | **133 distinct named people**, 13 612 face rows. Top: Atlas 1 946, Gigi 1 922, Nicolas 1 852, Hugo 1 113, Gaetan 971. Boxes are normalised `x,y,w,h` |
| **OCR text** | `mcp-content.db.ocr` | 7 785 non-empty | 18.6 % | 3 891 (9.3 %) carry ≥25 characters. Language: fr 2 047, en 988, **NULL 3 119**, then a long tail of noise (id 175, es 170, pt 161, ca 155, pl 130…) |
| **Dominant colour** | `visual.colorName` | 41 913 | 100 % | **but 60.6 % land on grey/white/black.** grey 23 579, orange 6 776, blue 4 532, yellow 1 558, cyan 1 499, black 1 198, red 1 022, green 1 020, white 636, magenta 93 |
| **Rating** | `photos.rating` | 23 328 non-NULL, but only **5 068 are > 0** | 11.8 % useful | 18 260 photos carry an explicit `0`. `ratingMin: 0` filters nothing |
| **Flag** | `photos.flag` | **38** | 0.09 % | `pick`/`reject`. Effectively unused — do not build UI around it |
| **Aesthetics** | `photos.aestheticsScore` | 42 708 | 99.5 % | Adobe's own score. The most broadly available quality signal by far |
| **Auto-tag (AI)** | `photo_tags` where `tags.kind='ai'` | 29 157 photos, 724 529 rows, 5 528 vocabulary | 67.9 % | Confidence 48–98, mean 63.9. Top: blue 14 139, nature 12 021, sky 11 106, people 10 919, man 10 608 |
| **Keyword (user)** | `photo_tags` where `tags.kind='user'` | 41 011 photos, 246 568 rows, 2 496 vocabulary | 95.6 % — **but see §7.3, this axis is polluted** | |
| **Camera** | `cameraModel` | 35 374 | 82.4 % | `cameraMake` too; `lens` 22 713 (52.9 %), `iso` 32 343 (75.4 %) |
| **Duplicate** | `sha256` exact; `visual.dhash` perceptual | 949 sha256 groups covering 1 909 rows | | Spec measured 2 284 dHash pairs at distance 0 (975 byte-identical), 5 059 pairs at distance ≤ 3 |
| **Format** | `photos.format` | 42 911 | 100 % | jpg 32 061, heic 8 600, png 828, cr2 676, tif 470, jpeg 143, dng 85, m4v 40, orf 5, psd 3 |
| **Develop edits** | `hasDevelop` | 36 459 | 85 % | Boolean only — says a `crs:` block exists, not what it says |
| **Title / description** | `title`, `description` | 232 / 3 025 | 0.5 % / 7 % | Negligible |
| **Semantic ("a red boat at sunset")** | — | **0** | 0 % | Not implemented. `embeddings` is empty |

### Ranking the axes by what they can actually carry

- **Strong and near-universal:** album, outing, year, format, aesthetics, dominant colour (as a signal, not as a filter).
- **Strong on a defined subset:** GPS and place (modern era only), person (23 %), auto-tag (68 %), camera (82 %).
- **Weak but real:** OCR (19 %, and the only way to reach what is *printed* in a picture), rating (12 % useful), duplicates.
- **Do not build on:** flag (38 photos), title (232), semantic search (absent).

---

## 5. The invariant rules the app MUST respect

### 5.1 An inference must never look like a reading — the capital rule

Three kinds of date exist and must **never** be merged, at any layer, all the way
to the pixel:

| Kind | Where it lives | How the prototype renders it |
|---|---|---|
| **Read** from the file | `photos.captureDate` + `photos.dateSource` | green, plain — `1999-09-30 (exif)` |
| **Proposed** by the dating pass | `photo_proposals` / `dating.db.proposals`, its **own table**, its **own top-level field** in `get_photo` | amber, italic, `≈` prefix — `≈ 1999-09-30 (± 96 h · 32.98, -16.39)` |
| **Decided by hand** | an annotation in `data/annotations/`, surfacing as `confidence = 'manual'` | violet, bold, `✓` prefix — `✓ 1999-09-28 — by hand` |

The rule is enforced structurally at every level and the app is the last place it
could be broken:

- `dating.db` is a separate file so `build-index` cannot destroy it and so an
  inference cannot become an EXIF reading by living in the same column.
- `photo_proposals` and `photo_doubts` are **separate tables**, never columns on
  `photos`.
- `get_photo` returns `proposal` and `doubt` as their own fields.
- The interface uses three colours, three prefixes, three type treatments.

**Corollaries the app must also honour:**

- **The bracket travels with the proposal.** `spanHours` is the error bound,
  stated rather than implied. A proposal that lost its evidence must show
  `no bracket`, never a number it cannot support.
- **Evidence must be reachable.** `proposals.evidence` names the log entries; a
  reader has to be able to open the page and disagree with the arithmetic.
- **A doubt is about the pass, not about the camera.** `hasGps: false` says the
  camera recorded no position. `doubt: 'place-not-on-track'` says the logbook
  never puts the boat there. Never render them the same way.
- **`photos.dateSource` is itself a confidence signal** and must be shown, not
  swallowed. Values and their counts, measured here:
  `capture-date` 23 739, `folder-exact` 14 104, `folder-year` 2 652,
  `folder-sequence` 1 212, `folder-month-assumed` 516, `none` 420,
  `folder-month` 268. `folder-month-assumed` in particular means *nobody
  confirmed this*.

### 5.2 What is derived and rebuilt — never write there

| Store | Lifecycle | May the app write? |
|---|---|---|
| `originals/` | the archive | **Never.** Nothing is ever written inside `originals/`. Lightroom Classic must not see foreign files there |
| Lightroom cloud bundle (`.mcat`, `.wfindex`) | Adobe's | **Never.** Read only through SQLite's online backup API into a snapshot — Lightroom holds them in WAL mode and a plain read sees a torn database |
| Lightroom Classic catalog | the user's | **Never** |
| `mcp-index.db` | deleted and recreated by `build-index` | No — anything written is gone at the next build |
| `dating.db` | **both tables emptied** and rewritten by every pass | No — same |
| `mcp-content.db` | never deleted by any build | No — it is a cache of expensive facts, not a place for decisions |
| `documents.db` | `page_replies` irreplaceable, the rest re-derivable | No |
| `data/annotations/*.jsonl` | git-tracked, append-only | **This is the only place a human decision goes** |

### 5.3 Annotations are the only write path

`data/annotations/annotations.jsonl` (85.8 KB today) is described in the project
as *the one irreplaceable directory in the repository*. Shape:

```json
{"id":"dating_<photoId>_<iso>","at":"2026-08-28T13:13:10.077Z","kind":"dating",
 "target":{"type":"photo","id":"e8bc80b75e254b7db2e1454222416813"},
 "value":{"date":"1999-03-02"},"note":"wrong date in folder-sequence"}
```

- `kind` ∈ `correction` | `addition` | `arbitration` | `dating` — four distinct
  meanings, not interchangeable. `correction` replaces a transcribed value,
  `addition` creates a fact written nowhere, `arbitration` records which of two
  disagreeing sources wins, `dating` asserts a date or place by hand.
- `target.type` ∈ `passage` | `log_entry` | `photo` | `page` | `album`.
- `target.id` for a photo is the **`cloudAssetId`**, not `photos.id`.
- The writer is **append-only** and refuses a reused `id`. Nothing may rewrite an
  existing line.
- The reader **throws** on a malformed line, naming `file:line`, by design: a
  line that will not parse is a person's lost work, not noise to skip.
- An annotation carrying **neither a value nor a note is refused** — it would say
  nothing and could never be acted on.
- A `dating` annotation on `target.type: 'album'` with `value: {from, to}` is
  read **before anything is computed and overrules all of it**, the year filter
  included.

**The gesture and the record are different units.** The prototype settled this:
the interface picks a whole album in one click, but writes **one annotation per
photograph**. The album is right for the hand; the photograph is what the pass
consumes, and a record naming the thing it decided about still means something
after the album's membership has changed. The one exception is `several-visits`,
where the ambiguity genuinely belongs to the album and one album-targeted
annotation is written.

### 5.4 Other invariants

- **`get_image` never returns an original.** Originals reach 872 MB here
  (measured: the largest `.tif`); the largest `.jpg` is 80.9 MB. Serve a
  downscaled render.
- **Every photo answer carries its path**, so a caller can act on the real file.
- **Confidence travels with AI tags.** A tag at 52 and a tag at 95 are not the
  same claim and must not be flattened.
- **Absent is not zero.** 420 photos have no date at all, 24 852 have no GPS,
  33 188 have no named face. Those come back NULL, never as a default that reads
  as data.
- **Re-processing is not a feature to build.** `npm run propose-dates` rebuilds
  every proposal from the stores and the annotations, free, with no API cost.
  There is no queue and no job state to model.
- **A filter the caller asked for must narrow or match nothing — never silently
  vanish.** See §7.5.

---

## 6. Image generation — how it works and what it costs

### The path to pixels

`renderImage(photoPath, maxEdge, cacheDir, rawDecodedRoot, originalsRoot)`:

1. `decodeSource()` resolves which file to actually open:
   - path outside `originalsRoot` → `{kind:'outside'}`, a **configuration error**,
     reported distinctly so it is never mistaken for a per-photo problem;
   - extension in `{m4v, mov, mp4, avi}` → `{kind:'video'}`, no still to render;
   - extension in `{cr2, cr3, nef, arw, orf, raf, rw2, pef, srw, dng}` → the
     pre-decoded PNG under `work/raw-decoded/<same relative path>.png` **if it
     exists**, otherwise the raw original (`sips` decodes CR2/ORF/DNG natively
     through ImageIO);
   - anything else → the file itself.
2. `maxEdge` is clamped to 64–2048.
3. Cache key = `sha256(source|edge)[0:32]`, cached as JPEG in
   `work/mcp-previews/` (10 files today — the cache is essentially cold).
4. `sips -s format jpeg -s formatOptions 70 -Z <edge> <src> --out <cached>`.
5. Returns base64 + `image/jpeg`.

**Pre-decoded raws:** `work/raw-decoded/`, **766 lossless 16-bit PNGs**, **43 GB**
(measured here), mirroring the relative path under `originals/`. Decoded once on
2026-08-24, 0 failures. A decoded PNG holds *less* information than its CR2 — it
bakes in Apple's demosaic and white balance. The raws stay the archive; the PNGs
are a consumption format.

**Note the MCP server never serves a Lightroom preview.** `mcp_spec.md` says
"serve the Lightroom preview where one exists, otherwise downscale on demand" —
the implementation only ever downscales with `sips`. Lightroom's own previews are
content-addressed (`previews/<2 chars>/<hash>`, no readable name, no extension)
and nothing in the pipeline resolves them.

### Measured cost, 2026-08-28, on the external Thunderbolt volume

All figures are `sips -Z 600 -s format jpeg`, warm-ish filesystem cache, one
process per image:

| Source | Cost per image |
|---|---|
| JPEG, 2–5 MB (the bulk of the corpus) | **60–80 ms** |
| A real album of 60 mixed photos, sequential | **2.41 s total = 40 ms each** |
| Large JPEG (> 8 MB), 20 samples | **81 ms each** |
| **HEIC**, 20 samples | **140 ms each** — the slowest common format |
| CR2 original, direct demosaic | **310–420 ms** |
| Pre-decoded PNG (53 MB, 16-bit) | **430 ms** — *slower than decoding the CR2* |
| TIFF, 20 MB | 20–30 ms (embedded thumbnail is likely being used) |

A 1024px JPEG at quality 70 comes out around **174 KB**, so ~232 KB as base64.

**The pre-decoded PNG is not a speed win for thumbnailing.** It was built to
avoid repeated demosaic cost, but a 53 MB 16-bit PNG takes longer to read and
downscale than the 25 MB CR2 it came from. It remains the right source for
correctness (one canonical decode across the content pass and `get_image`), not
for latency.

### What `frontend_spec.md` says about thumbnails

It leaves exactly one question open, and this one:

> Still open: **thumbnails are made with `sips` into the system temp directory**
> on first view, which makes the first scroll through a large album slow. Whether
> to pre-build them, and where they should live, is not decided.

The prototype's thumbnails are 600 px JPEGs, keyed by `sha256(absolute path)`,
written to `os.tmpdir()/adobe-mcp-review-thumbs` — **explicitly not beside the
photographs, because the originals volume is the one thing this project never
writes to**. The stated reason for thumbnailing at all: the scans run to several
megabytes each and an album of two hundred is not a grid a browser will render
politely.

**Arithmetic for `photo_ui`:** a 200-photo album cold = 200 × 40–140 ms =
**8–28 s sequentially**. Parallelism and a persistent, pre-built thumbnail store
are the two levers. Whole-corpus pre-build: 42 911 × ~70 ms ≈ **50 min single-
threaded**, well under an hour, and this is the obvious thing to do once.

---

## 7. Known traps — every one of these was paid for already

### 7.1 The index's proposals and doubts are stale, and use a dead vocabulary

**Measured here, and this is live right now.** `mcp-index.db` (built 15:06) holds
85 proposals and 933 doubts; `dating.db` (written 16:13, later the same day)
holds 68 and 483. Worse, the reason vocabularies differ:

| `mcp-index.db.photo_doubts` (stale) | `dating.db.unresolved` (current) |
|---|---|
| `not-a-stay` 453 | `several-visits` 242 |
| `album-not-in-logbook` 398 | `place-not-on-track` 138 |
| `no-place-in-name` 69 | `no-place-in-name` 46 |
| `out-of-logbook-period` 13 | `not-a-stay` 46 |
| | `out-of-logbook-period` 11 |

`album-not-in-logbook` **no longer exists**; it was replaced by
`several-visits` and `place-not-on-track` when the pass moved from text matching
to position matching. But the MCP server's `doubt` enum still lists the old set
and would **reject** `several-visits` or `place-not-on-track` as unknown values.

**Consequence for the app:** read doubts and proposals from `dating.db`, not
from `mcp-index.db`, or re-run `build-index` after every dating pass and treat
the reason set as data rather than as a hard-coded enum. The `review` prototype
already uses the current five-value set; the MCP server does not.

### 7.2 `captureDate` is three different formats in one column

Measured here — string lengths in `photos.captureDate`:

| Length | Shape | Rows |
|---|---|---|
| 19 | `1987-05-03T12:01:16` — **no offset at all** | 32 070 |
| 29 | `2018-11-10T11:48:23.780+04:00` | 9 465 |
| 24 | `2023-02-01T16:04:33.000Z` | 418 |
| 22 | `2023-05-20T23:07:11.36` | 70 |
| 20 | `2018-11-16T06:20:19Z` | 56 |
| 25 | `2022-04-25T11:10:10+02:00` | 2 |

Offsets seen: `+02:00` (2 149), `+01:00` (1 761), `Z` (174), `+04:00` (28), and
a long tail of sub-second variants.

**Three consequences:**
1. 75 % of rows carry **no timezone**. The date part is in its *stored offset* —
   the pipeline's own rule is *do not convert to UTC*, because the original file
   path is `originals/YYYY/YYYY-MM-DD/` derived from exactly that stored offset.
2. `dateFrom`/`dateTo` in `search_photos` are **string comparisons** on this
   column. `dateTo = '2018-11-16'` excludes everything captured on 2018-11-16,
   because `'2018-11-16T06:20:19' > '2018-11-16'`. Any Postgres import must
   normalise deliberately and document what it did.
3. A naive `timestamptz` cast will silently shift 32 070 photos by the server's
   local offset.

### 7.3 `kind = 'user'` keywords are not what a person wrote

Measured here, and this is not documented anywhere in `adobe_mcp`:

- **1 591 of the 2 496** `user` keyword names are **also** Adobe auto-tag names.
- **141 283 of the 246 568** `user` keyword rows (57 %) carry such a name.
- **656** of the `user` keyword names are **album names**.
- The top "user keywords" by row count are: `all pics` 22 257,
  `2 August 2022 21:25` 20 788, `Nico Iphone` 10 108, `water` 6 466, `sea` 6 001,
  `Nico Ipad` 5 252, `man` 4 317, `nature` 4 235, `blue` 4 135.

The first, second, third and sixth of those are the **root catch-all albums**;
`water`, `sea`, `man`, `nature`, `blue` are auto-tags that crossed the
70-confidence floor Phase 1 applied when embedding XMP into the exported files,
came back as `dc:subject`, and are now indistinguishable from a hand-typed
keyword.

**Consequence:** presenting `kind='user'` as "your keywords" is wrong. Either
subtract the names that also exist as `ai` tags and the names that match an
album, or do not offer the axis as a curated one. The honest residue is roughly
900 vocabulary entries out of 2 496.

### 7.4 The date in an album's name is not evidence — and the index believes it is

The second level of the 1998-2004 hierarchy is `aaaa-mm-place or comment`, and
**those months were never reconciled with the documents. They can be months out,
and the year with them** — the 2026-08-28 reorganisation renamed
`2001-11-Venezuela-Merida` to `2000-12-viree au Venezuela-3mois`.

**Where the album name and the documents disagree, the logbook and `ma vie` win.**
They were written on the day; an album name is a label put on a folder years
later.

`toPhotoRecord` takes the album name's year and month **first** and falls back to
`captureDate` only when the name has none. That is right for a folder called
`2015-12-30 zoo` and **wrong for every album of the voyage**. The place in the
name stays valuable — it is what brackets an album against the logbook — but the
figures in front of it are a guess that looks like a reading.

This is a live, unfixed divergence between what the project believes and what the
index does. `photo_ui` must not present `photos.year`/`month` for 1998-2004
albums as authoritative.

### 7.5 A filter that silently disappears returns the whole library

Two distinct incidents, both observed:

1. **Unknown filter keys are stripped by zod.** The MCP SDK builds a non-strict
   object from the shape, so an unknown key vanishes and the filter is simply not
   applied. A client asking an older server for `inImage` got **42 913 rows
   presented as matches**. Fixed by `rejectUnknownFilters`, which fails loudly.
2. **A search term that strips to nothing.** `inImage: "*"` reduces to no usable
   FTS term after metacharacter stripping; dropping the clause returned the whole
   library. Fixed by pushing a literal `0` into the WHERE clause instead.

**The rule:** a filter the caller asked for must narrow, or match nothing, or
fail loudly. It must never disappear. The REST API must enforce the same thing —
an unknown query parameter is a 400, not a silent no-op.

### 7.6 FTS: separate columns for separate questions

`text` and `inImage` are **different questions** and had to be separated:

- `text: "recette"` → 745 photos, because they sit in a folder named
  `Gigi Recettes`.
- `inImage: "recette"` → the 69 that actually show the word.

Both are right answers; the caller chooses, the server does not guess.

While OCR and caption shared one FTS column, `inImage: "grey"` matched
**24 056 photos** — three times the entire text-bearing corpus — because the
dominant-colour word lived there too, and a title like
`M27 - Nébuleuse de l'haltère` made a photo with no text at all answer a search
for text *in* the image.

The index therefore has 8 FTS columns: `path, groupName, albumPath, place,
people, tags, caption, ocr`. `caption` = title + description + colour name;
`ocr` = the printed text only, whitespace-flattened and capped at 4 000
characters so one screenshot of a manual does not outweigh a thousand photos in
ranking.

Also, on a **contentless FTS5 table**, the form
`WHERE photos_fts MATCH ? AND rowid = ?` silently **ignores a bound rowid** and
returns the corpus count, while the same query with a literal rowid returns 1.
It fails as a wrong number, not as an error. Always use
`p.id IN (SELECT rowid FROM photos_fts WHERE photos_fts MATCH ?)`.

FTS input must be escaped: `"`, `*`, `^`, `:`, `(`, `)`, `-` are FTS5 syntax, and
control characters must go too — a NUL byte truncates the query at the C string
boundary mid-literal and SQLite raises "unterminated string" out of the handler.

### 7.7 Scanned film carries the date it was scanned

Half this library is scanned film. `1992-08 Empuria Brava` holds photos stamped
**2013-12-29**. **3 401 photos** (measured here) have a `captureDate` year that
disagrees with their `photos.year`.

This is why `resolveMonth` only lets a capture date vote on a `YYYY-NN` album
when its **year matches the folder's**. Letting all capture dates vote rejected
the month in **70 of 73** candidate albums — the folder name, written by a person
who was there, was being overruled by a scanner's clock.

Never show a `captureDate` as *the* date of a scanned photograph without also
showing `dateSource`.

### 7.8 `YYYY-NN` album names are genuinely ambiguous

`1999-07 Nans les Pins` means July. `2002-24 TCI` cannot mean month 24. Of 135
albums in this shape, 73 have `NN ≤ 12` and 62 have `NN` between 13 and 53.

Resolution rule, as implemented:
- same-year capture dates that agree (≥ 60 % majority) → `folder-month`, confirmed;
- same-year dates that disagree → the number is a **week or trip number**
  (`folder-sequence`, kept in `photos.sequence`);
- no same-year dates at all → `folder-month-assumed` if `NN ≤ 12`.

**And the prefix is not a chronological rank.** Confirmed against positions for
the 2000 Caribbean season: Guadeloupe `2000-07` was 11-15 May, Ste Lucie
`2000-09` was 11-17 July, Union `2000-08` was 4-11 August. Ordering comes from
positions, never from the prefix.

### 7.9 Positions in the logbook are degrees-and-minutes, not decimal

`14.43.9N` is 14° 43.9′, i.e. 14.73 — not 14.44. Silent misreadings that were
found and fixed, each of which produced a plausible-looking wrong coordinate:

| Fault | Cell | Was read as | Actually |
|---|---|---|---|
| fraction of a minute limited to one digit | `38.50.46N` | 50.77 N | 38.84 N |
| degrees never bounded | `1556.5N` | 556.08 N | 15.94 N |
| `W` transcribed as `N` | `17.32N 62.23.9N` | 62.40 **E** | 62.40 W |
| separator between degrees and minutes simply absent | `1505N`, `1602N 61.15W` | filed as a place name | 47 cells recovered |
| a second field ≥ 60 is not minutes — it is decimal degrees | `21.50N 72.91W` | | 11 cells |

**A missing hemisphere letter is read as north and west** — the voyage never left
the western Atlantic. **The proof is per group, never per cell:** page 16 writes
a latitude in degrees-and-minutes beside a longitude that cannot be.

Net: 543 → 711 positions (measured here: 711 of 1 012 `log_entries` carry a
coordinate). Four readings were withdrawn as unreachable by `dropOutlierFixes`;
**39 cells remain unread** — dash-separated pairs, pairs split across two rows,
`41°11'290"`, a wrong hemisphere letter, two illegible.

A residue worth knowing: the decimal longitudes land 20–50 miles west of the
place their own row names. The reading is kept because it is what the page says;
**it is not confirmed**.

### 7.10 The table's column order changes between pages

The logbook's transcribed table does not keep a stable column order. The header
is read **per page**. A parser that reads the header once corrupts every page
after the first that differs — silently, since every column holds plausible text.

### 7.11 The language recogniser guesses rather than abstains

`NLLanguageRecognizer` **never says "I don't know"** — it guesses at 18 %
confidence rather than abstain. A 0.50 confidence floor was applied, which is why
`ocr.lang` is NULL for **3 119** of the 7 785 text-bearing photos (measured
here). The tail below fr/en is noise: id 175, es 170, pt 161, ca 155, pl 130,
ro 109, tr 100, nl 95, it 91 — on a library whose text is French and English.

**Consequence:** `lang` is not a filter axis. NULL means "not confident", not
"no language", and a non-NULL value outside fr/en is probably wrong.

### 7.12 A missing row means nothing without its reason

An absent row in `proposals` reads the same whether the pass never reached the
album, the logbook never named the place, or the mentions were too thin to call a
stay. That difference is knowable **only while the decision is being taken**, so
the pass writes it into `unresolved`. The app must surface the reason, not the
absence.

The same principle governs `pages.spanSource` in `documents.db`: a page that
names no day takes the day before as both ends and is marked `carried` — a
carried day is an inference and must not look like a reading. 22 of the 103
`ma vie` pages are `carried`, 81 are `passages`, and the logbook's are `entries`.

### 7.13 Formats and files that will not render

- **`.m4v` — 40 files.** No still to render, skipped by design in the content
  pass, and `get_image` throws. They stay findable by date, album, place and
  person. The app must handle a photo record that can never produce a pixel.
- **The `UNSUPPORTED` raw list was wrong** and blocked 766 photos for no reason;
  `sips` decodes CR2, ORF and DNG natively. That is fixed — do not reintroduce a
  format blacklist.
- **`.psd` (3), `.tif` (470, up to 872 MB).** Renderable but heavy.

### 7.14 Two more, from the dating pass

- **A year-level album is an unsorted pile.** `2000-2001/2000`, `2002/2002`,
  `2003-toCheck/2003` — 81 photos whose leaf is a bare year are the ones never
  filed into a sub-album. Not a place, not a stay: a heap that needs eyes, and it
  should be **marked to verify rather than bracketed**.
- **An album is not one crew in one place.** `2002-23 Gigi St Martin` is
  Ghislaine alone at St Martin, contemporaneous with `2002-24 TCI` where the rest
  of the family was. Do not infer "who was there" from "who is usually in this
  album".

### 7.15 Read the catalogs through the backup API, never directly

Lightroom and Lightroom Classic hold their catalogs in **WAL mode while
running**, and a plain read can see a torn database. Both are opened read-only
and through SQLite's online backup API into `work/*-snapshot.*`. The same applies
to any copy of `documents.db`: `.backup`, not `cp`.

---

## 8. What is specified but does not exist

Do not plan around these:

| Thing | State |
|---|---|
| Semantic search (`describe`) | Specified in `content_index_spec.md` (model chosen: `jinaai/jina-clip-v2`, 1024 dims, int8-quantised, ~43 MB, no ANN index, brute-force scan after SQL filtering). **`embeddings` has 0 rows.** Deliberately not started — its value is only knowable after living with stage A |
| Similarity (`similarTo`) | Same |
| `sort: 'relevance'` | Same |
| VLM captions | Deferred, out of scope, 12–36 h of compute |
| Lightroom preview serving | In the spec, not in the code |
| Incremental index rebuild | Watermarks exist (`meta.cloudWatermark` = 321 892) but a full rebuild takes under a minute, so incremental complexity was never built |
| An annotation on a `log_entry` | `readAnnotations` accepts `target.type: 'log_entry'` but **only `kind: dating` on `target.type: photo` (and `album`) is honoured**. An annotation naming a log entry would be read and silently ignored — a known gap, blocking the hand correction of logbook page 27 |

---

## 9. Practical notes for the Postgres import

- **Durable keys:** `cloudAssetId` (text, from the Adobe catalog) and `sha256`.
  Never `photos.id`.
- **Photo → content join** is on `sha256`, and a duplicate file is one content
  row serving several photo rows (949 sha256 groups covering 1 909 photo rows,
  measured here).
- **Album membership is many-to-many.** `photos.albumPath` is only the *primary*
  album; `photo_albums` has all 89 036 memberships. 4 724 photos have none.
- **`albums.groupName` is NULL for 51 of 675 albums**, and `albums.dateSource` is
  **`'unset'` for all 675** (measured here) — `build.ts` inserts the album row
  with `year: null, month: null, dateSource: 'unset'` and only fills `year`/
  `month` afterwards by majority vote over the album's photos. The album's own
  parsed date source is computed during the build and then thrown away. If the
  app wants it, re-derive it from the album name.
- **`photos_fts` is contentless FTS5** and cannot be read back — it exists only
  to match. Postgres will need its own `tsvector`, built from the same eight
  fields with the same separation between `caption` and `ocr`.
- **All 200 sampled `photos.path` values exist on disk** (measured here), so the
  index and the filesystem are currently in agreement. CLAUDE.md notes 151
  photos absent by path at the Classic import (54 real duplicates, 97 to
  recover) — that is a Classic-side gap, not an index-side one.
- Paths are absolute and contain spaces:
  `/Volumes/OWC Envoy Ultra/Pictures/lightroom/originals/194x-1969/194x/43 Mai Biozat Taté.jpg`.
  Store the path relative to the export root as well, so the volume can move.

## 10. Context that is world knowledge, not data

The dating work rests on facts told by Nicolas that appear nowhere in any
catalog. They are recorded because nothing derives them:

| Period | Where | Boat | Aboard |
|---|---|---|---|
| 1998 | Day sails around Lisbon | Funiculi Funicula | the family |
| 1999 → 2002 | Portugal → Fort Lauderdale | Funiculi Funicula | Nicolas, Ghislaine, Hugo, Gaëtan |
| 2002 → 2003 | A year ashore in Fort Lauderdale | — | the family |
| 2003 | Canada, around Sorel | — | — |
| 2003 → 2004 | Florida → Portugal | Funfun2 | Nicolas, Hugo, Michel |
| from 2004 | Portugal | Funfun2 | Nicolas, Ghislaine, Hugo |

Gaëtan is aboard for the first voyage and not the second; Michel only for the
second. **A face is evidence about a date, and a date is evidence about a face.**

A gazetteer of **31 places** (name, the forms an album writes them in, a bounding
box) lives in `packages/dating/src/places.ts`. It is the only such table in the
project, written on purpose: the boxes say where Sainte-Lucie is, the logbook
alone says when the boat was there. Nothing derives it from the data.

---

## 11. Uncertainties — not verified

Declared rather than guessed.

1. **The 351-people figure.** `mcp_spec.md` and `CLAUDE.md` both state "351
   distinct people" / "13 619 named faces over 9 729 photos". The live index has
   **133 people**, 13 612 face rows, 9 723 photos. `docs/sqlite.md` agrees with
   the index (133). I did not determine whether 351 was measured before a
   filtering step, on a different source, or is simply wrong. **Use 133.**

2. **The proposals/doubts drift.** I established that `mcp-index.db` is one
   dating pass behind `dating.db` and that the reason vocabularies differ. I did
   **not** verify what `build-index` produces after a fresh run — I did not run
   it. The stale counts may be a transient state of this machine rather than a
   structural problem.

3. **The keyword pollution finding is mine, not the project's.** The 1 591/2 496
   overlap and the 656 album-name keywords are measured here and documented
   nowhere in `adobe_mcp`. My explanation — Phase 1 embedded auto-tags above a
   70-confidence floor into XMP, which came back as `dc:subject` — is inferred
   from a single sentence in `mcp_spec.md` plus the observed overlap. I did not
   read the Phase 1 embedding code to confirm it.

4. **TIFF render timing (20–30 ms for a 20 MB file) is anomalous** and probably
   reflects `sips` using an embedded thumbnail rather than decoding. Not
   investigated. Do not plan capacity on it.

5. **All timings were measured on one machine, warm, single-process, over
   Thunderbolt.** Cold-cache and concurrent behaviour on the external volume is
   not measured. The 60-photo album at 40 ms each may not be representative — it
   happened to be small scans.

6. **I did not read** `packages/dating/src/places.ts`, `propose.ts`, `bracket.ts`,
   `visits.ts`, `interpolate.ts`, nor `packages/documents/` beyond its schema. The
   dating algorithm's internals are summarised from `CLAUDE.md`, not from code.

7. **I did not read** `packages/photo-index/src/catalog/` (the `.mcat`
   MessagePack decoder, the `wfindex` face join, the Classic reader). Statements
   about how the cloud catalog is decoded come from `CLAUDE.md`.

8. **`photos.sequence`** is populated (1 212 rows have `dateSource =
   'folder-sequence'`) but no MCP tool filters on it. Whether it is useful to the
   app is untested.

9. **Concurrency.** Whether several `sips` processes in parallel scale linearly
   on this volume is not measured, and it is the single most important number for
   a thumbnail pre-build.

10. **The `.m4v` count (40) and their behaviour in a browser** — I verified they
    exist and that `get_image` refuses them. I did not check whether they play
    natively or need transcoding.

11. **`frontend_spec.md` was read in full** but is deliberately not summarised
    here per instruction; only what it imposes on the rest is recorded (§5.1,
    §5.3, §6).
