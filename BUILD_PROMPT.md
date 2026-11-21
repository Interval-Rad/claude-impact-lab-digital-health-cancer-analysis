# Interval Read: build instruction set

Track 3, Radiology / Oncology. Claude Impact Lab NYC. For Bonnie and whoever drives Claude Code.

## How to use this kit

1. Put the `agents/` folder and `dataset/` folder in an empty repo.
2. Open Claude Code in the repo.
3. Paste everything in Part 1 as the first message.
4. Build in the order in section 9. Stop adding features at 1:55.
5. Part 2 is for the team: tech choices to defend, how this sits next to Sectra and Rad AI, and open items for the clinicians.

Files in the kit:

| File | Role |
|---|---|
| `agents/READING_METHOD.md` | Radiologist search pattern. Loaded into Lightbox's prompt |
| `agents/01_CHARGE_orchestrator.md` | Orchestrator: state machine, firewall, QC, gate, audit |
| `agents/02_LIGHTBOX_read.md` | Reading agent: comparability, blind read twice, focused pass |
| `agents/03_STAT_triage.md` | Triage agent: severity subgroup, tier, on-call page |
| `agents/04_COURIER_report_handoff.md` | Report draft, delivery, handoffs, voice |
| `dataset/DATASET_GUIDE.md` | Sources, licenses, how to pull pairs, scorecard |
| `dataset/nih_pairs_manifest.csv` | 48 prior/current X-ray pairs from NIH ChestX-ray14 |
| `dataset/pull_pairs.py` | Downloads pairs into `cases/` |

---

# Part 1. The build prompt (paste into Claude Code)

## 1. Mission

Build Interval Read, a demo web app for radiologists at an academic medical center.

For a cancer patient's follow-up chest study, the app compares the current image with the prior one and drafts a structured first read: what changed, what did not, what to look at first, and what it declines to call. A resident reviews the draft and enters measurements. An attending signs. Only then does the result go to the ordering provider with a pre-filled follow-up order, and to the tumor board, the surgeon and the family in a form each will use.

The bar: a first read a radiologist confirms, instead of one they write from scratch.

The demo runs locally on public de-identified images with a synthetic chart. It must work end to end on one case, and show one refusal case.

## 2. Hard rules. Do not trade these for features

1. The reason for the scan is hidden from the blind reads. The server holds it and releases it only for the focused pass. Log the release time and show it.
2. The blind read runs twice. Confidence shown to the user is agreement between the two reads. Never show a model-reported confidence.
3. The model gives no millimeter sizes and no percent change. The radiologist enters measurements. Code computes RECIST 1.1.
4. No single blended score anywhere. The worklist is a plain sort on visible columns.
5. Chart data (vitals, labs, problem list) is used by the triage agent only. The reading agent never sees it.
6. "Can't determine" is a first-class output with a reason and a next step. Same visual weight as a finding.
7. Nothing leaves radiology before the attending signs. The follow-up order is locked until then, and the provider signs it. No agent places an order.
8. The patient hears results from the provider first. Voice schedules and answers from the signed report only.
9. Every screen says what the software is: "AI DRAFT. Requires resident review and attending signature." until signed.
10. Every synthetic field carries a visible "synthetic" tag.
11. API keys stay on the server. No patient data in URLs.

## 3. Pipeline and agents

Read all five files in `agents/` before writing code. They hold the system prompts, JSON schemas, state machine and QC rules. Treat them as the spec. Load each agent's system prompt from its markdown file at runtime so the clinicians edit prompts without touching code.

| Agent | Job | Model | Calls |
|---|---|---|---|
| Charge | Orchestrator. State machine, indication firewall, QC, signature gate, audit, timers | code + `claude-sonnet-5-5` for one QC call | 1 |
| Lightbox | Comparability check, blind read A, blind read B, focused pass | `claude-fable-5-2` | 3 |
| Stat | Severity subgroup, urgency tier, on-call page, worklist reason | `claude-sonnet-5-5` | 1 |
| Courier | Report draft. After signature: provider message, order pre-fill, handoffs, voice scripts | `claude-sonnet-5-5` | 2 |

Fallback when Fable credits run out: `claude-opus-5-5` for Lightbox, and say so in the UI footer.

Flow for one upload:

```
upload(prior, current, case.json)
  -> Charge stores the order. Indication and prior report locked
  -> Lightbox blind read A  \  in parallel, images + view labels only
  -> Lightbox blind read B  /
  -> code: reconcile A and B, set agreement per finding
  -> Charge releases the indication
  -> Lightbox focused pass
  -> Stat (merged findings + indication + chart)
  -> code: worklist sort. Tier critical: page on-call
  -> Courier mode A: report draft
  -> Charge QC call. Fail twice: NEEDS_HUMAN
  == human gate ==
  -> resident: accept / edit / reject each finding, enter measurements
  -> code: RECIST on confirmed measurements. Courier redrafts
  -> attending: sign
  -> Courier mode B: provider message, order pre-fill, handoffs
  -> code: delivery timers (60 min re-send and escalate. Critical: direct call)
  -> provider: open, sign order, mark patient informed
  -> Courier mode C + ElevenLabs: scheduling call, family page audio
```

## 4. Tech stack

Pick the smallest stack one builder ships in 90 minutes.

| Need | Use | Not this | Reason |
|---|---|---|---|
| App | Next.js App Router, TypeScript, one repo | Separate Python API + React app | One process, one deploy, server routes keep the API key off the client |
| Styling | Tailwind with CSS variables for tokens. Hand-built components | shadcn, MUI or any kit | Kits produce the generic look we are avoiding. Six components cover the app |
| Model calls | Anthropic TypeScript SDK, server side | Agent framework | Four agents in a fixed order. A plain function per agent is easier to debug and to explain to a judge |
| Structured output | One tool per agent with a JSON schema, forced tool choice, validated with zod, one retry with the validation error | Parsing JSON out of prose | Schema failures surface at once |
| Sequencing | A state machine in code (`charge.ts`) | A model deciding the order | Safety steps must run in a fixed order |
| Storage | JSON files under `data/cases/<id>/` plus `audit.jsonl` | Database | Zero setup. Easy to inspect during a demo |
| Images | PNG served from disk. Viewer built on a canvas or CSS transforms | DICOM viewer library | No DICOM today. Window and level approximated with brightness and contrast |
| Timers | In-process timers with a demo clock (60 minutes runs as 20 seconds) | Job queue | Shows escalation live |
| Voice | ElevenLabs text to speech from a server route. Cache the audio file | Live phone call | A played clip is enough for the demo |
| Auth | None. A role switch in the header | Login | Out of scope |

Check docs.claude.com for current request parameters before coding the SDK calls. Send images as base64 image blocks, prior first, each preceded by a text label. Run the two blind reads with `Promise.all`.

## 5. Repo layout

```
agents/                    prompts and specs (given)
dataset/                   manifest, pull script, guide (given)
data/cases/<case_id>/      prior.png, current.png, case.json, state.json
data/audit.jsonl
src/lib/charge.ts          state machine, firewall, QC, timers, audit
src/lib/lightbox.ts        three calls + reconcile()
src/lib/stat.ts            triage call + sortWorklist()
src/lib/courier.ts         modes A, B, C
src/lib/recist.ts          pure function, unit tested
src/lib/schemas.ts         zod schemas mirroring the agent files
src/lib/prompts.ts         loads agents/*.md, extracts the fenced system prompt
src/app/page.tsx           worklist
src/app/case/[id]/page.tsx read screen
src/app/case/[id]/handoff/page.tsx
src/app/inbox/page.tsx     ordering provider view
src/app/api/...            upload, run, review, measure, sign, deliver, open, voice
```

## 6. Server routes

| Route | Does |
|---|---|
| `POST /api/cases` | Upload prior, current, case.json. Starts the pipeline |
| `GET /api/cases` | Worklist, sorted |
| `GET /api/cases/[id]` | Full case state for the UI |
| `POST /api/cases/[id]/review` | Accept, edit or reject one finding, with a reason |
| `POST /api/cases/[id]/measure` | Radiologist enters prior and current mm for a finding. Recomputes RECIST |
| `POST /api/cases/[id]/sign` | Resident sign-off, then attending signature |
| `POST /api/cases/[id]/deliver` | Runs Courier mode B. Refuses when unsigned |
| `POST /api/cases/[id]/open` | Provider opened the result. Stops the timer |
| `POST /api/cases/[id]/informed` | Provider marks the patient conversation done. Unlocks voice |
| `POST /api/cases/[id]/voice` | ElevenLabs audio for the scheduling script or family page |

`recist.ts`: sum target diameters. Progression: 20 percent or more increase and at least 5 mm, or any new lesion. Partial response: 30 percent or more decrease. Complete response: targets resolved. Otherwise stable. No measurements: return "not computed". Write tests first.

## 7. Interface

### 7.1 Direction

The app should look like a panel docked inside a PACS reading workstation, not like an AI product. Radiologists read in a dim room on tools built for density and speed. Borrow those conventions: image first, dense tables, keyboard driven, almost no chrome. The PCP and oncologist see the same data through a calmer, larger view.

Name for the look: reading room (dark) and paper chart (light).

Do:
- Tables and hairline rules. Radius 2 px. No shadows.
- One accent color, amber, used only for "needs your attention".
- Mono type for anything a clinician compares: dates, MRN, measurements, status, agreement.
- Small uppercase mono labels with letter spacing for section heads.
- Status as a word plus a shape, never color alone.
- AI text shown as a draft until a person accepts it: dotted left rule, turning solid on accept.

Do not:
- No purple, indigo or blue-violet. No gradients. No glass blur. No glow.
- No sparkle icons, robot avatars, emoji or chat bubbles. This is not a chatbot.
- No card grid dashboard. No hero section. No rounded pill badges in many colors.
- No shimmer skeletons. Show a plain text status: "Blind read A running".
- No modal for the main flow. Everything on one screen.

### 7.2 Tokens

```css
:root[data-theme="dark"] {           /* reading room */
  --bg: #0B0C0A;  --surface: #141511;  --raised: #1C1E19;
  --rule: #2B2E27;  --text: #E6E3D8;  --muted: #8F8D80;
  --accent: #E3A21A;  --critical: #E5484D;  --confirm: #8FB59A;
  --blind: #6FA8A0;                  /* marks content produced blind */
}
:root[data-theme="light"] {          /* paper chart */
  --bg: #F4F1E8;  --surface: #FBF9F3;  --raised: #FFFFFF;
  --rule: #D9D4C5;  --text: #1C1B17;  --muted: #6B685C;
  --accent: #8A5A00;  --critical: #B42318;  --confirm: #2F6B45;
  --blind: #2F6F68;
}
.image-well { background: #000; }    /* always black, in both themes */
```

Type: IBM Plex Sans for interface text, IBM Plex Mono for data, Source Serif 4 for the family page only. Radiology view 13 px base. Provider view 16 px base. Theme toggle in the header, saved per user, dark by default for the Radiology role and light by default for the Provider role.

### 7.3 Screens

Header on every screen, one line: product name, role switch (Radiology | Ordering provider), theme toggle, demo clock.

Worklist (home). A table, one row per study. Columns: tier, severity subgroup, agreement flag, patient, exam, indication (hidden until the focused pass has run), context flags, state, arrived. Sorted by the rule in `03_STAT_triage.md`. Critical rows carry the amber rule on the left and "on-call paged 02:14".

Read screen:

```
+------------------------------------------------------------------------------+
| INTERVAL READ   Radiology | Provider            theme   demo clock           |
+------------------------------------------------------------------------------+
| AI DRAFT. Requires resident review and attending signature.   state: DRAFTED |
+-------------------------------------------+----------------------------------+
|  PRIOR  PA  2026-08-14 syn | CURRENT AP   | COMPARABILITY   limited          |
|                            |  2026-11-20  |  projection: PA then AP          |
|                            |              |  prevents: size comparison       |
|        [image well, black]                +----------------------------------+
|        linked zoom and pan                | LOOK FIRST                       |
|        Space: flicker prior/current       |  F1  R upper  nodule             |
|        I: invert   W: window              +----------------------------------+
|                                           | FINDINGS            reads agree  |
|                                           |  F1 indeterminate   2 of 2   AER |
|                                           |  F2 stable          1 of 2 ! AER |
|                                           |  F3 new  outside indication  AER |
|                                           +----------------------------------+
|                                           | CAN'T DETERMINE                  |
|                                           |  Has the nodule changed in size? |
|                                           |  Reason: PA then AP projection   |
|                                           |  Next: CT chest                  |
|                                           +----------------------------------+
|                                           | MEASUREMENTS (you enter)         |
|                                           |  F1 prior [  ] mm current [  ] mm|
|                                           |  RECIST 1.1: not computed        |
+-------------------------------------------+----------------------------------+
| INDICATION  released 14:02:11 after blind reads  [synthetic]                 |
| REPORT DRAFT (editable, template order)                    QC: pass          |
+------------------------------------------------------------------------------+
| Resident: 2 of 3 reviewed          [ Sign as resident ]  [ Attending sign ]  |
+------------------------------------------------------------------------------+
```

Details:
- Left 58 percent: the two images side by side, linked zoom and pan, a flicker toggle, invert, brightness and contrast drag. Clicking a finding highlights its region label over the image. No AI-drawn boxes on the image unless a radiologist asks. A wrong box does more harm than no box.
- Right rail, in report order. Each finding row: id, region, kind, status, agreement, evidence on expand, then Accept, Edit, Reject. Reject and Edit ask for a reason.
- Agreement shown as "2 of 2" or "1 of 2 !" with both reads' statuses visible on expand.
- Can't determine block has a hatched left rule and the same type size as findings.
- Indication strip sits below the images, with the release timestamp.
- Sign bar is fixed to the bottom. Attending sign is disabled until every finding is reviewed.

Handoff screen (after signature). Tabs: Ordering provider, Follow-up order, Tumor board, Surgeon, Family, PCP, Navigator. Each tab is an editable draft with Copy. The Family tab uses the serif face, large type, and a Play button, locked until the provider marks the patient informed.

Ordering provider inbox (role switch). Light theme, 16 px, one column. Message list on the left, the selected result on the right in this order: what changed, what the radiologist recommends, the pre-filled follow-up order with a Sign order button, then the full report collapsed. Buttons: Mark patient informed, Copy Epic chat question. Unopened high-tier messages show the countdown.

### 7.4 Keys (Radiology role)

`J` / `K` next and previous finding. `A` accept. `E` edit. `R` reject. `Space` flicker prior and current. `I` invert. `M` jump to measurements. `Cmd+Enter` sign. `D` theme.

### 7.5 Accessibility

Text contrast at least 4.5 to 1 in both themes. Focus rings visible. Every action reachable by keyboard. Status never by color alone.

## 8. Population health layer

Same loop, wider population. Build one case to show it.

- Case: ED order, portable AP film, no PCP on file, no insurance on file, preferred language Spanish. A prior upright PA film exists. This is also the refusal case.
- Lightbox output: Can't determine interval size change, recommend CT chest.
- After signature, Courier adds a navigator referral: owner is the nurse navigator queue, a due date, a sixth grade letter in Spanish saying a follow-up scan is recommended and how to book it.
- A small registry view: follow-ups due, booked, completed, split by insurance on file, language and ordering location. Synthetic counts, tagged synthetic.
- Rule: these fields add support. They never enter the worklist sort.

## 9. Build order and done criteria

1. `recist.ts` with tests. Schemas. Prompt loader.
2. Upload and Lightbox, three calls, with reconciliation. Done: JSON for one pair prints in the terminal.
3. Read screen with images and the findings rail. Done: one case renders from stored JSON.
4. Stat and the worklist. Courier mode A. QC call.
5. Review, measurements, RECIST, sign.
6. Courier mode B, handoff tabs, provider inbox, delivery timer on the demo clock.
7. The refusal and population health case.
8. ElevenLabs clip. Theme polish.

Stop at step 6 if the clock says so. Steps 1 to 6 are the demo.

## 10. Out of scope today

PACS or EHR integration. DICOM. Login. A database. Live phone calls. AI-drawn bounding boxes. Model-made measurements. TNM staging. Any claim of clinical validation.

---

# Part 2. Notes for the team

## Tech choices a judge will ask about

| Question | Answer |
|---|---|
| Why four agents? | Each has one job and one input boundary. Lightbox's blind reads see images and view labels only. Its focused pass also gets the indication and prior report. Stat sees the chart and no images. Courier's handoff mode sees only what the attending signed. The boundaries are the safety design |
| Why is the orchestrator code? | Order, locks and timers must be deterministic. The model checks the report against the findings, which is a judgment task |
| Why run the read twice? | A model's stated confidence is not accuracy. Agreement is measurable. Disagreement is shown, never hidden |
| What does agreement not tell you? | Whether the reads are right. Two reads from one model share blind spots. A radiologist reads every study |
| Why Fable 5.2 for Lightbox? | Vision on paired images, plus declining to call what the image does not support |
| Why Sonnet for the rest? | Text tasks on structured input. Faster and cheaper, and it leaves Fable credits for the three vision calls |
| How was it tested? | Pairs labelled by clinicians before the run. Scorecard: caught, false flags, correct refusals, missed refusals, sign-off rate. A smoke test, not a validation study |

## Where this sits next to Sectra and Rad AI

Sectra: PACS and enterprise imaging. Its Amplifier Marketplace lists third-party AI applications which run inside the Sectra diagnostic application (IDS7), so radiologists use them without leaving the viewer. Lesson for us: Interval Read belongs inside the reading workstation as a docked panel. The production path is a marketplace app plus standard interfaces (results as a FHIR DiagnosticReport or HL7 message, launch from the EHR), not a separate website.

Rad AI: three products per its site. Reporting (speech-driven reporting with pre-generated findings for unchanged follow-up exams and quality checks before sign-off). Impressions (drafts the impression from the radiologist's own findings, in their phrasing). Continuity (follow-up management for 50+ categories of actionable incidental findings, with outreach to providers and patients).

Be straight about overlap. Closing the loop on follow-up recommendations is not new. Continuity does it at scale. Do not pitch it as the invention.

What Interval Read adds:
1. The comparison itself, drafted from the two images, with explicit refusals. Rad AI's tools start from the radiologist's text.
2. The bias guard: indication hidden, blind read twice, agreement shown.
3. One signed read turned into versions for the tumor board, the surgeon, the PCP and the family.
4. The safety-net path: no PCP, no insurance, ED order, and a completion gap reported by group.

Lessons to copy from both: fit inside the existing workflow, never overwrite the radiologist's report, insert drafts the radiologist accepts.

## Population health talking points

- Inside the academic center: every signed result reaches the ordering provider, with re-send and escalation.
- Outside it: the ED patient with no PCP is where recommendations get lost. A study of two New York City teaching hospitals reported 41.3 percent of patients with incidental lung nodules completed recommended follow-up imaging, with lower completion among uninsured patients and after ED or inpatient imaging. Pull the original paper before putting the number on a slide.
- The registry turns a per-patient task into a system metric: completion rate by insurance, language and ordering site.

## Open items for the clinicians

1. Review `READING_METHOD.md` line by line. Thresholds come from teaching material.
2. Set the on-call re-page interval (placeholder: 15 minutes).
3. Confirm the wording for RECIST on radiographs. RECIST 1.1 expects CT.
4. Write the synthetic chart for each case and tag it.
5. Label ground truth before the first model run.
