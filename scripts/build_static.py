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
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:13px/1.45 "IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif}
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
<span class="label" style="margin-left:auto">demo only, not for clinical use</span></header>
<div class="strip"><span class="tag warn">recorded snapshot</span><span class="mono">Findings and report are real model output recorded <span id="rec"></span>. Buttons work in this browser only: nothing is saved and no model is called here.</span></div>
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
function fresh(id) { return { id, reviews: {}, reason: {}, open: {}, mm: {}, flick: false, show: 'prior', invert: false, resident: null, attending: null }; }
function render() {
  const c = CASES.find(x => x.id === S.id), app = document.getElementById('app'); app.textContent = '';
  document.getElementById('banner').textContent = S.attending ? '● Signed by attending ' + time(S.attending) + ' (in this browser only)' : 'AI DRAFT. Requires resident review and attending signature.';
  if (c.needs_human) { app.append(el('section', {}, el('div', { class: 'attn mono' }, 'NEEDS HUMAN ! No AI draft. A person reads this study.'), el('p', { class: 'muted' }, 'Recorded reason: ' + (c.error || 'not recorded')))); document.getElementById('models').textContent = ''; return; }
  document.getElementById('rec').textContent = c.recorded ? new Date(c.recorded).toLocaleString() : '';
  document.getElementById('models').textContent = 'models: ' + c.models.join(', ');
  const lb = c.lightbox, fs = lb.findings, reviewed = fs.filter(f => S.reviews[f.id]).length, all = reviewed === fs.length;
  const filt = S.invert ? 'invert(1)' : 'none';
  const pane = w => el('div', { class: 'pane' }, el('img', { src: c.img[w], alt: (w === 'prior' ? 'Prior' : 'Current') + ' chest radiograph, ' + c.views[w] + ' view', style: 'filter:' + filt }), el('span', { class: 'cap mono' }, w.toUpperCase() + ' ' + c.views[w] + ' ' + (c.chart[w + '_date'] || ''), ' ', syn()));
  const left = el('div', {},
    el('div', { class: 'well' + (S.flick ? ' one' : '') }, S.flick ? pane(S.show) : [pane('prior'), pane('current')]),
    el('div', { class: 'strip' }, el('span', { class: 'label' }, 'display'),
      el('button', { 'aria-pressed': String(S.flick), onclick: () => { S.flick = !S.flick; render(); } }, 'Flicker: ' + (S.flick ? 'on' : 'off')),
      S.flick && el('button', { onclick: () => { S.show = S.show === 'prior' ? 'current' : 'prior'; render(); } }, 'Swap (showing ' + S.show + ')'),
      el('button', { 'aria-pressed': String(S.invert), onclick: () => { S.invert = !S.invert; render(); } }, 'Invert: ' + (S.invert ? 'on' : 'off'))),
    el('section', {}, el('div', { class: 'label' }, 'Indication  ', el('span', { class: 'mono' }, 'released ' + time(c.released) + ' after blind reads')),
      el('p', {}, c.chart.indication, ' ', syn()), el('p', { class: 'muted' }, 'Ordered by: ' + c.provider.name + ', ' + c.provider.role + ' ', syn()),
      el('p', { class: 'muted' }, 'Prior report: ' + c.chart.prior_report + ' ', syn()),
      lb.indication_pass && el('p', { class: 'f' }, el('span', { class: 'label' }, 'focused pass '), lb.indication_pass.answer),
      lb.prior_report_discrepancies.map(d => el('p', { class: 'attn' }, 'Differs from prior report ! ', el('span', { style: 'color:var(--text)' }, 'Report says: ' + d.prior_report_says + ' Images show: ' + d.images_show)))),
    el('section', {}, el('div', { class: 'label' }, 'Report draft   QC: ' + (c.qc ? (c.qc.pass ? 'pass' : 'fail !') : 'not run')), el('pre', {}, c.report || 'No report draft.')));
  const finding = f => { const r = S.reviews[f.id], ag = f.agreement ? AGREE[f.agreement] : ['focused pass', false], open = S.open[f.id];
    return el('div', { class: 'f ' + (r ? r.action : '') },
      el('div', { class: 'top mono' }, el('b', {}, f.id), words(f.region), el('span', { class: 'muted' }, words(f.kind)), el('span', {}, (SHAPE[f.status] || '') + ' ' + f.status), el('span', { class: ag[1] ? 'attn' : '' }, ag[0]), f.outside_indication && el('span', { class: 'tag' }, 'outside indication'), f.time_sensitive && el('span', { class: 'tag warn' }, 'time sensitive')),
      el('div', {}, f.description),
      open && el('div', { class: 'muted' }, el('div', {}, 'Evidence: ' + f.evidence), el('div', { class: 'mono' }, 'read A: ' + (f.read_a_status || 'not seen') + '   read B: ' + (f.read_b_status || 'not seen'))),
      el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:4px' },
        el('span', { class: 'mono muted' }, r ? (r.action === 'accepted' ? '● accepted' : '✕ rejected: ' + r.reason) : '○ draft, not reviewed'),
        el('button', { onclick: () => { S.open[f.id] = !open; render(); } }, open ? 'Hide evidence' : 'Evidence'),
        el('button', { disabled: !!S.attending, onclick: () => { S.reviews[f.id] = { action: 'accepted' }; render(); } }, 'Accept'),
        el('input', { type: 'text', placeholder: 'reason to reject', 'aria-label': 'Reason to reject ' + f.id, value: S.reason[f.id] || '', oninput: e => { S.reason[f.id] = e.target.value; } }),
        el('button', { disabled: !!S.attending, onclick: () => { const why = (S.reason[f.id] || '').trim(); if (!why) { alertLine('Reject needs a reason.'); return; } S.reviews[f.id] = { action: 'rejected', reason: why }; render(); } }, 'Reject'),
        r && !S.resident && el('button', { onclick: () => { delete S.reviews[f.id]; render(); } }, 'Undo'))); };
  const rail = el('div', { class: 'rail' },
    el('section', {}, el('div', { class: 'label' }, 'Comparability'), el('div', { class: 'mono' }, ({ yes: '●', limited: '◐', no: '✕' })[lb.comparability.comparable] + ' ' + lb.comparability.comparable + '   (read A: ' + lb.comparable_by_read.a + ', read B: ' + lb.comparable_by_read.b + ')'),
      lb.study_flags.length ? el('div', { class: 'attn' }, 'reads disagree on comparability !') : null,
      lb.comparability.differences.map(d => el('div', { class: 'muted' }, el('span', { class: 'mono' }, d.factor + ': '), d.detail + ' Prevents: ' + d.prevents))),
    c.stat && el('section', {}, el('div', { class: 'label' }, 'Triage'), el('div', { class: 'mono' }, '◆ ' + c.stat.urgency_tier + '   ' + words(c.stat.severity_subgroup)), el('div', { class: 'muted' }, c.stat.worklist_reason)),
    el('section', {}, el('div', { class: 'label' }, 'Look first'), lb.look_first.length ? lb.look_first.map(id => { const f = fs.find(x => x.id === id); return el('div', { class: 'mono' }, el('b', { class: 'attn' }, id + ' '), f ? words(f.region) + ' ' + words(f.kind) : ''); }) : el('div', { class: 'muted' }, 'None')),
    el('section', {}, el('div', { class: 'label' }, 'Findings   ' + reviewed + ' of ' + fs.length + ' reviewed'), fs.map(finding)),
    el('section', {}, el('div', { class: 'label' }, "Can't determine"), lb.cant_determine.map(q => el('div', { class: 'cd' }, el('div', {}, q.question, q.related_finding ? el('span', { class: 'mono muted' }, '  ' + q.related_finding) : null), el('div', { class: 'muted' }, 'Reason: ' + q.reason), el('div', {}, 'Next: ' + q.recommend)))),
    el('section', {}, el('div', { class: 'label' }, 'Measurements (you enter)'), fs.filter(f => f.needs_measurement).map(f => el('div', { class: 'mono', style: 'margin:4px 0' }, f.id + ' prior ', el('input', { type: 'number', min: '0', style: 'width:70px', 'aria-label': f.id + ' prior mm' }), ' mm  current ', el('input', { type: 'number', min: '0', style: 'width:70px', 'aria-label': f.id + ' current mm' }), ' mm')), el('div', { class: 'mono' }, c.recist || 'RECIST 1.1: not computed'), el('div', { class: 'muted' }, 'The draft contains no sizes. Only values typed here are measurements.')),
    el('section', {}, el('div', { class: 'label' }, 'Ordering provider view'),
      !S.attending ? el('div', { class: 'locked mono' }, 'Locked. Nothing leaves radiology before the attending signs.')
      : c.handoff ? el('div', {}, el('div', { class: 'mono' }, c.handoff.provider_message.subject), el('pre', {}, c.handoff.provider_message.body), c.handoff.followup_order ? el('table', { style: 'margin-top:6px' }, Object.entries(c.handoff.followup_order).map(([k, v]) => el('tr', {}, el('th', {}, words(k)), el('td', {}, v)))) : el('div', { class: 'muted' }, 'The signed report recommends no follow-up order.'), el('div', { class: 'muted' }, 'The provider signs the order. No agent places an order.'))
      : el('div', { class: 'mono' }, '● Unlocked. In the running app, the provider message and the pre-filled follow-up order are drafted at this point from the signed report. That step is a live model call and is not part of this snapshot.')));
  app.append(el('div', { class: 'strip' }, el('span', { class: 'mono' }, c.chart.display_name + ' '), syn(), el('span', { class: 'mono' }, 'MRN ' + c.chart.mrn + ' '), syn(), el('span', { class: 'mono muted' }, 'XR CHEST 1 VIEW')),
    el('div', { class: 'grid' }, left, rail),
    el('div', { class: 'bar' }, el('span', { class: 'mono ' + (all ? '' : 'attn') }, 'Resident: ' + reviewed + ' of ' + fs.length + ' reviewed' + (all ? '' : ' !')), S.resident && el('span', { class: 'mono' }, '● resident signed ' + time(S.resident)), S.attending && el('span', { class: 'mono' }, '● attending signed ' + time(S.attending)), el('span', { class: 'mono attn', id: 'msg', role: 'alert' }),
      el('span', { style: 'margin-left:auto;display:flex;gap:8px' }, el('button', { disabled: !all || !!S.resident, onclick: () => { S.resident = new Date().toISOString(); render(); } }, 'Sign as resident'), el('button', { disabled: !all || !S.resident || !!S.attending, onclick: () => { S.attending = new Date().toISOString(); render(); } }, 'Attending sign'), el('button', { onclick: () => { S = fresh(S.id); render(); } }, 'Reset'))));
}
function alertLine(t) { const m = document.getElementById('msg'); if (m) m.textContent = t + ' !'; }
const sel = document.getElementById('case');
CASES.forEach(c => sel.append(el('option', { value: c.id }, c.id + (c.needs_human ? ' (needs human)' : ''))));
sel.addEventListener('change', () => { S = fresh(sel.value); render(); });
S = fresh(CASES[0].id); render();
</script>
<div class="strip"><span class="label">Images: NIH Clinical Center, ChestX-ray14 (Wang et al., CVPR 2017). All chart data is synthetic. A smoke test, not a validation study.</span><a class="mono" href="https://github.com/Interval-Rad/claude-impact-lab-digital-health-cancer-analysis">Source on GitHub</a></div>
</body></html>
"""
open(os.path.join(ROOT, "index.html"), "w").write(HTML.replace("__DATA__", data))
print("index.html written:", [(c["id"], "needs human" if c.get("needs_human") else "draft") for c in cases], os.path.getsize(os.path.join(ROOT, "index.html")), "bytes")
