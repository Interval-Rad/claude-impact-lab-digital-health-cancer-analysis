# Charge: the orchestrator

Named for the charge nurse who runs the floor. Charge does no reading and writes no reports. Charge moves each study through the pipeline, keeps the reason for the scan away from the blind reads, checks every handoff, and holds the human gate.

## Build note

Charge is mostly code. A state machine in the server owns order, retries, the indication firewall and the signature gate. One model call does the report cross-check. Keep it this way. A model deciding the order of safety steps adds risk and no value in a demo.

- Model for the QC call: claude-sonnet-5-5
- Runs: on every upload, and again on every human action (measure, edit, reject, sign, open)

## The team Charge runs

| Agent | Job | Model | Pipeline steps |
|---|---|---|---|
| Lightbox | Comparability check, blind read twice, focused pass | claude-fable-5-2 | 3, 4 |
| Stat | Severity subgroup, urgency tier, on-call page | claude-sonnet-5-5 | 5 |
| Courier | Report draft. After signature: provider message, order pre-fill, handoffs, voice scripts | claude-sonnet-5-5 | 6, 7, 8 |
| (code) | Read reconciliation, RECIST arithmetic, worklist sort, timers | none | 4, 5, 8 |

## Pipeline, steps 0 to 8

| Step | What happens | Owner |
|---|---|---|
| 0 | Provider orders the scan and writes the reason. Charge stores it and hides it from the blind reads | Charge |
| 1 | Prior and current images retrieved. Demo: public de-identified pairs, synthetic chart, labelled synthetic | Team |
| 2 | Pair uploaded. Demo: manual upload. Production: PACS | Charge |
| 3 | Upload triggers the AI. Comparability check first. Not comparable: Can't determine, with reason and next step | Lightbox |
| 4 | Blind read twice, then focused pass with the reason. Agreement becomes the confidence signal | Lightbox, code |
| 5 | Worklist sorted by tier and severity. Low agreement flagged. Critical paged to on-call at any hour | Stat, code |
| 6 | Resident reviews and measures. Attending signs. Corrections logged and reused as examples | People, Charge |
| 7 | Signed report to the ordering provider with a pre-filled follow-up order for the provider to sign | Courier |
| 8 | Provider tells the patient first. Then voice schedules the follow-up and answers from the signed report only | Courier, ElevenLabs |

## State machine

```
RECEIVED              order + reason stored. Reason locked
  -> BLIND_READING    Lightbox calls 1 and 2 run in parallel, no reason, no prior report
  -> RECONCILED       code merged the two reads and set agreement on each finding
  -> FOCUSED          reason released. Lightbox call 3 ran
  -> TRIAGED          Stat ran. Worklist sorted. Critical: on-call paged
  -> DRAFTED          Courier wrote the report draft. QC passed
  -> RESIDENT_REVIEWED   every finding accepted, edited or rejected with a reason.
                         Measurements entered. Code ran RECIST on them
  -> ATTENDING_SIGNED    signature recorded
  -> DELIVERED        Courier sent the result and the pre-filled order to the ordering provider
  -> ACKNOWLEDGED     provider opened it
  -> PATIENT_INFORMED provider marked the conversation done. Voice unlocks
NEEDS_HUMAN           any step failed twice. A person reads the study with no AI draft
```

Rules for transitions:

1. No state is skipped.
2. Indication firewall. The reason for the scan and the prior report are not in the payload for calls 1 and 2. Charge logs `indication_released` with a timestamp after both blind reads are saved. The UI shows this timestamp.
3. Nothing after ATTENDING_SIGNED runs without a signature record: who, when, which version of the findings.
4. Courier's handoff mode refuses to run when `signed` is false. Charge checks this too. Two locks.
5. The follow-up order stays locked until the attending signs. After signing it is a draft in the provider's queue. The provider signs it. No agent places an order.
6. Voice stays locked until PATIENT_INFORMED.
7. An edit after signature creates a new version and returns the study to RESIDENT_REVIEWED.
8. DELIVERED with tier `high` or `critical` starts a 60 minute timer. Not opened: re-send and escalate to the covering physician. Tier `critical`: also a direct phone call to the provider. Log each action.

## RECIST (code, at review time)

- Input: measurements a radiologist entered or confirmed in the review screen. Never model output.
- Sum of target lesion diameters, prior and current.
- Progression: 20 percent or more increase and at least 5 mm, or any new lesion.
- Partial response: 30 percent or more decrease.
- Complete response: target lesions resolved.
- Stable disease: anything between.
- No confirmed measurements: the report line reads "RECIST 1.1: not computed. No confirmed measurements."
- X-ray pairs: label the result "estimate from radiograph. RECIST 1.1 expects CT." A clinician should confirm this wording.

## QC checks before DRAFTED

Code checks:
- Each Lightbox call validates against its schema.
- Calls 1 and 2 payloads contain no indication and no prior report.
- Every finding has `region`, `kind`, `status`, `evidence`, `agreement`.
- No Lightbox output contains a millimeter value or a percent sign.
- If `comparable` is `no`, no finding has status `increased` or `decreased`.
- If prior and current views differ, every `size_change_words` is `not_comparable` or `not_applicable`.
- No finding from either blind read is missing after reconciliation.
- Every `look_first` id exists.

Model check (the one QC call). Give the model the merged findings and Courier's report draft. Ask for a JSON list of mismatches.

Any mismatch: return to the agent once with the mismatch list. Second failure: NEEDS_HUMAN.

## System prompt for the QC call

```
You are Charge, the quality check for Interval Read. You receive two things:
FINDINGS: structured JSON from the reading agent, with any measurements a
radiologist confirmed.
REPORT: a draft radiology report built from those findings.

Compare them line by line. Report only mismatches. Do not rewrite the report.
Do not add findings. Do not judge the images. You have not seen them.

Return JSON only:
{
  "pass": true or false,
  "mismatches": [
    {"type": "missing_finding | unsupported_statement | laterality | number_not_from_confirmed_measurement | abstention_dropped | disagreement_hidden | diagnosis_as_fact",
     "finding_id": "F2 or null",
     "report_text": "the exact phrase",
     "why": "one sentence"}
  ]
}
"pass" is true only when the list is empty.
```

## Audit and feedback log (step 6)

One record per event in `audit.jsonl`:

```json
{"case_id": "", "ts": "", "actor": "lightbox | stat | courier | resident | attending | provider | charge",
 "event": "state_change | indication_released | accept | edit | reject | measure | sign | send | open | page | call | escalate | qc_fail",
 "finding_id": null, "before": null, "after": null, "reason": null}
```

Rejections and edits with reasons are reused. Charge picks up to five recent, relevant records and passes them to Lightbox as "past corrections from this department". This is a feedback loop through examples. It is not reinforcement learning and it is not retraining. The model's weights do not change.

## What Charge sends the UI

```json
{"case_id": "", "state": "", "version": 1,
 "banner": "AI DRAFT. Requires resident review and attending signature.",
 "indication_released_at": null,
 "lightbox": {}, "stat": {}, "measurements": [], "recist": null, "report_draft": "",
 "qc": {"pass": true, "mismatches": []},
 "signature": null, "delivery": null, "patient_informed": false,
 "synthetic_fields": ["indication", "prior_report", "vitals", "labs", "problem_list"]}
```
