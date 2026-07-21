function count(source, label) {
  const pattern = new RegExp(`(?:^|\\r?\\n)\\s*(?:#|ℹ)\\s*${label}\\s+(\\d+)\\s*(?=\\r?$)`, 'gmu');
  const matches = [...String(source ?? '').matchAll(pattern)];
  return matches.length ? Number(matches.at(-1)[1]) : null;
}

export function parseTapSummary(stdout) {
  const pass = count(stdout, 'pass');
  const fail = count(stdout, 'fail');
  if (pass === null || fail === null) throw new Error('Test output is missing TAP pass/fail counts.');
  return { pass, fail };
}
