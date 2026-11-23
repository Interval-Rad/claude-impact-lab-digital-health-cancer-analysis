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
:root{--bg:#0B0C0A;--surface:#141511;--raised:#1C1E19;--rule:#2B2E27;--text:#E6E3D8;--muted:#8F8D80;--accent:#E3A21A;--critical:#E5484D;--confirm:#8FB59A;--blind:#6FA8A0}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 "IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif}
.mono,.label,button,select{font-family:"IBM Plex Mono",ui-monospace,Menlo,monospace}
.label{font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
header,.strip{display:flex;gap:16px;align-items:center;flex-wrap:wrap;padding:6px 12px;border-bottom:1px solid var(--rule)}
header{background:var(--surface)}header b{letter-spacing:.18em;font-weight:500;font-size:12px}
.tag{border:1px solid var(--rule);color:var(--muted);padding:0 5px;border-radius:2px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;font-family:"IBM Plex Mono",ui-monospace,monospace}
.tag.warn{border-color:var(--accent);color:var(--accent)}
button{background:var(--raised);color:var(--text);border:1px solid var(--rule);border-radius:2px;padding:3px 9px;font-size:11.5px;cursor:pointer}
button:disabled{color:var(--muted);cursor:not-allowed;opacity:.6}button[aria-pressed=true]{border-color:var(--accent);color:var(--accent)}
button:focus-visible,select:focus-visible,input:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
select,input[type=text],input[type=number]{background:var(--bg);color:var(--text);border:1px solid var(--rule);border-radius:2px;padding:3px 6px;font-size:12px}
.grid{display:grid;grid-template-columns:58fr 42fr;min-height:0}
.well{background:#000;display:grid;grid-template-columns:1fr 1fr;gap:1px}.well.one{grid-template-columns:1fr}
.pane{position:relative}.pane img{display:block;width:100%;height:auto}.pane .cap{position:absolute;left:6px;top:4px;background:#000;padding:1px 6px;font-size:11px}
.rail{border-left:1px solid var(--rule);background:var(--surface)}section{padding:9px 12px;border-bottom:1px solid var(--rule)}
.f{border-left:2px dotted var(--blind);padding:5px 0 5px 9px;margin:7px 0}.f.accepted{border-left:2px solid var(--confirm)}.f.rejected{border-left:2px solid var(--muted);opacity:.65}
.f .top{display:flex;gap:10px;flex-wrap:wrap;align-items:baseline}.attn{color:var(--accent)}.muted{color:var(--muted)}
.cd{border-left:3px double var(--accent);padding:4px 0 4px 9px;margin:7px 0}
pre{white-space:pre-wrap;font:12px/1.5 "IBM Plex Mono",ui-monospace,monospace;margin:0}
.bar{position:sticky;bottom:0;display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:7px 12px;border-top:1px solid var(--rule);background:var(--surface)}
.locked{border:1px dashed var(--rule);padding:10px;color:var(--muted)}table{border-collapse:collapse}td,th{border:1px solid var(--rule);padding:3px 8px;text-align:left;font-size:12px}
details summary{cursor:pointer}a{color:var(--text)}
@media(max-width:900px){.grid{grid-template-columns:1fr}.rail{border-left:0}}
</style></head><body>
<header><b class="mono">SCANSHIFT</b><span class="label">Radiology</span>
<label class="label" for="case">case</label><select id="case"></select>
<button id="own" type="button">Compare your own pair</button>
<span class="label" style="margin-left:auto">demo only, not for clinical use</span></header>
<div class="strip"><span class="tag warn">recorded snapshot</span><span class="mono muted">Real model output, recorded <span id="rec"></span>. Buttons work in this browser only.</span></div>
<div class="strip"><b class="mono" id="banner">AI DRAFT. Requires resident review and attending signature.</b><span class="mono muted" id="models" style="margin-left:auto"></span></div>
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
const more = (label, ...kids) => el('details', {}, el('summary', { class: 'label' }, label), el('div', { style: 'padding-top:6px' }, kids));
function render() {
  const c = CASES.find(x => x.id === S.id), app = document.getElementById('app'); app.textContent = '';
  document.getElementById('banner').textContent = S.attending ? '● Signed by attending ' + time(S.attending) + ' (in this browser only)' : 'AI DRAFT. Requires resident review and attending signature.';
  if (c.own) {
    document.getElementById('models').textContent = ''; document.getElementById('rec').textContent = 'for the example cases';
    const pick = w => el('label', { class: 'mono', style: 'display:grid;gap:4px' }, w === 'prior' ? 'Prior image' : 'Current image', el('input', { type: 'file', accept: 'image/*', onchange: e => { const f = e.target.files[0]; if (f) { c.img[w] = URL.createObjectURL(f); render(); } } }));
    const pane = w => el('div', { class: 'pane', style: 'min-height:200px' }, c.img[w] ? el('img', { src: c.img[w], alt: w + ' image you chose', style: 'filter:' + (S.invert ? 'invert(1)' : 'none') }) : el('div', { class: 'muted mono', style: 'padding:60px 12px' }, 'no ' + w + ' image chosen'), el('span', { class: 'cap mono' }, w.toUpperCase()));
    app.append(el('section', {}, el('div', { class: 'label' }, 'Your own pair'), el('p', {}, 'Choose two images to compare side by side. They stay in this browser. Nothing is uploaded and nothing is read by AI here.'), el('div', { style: 'display:flex;gap:24px;flex-wrap:wrap;margin-top:8px' }, pick('prior'), pick('current'))),
      el('div', { class: 'well' + (S.flick ? ' one' : '') }, S.flick ? pane(S.show) : [pane('prior'), pane('current')]),
      el('div', { class: 'strip' }, el('button', { 'aria-pressed': String(S.flick), onclick: () => { S.flick = !S.flick; render(); } }, 'Flicker: ' + (S.flick ? 'on' : 'off')), S.flick && el('button', { onclick: () => { S.show = S.show === 'prior' ? 'current' : 'prior'; render(); } }, 'Swap (showing ' + S.show + ')'), el('button', { 'aria-pressed': String(S.invert), onclick: () => { S.invert = !S.invert; render(); } }, 'Invert: ' + (S.invert ? 'on' : 'off'))),
      el('section', {}, el('div', { class: 'locked mono' }, 'No AI draft. This page is a static snapshot and cannot call a model. In the running app, "Upload a pair" on the worklist starts the two blind reads on your images.')));
    return; }
  if (c.needs_human) { app.append(el('section', {}, el('div', { class: 'attn mono' }, 'NEEDS HUMAN ! No AI draft. A person reads this study.'), el('p', { class: 'muted' }, 'Recorded reason: ' + (c.error || 'not recorded')))); document.getElementById('models').textContent = ''; return; }
  document.getElementById('rec').textContent = c.recorded ? new Date(c.recorded).toLocaleString() : '';
  document.getElementById('models').textContent = 'models: ' + c.models.join(', ');
  const lb = c.lightbox, fs = lb.findings, reviewed = fs.filter(f => S.reviews[f.id]).length, all = reviewed === fs.length;
  const filt = S.invert ? 'invert(1)' : 'none';
  const pane = w => el('div', { class: 'pane' }, el('img', { src: c.img[w], alt: (w === 'prior' ? 'Prior' : 'Current') + ' chest radiograph, ' + c.views[w] + ' view', style: 'filter:' + filt }), el('span', { class: 'cap mono' }, w.toUpperCase() + ' ' + c.views[w] + ' ' + (c.chart[w + '_date'] || ''), ' ', syn()));
  const left = el('div', {},
    el('div', { class: 'well' + (S.flick ? ' one' : '') }, S.flick ? pane(S.show) : [pane('prior'), pane('current')]),
    el('div', { class: 'strip' },
      el('button', { 'aria-pressed': String(S.flick), onclick: () => { S.flick = !S.flick; render(); } }, 'Flicker: ' + (S.flick ? 'on' : 'off')),
      S.flick && el('button', { onclick: () => { S.show = S.show === 'prior' ? 'current' : 'prior'; render(); } }, 'Swap (showing ' + S.show + ')'),
      el('button', { 'aria-pressed': String(S.invert), onclick: () => { S.invert = !S.invert; render(); } }, 'Invert: ' + (S.invert ? 'on' : 'off'))),
    el('section', {}, more('Full report draft   QC: ' + (c.qc ? (c.qc.pass ? 'pass' : 'fail !') : 'not run'), el('pre', {}, c.report || 'No report draft.'))),
    el('section', {}, more('Prior report and where the images differ from it (' + lb.prior_report_discrepancies.length + ')',
      el('p', { class: 'muted' }, 'Prior report: ' + c.chart.prior_report + ' ', syn()),
      lb.prior_report_discrepancies.map(d => el('p', {}, el('span', { class: 'attn' }, 'Differs ! '), 'Report says: ' + d.prior_report_says + ' Images show: ' + d.images_show)))));
  const finding = f => { const r = S.reviews[f.id], ag = f.agreement ? AGREE[f.agreement] : ['focused pass', false], open = S.open[f.id], rej = S.rejecting[f.id];
    return el('div', { class: 'f ' + (r ? r.action : '') },
      el('div', { class: 'top mono' }, el('b', {}, f.id), words(f.region) + ' ' + words(f.kind), el('span', {}, (SHAPE[f.status] || '') + ' ' + f.status), el('span', { class: ag[1] ? 'attn' : 'muted' }, ag[0]),
        el('span', { style: 'margin-left:auto;display:flex;gap:6px;align-items:center' },
          r && el('span', { class: 'muted' }, r.action === 'accepted' ? '● accepted' : '✕ rejected'),
          !r && el('button', { disabled: !!S.attending, onclick: () => { S.reviews[f.id] = { action: 'accepted' }; render(); } }, 'Accept'),
          !r && el('button', { disabled: !!S.attending, onclick: () => { S.rejecting[f.id] = !rej; render(); } }, 'Reject'),
          r && !S.resident && el('button', { onclick: () => { delete S.reviews[f.id]; render(); } }, 'Undo'),
          el('button', { 'aria-expanded': String(!!open), onclick: () => { S.open[f.id] = !open; render(); } }, open ? 'Less' : 'Why'))),
      rej && !r && el('div', { style: 'display:flex;gap:6px;margin-top:4px' }, el('input', { type: 'text', style: 'flex:1', placeholder: 'reason (required)', 'aria-label': 'Reason to reject ' + f.id, value: S.reason[f.id] || '', oninput: e => { S.reason[f.id] = e.target.value; } }),
        el('button', { onclick: () => { const why = (S.reason[f.id] || '').trim(); if (!why) { alertLine('Reject needs a reason.'); return; } S.reviews[f.id] = { action: 'rejected', reason: why }; S.rejecting[f.id] = false; render(); } }, 'Confirm reject')),
      r && r.reason && el('div', { class: 'muted' }, 'Reason: ' + r.reason),
      open && el('div', { style: 'margin-top:4px' }, el('div', {}, f.description), el('div', { class: 'muted' }, 'Evidence: ' + f.evidence), el('div', { class: 'mono muted' }, 'read A: ' + (f.read_a_status || 'not seen') + '   read B: ' + (f.read_b_status || 'not seen') + (f.outside_indication ? '   outside indication' : '')))); };
  // Can't determine: items tied to the look-first findings come first. Three are shown, the rest on request.
  const rankCd = q => { const i = lb.look_first.indexOf(q.related_finding); return i === -1 ? (q.related_finding ? 50 : 99) : i; };
  const cds = [...lb.cant_determine].sort((x, y) => rankCd(x) - rankCd(y)), shown = S.moreCd ? cds : cds.slice(0, 3);
  const firstDiff = lb.comparability.differences[0];
  const rail = el('div', { class: 'rail' },
    el('section', {}, el('div', { class: 'label' }, 'Clinical question ', syn()), el('div', {}, c.chart.indication),
      el('div', { class: 'label', style: 'margin-top:8px' }, 'Draft answer'), el('div', { class: 'f', style: 'font-size:14px' }, lb.indication_pass ? lb.indication_pass.answer : 'No focused pass was run.'),
      el('div', { class: 'mono muted' }, 'question released to the AI ' + time(c.released) + ', after both blind reads')),
    el('section', {}, el('div', { class: 'label' }, 'Can the two films be compared?'),
      el('div', { class: 'mono' }, ({ yes: '● yes', limited: '◐ limited', no: '✕ no' })[lb.comparability.comparable] + (firstDiff ? '   ' + firstDiff.factor + ': ' + firstDiff.detail : '')),
      lb.study_flags.length ? el('div', { class: 'attn' }, 'the two reads disagree on this !') : null,
      lb.comparability.differences.length > 0 && more('What this prevents (' + lb.comparability.differences.length + ')', lb.comparability.differences.map(d => el('div', { class: 'muted' }, el('span', { class: 'mono' }, d.factor + ': '), d.prevents)))),
    el('section', {}, el('div', { class: 'label' }, "Can't determine  (" + cds.length + ')'),
      shown.map(q => el('div', { class: 'cd' }, el('div', {}, q.question), el('div', {}, el('b', {}, 'Next: '), q.recommend), more('Reason', el('div', { class: 'muted' }, q.reason)))),
      cds.length > 3 && el('button', { onclick: () => { S.moreCd = !S.moreCd; render(); } }, S.moreCd ? 'Show fewer' : 'Show ' + (cds.length - 3) + ' more')),
    el('section', {}, el('div', { class: 'label' }, 'Findings   ' + reviewed + ' of ' + fs.length + ' reviewed' + (lb.look_first.length ? '   look first: ' + lb.look_first.join(', ') : '')), fs.map(finding)),
    el('section', {}, more('Measurements (you enter)', fs.filter(f => f.needs_measurement).map(f => el('div', { class: 'mono', style: 'margin:4px 0' }, f.id + ' prior ', el('input', { type: 'number', min: '0', style: 'width:70px', 'aria-label': f.id + ' prior mm' }), ' mm  current ', el('input', { type: 'number', min: '0', style: 'width:70px', 'aria-label': f.id + ' current mm' }), ' mm')), el('div', { class: 'mono' }, c.recist || 'RECIST 1.1: not computed'), el('div', { class: 'muted' }, 'The draft contains no sizes. Only values typed here are measurements.'))),
    el('section', {}, el('div', { class: 'label' }, 'Ordering provider'),
      !S.attending ? el('div', { class: 'locked mono' }, 'Locked until the attending signs.')
      : c.handoff ? el('div', {}, el('div', { class: 'mono' }, c.handoff.provider_message.subject), el('pre', {}, c.handoff.provider_message.body))
      : el('div', { class: 'mono' }, '● Unlocked. The running app drafts the provider message and follow-up order here. Not part of this snapshot.')));
  app.append(el('div', { class: 'strip' }, el('span', { class: 'mono' }, c.chart.display_name + ' '), syn(), el('span', { class: 'mono' }, 'MRN ' + c.chart.mrn + ' '), syn(), c.stat && el('span', { class: 'mono' }, '◆ ' + c.stat.urgency_tier + ': ' + c.stat.worklist_reason)),
    el('div', { class: 'grid' }, left, rail),
    el('div', { class: 'bar' }, el('span', { class: 'mono ' + (all ? '' : 'attn') }, reviewed + ' of ' + fs.length + ' findings reviewed' + (all ? '' : ' !')), S.resident && el('span', { class: 'mono' }, '● resident signed ' + time(S.resident)), S.attending && el('span', { class: 'mono' }, '● attending signed ' + time(S.attending)), el('span', { class: 'mono attn', id: 'msg', role: 'alert' }),
      el('span', { style: 'margin-left:auto;display:flex;gap:8px' }, el('button', { disabled: !!S.attending, onclick: () => { fs.forEach(f => { if (!S.reviews[f.id]) S.reviews[f.id] = { action: 'accepted' }; }); render(); } }, 'Accept all remaining'), el('button', { disabled: !all || !!S.resident, onclick: () => { S.resident = new Date().toISOString(); render(); } }, 'Sign as resident'), el('button', { disabled: !all || !S.resident || !!S.attending, onclick: () => { S.attending = new Date().toISOString(); render(); } }, 'Attending sign'), el('button', { onclick: () => { S = fresh(S.id); render(); } }, 'Reset'))));
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
