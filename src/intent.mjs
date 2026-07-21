import { boundedText, containsSecret } from './files.mjs';
import { conflictError } from './errors.mjs';

const HEADER = '# VibeTether Intent Contract';

function parseList(lines, title) {
  const heading = lines.indexOf(`## ${title}`);
  if (heading < 0) throw conflictError(`Intent Contract is missing ${title}.`, 'INVALID_INTENT');
  const output = [];
  for (let index = heading + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith('## ')) break;
    if (!line.trim()) continue;
    if (!line.startsWith('- ')) throw conflictError(`Intent ${title} contains malformed list syntax.`, 'INVALID_INTENT');
    if (line === '- None.') continue;
    output.push(boundedText(line.slice(2), 500, `Intent ${title} item`));
  }
  return output;
}

export function parseIntent(source) {
  if (typeof source !== 'string' || containsSecret(source)) throw conflictError('Intent Contract is missing or secret-bearing.', 'INVALID_INTENT');
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  if (lines[0] !== HEADER) throw conflictError('Intent Contract has an invalid heading.', 'INVALID_INTENT');
  const field = (prefix) => {
    const matches = lines.filter((line) => line.startsWith(prefix));
    if (matches.length !== 1) throw conflictError(`Intent Contract requires one ${prefix.trim()} field.`, 'INVALID_INTENT');
    return matches[0].slice(prefix.length).trim();
  };
  const status = field('Status: ');
  const goal = field('Goal: ');
  const success_evidence = field('Success evidence: ');
  if (!['draft', 'confirmed'].includes(status)) throw conflictError('Intent status must be draft or confirmed.', 'INVALID_INTENT');
  if (status === 'confirmed' && (!goal || !success_evidence)) throw conflictError('Confirmed Intent requires goal and success evidence.', 'INVALID_INTENT');
  return {
    status,
    goal,
    success_evidence,
    scope_boundaries: parseList(lines, 'Scope boundaries'),
    constraints: parseList(lines, 'Constraints'),
  };
}

export function renderIntent({ status = 'draft', goal = '', success_evidence = '', scope_boundaries = [], constraints = [] } = {}) {
  if (!['draft', 'confirmed'].includes(status)) throw conflictError('Intent status must be draft or confirmed.', 'INVALID_INTENT');
  const cleanGoal = goal ? boundedText(goal, 2000, 'Goal') : '';
  const cleanEvidence = success_evidence ? boundedText(success_evidence, 2000, 'Success evidence') : '';
  if (status === 'confirmed' && (!cleanGoal || !cleanEvidence)) throw conflictError('Confirmed Intent requires goal and success evidence.', 'INVALID_INTENT');
  const list = (values, label) => values.length ? values.map((item) => `- ${boundedText(item, 500, label)}`).join('\n') : '- None.';
  return [
    HEADER, '', `Status: ${status}`, `Goal: ${cleanGoal}`, `Success evidence: ${cleanEvidence}`, '',
    '## Scope boundaries', '', list(scope_boundaries, 'Scope boundary'), '',
    '## Constraints', '', list(constraints, 'Constraint'), '',
  ].join('\n');
}
