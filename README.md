# ScanShift

Claude Impact Lab NYC, Track 3 (Radiology / Oncology). Demo build. Not
for clinical use.

**Who it is for:** the radiologist reading a cancer patient's follow-up
chest film.

**The problem:** they write the comparison with the prior study from
scratch, and some image pairs cannot support a call.

**What it does:** compares the prior and current image and drafts a
structured first read: what changed, what did not, what to look at first,
and what it declines to call. A resident reviews it and an attending
signs it. Only then does the result go to the ordering provider.

## Safety design

- The reason for the scan is hidden from the blind reads.
- The blind read runs twice. The app shows agreement between the reads,
  not a model-reported confidence.
- The model gives no measurements. A radiologist enters them and code
  does the RECIST arithmetic.
- "Can't determine" is a first-class output with a reason and a next step.
- Nothing leaves radiology before the attending signs.

## Data

Public de-identified images from NIH ChestX-ray14. All chart data is
synthetic and labelled synthetic. Testing so far is a smoke test on a
small number of pairs, not a validation study.

Chest X-ray images: NIH Clinical Center, ChestX-ray14.
https://nihcc.app.box.com/v/ChestXray-NIHCC. Wang X, Peng Y, Lu L, Lu Z,
Bagheri M, Summers RM. ChestX-ray8: Hospital-scale Chest X-ray Database
and Benchmarks on Weakly-Supervised Classification and Localization of
Common Thorax Diseases. IEEE CVPR 2017, pp. 3462-3471.

## Run it

Needs Node 22 and Python 3 with `requests`.

```
npm install
python dataset/pull_demo_pairs.py --out /tmp/interval_read_pull
for c in control new_effusion new_nodule refusal_heart refusal_nodule; do cp /tmp/interval_read_pull/$c/*.jpg data/cases/$c/; done
npm run check        # typecheck, unit tests, rule guard
npm run dev          # http://localhost:3000
```

The images are not in git. The copy step above adds them next to each
committed `case.json` without overwriting the synthetic chart.

Live model calls need `ANTHROPIC_API_KEY` in `.env.local` (server side only):

```
npm run models                 # checks the model ids in src/lib/config.ts against the key
npm run pipeline -- new_nodule # one case from upload to report draft, without the browser
npm run cases                  # scorecard.md from the stored runs (add -- --rerun to run them again)
```

`DEMO_MODE=replay` serves responses recorded in `data/cache/` and calls no model.

## Status

Works, and has been run live on the five demo pairs:

- Two blind reads, reconciliation with agreement per finding, focused pass with the release time.
- Triage and the worklist sort. Report draft and the quality check.
- Review (accept, edit, reject with a reason), typed measurements, resident and attending signatures.
- After the attending signs: provider message, pre-filled follow-up order, tumor board, surgeon and
  family drafts, the provider inbox, and re-send with escalation on the demo clock.
- Replay from recorded responses (`DEMO_MODE=replay`), and a model id check when the server starts.

Known limits:

- No case has clinician ground truth, so `scorecard.md` has no accuracy counts.
- RECIST is not computed on radiographs until a clinician confirms the wording
  (`RECIST_RADIOGRAPH_POLICY` in `src/lib/config.ts`). Every demo case is a radiograph.
- The synthetic charts were written for the demo and no clinician has reviewed them.
- Three of the five cases failed the report quality check on their first run and were redrafted on request.
- Not built: voice, past-corrections feedback to the reading agent, automatic fallback model,
  on-call re-page, PCP and navigator tabs.

`index.html` is a static snapshot of the recorded runs (rebuild with `python3 scripts/build_static.py`).
`slides/` holds the three minute deck. `design/` is a separate design exploration, not app code.

## Layout

- agents/: reading method and the four agent specs (the app loads its prompts from here)
- dataset/: dataset guide, pair manifest, pull script
- data/cases/: one folder per case. data/cache/: recorded model responses
- src/lib/: pipeline code and tests. src/app/: screens and API routes
- scripts/: command line runners
- fixtures/: mock UI fixture
- CLAUDE.md, .claude/: project rules, hooks and subagents for Claude Code
- BUILD_PROMPT.md: build instructions
