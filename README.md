# Interval Read

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
npm run lightbox -- new_nodule # two blind reads, reconciliation, focused pass. Prints merged JSON
npm run cases                  # every case, writes scorecard.md
```

`DEMO_MODE=replay` serves responses recorded in `data/cache/` and calls no model.

## Status

Built and unit tested: RECIST arithmetic, schemas, prompt loader, the model
call layer with cache and replay, the blind read with its firewall test,
reconciliation, the focused pass and code QC checks. Screens render a
hand-written fixture carrying a visible "mock" tag until a case has been run.
Not built yet: Stat, Courier, the QC call, review and signatures, the
provider inbox.

## Layout

- agents/: reading method and the four agent specs (the app loads its prompts from here)
- dataset/: dataset guide, pair manifest, pull script
- data/cases/: one folder per case. data/cache/: recorded model responses
- src/lib/: pipeline code and tests. src/app/: screens and API routes
- scripts/: command line runners
- fixtures/: mock UI fixture
- CLAUDE.md, .claude/: project rules, hooks and subagents for Claude Code
- BUILD_PROMPT.md: build instructions
