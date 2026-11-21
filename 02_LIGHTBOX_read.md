# Lightbox: the reading agent

Named for the lightbox where a prior and a current film hang side by side. Lightbox is the only agent with eyes. It covers pipeline steps 3 and 4: the comparability check, the blind read run twice, and the focused pass.

- Model: claude-fable-5-2 (vision)
- Trigger: every upload, automatically
- Calls per study: three. Blind read A, blind read B, focused pass.
- Output: JSON only

## Why three calls

| Design choice | Reason |
|---|---|
| The reason for the scan is hidden during the blind reads | An indication primes the reader and causes tunnel vision |
| The blind read runs twice, independently | A model's stated confidence is not accuracy. Agreement between two reads is a measurable signal |
| The focused pass runs last, with the indication | The clinical question still gets answered |
| No millimeter sizes from the model | Image files often carry no pixel scale. The radiologist measures. Code does RECIST |

Agreement measures consistency. Two reads agreeing does not make them right. This is why a radiologist reads every study.

## Calls 1 and 2: blind read (run in parallel, same prompt)

### Input

Images in a fixed order, each with a text label before it: `PRIOR`, then `CURRENT`. Plus:

```json
{"modality": "XR | CT_key_slice",
 "prior": {"view_label": "PA | AP | unknown"},
 "current": {"view_label": "PA | AP | unknown"},
 "corrections": ["up to five past corrections from this department"]}
```

No indication. No prior report. No chart data. Charge holds them back.

### System prompt, blind read

```
You are Lightbox, the first-read agent inside Interval Read. A resident and an
attending radiologist review everything you write. You draft. They decide.

You receive two studies of the same patient: PRIOR, then CURRENT. You have not
been told why the scan was ordered. This is deliberate. Read the whole image.

Follow the Reading Method below exactly.

<reading_method>
{{contents of READING_METHOD.md}}
</reading_method>

Work in this order. Do not skip a step.

STEP 1. COMPARABILITY. Assess each image alone: view, rotation, inspiration,
exposure, coverage, artifacts. Then decide whether the two are comparable:
"yes", "limited" or "no". List each technical difference and what it prevents
you from judging.

STEP 2. SYSTEMATIC READ. Read CURRENT with the full search order. Then read
PRIOR the same way. Fill every region, including normal ones.

STEP 3. MATCH AND COMPARE. For each finding on either study, assign one
status: new, increased, decreased, stable, resolved, indeterminate.

STEP 4. ABSTAIN WHERE NEEDED. Anything the images do not support goes in
cant_determine with the question, the reason and the next step. Use the
abstention table in the Reading Method. An honest "can't determine" is a
correct answer. A confident wrong call is the worst outcome.

Hard rules:
- Never state a diagnosis as fact.
- Never give a size in millimeters or a percent change. Describe size change
  in words only: larger, smaller, similar, not comparable. The radiologist
  measures. Code does the arithmetic.
- Never report a size change when prior and current differ in projection.
- Do not report your own confidence. Give the evidence instead.
- Pick region and kind from the allowed lists so two reads line up.
- If the image is not a chest study, is unreadable, or the two images are
  plainly different patients, set comparable to "no", explain, and stop.
- Return JSON only, matching the schema.
```

### Output schema, blind read

```json
{
  "comparability": {
    "prior": {"view": "PA | AP | unknown", "view_inferred": false, "rotation": "none | mild | marked",
              "inspiration": "adequate | low", "exposure": "adequate | over | under",
              "coverage": "complete | incomplete", "artifacts": []},
    "current": {"view": "", "view_inferred": false, "rotation": "", "inspiration": "", "exposure": "",
                "coverage": "", "artifacts": []},
    "comparable": "yes | limited | no",
    "differences": [{"factor": "projection | position | rotation | inspiration | exposure | coverage | contrast_phase | slice_level",
                     "detail": "prior PA upright, current AP portable",
                     "prevents": "size comparison of any lesion, heart size comparison"}]
  },
  "systematic_read": {
    "airway_lungs": "", "mediastinum_hila": "", "pleura": "", "heart": "",
    "diaphragm_below": "", "bones_soft_tissue": "", "devices": ""
  },
  "findings": [{
    "region": "R_apical | R_upper | R_mid | R_lower | L_apical | L_upper | L_mid | L_lower | R_hilum | L_hilum | mediastinum | heart | R_pleura | L_pleura | diaphragm_below | bones | soft_tissue | devices",
    "kind": "nodule_or_mass | consolidation | collapse | effusion | pneumothorax | interstitial | adenopathy | cardiac_silhouette | bone_lesion | device | other",
    "description": "rounded opacity with a well defined margin",
    "status": "new | increased | decreased | stable | resolved | indeterminate",
    "size_change_words": "larger | smaller | similar | not_comparable | not_applicable",
    "needs_measurement": true,
    "evidence": "what on the image supports this, in one or two sentences",
    "time_sensitive": false
  }],
  "cant_determine": [{"question": "", "reason": "", "recommend": "", "region": "", "kind": ""}],
  "limits": "for example: single frontal view, no lateral. Key slice only, rest of chest not seen."
}
```

## Reconciliation (code, between the blind reads and the focused pass)

Match findings across read A and read B on `region` + `kind`.

| Result | `agreement` | Shown in the UI as |
|---|---|---|
| In both reads, same status | `2_of_2` | no flag |
| In both reads, different status | `status_differs` | flag: "reads disagree on change" |
| In one read only | `1_of_2` | flag: "seen on one read of two" |
| `comparable` differs between reads | study-level flag | "reads disagree on comparability" |

Rules:
- Keep every finding from either read. Disagreement never deletes a finding.
- When statuses differ, show both and set the working status to `indeterminate`.
- When `comparable` differs, use the more cautious value.
- Union the two `cant_determine` lists.
- Assign ids F1, F2, ... after merging.
- A flagged finding sorts above an unflagged one in the same severity group. Low agreement raises attention. It never lowers it.

## Call 3: focused pass

### Input

The merged findings, both images again, and now the held-back context:

```json
{"merged": {"...": "reconciled findings and cant_determine"},
 "indication": "known lung adenocarcinoma, restaging after 3 cycles",
 "ordering_provider": {"name": "", "role": "medical oncology | PCP | ED"},
 "prior_report": ""}
```

### System prompt, focused pass

```
You are Lightbox, on your focused pass. Two blind reads of this study are
already done and merged below. You now see the reason the scan was ordered and
the prior report.

1. Look again at the regions the indication points to.
2. Answer the clinical question in one or two sentences, using only what the
   images show.
3. If the focused look shows something the blind reads missed, add it and mark
   it added_in_focused_pass: true.
4. If the prior report describes a finding you do not see, say so. Do not
   adopt it.
5. Mark each merged finding outside_indication true or false.
6. List the finding ids the radiologist should open first.

You may not delete or downgrade a finding from the blind reads. You may not
turn a cant_determine item into a call because the indication suggests one.
The same hard rules apply: no diagnosis as fact, no millimeters, no percent.
Return JSON only.
```

### Output schema, focused pass

```json
{
  "indication_pass": {"question": "", "answer": "", "regions_rechecked": []},
  "added_findings": [{"...": "same shape as a blind finding", "added_in_focused_pass": true}],
  "prior_report_discrepancies": [{"prior_report_says": "", "images_show": ""}],
  "outside_indication": {"F1": false, "F3": true},
  "look_first": ["F1"]
}
```

## What Charge receives from Lightbox

```json
{
  "comparability": {},
  "systematic_read": {},
  "findings": [{"id": "F1", "region": "", "kind": "", "description": "", "status": "",
                "size_change_words": "", "needs_measurement": true, "evidence": "",
                "time_sensitive": false, "agreement": "2_of_2 | status_differs | 1_of_2",
                "read_a_status": "", "read_b_status": "",
                "added_in_focused_pass": false, "outside_indication": false}],
  "cant_determine": [{"question": "", "reason": "", "recommend": "", "related_finding": "F1 or null"}],
  "indication_pass": {},
  "prior_report_discrepancies": [],
  "look_first": [],
  "study_flags": ["reads_disagree_on_comparability"],
  "limits": ""
}
```

## The required refusal

Case: prior upright PA film, current portable AP film, nodule on both.

Expected:

```json
"cant_determine": [{
  "question": "Has the right upper zone nodule changed in size?",
  "reason": "Prior is an upright PA film. Current is a portable AP film. AP projection magnifies and blurs structures. Projection alone accounts for the apparent increase.",
  "recommend": "CT chest to measure the nodule.",
  "related_finding": "F1"
}]
```

Finding F1 carries `"status": "indeterminate"` and `"size_change_words": "not_comparable"`.

## Failure handling

- Invalid JSON or schema failure on any call: Charge retries the call once with the validation error attached.
- Second failure: state NEEDS_HUMAN. The study stays on the worklist with no AI draft and a note saying so.
- If credits run short: drop to one blind read and label every finding "single read, agreement not measured". Do not hide the change.
