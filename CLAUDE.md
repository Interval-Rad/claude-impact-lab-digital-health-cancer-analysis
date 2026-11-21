# Interval Read

Demo web app for Track 3 (Radiology / Oncology), Claude Impact Lab NYC. Compares a cancer patient's current chest study with the prior, drafts a first read with explicit refusals, and after two human signatures hands the result to the ordering provider. Demo only. Public de-identified images, synthetic chart. Not for clinical use.

## Source of truth

1. `agents/*.md`: system prompts, schemas, state machine, QC rules.
2. This file.
3. `BUILD_PROMPT.md` for stack and interface.

The 12:00 Build Plan PDF is superseded. It still describes model confidence, an aggregate score and model measurements. Ignore it.

## Hard rules (the rule guard hook enforces the starred ones)

1. * Blind reads see images and view labels only. The blind read lives in `src/lib/lightbox.blind.ts`. This file never mentions indication, prior report, vitals, labs or problem list.
2. The blind read runs twice. The UI shows agreement between reads. * No model-reported confidence field anywhere in `src/lib/schemas.ts`.
3. The model gives no millimeters and no percent. The radiologist types measurements in. `src/lib/recist.ts` does the arithmetic.
4. * No blended or aggregate score. The worklist is a plain sort on visible columns.
5. Chart data goes to Stat only.
6. "Can't determine" has the same visual weight as a finding, with a reason and a next step.
7. * `src/lib/courier.ts` handoff mode throws `NOT_SIGNED` when the attending has not signed. Charge checks too.
8. Voice unlocks only after the provider marks the patient informed.
9. Every unsigned screen shows: "AI DRAFT. Requires resident review and attending signature."
10. Every synthetic field shows a "synthetic" tag.
11. * API keys stay on the server. No `NEXT_PUBLIC_` key. No key literal in the repo.
12. * Interface: no purple, indigo or violet, no gradients, no backdrop blur. Tokens come from `BUILD_PROMPT.md` section 7.2.

## Conventions

- Models: `claude-fable-5-2` (Lightbox), `claude-sonnet-5-5` (Stat, Courier, QC), `claude-opus-5-5` (fallback). At server start, list models through the SDK and fail with a clear message if one is missing.
- Images: read the media type from the file's first bytes (JPEG `FF D8 FF`, PNG `89 50 4E 47`). Never trust the extension. `case.json` also records it.
- Every model call goes through `src/lib/model.ts` `callModel()`. It validates against a zod schema, retries once with the validation error, and writes request hash plus response to `data/cache/`.
- `DEMO_MODE=replay` serves cached responses. The UI shows "replayed, recorded HH:MM" in the footer. Record once, demo from replay.
- Agent prompts load from `agents/*.md` at runtime. Clinicians edit prompts without touching code.

## Commands

- `npm run dev`: app
- `npm run check`: typecheck, unit tests, rule guard
- `npm run cases`: run every case in `data/cases/` headless, write outputs and `scorecard.md`
- `python dataset/pull_demo_pairs.py`: fetch the demo pairs

## Claude Code subagents (in `.claude/agents/`)

These build and check the app. They are not the app's agents (Charge, Lightbox, Stat, Courier).

- `ui-builder`: builds screens from `fixtures/demo_case.json` while the main session builds the pipeline.
- `rule-auditor`: read-only audit of the hard rules. Run before recording.
- `case-runner`: runs all cases, fills the scorecard, reports failures.
- `pitch-checker`: checks every claim in the demo script against the code and the scorecard.

## Hooks (in `.claude/settings.json`)

- After every edit: rule guard. Violations come back as errors.
- Before every shell command: blocks key printing, force pushes and deleting `data/`.
- On stop: typecheck and unit tests must pass. In the last ten minutes, `touch .claude/skip-check` to turn this off.

## Scope today

Must work: upload, three Lightbox calls with reconciliation, Stat, report draft, QC, review, typed measurements, RECIST, two signatures, provider message with the locked follow-up order, the refusal case, the scorecard.

Skip: registry, navigator letter, FHIR object, keyboard shortcuts, theme toggle polish, caliper, live phone calls, PACS or EHR integration.
