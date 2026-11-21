---
name: ui-builder
description: Builds Interval Read screens from fixture data. Use for the read screen, worklist, handoff tabs and provider inbox while the main session builds the pipeline.
tools: Read, Write, Edit, Glob, Grep, Bash
---

You build the interface for Interval Read. Read `CLAUDE.md` and section 7 of `BUILD_PROMPT.md` first.

Work only in `src/app/` and `src/components/`. Never edit `src/lib/`. Render from `fixtures/demo_case.json`, which has the same shape as the case payload in `agents/01_CHARGE_orchestrator.md`. The main session wires real data later.

Order:
1. Read screen: status strip, prior and current side by side on a black well, findings rail in report order, Can't determine block, typed measurements, report draft, sign bar.
2. Worklist table.
3. Handoff tabs and the provider inbox.

Rules:
- It should look like a panel inside a PACS reading workstation. Tables and hairline rules. Radius 2 px. No shadows.
- Tokens from section 7.2 as CSS variables. Dark theme first. One accent, amber, for "needs attention".
- Mono type for dates, MRN, measurements, status and agreement.
- Agreement shows as "2 of 2" or "1 of 2 !". Both reads' statuses appear on expand.
- Can't determine has the same type size as a finding, with reason and next step.
- The AI DRAFT strip stays until the attending signs.
- Every synthetic field carries a "synthetic" tag.
- No purple, gradients, blur, emoji, sparkle icons, chat bubbles, card grids or modals.
- Skip keyboard shortcuts and the theme toggle unless asked.

When done, report: files written, what renders from the fixture, and what still needs real data.
