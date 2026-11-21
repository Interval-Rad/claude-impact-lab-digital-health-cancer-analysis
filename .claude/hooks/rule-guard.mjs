// Interval Read rule guard. Runs after every Edit or Write, and from `npm run check`.
// Exit 2 sends the violations back to Claude Code. Exit 0 means clean.
import fs from 'node:fs';
import path from 'node:path';

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const src = path.join(root, 'src');
if (!fs.existsSync(src)) process.exit(0);

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx|css)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) files.push(p);
  }
})(src);

const bad = [];
const rel = (p) => path.relative(root, p);
const scan = (p, re, msg) => {
  fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
    if (line.includes('rule-guard-ignore')) return;
    if (re.test(line)) bad.push(`${rel(p)}:${i + 1}  ${msg}\n    ${line.trim().slice(0, 110)}`);
  });
};

for (const p of files) {
  const name = path.basename(p);
  // Rule 1: the blind read never sees the reason for the scan or the chart
  if (name === 'lightbox.blind.ts')
    scan(p, /indication|prior_?report|priorReport|vitals|\blabs\b|problem_?list|problemList|ehr/i,
      'Rule 1: the blind read file mentions held-back context');
  // Rule 2: no model-reported confidence
  if (name === 'schemas.ts')
    scan(p, /\bconfidence\b/i, 'Rule 2: no model-reported confidence. Use agreement between the two reads');
  // Rule 4: no blended score
  scan(p, /aggregate_?score|blended_?score|aggregateScore|blendedScore|triage_?score|triageScore/,
    'Rule 4: no blended or aggregate score. Plain sort on visible columns');
  // Rule 11: keys stay on the server
  scan(p, /NEXT_PUBLIC_[A-Z_]*(ANTHROPIC|ELEVEN|API_KEY)|sk-ant-[A-Za-z0-9]/,
    'Rule 11: API keys stay on the server');
  // Rule 12: interface
  if (/\.(tsx|css)$/.test(name))
    scan(p, /\b(purple|indigo|violet|fuchsia)-\d|bg-gradient|backdrop-blur|linear-gradient/,
      'Rule 12: no purple, indigo, violet, gradients or blur');
}

// Rule 7: handoff refuses when unsigned
const courier = files.find((p) => path.basename(p) === 'courier.ts');
if (courier && !/NOT_SIGNED/.test(fs.readFileSync(courier, 'utf8')))
  bad.push(`${rel(courier)}  Rule 7: handoff mode must throw NOT_SIGNED when the attending has not signed`);

if (bad.length) {
  console.error(`Interval Read rule guard: ${bad.length} violation(s). Fix before moving on.\n\n` + bad.join('\n'));
  process.exit(2);
}
process.exit(0);
