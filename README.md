# Interval Read

Demo web app for radiologists. It compares a cancer patient's current and prior chest film and drafts a structured first read: what changed, what did not, what to look at first, and what it declines to call. A resident reviews, an attending signs, and only then does the result go to the ordering provider.

Runs locally on public de-identified NIH ChestX-ray14 images with a **synthetic** chart. Not a clinical tool. No claim of clinical validation.

Spec and prompts: `Interval_Read_Kit/` (`BUILD_PROMPT.md`, `agents/*.md`). The app loads each agent's system prompt from those markdown files at runtime.

## Run

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/Interval-Rad/claude-impact-lab-digital-health-cancer-analysis?ref=my-feature)

In a Codespace the app starts itself on port 3000. Add `ANTHROPIC_API_KEY` as a Codespaces secret for live reads. Without it the app runs in labelled fixture mode.

```
npm install
npm run seed -- <dir with pulled cases>   # only if data/cases is empty. See below
npm run dev                               # http://localhost:3000
npm test                                  # RECIST, reconciliation, firewall, sort, prompt loader
```

| Env var | Effect |
|---|---|
| `ANTHROPIC_API_KEY` | Live mode. Lightbox runs on `claude-fable-5-2` (falls back to `claude-opus-5-5`), Stat, Courier and QC on `claude-sonnet-5-5`. Server side only |
| *(unset)* | **Fixture mode.** Scripted output by case category, labelled on every screen. It is not a read of the images. Lets you click through the whole flow without a key |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | Server-side text to speech for the scheduling call and family page. Without a key the browser voice is used |
| `INTERVAL_READ_FIXTURES=1` | Force fixture mode even when a key is set |

## Cases

Seven sample cases are committed in `data/cases/<id>/`: `prior.png`, `current.png`, `case.json`. `state.json` (git-ignored) appears once a case is run. To get images:

```
python Interval_Read_Kit/dataset/pull_pairs.py Interval_Read_Kit/dataset/nih_pairs_manifest.csv --per-category 1 --out /tmp/pulled
npm run seed -- /tmp/pulled
```

`seed` copies the pairs in and fills a synthetic chart. The Hugging Face route can return 500 "dataset index is loading" for a minute. Rerun if a pair fails. Image source and attribution: NIH Clinical Center, ChestX-ray14 (Wang et al., CVPR 2017).

## What is built

Steps 1 to 7 of the build order, plus the refusal and population-health case (`D_*`: PA then AP, ED order, no PCP, no insurance, Spanish).

- State machine in code (`src/lib/charge.ts`): indication firewall, reconciliation, QC, signature gate with two locks, audit log (`data/audit.jsonl`), lazy delivery timers on a demo clock (60 minutes = 20 seconds).
- Lightbox: two parallel blind reads, code reconciliation, focused pass. Stat: triage plus a plain sort. Courier: report draft, handoffs, voice scripts.
- Screens: worklist, read screen with keyboard control, handoff tabs, provider inbox, registry.

Not built: PACS/EHR integration, DICOM, login, database, live phone calls, AI-drawn boxes, model-made measurements, upload UI (the `POST /api/cases` multipart route exists), on-call re-page interval (placeholder in the spec).
