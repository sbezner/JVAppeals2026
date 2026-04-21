# Feature Backlog

Features under consideration for JVAppeals2026. Ranked by real impact on
whether a Jersey Village homeowner wins their property tax appeal.
Originally drafted 2026-04-20; last updated 2026-04-21 after the
/stats.html launch (community-scale snapshot + distribution histogram).

---

## ✅ Shipped

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

### #2 Tax-savings estimator ⭐ next pick

Turn *"+7% over"* into *"**~$840/year in tax savings if you win.**"*

Jersey Village's combined effective tax rate is ~2.8% (city +
Cy-Fair ISD + Harris County + HCFCD + HCCS). Multiply that by the gap
dollar amount on the report.

**Why:** This is the line homeowners print out and show their spouse
to justify the 90 minutes they'll spend filing. Converts abstract
percentage to concrete motivation.

**Work:** One extra line in the bottom banner and Page 1 summary.
Pure string formatting — no pipeline change. ~1 hour.

---

### #3 Year-over-year appraisal trend

`prior_tot_appr_val` is already loaded (we use it for the cap check).
Show a line on the facts table: *"HCAD raised your appraisal 14.3%
this year, from $376,000 to $430,337."*

**Why:** Not itself a §41.43(b)(3) argument, but it's context ARB
panelists notice. Combined with the homestead cap, it's actionable.

**Work:** Add `prior_v` already in `reports.json`. Just add a row to
the facts table in `report.js`; one sentence in the bottom line when
delta > +10%. ~30 min.

---

### #4 Condition-adjustment worksheet

The statute allows *"appropriately adjusted"* comps. A simple
checklist on the report page:

- Roof > 20 years old
- HVAC > 15 years old
- Foundation issues / cracks
- Kitchen pre-2000
- Bathrooms pre-2000
- No garage / carport only
- Known flood history
- Deferred maintenance / needs paint

Each checkbox applies a standard downward adjustment to the fair-value
median. Lets the homeowner argue their comps aren't truly equivalent
to their (poorer-condition) home.

**Why:** Distinguishes this site from every generic property-tax
calculator. Real hearing tool — the appraiser will ask if there are
condition issues and the homeowner should be ready with specifics.

**Work:** Client-side only. State lives in `localStorage` per account.
Adds a new section to Page 1 of the report between the facts table and
the comp table. ~half day.

---

## Tier 2 — Nice-to-haves (low effort, modest impact)

### Social-media preview cards (Open Graph tags)

When `jvtaxappeal.com` gets shared — on Facebook, iMessage, Slack, X,
Nextdoor — the link currently unfurls as a naked URL with no preview.
Posts with rich preview cards get roughly 2× the click-through of
bare links.

Four `<meta>` tags in `index.html` (duplicated in `report.html`) plus
a 1200×630 PNG screenshot of the map committed to the repo root:

- `og:title` — "Jersey Village 2026 HCAD Appeals"
- `og:description` — one sentence: "Check your 2026 HCAD appraisal
  and see if you have a §41.43(b)(3) case in one click."
- `og:image` — a screenshot of the map with colored pins
- `og:url` — canonical URL
- `twitter:card` pair for X/Twitter previews

**Why:** Time-sensitive for the neighborhood-FB launch. After the
initial post, every re-share still benefits. Affects reach, not
homeowner outcome — which is why it sits in Tier 2 rather than Tier 1.

**Work:** ~30 minutes. Half of it is capturing and cropping a
screenshot of the map to the 1200×630 spec.

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

---

## Top pick

**#2 — Tax-savings estimator.** Cheapest of the Tier 1 items, and the
line that converts a casual "eh, 7% over median" into "this is worth
90 minutes of my life to file." Strongest motivation-multiplier per
hour of engineering work.
