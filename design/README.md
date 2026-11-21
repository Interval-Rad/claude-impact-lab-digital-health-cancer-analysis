# Decision view preview (design exploration, not app code)

`interval_read_v2_preview.html` is a standalone, clickable page. Open it in a browser. It does not touch `src/`.

What it explores:
- One decision at a time: numbered suggestion cards (accept, edit, reject), report built from what is accepted.
- Real public radiographs instead of drawn placeholders.
- Voice dictation with ElevenLabs speech to text (`scribe_v2`): "agree with 1, 2 and 4". Voice never signs.

## Where it differs from CLAUDE.md. Decide before merging any of this into the app

| Preview does | CLAUDE.md says |
|---|---|
| Model proposes caliper endpoints, code computes a ratio | Hard rule 3: radiologist types measurements. Scope list skips calipers |
| Keyboard shortcuts, theme toggle | Scope list skips both |
| ElevenLabs key pasted into the page | Hard rule 11: keys stay on the server. Preview only. Real app must call a server route |
| `repeating-linear-gradient` for the hatched can't-determine rule | Hard rule 12: no gradients. Use a border style or SVG pattern instead |
| Findings and chart text were written by hand for the pictured films | Real app takes them from Lightbox and the case file |

## Image credit
Radiopaedia case `covid-19-pneumonia-58`, CC BY-NC-SA, via the ieee8023 covid-chestxray-dataset. Same patient, PA prior and mobile AP current. Non commercial use only. Keep the credit on screen.
