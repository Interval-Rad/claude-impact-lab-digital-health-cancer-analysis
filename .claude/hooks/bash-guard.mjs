// Blocks a few shell commands that could sink the demo. Exit 2 blocks the call.
let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let cmd = '';
  try { cmd = JSON.parse(raw)?.tool_input?.command || ''; } catch { process.exit(0); }
  const rules = [
    [/(cat|less|more|head|tail|bat)\s+[^|;&]*\.env(\.\w+)?\b/, 'Do not print .env files. Read keys through process.env in server code.'],
    [/(echo|printf)\s+[^|;&]*\$\{?(ANTHROPIC|ELEVEN)[A-Z_]*KEY/, 'Do not print API keys.'],
    [/\bprintenv\b|\benv\s*(\||$)/, 'Do not dump the environment. It holds API keys.'],
    [/rm\s+-[a-zA-Z]*r[a-zA-Z]*\s+[^|;&]*\b(data|agents|dataset|fixtures)\b/, 'Do not delete data/, agents/, dataset/ or fixtures/. Cases and cached model responses live there.'],
    [/git\s+push\s+[^|;&]*(--force|-f)\b/, 'No force push during the hackathon.'],
    [/git\s+(reset\s+--hard|clean\s+-[a-zA-Z]*f)/, 'No hard reset or clean. Uncommitted work is the demo.'],
  ];
  for (const [re, why] of rules) {
    if (re.test(cmd)) { console.error('Blocked by Interval Read bash guard: ' + why); process.exit(2); }
  }
  process.exit(0);
});
