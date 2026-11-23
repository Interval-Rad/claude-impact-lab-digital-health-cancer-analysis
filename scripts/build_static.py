#!/usr/bin/env python3
"""Builds index.html: a static, clickable snapshot of recorded ScanShift runs.

Reads data/cases/<id>/state.json (real pipeline output) and the two images, and writes one
self-contained page. Review and sign buttons work in the browser only. Nothing is saved and
no model is called. Run: python3 scripts/build_static.py
"""
import base64, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CASES = os.path.join(ROOT, "data", "cases")
ORDER = ["refusal_nodule", "refusal_heart", "new_nodule", "control", "new_effusion"]

def media(b):
    return "image/jpeg" if b[:3] == b"\xff\xd8\xff" else "image/png"

def load(cid):
    d = os.path.join(CASES, cid)
    sp = os.path.join(d, "state.json")
    if not os.path.exists(sp):
        return None
    s = json.load(open(sp)); c = json.load(open(os.path.join(d, "case.json")))
    if not s.get("lightbox") or s.get("state") == "NEEDS_HUMAN":
        return {"id": cid, "needs_human": True, "error": s.get("error"), "state": s.get("state")}
    img = {}
    for w in ("prior", "current"):
        b = open(os.path.join(d, c[w]["file"]), "rb").read()
        img[w] = "data:%s;base64,%s" % (media(b), base64.b64encode(b).decode())
    ch = c["synthetic_chart"]; signed = bool((s.get("signature") or {}).get("attending"))
    return {"id": cid, "img": img,
            "views": {w: c[w]["nih"]["view_position"] for w in ("prior", "current")},
            "chart": {k: ch[k] for k in ("display_name", "mrn", "prior_date", "current_date", "indication", "prior_report")},
            "provider": ch["ordering_provider"], "released": s.get("indication_released_at"),
            "lightbox": s["lightbox"], "stat": s.get("stat"), "report": s.get("report_draft"), "qc": s.get("qc"),
            "recist": (s.get("recist") or {}).get("line"),
            "handoff": s.get("handoff") if signed else None,
            "models": sorted({m["model"] for m in s.get("calls", [])}),
            "recorded": max([m["recorded_at"] for m in s.get("calls", [])] or [""])}

cases = [x for x in (load(c) for c in ORDER if os.path.isdir(os.path.join(CASES, c))) if x]
if not any(not c.get("needs_human") for c in cases):
    sys.exit("No recorded case with a draft. Run the pipeline first.")
data = json.dumps(cases).replace("</", "<\\/")

HTML = r"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>ScanShift</title>
<style>
:root{--bg:#0B0C0A;--surface:#141511;--raised:#1C1E19;--rule:#2B2E27;--text:#E6E3D8;--muted:#8F8D80;--accent:#E3A21A;--confirm:#8FB59A}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 "IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif}
.mono{font-family:"IBM Plex Mono",ui-monospace,Menlo,monospace}
header,.strip{display:flex;gap:16px;align-items:center;flex-wrap:wrap;padding:8px 16px;border-bottom:1px solid var(--rule)}
header{background:var(--surface)}header b{letter-spacing:.18em;font-weight:500;font-size:12px}
h2{font-size:12px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 8px}
p{margin:0 0 6px}.muted{color:var(--muted)}.attn{color:var(--accent)}.small{font-size:13px}
.tag{border:1px solid var(--rule);color:var(--muted);padding:0 5px;border-radius:2px;font-size:10px;letter-spacing:.08em;text-transform:uppercase}
.tag.warn{border-color:var(--accent);color:var(--accent)}
button,select{font:inherit;font-size:14px;background:var(--raised);color:var(--text);border:1px solid var(--rule);border-radius:2px;padding:7px 14px;cursor:pointer}
button:hover:not(:disabled){border-color:var(--muted)}button:disabled{color:var(--muted);cursor:not-allowed;opacity:.6}button[aria-pressed=true]{border-color:var(--text)}
button.primary{background:var(--accent);color:#0B0C0A;border-color:var(--accent);font-weight:600;padding:9px 20px}
button.link{background:none;border:0;padding:0;color:var(--muted);text-decoration:underline;text-underline-offset:3px}
button:focus-visible,select:focus-visible,input:focus-visible,summary:focus-visible,a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
input[type=text],input[type=number]{font:inherit;background:var(--bg);color:var(--text);border:1px solid var(--rule);border-radius:2px;padding:6px 8px}
.grid{display:grid;grid-template-columns:55fr 45fr}.left{border-right:1px solid var(--rule)}.right{padding:16px;display:grid;gap:16px;align-content:start}
.well{background:#000;display:flex;gap:2px}.pane{position:relative;flex:1;min-width:0}.pane img{display:block;width:100%;height:auto}
.pane .cap{position:absolute;left:8px;top:8px;background:#000;padding:2px 8px;font-size:13px}
.panel{border:1px solid var(--rule);background:var(--surface);border-radius:2px;padding:14px 16px}
.big{font-size:17px;line-height:1.4}.chip{display:inline-block;border:1px solid var(--rule);border-radius:2px;padding:1px 8px;font-size:13px;white-space:nowrap}
.chip.warn{border-color:var(--accent);color:var(--accent)}.chip.ok{border-color:var(--confirm);color:var(--confirm)}
.row{border-top:1px solid var(--rule);padding:12px 0}.row:first-child{border-top:0;padding-top:0}
.cd{border-left:3px double var(--accent);padding-left:12px;margin:10px 0}
.steps{margin-left:auto;display:flex;gap:10px;flex-wrap:wrap;font-size:13px;color:var(--muted)}.steps .on{color:var(--text);font-weight:600}.steps .done{color:var(--confirm)}
pre{white-space:pre-wrap;font:13px/1.5 "IBM Plex Mono",ui-monospace,monospace;margin:0}
.bar{position:sticky;bottom:0;display:flex;gap:14px;align-items:center;flex-wrap:wrap;padding:12px 16px;border-top:1px solid var(--rule);background:var(--surface)}
details>summary{cursor:pointer;color:var(--muted)}a{color:var(--text)}
@media(max-width:900px){.grid{grid-template-columns:1fr}.left{border-right:0}}
</style></head><body>
<header><b class="mono">SCANSHIFT</b>
<label for="case" class="muted small">Case</label><select id="case"></select>
<button id="own" type="button">Compare your own pair</button>
<span class="muted small" style="margin-left:auto">Demo only. Not for clinical use.</span></header>
<div class="strip small"><span class="tag warn">recorded snapshot</span><span class="muted">Real AI output, recorded <span id="rec"></span>. Patient details are synthetic. Buttons work in this browser only.</span><span id="models" hidden></span></div>
<div class="strip small"><b id="banner">AI DRAFT. Requires resident review and attending signature.</b><ol class="steps" id="steps" style="list-style:none;margin:0 0 0 auto;padding:0"></ol></div>
<div id="app"></div>
<script id="data" type="application/json">__DATA__</script>
<script>
const CASES = JSON.parse(document.getElementById('data').textContent);
const el = (t, a = {}, ...kids) => { const n = document.createElement(t); for (const k in a) { if (k === 'class') n.className = a[k]; else if (k.startsWith('on')) n.addEventListener(k.slice(2), a[k]); else if (a[k] !== false && a[k] != null) n.setAttribute(k, a[k]); } for (const c of kids.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c))); return n; };
const words = s => String(s ?? '').replace(/_/g, ' ');
const syn = () => el('span', { class: 'tag' }, 'synthetic');
const time = iso => iso ? new Date(iso).toLocaleTimeString([], { hour12: false }) : '';
const AGREE = { '2_of_2': ['2 of 2', false], '1_of_2': ['1 of 2 !', true], 'status_differs': ['reads disagree !', true] };
const SHAPE = { new: '▲', increased: '▲', decreased: '▼', stable: '■', resolved: '○', indeterminate: '◇' };
let S = {};
function fresh(id) { return { id, reviews: {}, rejecting: {}, reason: {}, open: {}, moreCd: false, flick: false, show: 'prior', invert: false, resident: null, attending: null }; }
const REGION = { R_apical: 'Right lung, top', R_upper: 'Right upper lung', R_mid: 'Right mid lung', R_lower: 'Right lower lung', L_apical: 'Left lung, top', L_upper: 'Left upper lung', L_mid: 'Left mid lung', L_lower: 'Left lower lung', R_hilum: 'Right hilum', L_hilum: 'Left hilum', mediastinum: 'Mediastinum', heart: 'Heart', R_pleura: 'Right pleura', L_pleura: 'Left pleura', diaphragm_below: 'Diaphragm and below', bones: 'Bones', soft_tissue: 'Soft tissue', devices: 'Lines and devices' };
const KIND = { nodule_or_mass: 'nodule or mass', consolidation: 'opacity', collapse: 'collapse', effusion: 'fluid (effusion)', pneumothorax: 'pneumothorax', interstitial: 'interstitial markings', adenopathy: 'enlarged nodes', cardiac_silhouette: 'size and shape', bone_lesion: 'bone lesion', device: 'device', other: 'other finding' };
const CHANGE = { new: '▲ New', increased: '▲ Increased', decreased: '▼ Decreased', stable: '■ No change', resolved: '○ Resolved', indeterminate: '◇ Can’t tell' };
const COMP = { yes: '● Yes, the two films can be compared', limited: '◐ Only partly: read the changes with care', no: '✕ No, the two films cannot be compared' };
const TIER = { critical: '▲ Urgent', high: '◆ Review soon', routine: '○ Routine' };
const fname = f => (REGION[f.region] || f.region) + ': ' + (KIND[f.kind] || f.kind);
const agree = f => f.added_in_focused_pass ? ['Added on the second look', false] : f.agreement === '2_of_2' ? ['Both reads agree', false] : f.agreement === '1_of_2' ? ['Only 1 of 2 reads saw this !', true] : ['The 2 reads disagree !', true];
function render() {
  const c = CASES.find(x => x.id === S.id), app = document.getElementById('app'); app.textContent = '';
  document.getElementById('banner').textContent = S.attending ? '● Signed by the attending at ' + time(S.attending) + ' (in this browser only).' : 'AI DRAFT. Requires resident review and attending signature.';
  const stepsEl = document.getElementById('steps'); stepsEl.textContent = '';
  if (c.own) {
    document.getElementById('rec').textContent = 'for the example cases';
    const pick = w => el('label', { style: 'display:grid;gap:4px' }, w === 'prior' ? 'Before image' : 'Now image', el('input', { type: 'file', accept: 'image/*', onchange: e => { const f = e.target.files[0]; if (f) { c.img[w] = URL.createObjectURL(f); render(); } } }));
    const pane = w => el('div', { class: 'pane', style: 'min-height:220px' }, c.img[w] ? el('img', { src: c.img[w], alt: (w === 'prior' ? 'Before' : 'Now') + ' image you chose', style: 'filter:' + (S.invert ? 'invert(1)' : 'none') }) : el('div', { class: 'muted', style: 'padding:70px 16px' }, 'No ' + (w === 'prior' ? 'before' : 'now') + ' image chosen yet'), el('span', { class: 'cap' }, el('b', {}, w === 'prior' ? 'BEFORE' : 'NOW')));
    app.append(el('div', { class: 'right' }, el('div', { class: 'panel' }, el('h2', {}, 'Your own pair'), el('p', {}, 'Choose two images to compare. They stay in this browser. Nothing is uploaded, and no AI reads them here.'), el('div', { style: 'display:flex;gap:24px;flex-wrap:wrap;margin-top:8px' }, pick('prior'), pick('current')))),
      el('div', { class: 'well' }, S.flick ? pane(S.show) : [pane('prior'), pane('current')]),
      el('div', { class: 'strip' }, el('button', { 'aria-pressed': String(!S.flick), onclick: () => { S.flick = false; render(); } }, 'Side by side'), el('button', { 'aria-pressed': String(S.flick), onclick: () => { S.show = S.flick ? (S.show === 'prior' ? 'current' : 'prior') : 'prior'; S.flick = true; render(); } }, S.flick ? 'Flip (showing ' + (S.show === 'prior' ? 'before' : 'now') + ')' : 'Flip between them'), el('button', { 'aria-pressed': String(S.invert), onclick: () => { S.invert = !S.invert; render(); } }, 'Invert')),
      el('div', { class: 'right' }, el('div', { class: 'panel muted' }, 'No AI draft here. This page is a snapshot and cannot call a model. In the running app, "Upload a new pair of X-rays" starts the AI read on your images.')));
    return; }
  if (c.needs_human) { app.append(el('div', { class: 'right' }, el('div', { class: 'panel' }, el('h2', {}, 'No AI draft for this study'), el('p', {}, 'The AI draft was stopped by a safety check, so a person reads this study without it.'), el('p', { class: 'muted' }, 'What happened: ' + (c.error || 'not recorded'))))); return; }
  document.getElementById('rec').textContent = c.recorded ? new Date(c.recorded).toLocaleString() : '';
  const lb = c.lightbox, fs = lb.findings, reviewed = fs.filter(f => S.reviews[f.id]).length, all = reviewed === fs.length;
  const step = S.attending ? 4 : S.resident ? 3 : all ? 2 : 1;
  ['Review', 'Resident signs', 'Attending signs', 'Sent to provider'].forEach((t, i) => stepsEl.append(el('li', { class: i + 1 === step ? 'on' : i + 1 < step ? 'done' : '' }, (i + 1 < step ? '✓ ' : (i + 1) + '. ') + t + (i < 3 ? '  ›' : ''))));
  const pane = w => el('div', { class: 'pane' }, el('img', { src: c.img[w], alt: (w === 'prior' ? 'Earlier' : 'Current') + ' chest X-ray, ' + c.views[w] + ' view', style: 'filter:' + (S.invert ? 'invert(1)' : 'none') }), el('span', { class: 'cap' }, el('b', {}, w === 'prior' ? 'BEFORE' : 'NOW'), ' ' + (c.chart[w + '_date'] || '') + ' · ' + c.views[w] + ' view'));
  const left = el('div', { class: 'left' },
    el('div', { class: 'well' }, S.flick ? pane(S.show) : [pane('prior'), pane('current')]),
    el('div', { class: 'strip' }, el('button', { 'aria-pressed': String(!S.flick), onclick: () => { S.flick = false; render(); } }, 'Side by side'), el('button', { 'aria-pressed': String(S.flick), onclick: () => { S.show = S.flick ? (S.show === 'prior' ? 'current' : 'prior') : 'prior'; S.flick = true; render(); } }, S.flick ? 'Flip (showing ' + (S.show === 'prior' ? 'before' : 'now') + ')' : 'Flip between them'), el('button', { 'aria-pressed': String(S.invert), onclick: () => { S.invert = !S.invert; render(); } }, 'Invert')));
  const finding = f => { const r = S.reviews[f.id], ag = agree(f), open = S.open[f.id], rej = S.rejecting[f.id];
    return el('div', { class: 'row' },
      el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;align-items:baseline' }, el('b', {}, fname(f)), el('span', { class: 'chip' }, CHANGE[f.status] || f.status), el('span', { class: 'chip' + (ag[1] ? ' warn' : '') }, ag[0])),
      open && el('div', { class: 'muted', style: 'margin-top:8px' }, el('p', { style: 'color:var(--text)' }, f.description), el('p', {}, 'Why: ' + f.evidence), el('p', {}, 'First read: ' + (f.read_a_status ? CHANGE[f.read_a_status] : 'did not report it') + '. Second read: ' + (f.read_b_status ? CHANGE[f.read_b_status] : 'did not report it') + '.' + (f.outside_indication ? ' Not related to the reason for the scan.' : ''))),
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px' },
        r ? [el('span', { class: 'chip' + (r.action === 'accepted' ? ' ok' : '') }, r.action === 'accepted' ? '✓ Confirmed' : '✕ Rejected'), r.reason && el('span', { class: 'muted' }, 'Reason: ' + r.reason), !S.resident && el('button', { onclick: () => { delete S.reviews[f.id]; render(); } }, 'Undo')]
          : !S.resident && [el('button', { onclick: () => { S.reviews[f.id] = { action: 'accepted' }; render(); } }, '✓ Confirm'), el('button', { 'aria-expanded': String(!!rej), onclick: () => { S.rejecting[f.id] = !rej; render(); } }, '✕ Reject')],
        el('button', { class: 'link', style: 'margin-left:auto', 'aria-expanded': String(!!open), onclick: () => { S.open[f.id] = !open; render(); } }, open ? 'Hide details' : 'Details')),
      rej && !r && el('div', { style: 'display:flex;gap:8px;margin-top:8px' }, el('input', { type: 'text', style: 'flex:1', placeholder: 'Why are you rejecting it? (required)', 'aria-label': 'Reason', value: S.reason[f.id] || '', oninput: e => { S.reason[f.id] = e.target.value; } }),
        el('button', { onclick: () => { const why = (S.reason[f.id] || '').trim(); if (!why) { alertLine('Rejecting needs a reason.'); return; } S.reviews[f.id] = { action: 'rejected', reason: why }; S.rejecting[f.id] = false; render(); } }, 'Save'))); };
  const rankCd = q => { const i = lb.look_first.indexOf(q.related_finding); return i === -1 ? (q.related_finding ? 50 : 99) : i; };
  const cds = [...lb.cant_determine].sort((x, y) => rankCd(x) - rankCd(y)), shown = S.moreCd ? cds : cds.slice(0, 2);
  const d0 = lb.comparability.differences[0];
  const right = el('div', { class: 'right' },
    el('div', { class: 'panel' }, el('h2', {}, S.attending ? 'Bottom line (signed)' : 'Bottom line (AI draft, not final)'),
      el('p', { class: 'muted' }, 'Question: ' + c.chart.indication + ' ', el('span', { class: 'tag' }, 'synthetic')),
      el('p', { class: 'big' }, lb.indication_pass ? lb.indication_pass.answer : 'No answer was drafted for this study.'),
      el('p', { style: 'margin-top:10px' }, (COMP[lb.comparability.comparable] || '') + (d0 ? '. ' + d0.detail : '.')),
      c.stat && el('p', { class: 'muted' }, 'Priority: ' + (TIER[c.stat.urgency_tier] || '') + '. ' + c.stat.worklist_reason)),
    cds.length > 0 && el('div', { class: 'panel' }, el('h2', {}, 'What the AI could not tell (' + cds.length + ')'),
      shown.map(q => el('div', { class: 'cd' }, el('div', {}, el('b', {}, q.question)), el('div', {}, el('b', {}, 'Suggested next step: '), q.recommend), el('details', {}, el('summary', {}, 'Why'), el('div', { class: 'muted' }, q.reason)))),
      cds.length > 2 && el('button', { class: 'link', onclick: () => { S.moreCd = !S.moreCd; render(); } }, S.moreCd ? 'Show fewer' : 'Show ' + (cds.length - 2) + ' more')),
    el('div', { class: 'panel' }, el('h2', {}, 'Findings to confirm (' + reviewed + ' of ' + fs.length + ' done)'), fs.map(finding)),
    el('details', { class: 'panel' }, el('summary', {}, 'More: full report, technical detail'),
      el('div', { style: 'display:grid;gap:16px;margin-top:12px' },
        el('div', {}, el('h2', {}, 'Report draft ' + (c.qc ? (c.qc.pass ? '(checked against the findings: pass)' : '(check found mismatches !)') : '')), el('pre', {}, c.report || 'No report draft.')),
        el('div', {}, el('h2', {}, 'Why the comparison is limited'), lb.comparability.differences.length ? lb.comparability.differences.map(d => el('p', {}, d.detail + ' ', el('span', { class: 'muted' }, 'This prevents: ' + d.prevents))) : el('p', {}, 'No technical differences were noted.')),
        lb.prior_report_discrepancies.length > 0 && el('div', {}, el('h2', {}, 'Where the images differ from the earlier report'), el('p', { class: 'muted' }, 'Earlier report: ' + c.chart.prior_report), lb.prior_report_discrepancies.map(d => el('p', {}, 'The report says: ' + d.prior_report_says + ' The images show: ' + d.images_show))),
        el('div', { class: 'muted small' }, el('h2', {}, 'Technical'), el('p', {}, 'The reason for the scan was released to the AI at ' + time(c.released) + ', after both blind reads. ' + (c.recist || '') + '. The AI never measures.'), el('p', {}, 'Models: ' + c.models.join(', ') + '.')))),
    S.attending && el('div', { class: 'panel' }, el('h2', {}, 'Sent to the ordering provider'), el('p', {}, 'In the running app, the provider now receives a short message and a pre-filled follow-up order to sign. That step is a live AI call and is not part of this snapshot.')));
  let next;
  if (S.attending) next = el('span', { class: 'chip ok' }, '✓ Signed and sent');
  else if (S.resident) next = el('button', { class: 'primary', onclick: () => { S.attending = new Date().toISOString(); render(); } }, 'Sign as attending');
  else if (all) next = el('button', { class: 'primary', onclick: () => { S.resident = new Date().toISOString(); render(); } }, 'Sign as resident');
  else next = el('button', { class: 'primary', onclick: () => { fs.forEach(f => { if (!S.reviews[f.id]) S.reviews[f.id] = { action: 'accepted' }; }); render(); } }, 'Confirm all ' + (fs.length - reviewed) + ' remaining');
  app.append(el('div', { class: 'strip' }, el('b', {}, c.chart.display_name + ' '), el('span', { class: 'tag' }, 'synthetic')),
    el('div', { class: 'grid' }, left, right),
    el('div', { class: 'bar' }, el('span', {}, S.attending ? '● Signed by the attending.' : S.resident ? '● Signed by the resident. The attending signs next.' : all ? '● All findings confirmed. Ready to sign.' : reviewed + ' of ' + fs.length + ' findings confirmed.'), el('span', { class: 'attn', id: 'msg', role: 'alert' }),
      el('span', { style: 'margin-left:auto;display:flex;gap:8px;align-items:center' }, (reviewed > 0 || S.resident) && el('button', { onclick: () => { S = fresh(S.id); render(); } }, 'Start over'), next)));
}
function alertLine(t) { const m = document.getElementById('msg'); if (m) m.textContent = t + ' !'; }
const sel = document.getElementById('case');
CASES.forEach(c => sel.append(el('option', { value: c.id }, c.id + (c.needs_human ? ' (needs human)' : ''))));
sel.addEventListener('change', () => { S = fresh(sel.value); render(); });
document.getElementById('own').addEventListener('click', () => { if (!CASES.find(c => c.own)) { CASES.push({ id: 'your own pair', own: true, img: {} }); sel.append(el('option', { value: 'your own pair' }, 'your own pair (not read)')); } sel.value = 'your own pair'; S = fresh('your own pair'); render(); });
S = fresh(CASES[0].id); render();
</script>
<div class="strip"><span class="label">Images: NIH Clinical Center, ChestX-ray14 (Wang et al., CVPR 2017). All chart data is synthetic. A smoke test, not a validation study.</span><a class="mono" href="https://github.com/Interval-Rad/claude-impact-lab-digital-health-cancer-analysis">Source on GitHub</a></div>
</body></html>
"""
open(os.path.join(ROOT, "index.html"), "w").write(HTML.replace("__DATA__", data))
print("index.html written:", [(c["id"], "needs human" if c.get("needs_human") else "draft") for c in cases], os.path.getsize(os.path.join(ROOT, "index.html")), "bytes")
