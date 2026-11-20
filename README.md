# RCPSDC STT Tracker

Local, offline dashboard for the RCPSDC Short Term Training programme. Open `index.html` in Chrome or Edge, click **Load project folder**, pick the data folder. Nothing is uploaded; there is no server and no stored copy.

## Data folder

```
RCPSDC_Data/
  master/   rcpsdc_master.xlsx        Centres · JobRoles · Plan        (rarely changes)
            trainers.xlsx             Trainers                         (weekly)
  status/   status_YYYY-MM-DD.xlsx    CAAF · Batches                   (save a new dated copy per update)
  batches/  batch_<BatchID>.xlsx      Info · Students · Attendance · Assessment   (daily)
```

- The latest `status_` file is used by default; older ones are selectable from "Status as of", and their date drives every "days to start / days overdue" calculation.
- Start a batch file by copying `templates/batch_TEMPLATE.xlsx` to `batches/batch_<BatchID>.xlsx` and setting `Info.BatchID`.
- Attendance: one column per session date (header = date), mark `P` or `A`, blank = not marked.
- Every workbook has a **Guide** sheet listing columns and allowed values. Red headers are mandatory.
- Never store Aadhaar numbers or CCTV credentials in these files; only the Y/N status.

## Hosting and the data folder (CR14)

The app (this folder) holds only code, the Karnataka district outline and the logo, so it can be hosted, e.g. on GitHub Pages: push the contents of this folder to a repository, then Settings → Pages → Deploy from a branch → main / root. Nothing is uploaded when someone picks a folder; files are read in their own browser.

Programme content stays in the data folder that people pick (shared drive):

```
RCPSDC_Data/
  RCPSDC_STT Plan of Action*.xlsx
  TOT_Nominations*.xlsx
  ToT_Sheet*.xlsx
  RCPSDC_Decisions*.xlsx        (optional, yours)
  config/nominations.js         courses, QP/TOT names, header spellings, dates, owners, deck wording, centre names
  config/centre-coords.js       map pin per TC ID
```

Every .js file in `config/` is loaded when the folder is picked (nominations.js first). Without it the page says the config folder is missing. The Presentation (and its Excel/print) is local-only: it appears only when index.html is opened from your own computer (file://) or localhost; on the hosted site the menu item is hidden and the route shows a notice.

CR15: the hosted page is unbranded until a folder is loaded — the landing shows only "Load project folder", the tab title is "Tracker". Name, sub-title, mark, file-name prefix and course wording come from `brand` in config/nominations.js; the deck logo is `config/rcpsdc-logo.png` in the data folder (deck.logo).

## Trainer nominations (CR4)

Put the three workbooks you receive into the data folder (root or a `nominations/` subfolder) exactly as they are (no conversion):

- `RCPSDC_STT Plan of Action*.xlsx` — Sheet1: centres, TC IDs, targets. Required trainers = target / 30 per course (1 per batch).
- `TOT_Nominations*.xlsx` — "Mapped with TC" (TC grouping, TR IDs) + "All Nominations" (DOB, qualification, experience).
- `ToT_Sheet*.xlsx` (CR12) — TOT requests dumped from the portal: Applicant ID (TR ID), name, mobile, Job Role (QP Code), Requested On. Optional; without it TOT stays "Training pending".

The newest file of each kind is used. Columns are matched by header name; if a header is renamed, add the new spelling in the data folder's `config/nominations.js`. The Checks page says exactly what is missing.

Rules: one trainer per batch counted; extras kept as Backup; a course not allocated to that centre is Rejected (but suggested if the same centre is short elsewhere); a person nominated for several courses is kept on the course with the biggest shortfall; people grouped without a TC (Belagavi, Chitradurga) are Unassigned until you confirm. TOT = "Training pending" and Inspection = "Not inspected" until you record otherwise.

Your calls go in the Decisions file: Exports → Download Decisions, edit the yellow columns (AssignTC, AssignCourse, Decision, TOTStatus, TOTDate, Notes; Centres sheet: InspectionStatus), save it in the same folder and reload. Decisions follow the person (by mobile) across new nomination files and are kept when you export again.

| File | Role |
|---|---|
| `<data>/config/nominations.js` | File patterns, header spellings, courses, district aliases, centre labels, allowed decision values |
| `js/nom-model.js` | Adapters (read workbooks as received), join, allocation rules, flags, metrics |
| `js/nom-views.js` | Overview, centre, people, person, follow-ups (call sheet), checks, exports |
| `js/nom-export.js` | Decisions workbook and clean nominations workbook |

## Map and presentation (CR3, CR5, CR6)

- **Map** (Nominations → Map): 33 centre pins on the KGIS 31-district map, coloured by trainer staffing, staffed-with-TR-ID, or CAAF status; size and number = batches planned; dashed ring = CAAF awaiting NSDC. Pins are approximate (town named in the plan's Center Address, `config/centre-coords.js`); exact pins come from Latitude / Longitude on the Decisions file's Centres sheet.
- **Presentation** (Nominations → Presentation): 10 slides built live from the files — cover, headline, batch readiness ladder, distribution, map, gaps & owners, timeline, asks, centre appendix, counting method. Arrow keys / Space to move, Esc to exit, "Print / PDF" gives one A4 landscape slide per page.
- Readiness gates and milestone dates live in `config/nominations.js` (`gates`, `milestones`): nominations and TR IDs by 10 Nov (before TOT), TOT 11 Nov, inspection by 14 Nov. Edit the dates there; no extra sheet.
- CR21–23 (20 Nov): one TOT workbook is now the single source — `TR_Request_raised_and_batches_list_with_remarks.xlsx` (sheet TR_Raised = requested, yet to accept; sheet Batches = batched). When it is present, the older two TOT files are ignored (noted on Checks). Batch rows carry Domain and Platform marks: any mark = "Assessed (marks)", both Absent = "Absent"; marks are shown as facts, not pass/fail; Completed still needs a Result column. Each person has an Eligibility (OK / Warn / Not OK / Not reviewed): Decisions file first, then an Eligibility column in the workbook, otherwise proposed from the document remarks by the rules in `config/nominations.js` → `eligibility.auto` (marked "auto"). Counted stays the headline; "Counted & eligible (OK)" sits alongside on Overview, centre, course and TOT pages. Allocation lock: Exports → "Lock allocation" downloads the Decisions file with everyone's current Counted / Backup / Rejected, course and centre marked Locked; with it in the folder, new files never change those people. New nominees fill open slots and are flagged "New since lock"; locked trainers missing from the nominations file, new nominees and Not-eligible counted trainers (with backup candidates) are listed under Checks → Proposed changes — never applied automatically. Fixes: course page "Centres running this course" no longer collapses under "Counted trainers"; filters and chips keep the scroll position. Config `configVersion: 20`.
- CR20: Presentation bar has "⤓ PowerPoint" (editable .pptx built in the browser from the same slides — vendor/pptxgen.bundle.js, js/nom-pptx.js; map rendered from the on-screen map, logo from config) and "⤓ PDF (print)". Local only, like the presentation. Batch dates Excel stored month-first (start after end) are swapped back. Long fully-staffed list on the distribution slide continues in a second column.
- CR19: two TOT files from the portal. `ToT_Sheet_PMKVY_Yet_to_accept.xlsx` = requests raised, not yet accepted (Applicant ID, Mobile No., Job Role (QP Code), Status, Is Certificate Available, Requested On). `TOT_Batch_Scheduled.xlsx` = accepted and batched (Batch ID, Name, Mobile, Job Role Name, TR ID, Email, Batch Start/End Date, Assessment Date). Reconciliation per mapped trainer: in neither = yet to request; in yet-to-accept = requested, awaiting acceptance; in scheduled = scheduled (counts as requested too); in both = scheduled, flagged "still in yet-to-accept" (older dump). Text dates (12/11/26, 14/11/2026) are read day-first; request dates that Excel stored month-first are swapped back. Completed needs an optional Result column (Pass/Fail/Absent) in the batch file — to be decided; until then no "result not recorded" flag. Config carries `configVersion: 19`; an older config triggers a warning on load and on Checks. CR18: Excel lock files (~$…) and config/ files no longer listed as ignored; Exports shows "Config loaded".
- CR17: TOT batches. Fourth workbook `TOT_Batches*.xlsx` in the data folder, one row per trainer: Batch ID, Assessment date, Name, Mobile, TR ID, TOT requested for, Result (blank = Scheduled; Pass = Completed; Fail / Absent = needs a new slot). Matched to people like the TOT sheet (mobile → TR ID → name). Counts use mapped (counted) trainers only; a trainer in a batch for another course is flagged. Overview centres table: "TOT requested · scheduled · completed" (three columns in Excel); centre page: TOT requested / scheduled / completed tiles and per-course columns, batch and date next to each trainer. TOT status page: four summary tiles (requests raised, assessment scheduled, yet to request with the support note from `totPage.supportNote` in config, completed), the Training plan for ToT (scheduled waves + "Date TBD" lines per course), and a TOT calendar by TC; its Excel download adds a "Summary and plan" sheet.
- CR13: Excel download. Every table has a small "⤓ Excel" button above it (that table, all rows, current sort order — not just the first rows shown). "⤓ Excel" in the top bar, next to Print / PDF, saves every table on the page as one workbook (one sheet per table) with an About sheet (page, data as of, source files, time). Follow-ups export as a flat call list; the Presentation bar has its own Excel button for the deck's tables. Name and mobile, centre and TC ID come out as separate columns; dates as real Excel dates. Buttons are hidden when printing. Code: `js/table-export.js`.
- CR12: TOT status page (Nominations → TOT status). Requests are matched to people by mobile, then TR ID, then name (name-only matches are flagged to confirm). QP codes map to courses in `config/nominations.js` (`courses[].qp`, `courses[].tot`): RSC/Q8401 → Machine Operator, RSC/Q8402 (Assistant Machine Operator) → Jr. Machine Operator, RSC/Q8003 → Jr. Designer, RSC/Q8016 → Operator - Plastic Products Making. A counted trainer whose request matches their course shows "Training requested"; any other course shows "Requested - wrong course"; requests from rejected people show "Requested - not counted"; requests from people not in the nominations are listed separately. The portal TR ID is the source of truth: a different TR ID in the nominations sheet is a high flag ("correct the nominations sheet"), a missing one is filled from the portal and flagged to add. A later TOTStatus in the Decisions file (Scheduled / Completed / Failed) wins over the request. Shown on People, Person, Centre, Course, Overview, Follow-ups, Checks, map tooltips, the clean export (new "TOT requests" sheet) and the deck.
- CR11: official course names shown in full on every screen, export and slide (no invented short names, no truncation); MO / JMO / JD / OPP stay as compact tags. Tables wrap text to the page width instead of scrolling sideways, so copy to Excel and screen prints come out whole.
- CR10: the presentation and PPTX carry your edits (logo cover, "Planned batch start", "Batch readiness:" title, Course Overview, named owners, working days left, asks with red help notes). Deck wording lives in `config/nominations.js` → `deck` (title, org line, start label, asks text with {tokens}, `showSequencingOption`) and milestone `team` names; edit there instead of in PowerPoint.
- CR9: course drill-down — a page per course (Nominations → click a course in the Overview "By course" table, a course chip such as MO 1/2, or a course row on a centre page): staffing, gap, TR ID, TOT, centres running it, its trainers, backups and the pool nominated where it isn't allocated, with a course map. People page has a Course dropdown next to Flags; the Map page has a course selector. The presentation and PPTX have one slide covering all four courses.
- CR8: readiness gates in process order — CAAF submitted → inspection passed → trainer mapped → TR ID → TOT → students onboarded. Each gate shows batches through it on its own, plus how many cleared every gate above. Agreed start (`agreedStart` in `config/nominations.js`, 30 Nov) replaces earlier plan dates; student onboarding milestone 21 Nov. Students onboarded per centre: `BatchesOnboarded` on the Decisions Centres sheet.
- CR7: map pins use the browser's own tooltip, listing each course with its mapped trainers ("(no TR ID)" where missing); districts show their name on hover. "No TR ID" is high severity and always first on Checks. People page: Flags dropdown next to search to filter by one or more flags (match all or any).
- CR5: "Same TR ID on 2 people" (was "TR ID shared"); counted trainers without a TR ID are a medium flag, shown on the Overview and in Follow-ups.

| File | Role |
|---|---|
| `config/karnataka-map.js` | Simplified district boundaries (generated by `scripts/build_map.py` from the KGIS GeoJSON) |
| `<data>/config/centre-coords.js` | Approximate pin per TC ID |
| `js/nom-map.js` | Map rendering (SVG), hover card |
| `js/nom-present.js` | Slides, navigation, print |

## Code layout (one-way pipeline)

| File | Stage | Change it when |
|---|---|---|
| `config/schema.js` | Internal format and rules (90% threshold, batch size 10–30) | Columns, sheet names, allowed values or rules change |
| `config/sidh.js` | SIDH export column mappings (**assumed**) | Real SIDH templates are available |
| `js/xlsx-lite.js` | Excel read/write, no dependencies | — |
| `js/table-export.js` | Download any on-screen table (or the whole page) as Excel | — |
| `js/ingest.js` | Classify files by name/folder, parse sheets | File naming changes |
| `js/validate.js` | Type coercion, allowed values, references, cross-checks | New data-quality rules |
| `js/model.js` | Hierarchy, CAAF stage, eligibility, roll-ups, attention flags | Business logic changes |
| `js/views.js` | Dashboard and drill-down pages | Layout or new views |
| `js/export-sidh.js` | Builds SIDH .xlsx from the model via `sidh.js` | New export types |
| `js/report.js`, `css/print.css` | Print / PDF with provenance header | Report layout |

## Assumptions to confirm

- Job role codes (`MO-CNC`, `JMO-CNC`, `JD-PP`, `OP-PPM`) are internal placeholders; QP codes are blank.
- Batch IDs are internal (`GTTC-01-MO-CNC-B1`); SIDH IDs go in `SIDHBatchID` once created.
- Plan seeded one batch per 30 seats with the plan's job-role window as each batch's dates.
- CAAF steps were seeded from the source "CAAF Status" (Half CAAF Fill → docs + OTP done; CAAF Submitted → photos done); step dates are unknown, so they show "Done".
- Centre display names use the town from the address; districts are kept as in the source sheet.
