# Feature Backlog

Features under consideration for JVAppeals2026. Ranked by real impact on
whether a Jersey Village homeowner wins their property tax appeal.
Originally drafted 2026-04-20; last updated 2026-04-20 after the
homestead-cap / raw-dollar / methods-differ release.

---

## ✅ Shipped

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

### Site analytics

Covered by Cloudflare Web Analytics (free, privacy-respecting, no
beacon needed since the domain is already proxied). Page views,
referrers, device mix, core web vitals — enough for this project's
scale. Originally listed as Tier 3 #14; no code work required.

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

### #8 Stats page (`/stats.html`)

Community-impact numbers: "Out of 2,172 JV parcels, 529 are
over-assessed by more than 7%. Median over-assessment is X%. If every
red homeowner filed and won, the total property-tax savings for JV
would be $Y million/year." Plus cap-violation count, methods-differ
count, etc. A Nextdoor-share and local-media hook, not a homeowner
tool.

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
  structure doesn't benefit from warmth. See
  `memory/pipeline_three_phase_plan.md` for the full rationale.
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
