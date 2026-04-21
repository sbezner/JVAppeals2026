# Feature Backlog

Features under consideration for JVAppeals2026. Ranked by real impact on
whether a Jersey Village homeowner wins their property tax appeal. Drafted
2026-04-20.

---

## Tier 1 — High leverage (ship these first)

### 1. Homestead exemption + 10% cap check ⭐ top pick

Texas homesteads have a statutory **10% cap on year-over-year appraisal
increases**. If HCAD raised your appraisal by more than 10% and you have a
homestead exemption, you're entitled to a reduction **independent of
§41.43(b)(3)**. A different statutory win — often a bigger one than
unequal appraisal, and many homeowners don't know about it.

**Data already available:**
- `jur_exempt_cd.txt` has the exemption flag per parcel
- `real_acct.prior_tot_appr_val` has last year's appraised value

**Work:** Extend `findings.py` to compute YOY %; surface as a 6th "case
path" in `report.html` (banner: "Homestead cap applies — file under §23.23").

---

### 2. Tax-savings estimator

Turn *"+7% over"* into *"**~$840/year in tax savings if you win.**"*

Jersey Village's combined effective tax rate is ~2.8% (city + Cy-Fair ISD +
Harris County + HCFCD + HCCS). Multiply that by the gap dollar amount on
the report.

**Why:** This is the line homeowners print out and show their spouse to
justify the 90 minutes they'll spend filing. Converts abstract percentage
to concrete motivation.

**Work:** One extra line in the bottom banner and Page 1 summary. Pure
string formatting — no pipeline change.

---

### 3. Year-over-year appraisal trend

`prior_tot_appr_val` is already loaded. Show a line on the facts table:
*"HCAD raised your appraisal 14.3% this year, from $376,000 to $430,337."*

**Why:** Not itself a §41.43(b)(3) argument, but it's context ARB panelists
notice. Combined with #1, it's actionable — and for homesteaded homes
over +10%, it's the #1 ground.

**Work:** Add `prior_val` to `reports_data.py` output; one row in the facts
table; one sentence in the bottom line when delta > +10%.

---

### 4. Condition-adjustment worksheet

The statute allows *"appropriately adjusted"* comps. A simple checklist on
the report page:

- [ ] Roof > 20 years old
- [ ] HVAC > 15 years old
- [ ] Foundation issues / cracks
- [ ] Kitchen pre-2000
- [ ] Bathrooms pre-2000
- [ ] No garage / carport only
- [ ] Known flood history
- [ ] Deferred maintenance / needs paint

Each checkbox applies a standard downward adjustment to the fair-value
median. Lets the homeowner argue their comps aren't truly equivalent to
their (poorer-condition) home.

**Why:** Distinguishes this site from every generic property-tax calculator.
Real hearing tool — the appraiser will ask if there are condition issues
and the homeowner should be ready with specifics.

**Work:** Client-side only. State lives in `localStorage` per account.
Adds a new section to Page 1 of the report between the facts table and
the comp table.

---

## Tier 2 — Nice-to-haves (low effort, modest impact)

### 5. PWA / Add to Home Screen

Make the site installable on phones (icon on home screen, splash screen,
offline-capable). ~3 files: `manifest.json`, a service worker,
touch icons.

### 6. Share button on the report page

Native Web Share API on mobile (tap → iOS/Android share sheet), copy-to-
clipboard fallback on desktop. One button next to "Back to map".

### 7. Filter pins by bucket

"Show only red" toggle on the map. A neighbor can text a block's-worth
of red pins to each other.

### 8. Stats page (`/stats.html`)

Community-impact numbers: "Out of 2,172 JV parcels, 529 are over-assessed
by more than 7%. Median over-assessment is X%. If every red homeowner
filed and won, the total property-tax savings for JV would be
$Y million/year."

Not a homeowner tool; a Nextdoor-share and local-media hook.

---

## Tier 3 — Bigger lifts (skip unless the project goes long-term)

### 9. ARB hearing date tracker

User enters their scheduled hearing date; page shows a countdown and
prep-reminder nudges. `localStorage` only, no backend.

### 10. Compare with a neighbor

Click two pins → side-by-side view. Useful for "my neighbor has a bigger
house and pays less" situations.

### 11. Email / SMS deadline reminder

"Remind me May 10 to file." Requires a backend or Zapier/Formspree.

### 12. Offline-mode service worker

Cache `parcels.json` + `reports.json` for reliable loading at the ARB
hearing with spotty WiFi. Depends on #5.

### 13. Multi-year tracking

Keep historical snapshots of `data/parcels.json` so next year's site
can show "your appraisal has climbed 34% since 2022." Requires
discipline about snapshotting per year.

### 14. Privacy-respecting analytics

Plausible or Fathom — see which features get used, which pins get the
most clicks, etc. Invisible to users. ~5 min to add.

---

## Out of scope (considered and rejected)

- **Owner-name search in autocomplete.** Stalker vector. HCAD's own site
  doesn't do it either. The popup already reveals owner when you know the
  address; don't add the reverse lookup.
- **AI-generated prose per parcel.** Shipped without it; the playbook
  structure doesn't benefit from warmth. See
  `memory/pipeline_three_phase_plan.md` for the full rationale.
- **Per-parcel HTML or PDF files.** One template + one data file is the
  durable architecture. Don't undo that.

---

## Top pick

**#1 — Homestead + 10% cap check.** It's the one where this project could
genuinely surface a win-the-appeal ground that most Jersey Village
homeowners don't realize they have. Everything else is polish on the
existing §41.43(b)(3) case.
