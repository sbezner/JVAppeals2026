# Feature Backlog

Features under consideration for JVAppeals2026. Ranked by real impact on
whether a Jersey Village homeowner wins their property tax appeal.
Originally drafted 2026-04-20; last updated 2026-04-24. Methodology
and recommendation logic are **frozen until after May 15, 2026** —
all comp-filter, adjustment, and verdict-threshold changes have been
moved to the new
[Post-2026 season](#post-2026-season-locked-until-next-years-data)
section so nothing accidentally ships mid-cycle.

---

## ✅ Shipped

### Content + UX refinement pass after the restructure (2026-04-24)

A second pass focused on factual accuracy and density. Fact-checked
copy against the live HCAD iFile portal (with the user logged in)
and the Texas Comptroller's protest pages, then trimmed redundant
content across pages.

Substantive corrections shipped:
- **iSettle is opt-in**, chosen during the iFile wizard's "Additional
  Options" screen with a required Opinion of Market Value when Yes —
  not something HCAD does automatically after filing. Playbook
  rewritten to match.
- **HCAD = Harris *Central* Appraisal District** (their footer name).
- **2026 deadline is May 18** for most JV homeowners (May 15 is the
  statute baseline; §41.44(a) extends 30 days from notice mailing,
  §1.06 bumps Sunday → Monday). Playbook deadline banner shows the
  full math; durable "May filing deadline" copy elsewhere.
- **iFile login is `owners.hcad.org`**, not generic `hcad.org`.

Content surfaces that changed:
- Report Page 2 collapsed to hearing script + Disclaimer; the deadline
  banner / iFile steps / iSettle / rebuttals / what-NOT-to-argue /
  §42.26 escalation moved to the Playbook (no more duplication).
  A blue callout at the top of Page 2 points to `playbook.html#file`
  and prints the URL `jvtaxappeal.com/playbook.html` for paper readers.
- Playbook Act 2 rewritten high-level: "follow HCAD's protest
  wizard… self-explanatory once you're logged in" rather than
  walking through screens. Evidence-packet section collapsed from
  4 numbered steps to 3 items. Printable checklist removed.
- Two-tier hero on both Appraisals (red gap → red total value) and
  Appeals (green win-rate → green median reduction).
- Map popover trimmed to colors + badges; "How comps are chosen"
  indented under the gray No-comps bullet, methods-differ indented
  under Orange Ring (visual parity). Relative-not-absolute caveat
  moved to About → Methodology.
- About page TOC + 8 anchored sections with proper sticky-nav offset.
- Footer everywhere: `← Jersey Village 2026 · Built by a neighbor ·
  Contact · Disclaimer` (Disclaimer link added).
- "Use of this site constitutes acceptance" clause added to the
  About → Disclaimer block.
- Owner names + report-as-evidence framing tightened: the report is
  a *preparation tool*, never described as the homeowner's
  evidence; uploads are HCAD comp printouts + their own statement.

Bug fix: anchor offsets stacked (`scroll-padding-top` + per-section
`scroll-margin-top` both at 80px = 200px overshoot). Now using
`scroll-padding-top: 60px` on `html` only — single source of truth.

### Social-media preview cards / Open Graph (2026-04-24)

When a JV neighbor shares `jvtaxappeal.com` on Facebook / NextDoor /
iMessage / Slack / X, the link now unfurls as a branded card with
the bucket-color dots, "Jersey Village 2026 HCAD Appeals" title,
"Find your home. See if you should file." tagline, and the JV badge.

- `og-image.svg` is the source design (1200×630, vector).
- `og-image.png` is the rendered artifact crawlers fetch (50KB).
  Generated with headless Chrome:
  `Google Chrome --headless=new --window-size=1200,630
  --screenshot=og-image.png file://$(pwd)/og-image.svg`
- Per-page `og:title` / `og:description` / `og:url` plus matching
  Twitter Card meta tags on every page (Map, Playbook, Appraisals,
  Appeals, About, Report). Image is shared across all pages.

Also shipped same day: `favicon.svg` — JV monogram in white on a red
circle, matches the bucket palette's "file your appeal" signal.
Linked from every HTML page.

### Five-tab site restructure — Map / Playbook / Appraisals / Appeals / About (2026-04-24)

Site went from two pages (map + stats) to five, tied together by a
sticky mobile-scrollable top nav. The map keeps its zero-click
address-search funnel at `/`; the old two-tab `stats.html` split into
`appraisals.html` and `appeals.html`, each its own top-level page with
the same three-act structure from the earlier designer pass. A new
`playbook.html` consolidates the homeowner's guide (how to use the
site, how to file, how to track on HCAD) with a TOC, glossary,
and an 8-question FAQ. `about.html` holds data
sources, methodology, privacy, contact (`hello@jvtaxappeal.com` via
Cloudflare email routing), and the full legal disclaimer.
`stats.html` was reduced to a tiny redirect stub that forwards
`?view=appeals` to `appeals.html` so legacy share URLs keep working.

Map-page `?` popover trimmed to just colors + badges (the old
"How to use this site" section lives in Playbook now). Footer
across every non-report page simplified to "← Jersey Village 2026 ·
Built by a neighbor · Contact", where Contact anchors to the About
page's Contact section rather than launching a `mailto:` on mis-tap.

Decisions baked in during the restructure:
- **Owner names stay visible** on map popup + sheet + report — HCAD
  itself publishes this data with zero barrier, so no takedown
  mechanism or privacy policy was added.
- **Playbook and report.html Page 2 stay distinct by purpose**:
  Playbook is generic pre-filing education, Page 2 is parcel-
  personalized hearing-day content. Don't duplicate.
- **Appraisals hero** gets a red-leaning accent (`.stats-hero-appraisals`)
  to pair with the "over-assessment" story; Appeals keeps its green
  win-rate hero. Everything else uses shared site-blue for nav/links.
- **Report page stays nav-less** — toolbar only, to preserve the
  print-clean layout for hearing packets.

QA-pass shipped in the same commit:
- Duplicate `id="notable"` in `appraisals.html` renamed to
  `#notable-section` (h2 anchor) vs `#notable` (ul that stats.js
  populates).
- `report.html` footer picked up a Contact link.
- Print CSS added for doc/stats pages — hides nav/footer/TOC and
  forces every FAQ `<details>` open so the printable Playbook is
  complete on paper.
- `:focus-visible` focus rings on every nav pill (was invisible
  default before).
- `nav.js` auto-scrolls the active pill into view on load so
  narrow-mobile landings on "Appeals & History" or "About" don't
  render the active tab offscreen.
- Non-obvious layout fix: `html, body { height: 100dvh }` (needed
  for Leaflet) was globally clamping body height on long-content
  pages and breaking sticky nav. Now scoped — only the unclassed
  `body` (map page) keeps the clamp; `body.doc-page` and
  `body.stats-page` override to `min-height: 100dvh; height: auto`.

Cache-bust: `style.css?v=34`, `main.js?v=9`, `stats.js?v=15`,
`nav.js?v=1`.

### ARB protest + hearings pipeline + 2026 filings factoid (2026-04-23, commits eff8d43, 82907e5)

New `hearings` pipeline stage loads HCAD's `arb_protest_real.txt` +
`arb_hearings_real.txt` for tax years 2023–2026, filters to JV parcels,
dedupes multi-hearings-per-year by `Release_Date DESC`, and emits a
`parcel_history` DuckDB table keyed by (account, year). 1,265 of 2,172
JV parcels (58%) have at least one record. `reports_data.py` attaches
a per-parcel `hist` field (year → filing date, agent/owner, hearing
outcome, initial/final appraised + market values); `mapdata.py` marks
those parcels with sparse `h:1`. CLI accepts multi-stage invocations
(`python -m pipeline hearings reports mapdata`) for the weekly refresh.

First UI consumer: a single live-count factoid on `/stats.html`
("**N** Jersey Village neighbors have already filed a 2026 protest")
under the hero — verifies the data is wired through to the site
without committing to a UI surface yet.

Size impact: parcels.json 86.7 KB → 89.4 KB gzipped (+3.1%);
reports.json 217.4 KB → 307.4 KB gzipped (+41.4%). reports.json is
lazy-loaded by report.html and stats.html only, so the delta never
hits map-load time. Cache-bust to stats.js v=9, style.css v=24.

The pipeline foundation is in place for the next round of UI features
(per-parcel protest-history row, owner-vs-agent win-rate stats,
year-over-year trend on parcel reports) without further pipeline
changes. Sub-features will be split out individually as they ship.

### Sqft + $/sqft in the main-map popup (2026-04-23)

New row on the pin popup and mobile bottom sheet shows the parcel's
living area and per-sqft appraisal in a muted line under the HCAD
account row, e.g. *"2,686 sqft · $160.21/sqft"*. Makes the map
directly useful for hand-picking comps on a gray parcel or
sanity-checking the tool's automatic matches — a homeowner can scan
neighboring pins and see which ones are in the right size/$/sqft
ballpark without opening each report.

Implementation: `pipeline/mapdata.py` adds `sqft` and `psf` to every
entry in `data/parcels.json` (psf is computed per-row, so it doesn't
depend on findings). 2,113 of 2,172 parcels have both (the other 59
are the HCAD-no-value parcels where psf can't be computed — the
line is gracefully suppressed on those pins). File size: 294KB →
359KB raw / 88KB gzipped (actually dropped from 97KB gzipped —
denser integer fields compress tighter than the cap/dis flag
sprinkle). Cache-bust to main.js v=8, style.css v=23.

Data emission only — no methodology, verdict, or comp-selection
change. Safe under the May-15 freeze.

### "What this tool doesn't adjust for" caveat block (2026-04-21)

Dedicated section on Page 1 of every report, right after the
comp table / methodology note / §23.23 cap ground. Lists the things
the per-sqft test is blind to: lot size, pool, covered patios,
detached garages/workshops, accessory dwellings (garage apartments /
MILs), condition + age-of-systems, recent renovations, flood
history. Each item has one sentence explaining *why* the tool can't
see it. Ends with a call to open the comps on
`search.hcad.org` and compare features before filing.

Prompted by real user feedback — a neighbor wrote in asking whether
the tool accounts for their oversize lot, two covered areas, and
accessory apartment. The answer for all three was no; rather than
reply one-off to every DM that raises this, the report now says it
in writing. Matches the site's "here's what we can and can't see"
ethos.

Static HTML — no JS wiring, no data dependency, renders identically
for every parcel.

### Year-over-year trend row in the facts table (2026-04-21)

New row at the bottom of the Page 1 facts table for any parcel with
a 2025 appraisal on file: *"2025 → 2026 Change: +14.3% ($376,000 →
$430,337)"*. Pulled from the `prior_v` field already loaded for the
§23.23 cap detection — no pipeline change, no data re-emit.

Neutral styling (no red/green tinting). Rationale: "appraisal went
up" isn't always bad news (an under-assessed home moving toward fair
is actually fine), and coloring the number editorializes something
the facts table is supposed to just report.

Omitted when HCAD has no prior-year value (new construction,
mid-year splits, data gaps).

### Stats page — /stats.html (2026-04-21, commit af0f70e, iterated through 39b152b)

A dedicated community-scale readout at `jvtaxappeal.com/stats.html`.
Not a homeowner tool — a JV-wide snapshot for Nextdoor / Facebook
browsers and for map users looking for context ("am I unusual?").
Advocacy-light tone: neutral headline, data does the talking.

Page structure:
- Hero: $900M total HCAD 2026 appraised value across 2,172 parcels.
- Secondary trio: combined red+yellow appraisal–median gap ($40M)
  and city-wide median year-over-year appraisal change (+1.5%).
- Distribution histogram: inline SVG, 2.5%-wide bins across the full
  over-% range, bars tinted by bucket, dashed cutoff lines at
  −5% / +2% / +7%, dotted median marker at −0.2%. Zero chart-library
  dependencies; ~80 lines of vanilla JS emitting `<rect>`s + axis text.
- Bucket ladder: 5 rows matching the map-overlay legend.
- "Also on the map": 23 possible §23.23 cap claims (1% of homesteaded),
  449 methods-differ flags (21% of parcels).
- Methodology paragraph linking to CLAUDE.md + aggregate-figures-only
  / not-legal-advice disclaimer.

Implementation is client-side only. `stats.js` fetches
`data/reports.json` (the lazy-loaded full dataset that feeds
report.html — already browser-cached for returning visitors) and
computes every number on load. No pipeline changes, no new data file;
numbers auto-refresh whenever `reports.json` is regenerated.

Linked from the footer of `index.html` and Page 2 of every
`report.html` as "Jersey Village by the numbers". Print mode strips
link styling so the phrase reads as plain text on paper — natural
share attribution when a printed report makes its way around.

### HCAD account click-to-verify (2026-04-21, commit dbad1e0)

Every account number in the comp table (subject row + all 5 comps) is
now a blue anchor with a ↗ icon. Click it and the account copies to
the clipboard while `https://search.hcad.org/` opens in a new tab;
the homeowner pastes and verifies the comp in two taps. Pre-empts the
"are these really my comps?" pushback. HCAD's new search is
session-URL-only (URL hash decodes to timestamp + token + offset, no
account), so deep-linking to a parcel detail page isn't possible —
copy-and-paste is the durable path. Print mode renders accounts as
plain black text with no underline or arrow.

### Info-popover badges + scrollable-on-mobile (2026-04-21, commits 99e7b8a, efadfec)

The "?" popover now documents two signals the map had added without
explanation: the orange ring around a pin (§23.23 homestead-cap claim
available) and the "methods differ" tag (per-sqft and raw-dollar tests
disagree). Each has a visual example matching the actual map pin and
popup tag. Also rewrote step 3 of the how-to to describe the report
as it actually is — FILE/DON'T FILE verdict banner, dual per-sqft +
raw-dollar comp display, separate §23.23 ground when applicable.
Separately, the popover got `max-height` + `overflow-y: auto` so
mobile users can reach the bottom instead of having the new content
clipped.

### §23.23 Homestead cap detection (2026-04-20, commit ac27938)

Flags the 23 JV parcels where a residence-homesteaded home had more
than a 10% year-over-year appraisal increase (statutory cap under
§23.23). Orange ring on the map; dedicated "Alternate Ground" section
on Page 1 with prior-year / 10%-ceiling / excess math; §23.23-first
hearing script; verdict-banner override that promotes the cap to the
primary recommendation for most color buckets. Ships with a
new-improvement caveat because ~4 of the 23 are likely new-construction
or major-remodel false positives.

### Raw-dollar comp median alt view (2026-04-20, commit ac27938)

Chronicle-style raw-dollar median of the 5 comp appraisals, shown as a
muted appendix beneath the primary per-sqft summary in the report comp
table. Homeowners can walk into the ARB with both numbers and present
whichever the panel responds to.

### Methods-differ note (2026-04-20, commit ac27938)

449 parcels (20.7% of the map) where the per-sqft and raw-dollar
methodologies give different file-vs-skip verdicts get a muted
"Methods differ — see report" tag in the map popup, and a full
Methodology Note section in the report explaining the divergence and
what it means for the homeowner's decision.

### Widen JV filter for HCAD data gaps (2026-04-20, commit ac27938)

HCAD's `jur_value.txt` had 61 JV-addressed residential parcels with no
tax_district rows at all, silently dropping them from the map
(including 15509 Jersey Dr). Fallback: postal `site_addr_2='JERSEY
VILLAGE'` when no `jur_value` row exists. Net add: 59 parcels.

### Verdict banner on the report (2026-04-19, commit 59d9ad1)

Big FILE / Consider filing / Skip / DON'T FILE / Review manually
banner on Page 1, right under the NOT-LEGAL-ADVICE notice. Tinted by
bucket (red/yellow/green/purple/gray) with distinct copy per color.
Homeowner gets the action decision above the fold before reading any
numbers. Print mode flattens to B&W with a solid border so the
banner still reads at the ARB hearing.

### Map-overlay legend (2026-04-19, commits 5641b78, 68550d7)

Bottom-left Leaflet control, always visible, with five color rows —
File / Consider / Skip / Don't file / Review — that mirror the
verdict banner's action verbs so the map and the report speak the
same language. Plus a sixth row documenting the orange ring
(homestead cap). Replaces the header-inline legend, which was 12px
gray text and hidden entirely on mobile.

### Purple under-assessed bucket + comp-spread CV badge (2026-04-19, commit 386b111)

5th color for parcels more than 5% below their per-sqft median —
explicit "do not file — the ARB can adjust values upward" warning
with the dollar upside-risk quantified in the hearing script. Those
583 parcels were previously in the green "skip — filing unlikely to
change" bucket, which was silently misadvising the 246 most
deeply-under-assessed homes. Comp-spread CV (`100 · stdev/mean of
comp $/sqft`) surfaced as a "spread: tight / moderate / wide" pill
next to the Median row so homeowners know how confident the median
is (58% tight, 28% moderate, 10% wide, 4% very wide).

### Per-sqft normalization (2026-04-19, commit f4c56f4)

Comp comparison switched from raw appraised value to $/sqft
(`median(comp_val / comp_living_area)`, implied fair value =
`median_psf × subject_sqft`). Matches HCAD's own CAMA model and the
Texas Comptroller's PVS uniformity audit, and removes the bias
raw-dollar medians introduced when the subject sat at the edge of
its sqft band. 2026 distribution shifted: red 581→529, yellow
331→316, green 1165→1232. The new greens are parcels the raw-$
method was wrongly flagging as over-assessed just because the
subject was smaller than its comp basket average.

### Locate-me map control (2026-04-19, commit 3230e50)

Top-right Leaflet control button that uses `navigator.geolocation`
to center the map on the user and drop a blue accuracy ring + dot.
One tap and the surrounding parcels are right there — especially
useful on mobile. Loading animation while geolocation resolves;
error toast for permission-denied / timeout paths.

### Cache-buster convention (2026-04-19, commit 32d7f19, plus every bump since)

`index.html` and `report.html` reference local assets with a
version query string — `style.css?v=N`, `main.js?v=N`,
`report.js?v=N`. Whenever any of those three files changes, bump
the integer so browsers fetch fresh on a normal refresh instead of
serving a stale cached copy. Documented in CLAUDE.md §7 as a
standing rule for future sessions. Currently at `v=10`.

---

## Tier 1 — High leverage (ship these first)

*All Tier 1 items have either shipped or been deferred to the
[Post-2026 season](#post-2026-season-locked-until-next-years-data)
section below. Condition-adjustment worksheet (former #4) was moved
there because it changes the verdict a homeowner sees, and the
methodology is frozen until after the May 15 filing deadline.*

---

## Tier 2 — Nice-to-haves (low effort, modest impact)

---

### Site analytics

Currently NOT collecting any data — the previous featurelist entry
(now removed from Shipped) claimed Cloudflare Web Analytics was
covered automatically. That only applies when the domain is
orange-cloud-proxied through Cloudflare. `jvtaxappeal.com` is
DNS-only (proxy off), which is required for GitHub Pages to
provision its Let's Encrypt cert, so automatic mode doesn't apply.

To enable: Cloudflare dashboard → Web Analytics → Add a site →
`jvtaxappeal.com` → copy the `<script data-cf-beacon="...">` snippet
Cloudflare generates → paste it just before `</body>` in
`index.html` and `report.html` → bump cache-busters → commit.
~10 minutes. Within ~30 min of enabling, the dashboard shows page
views, referrers, device mix, country, and core-web-vitals.

Alternatives if we ever want per-report-URL breakdowns: Plausible
($9/mo, rich dashboard, privacy-respecting) or GoatCounter
(free, open-source, lightweight).

---

### #5 PWA / Add to Home Screen

Make the site installable on phones (icon on home screen, splash
screen, offline-capable). ~3 files: `manifest.json`, a service worker,
touch icons.

### #6 Share button on the report page

Native Web Share API on mobile (tap → iOS/Android share sheet),
copy-to-clipboard fallback on desktop. One button next to "Back to
map".

### #7 Filter pins by bucket

"Show only red" toggle on the map. A neighbor can text a block's-worth
of red pins to each other.

### #9 First-visit onboarding tour

A subtle "New here? Here's how the map works" overlay for first-time
visitors. 3–4 screens: "click a pin", "colors mean X", "print the
report for the hearing", "deadline is May 15". Dismissible, stored in
localStorage so return visitors don't see it.

### #10 User-submitted comps for gray parcels

The 95 gray parcels have no automatic comp match. Let the homeowner
paste 5 HCAD account numbers (or click 5 pins on the map), and the
page re-renders the report client-side with those comps. Turns every
gray pin into a usable report.

---

## Tier 3 — Bigger lifts (skip unless the project goes long-term)

### #11 ARB hearing date tracker

User enters their scheduled hearing date; page shows a countdown and
prep-reminder nudges. `localStorage` only, no backend.

### #12 Compare with a neighbor

Click two pins → side-by-side view. Useful for "my neighbor has a
bigger house and pays less" situations.

### #13 Email / SMS deadline reminder

"Remind me May 10 to file." Requires a backend or Zapier/Formspree.

### #14 Offline-mode service worker

Cache `parcels.json` + `reports.json` for reliable loading at the ARB
hearing with spotty WiFi. Depends on PWA (#5).

### #15 Multi-year tracking

Keep historical snapshots of `data/parcels.json` so next year's site
can show "your appraisal has climbed 34% since 2022." Requires
discipline about snapshotting per year.

---

## Post-2026 season (locked until next year's data)

**Methodology and recommendation changes are frozen** until after the
May 15, 2026 filing deadline. Changing comp filters, adjustment
logic, or verdict thresholds mid-season means a homeowner who read
their report in April and planned their filing could return in May
to find their pin color or fair-value number shifted. That
undermines the tool's reliability exactly when people are using it
to make filing decisions.

The items below are all deferred to the 2027 pipeline rebuild. Most
are genuine upgrades that would strengthen the methodology — they
just can't land mid-cycle.

### Historical methodology validation (2026-04-23)

The HCAD ARB hearings data now in `hcad_raw/Hearings/` 2023–2025 has
the `Initial_Appraised_Value → Final_Appraised_Value` delta for every
real-property hearing — the ground-truth measure of who won how much.
To validate the tool's bucket assignments (*"do parcels we color red
actually win reductions at a higher rate than green?"*) we'd need to
re-run the pipeline against the 2025 HCAD appraisal-roll snapshot to
generate 2025 bucket colors, then inner-join against
`arb_hearings_real.txt` filtered to Tax_Year=2025.

Not possible today — we only have 2026 raw data. Needs:
- 2025 `real_acct.txt`, `building_res.txt`, `jur_value.txt`,
  `jur_exempt.txt`, and `Parcels.shp` (HCAD's annual certified-roll
  archive — may require emailing HCAD or paying for a historical
  download).
- A `hcad_raw_2025/` sibling folder + the pipeline invoked with
  `DATA_DIR` set to 2025 paths, emitting separate `parcels_2025.json` /
  `reports_2025.json`.
- A validation script that joins the 2025 bucket colors against the
  2025 hearing outcomes and reports a 5×2 table (red/yellow/green/
  purple/gray × won-reduction/no-reduction) with counts and median-
  reduction dollars per cell.

If 2025 bucket reds win reductions meaningfully more than greens, the
methodology is empirically validated and we can say so on `stats.html`.
If the correlation is weak, we've learned something about per-sqft vs
raw-dollar at real panels and can recalibrate for 2027.

*Data acquisition + pipeline variant + analysis; ~half-day once 2025
raw is in hand.*

### Thin-basket re-bucketing (QA-surfaced, 2026-04-23)

Today the bucket logic colors a parcel red/yellow/green/purple as long
as `median(comp_psf)` is non-null — which is true for any basket with
≥1 comp. That means 48 parcels with 1–4 comps are colored red or yellow
and recommended to FILE, on statistically thin evidence that an ARB
panel could reject as "not a reasonable number of appropriately-
adjusted comparables" under §41.43(b)(3). The thin-basket note warns
the homeowner, but the headline bucket still says FILE.

**Post-freeze fix:** change `findings.py` so a parcel with
`n_comps < 5` (or some threshold — 3 is defensible, 5 is conservative)
gets `color='gray'` regardless of the computed over-%. Those parcels
then render the existing "no comps" variant of the report (which
already tells the homeowner to hand-pick on hcad.org), eliminating
the false-confidence red/yellow verdicts.

Worth A/B'ing the threshold. At `n_comps<3 ⇒ gray`, 57 parcels shift.
At `n_comps<5 ⇒ gray`, 111 parcels shift. Conservative choice is 5 to
match the statute's "reasonable number" language and the legal-argument
paragraph's claim.

*Pipeline + frontend change; ~1 hr.*

### New-construction flag (QA-surfaced, 2026-04-23)

HCAD's `real_acct.yr_impr` captures year-built, but nothing in the
pipeline currently recognizes brand-new homes as a special case.
`15418 Jersey Dr` (built 2025, +517% YoY, prior value was
land-only, 1 comp from a 2016 build) is colored red — the tool
tells the owner of a brand-new home to file an unequal-appraisal
protest against a 9-year-old comp. An ARB panel would look at the
building permit and reject it, or ask uncomfortable questions.

**Post-freeze fix:** compute a `new_construction` boolean in
`findings.py` (`year_built >= current_year - 1 OR yoy_pct > 100`)
and set such parcels to `color='gray'` with a tailored
"newly-built — ARB unlikely to accept comp-based claim on a brand-
new home" variant. Would catch both the +517% case and the +339%
case cleanly.

*Pipeline + frontend change; ~1 hr.*

### Lot-size adjustment

Load HCAD `land.txt`. Either tighten the comp filter to &plusmn;25%
of the subject's lot size, or separate the land portion of the
appraisal before the per-sqft compare. Directly fixes the
"oversize lot" concern that the "What This Tool Doesn't Adjust For"
caveat block currently equivocates on.

*Pipeline change; ~2 hrs.*

### Extra-features strip-out (pools, accessory dwellings, outbuildings)

Load `fixtures.txt` and `extra_features.txt`. Subtract the HCAD-
assessed value of pools, detached garages, accessory apartments,
etc. from the total appraisal and compare just the main dwelling
on a per-sqft basis. Makes the apartment-question DM go away for
real instead of acknowledging it in the caveat.

*Pipeline change; ~3 hrs.*

### Bedroom / bathroom-count filter

HCAD's residential table has both counts. Tighten comp matching
so a 5BR/3BA subject isn't matched against 3BR/2BA comps in the
same sqft band.

*Pipeline change; ~1 hr.*

### Effective-age instead of actual year-built

HCAD stores both. A renovated 1960s home should match other
renovated 1960s homes, not fresh-build 1960s homes.

*Pipeline change; ~30 min.*

### Condition-adjustment worksheet (former Tier 1 #4)

Client-side checklist on the report — roof &gt; 20 yrs, HVAC &gt; 15
yrs, foundation issues, kitchen pre-2000, no garage, deferred
maintenance, flood history. Each checkbox applies a named downward
adjustment to the fair-value median. Even though it's purely
client-side, it changes the verdict a homeowner sees, so it falls
under the mid-season methodology lock.

*Client-side only; ~half-day.*

### What-if "remove a comp" recompute

Click an X on any comp row; the median, fair value, and over-%
all recompute live. Lets a skeptical homeowner vet the basket and
produce a tighter case. Numbers on the report change, so the same
lock applies.

*Client-side only; ~1.5 hrs.*

### §23.01 sales-based market-value protest

Load sale prices, compute per-nbhd median sale-$/sqft, flag parcels
where HCAD's appraisal is materially above that. Would add a
**second independent claim** (§23.01 market-value) alongside the
existing §41.43(b)(3) unequal-appraisal ground. Blocked on data:
Texas is a non-disclosure state, and HCAD's public download
probably doesn't include arms-length sale prices. Needs MLS access
or a paid data source (CoreLogic, DataTree, Realist). Verify
HCAD's `pdata` page before committing to this.

*Pipeline + report changes; half-day once a data source is
confirmed.*

### Multi-year §23.23 homestead-cap exposure

Archive prior years' appraisals; detect homesteads that breached
the 10% cap in **any** recent year, not just 2025&rarr;2026. Broader
exposure than the current 23-parcel count.

*Pipeline + data-archival change; ~half-day once prior snapshots
exist.*

### Multi-year trend chart per parcel

Line graph of 2022&ndash;2026 appraisal history on the report's
Page 1 facts table. Requires archiving HCAD data yearly (see
Tier 3 #15 Multi-year tracking, which is the infrastructure
prereq).

*Pipeline + data-archival change; ~2 hrs once prior snapshots
exist.*

---

## Out of scope (considered and rejected)

- **Owner-name search in autocomplete.** Stalker vector. HCAD's own
  site doesn't do it either. The popup already reveals owner when you
  know the address; don't add the reverse lookup.
- **AI-generated prose per parcel.** Shipped without it; the playbook
  structure doesn't benefit from warmth. See CLAUDE.md §7
  ("Don't re-introduce AI prose generation") for the rationale.
- **Per-parcel HTML or PDF files.** One template + one data file is
  the durable architecture. Don't undo that.
- **Google Analytics.** Contradicts the neighbor-project spirit
  (aggressive tracking, cookies, ads). Cloudflare Web Analytics covers
  the legitimate use case.
- **Tax-savings estimator** (previously Tier 1 #2). Would multiply
  the appraisal–median gap by Jersey Village's ~2.8% combined
  effective tax rate to project "if you win, you save ~$X/year."
  Killed on liability grounds: the site's whole positioning is
  *"not legal advice, built by a neighbor, no guarantees."* A
  projected dollar savings invites "your tool said I'd save $1,280
  and I didn't — refund me" complaints from homeowners whose
  protests don't win, which compromises the project's legal
  posture. The comp-table's existing "Over-assessment $X (+Y%)"
  row already anchors the magnitude without projecting a
  homeowner-specific outcome.
