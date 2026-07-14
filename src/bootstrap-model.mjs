const SYNTHETIC_SOURCES = new Set([
  'AGENTS.md',
  'CLAUDE.md',
  '.vibetether/intent.md',
]);

const SAFE_CONSTRAINTS = [
  'Preserve existing project instructions and higher-authority decisions.',
  'Confirm destructive actions and releases before execution.',
];

const SCOPE_RECOMMENDATION = 'Preserve existing instructions; confirm destructive actions and releases.';
const CANONICAL_ANSWER_KEYS = [
  'goal',
  'success_evidence',
  'scope_boundaries',
  'constraints',
  'visual_direction',
];

const QUESTION_DEFINITIONS = {
  goal: {
    id: 'goal',
    prompt: 'Who should this project help, and what outcome should they achieve?',
    required: true,
    recommended: null,
    answered: false,
  },
  success_evidence: {
    id: 'success_evidence',
    prompt: 'What fresh evidence would make the first milestone successful?',
    required: true,
    recommended: null,
    answered: false,
  },
  scope_boundaries: {
    id: 'scope_boundaries',
    prompt: 'What is explicitly out of scope or must not be weakened?',
    required: false,
    recommended: SCOPE_RECOMMENDATION,
    answered: false,
  },
  visual_direction: {
    id: 'visual_direction',
    prompt: 'What existing brand, reference, or visual direction governs the interface?',
    required: false,
    recommended: null,
    answered: false,
  },
};

const MISSING = {
  goal: 'No project goal has been recorded yet.',
  success_evidence: 'No acceptance evidence has been recorded yet.',
  scope_boundaries: 'No additional boundaries have been recorded yet.',
  visual_direction: 'No visual direction has been recorded yet.',
};

function normalizeScalar(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function normalizeStringList(value) {
  return [...new Set(value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean))];
}

function normalizeListInput(value) {
  if (Array.isArray(value)) return normalizeStringList(value);
  return normalizeScalar(value);
}

function hasAnswer(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined && value !== '';
}

function asList(value) {
  if (Array.isArray(value)) return value;
  return hasAnswer(value) ? [value] : [];
}

function normalizeConstraints(value) {
  const custom = asList(normalizeListInput(value)).filter((constraint) => !SAFE_CONSTRAINTS.includes(constraint));
  return [...new Set([...custom, ...SAFE_CONSTRAINTS])];
}

function normalizeAnswers(input = {}) {
  return {
    goal: normalizeScalar(input.goal),
    success_evidence: normalizeScalar(input.success_evidence ?? input.successEvidence),
    scope_boundaries: normalizeListInput(input.scope_boundaries ?? input.scopeBoundaries),
    constraints: normalizeConstraints(input.constraints),
    visual_direction: normalizeScalar(input.visual_direction ?? input.visualDirection),
  };
}

function bundleSignals(discovery) {
  if (!discovery || typeof discovery !== 'object') return [];
  for (const candidate of [discovery.bundle_signals, discovery.bundleSignals]) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function sourceEntries(discovery) {
  if (!discovery || typeof discovery !== 'object') return [];
  const sourceMap = discovery.discovery && typeof discovery.discovery === 'object'
    ? discovery.discovery
    : discovery;
  return Object.entries(sourceMap).filter(([, metadata]) => (
    metadata
    && typeof metadata === 'object'
    && !Array.isArray(metadata)
    && ('role' in metadata || 'kind' in metadata || 'confidence' in metadata)
  ));
}

function declaredSourcePaths(discovery) {
  const sources = discovery?.sources;
  if (!sources || typeof sources !== 'object') return [];
  const conditional = sources.conditional && typeof sources.conditional === 'object'
    ? Object.values(sources.conditional).flatMap((value) => (Array.isArray(value) ? value : []))
    : [];
  return [
    ...(Array.isArray(sources.always) ? sources.always : []),
    ...conditional,
  ];
}

function normalizedPath(value) {
  return String(value).replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
}

function isGreenfield(discovery) {
  if (discovery?.project_state !== 'greenfield') return false;
  if (bundleSignals(discovery).length > 0) return false;
  const paths = [
    ...sourceEntries(discovery).map(([sourcePath]) => sourcePath),
    ...declaredSourcePaths(discovery),
  ];
  return paths.every((sourcePath) => SYNTHETIC_SOURCES.has(normalizedPath(sourcePath)));
}

function hasWebVisualEvidence(discovery) {
  const highConfidenceWebBundle = bundleSignals(discovery).some((signal) => (
    signal
    && typeof signal === 'object'
    && String(signal.bundle).toLowerCase() === 'web'
    && String(signal.confidence).toLowerCase() === 'high'
  ));
  if (highConfidenceWebBundle) return true;

  const discoveredUiSpecification = sourceEntries(discovery).some(([sourcePath, metadata]) => {
    const role = String(metadata.role ?? '').toLowerCase();
    return role.includes('user interface specification')
      || role.includes('ui specification')
      || /(^|\/)docs\/(ui|ux)-(spec|design)\.md$/i.test(normalizedPath(sourcePath));
  });
  if (discoveredUiSpecification) return true;

  const declaredUi = discovery?.sources?.conditional?.ui;
  return Array.isArray(declaredUi) && declaredUi.length > 0;
}

function question(key) {
  return { ...QUESTION_DEFINITIONS[key] };
}

export function buildBootstrapModel({ discovery, input = {} }) {
  const answers = normalizeAnswers(input);
  const questions = [];

  for (const key of ['goal', 'success_evidence', 'scope_boundaries']) {
    if (!hasAnswer(answers[key])) questions.push(question(key));
  }
  if (hasWebVisualEvidence(discovery) && !hasAnswer(answers.visual_direction)) {
    questions.push(question('visual_direction'));
  }

  return {
    greenfield: isGreenfield(discovery),
    ready: hasAnswer(answers.goal) && hasAnswer(answers.success_evidence),
    answers,
    questions,
  };
}

function renderValue(value, missingMessage) {
  if (!hasAnswer(value)) return missingMessage;
  if (Array.isArray(value)) return value.map((item) => `- ${item}`).join('\n');
  return String(value);
}

function renderMetadata(answers) {
  const payload = Buffer.from(JSON.stringify(answers), 'utf8').toString('base64url');
  return `<!-- vibetether:intent:v1 ${payload} -->`;
}

function openDirectionDecisions(answers) {
  const missingRequired = [
    !hasAnswer(answers.goal) ? 'goal' : null,
    !hasAnswer(answers.success_evidence) ? 'success evidence' : null,
  ].filter(Boolean);
  const decisions = [];

  if (missingRequired.length === 2) {
    decisions.push('Confirm the goal and success evidence before consequential product work.');
  } else if (missingRequired.length === 1) {
    decisions.push(`Confirm the ${missingRequired[0]} before consequential product work.`);
  }
  return decisions.length > 0
    ? decisions.map((decision) => `- ${decision}`).join('\n')
    : 'No open direction decisions.';
}

export function renderIntentContract(input = {}) {
  const answers = normalizeAnswers(input);
  const status = hasAnswer(answers.goal) && hasAnswer(answers.success_evidence)
    ? 'confirmed'
    : 'unresolved';

  return `# VibeTether Intent Contract

Status: ${status}
${renderMetadata(answers)}

This contract is the durable statement of direction for long-running agent work. Resolve product ambiguity with the user before changing consequential behavior.

## Goal

${renderValue(answers.goal, MISSING.goal)}

## Success evidence

${renderValue(answers.success_evidence, MISSING.success_evidence)}

## Scope boundaries

${renderValue(answers.scope_boundaries, MISSING.scope_boundaries)}

## Non-negotiable constraints

${renderValue(answers.constraints, '')}

## Visual direction

${renderValue(answers.visual_direction, MISSING.visual_direction)}

## Open direction decisions

${openDirectionDecisions(answers)}
`;
}

function sections(source) {
  const result = new Map();
  const normalized = String(source ?? '').replaceAll('\r\n', '\n');
  for (const part of normalized.split(/^## /m).slice(1)) {
    const newline = part.indexOf('\n');
    if (newline === -1) continue;
    result.set(part.slice(0, newline).trim(), part.slice(newline + 1).trim());
  }
  return result;
}

function parseValue(value, missingMessage) {
  if (!value || value === missingMessage) return null;
  const lines = value.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length > 0 && lines.every((line) => line.startsWith('- '))) {
    return normalizeStringList(lines.map((line) => line.slice(2)));
  }
  return normalizeScalar(value);
}

function invalidMetadata(reason) {
  throw new Error(`Invalid VibeTether intent metadata: ${reason}`);
}

function validateMetadataAnswers(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalidMetadata('the v1 payload must be an object');
  }
  const keys = Object.keys(value);
  if (keys.length !== CANONICAL_ANSWER_KEYS.length
    || !CANONICAL_ANSWER_KEYS.every((key, index) => keys[index] === key)) {
    invalidMetadata('the v1 payload must contain only canonical answer fields in canonical order');
  }
  for (const key of ['goal', 'success_evidence', 'visual_direction']) {
    if (value[key] !== null && typeof value[key] !== 'string') {
      invalidMetadata(`${key} must be a string or null`);
    }
  }
  if (value.scope_boundaries !== null
    && typeof value.scope_boundaries !== 'string'
    && !(Array.isArray(value.scope_boundaries)
      && value.scope_boundaries.every((item) => typeof item === 'string'))) {
    invalidMetadata('scope_boundaries must be a string, an array of strings, or null');
  }
  if (!Array.isArray(value.constraints)
    || !value.constraints.every((item) => typeof item === 'string')) {
    invalidMetadata('constraints must be an array of strings');
  }
  return normalizeAnswers(value);
}

function parseMetadata(source) {
  const normalized = String(source ?? '').replaceAll('\r\n', '\n');
  const prefixMatches = normalized.match(/<!-- vibetether:intent:/g) ?? [];
  if (prefixMatches.length === 0) return null;
  const markerMatches = [...normalized.matchAll(/<!-- vibetether:intent:v1 ([A-Za-z0-9_-]+) -->/g)];
  if (prefixMatches.length !== 1 || markerMatches.length !== 1) {
    invalidMetadata('expected exactly one well-formed v1 marker');
  }

  const payload = markerMatches[0][1];
  let decoded;
  try {
    const bytes = Buffer.from(payload, 'base64url');
    if (bytes.toString('base64url') !== payload) invalidMetadata('the v1 payload is not canonical base64url');
    decoded = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    if (error.message.startsWith('Invalid VibeTether intent metadata:')) throw error;
    invalidMetadata('the v1 payload is not valid base64url JSON');
  }
  return validateMetadataAnswers(decoded);
}

function inputShape(answers) {
  return {
    goal: answers.goal,
    successEvidence: answers.success_evidence,
    scopeBoundaries: answers.scope_boundaries,
    constraints: answers.constraints,
    visualDirection: answers.visual_direction,
  };
}

export function parseIntentContract(source) {
  const metadata = parseMetadata(source);
  if (metadata) return inputShape(metadata);

  const parsed = sections(source);
  return inputShape(normalizeAnswers({
    goal: parseValue(parsed.get('Goal'), MISSING.goal),
    success_evidence: parseValue(parsed.get('Success evidence'), MISSING.success_evidence),
    scope_boundaries: parseValue(parsed.get('Scope boundaries'), MISSING.scope_boundaries),
    constraints: parseValue(parsed.get('Non-negotiable constraints'), '') ?? [],
    visual_direction: parseValue(parsed.get('Visual direction'), MISSING.visual_direction),
  }));
}

export function unresolvedIntent() {
  return renderIntentContract({});
}
