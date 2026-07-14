const DEFAULT_EXPERIENCE_INDEX = '.vibetether/experience-index.yaml';

function unsupported(message = 'Manifest is outside the canonical YAML subset') {
  throw new Error(message);
}

function mappingSeparator(source) {
  let quote = null;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote === '"') {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quote = null;
      continue;
    }
    if (quote === "'") {
      if (character !== "'") continue;
      if (source[index + 1] === "'") index += 1;
      else quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === ':' && (index === source.length - 1 || source[index + 1] === ' ')) return index;
  }
  return -1;
}

function parseQuotedScalar(source) {
  if (source.startsWith('"')) {
    try {
      const value = JSON.parse(source);
      if (typeof value !== 'string') unsupported();
      return value;
    } catch {
      unsupported('Manifest contains an invalid quoted scalar');
    }
  }
  if (source.startsWith("'")) {
    if (!source.endsWith("'") || source.length < 2) unsupported('Manifest contains an invalid quoted scalar');
    const body = source.slice(1, -1);
    if (body.replaceAll("''", '').includes("'")) unsupported('Manifest contains an invalid quoted scalar');
    return body.replaceAll("''", "'");
  }
  return null;
}

function parseScalar(source, { key = false } = {}) {
  if (!source || source !== source.trim()) unsupported('Manifest contains a non-canonical scalar');
  const quoted = parseQuotedScalar(source);
  if (quoted !== null) return quoted;
  if (/^(?:[-?:](?:$|\s)|[%&*!|>@`#])/.test(source)
      || /[\[\]{},]/.test(source)
      || /:\s|\s#/.test(source)) {
    unsupported('Manifest contains unsupported YAML syntax');
  }
  if (key) return source;
  if (source === 'null' || source === '~') return null;
  if (source === 'true') return true;
  if (source === 'false') return false;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(source)) return Number(source);
  return source;
}

function parseInlineValue(source) {
  if (source === '[]') return [];
  if (source === '{}') return {};
  return parseScalar(source);
}

function tokenize(source) {
  if (typeof source !== 'string') unsupported('Manifest source must be text');
  let normalized = source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (normalized.includes('\r') || normalized.includes('\t')) {
    unsupported('Manifest contains unsupported whitespace');
  }
  if (normalized.endsWith('\n')) normalized = normalized.slice(0, -1);
  if (!normalized || normalized.includes('\n\n')) unsupported('Manifest contains unsupported blank lines');
  const lines = normalized.split('\n').map((line) => {
    if (!line || line !== line.trimEnd()) unsupported('Manifest contains non-canonical whitespace');
    const indent = line.length - line.trimStart().length;
    if (indent % 2 !== 0) unsupported('Manifest contains invalid indentation');
    const content = line.slice(indent);
    if (!content || content.startsWith('#') || content === '---' || content === '...') {
      unsupported('Manifest contains unsupported YAML syntax');
    }
    return { indent, content };
  });
  if (lines[0].indent !== 0) unsupported('Manifest root must not be indented');
  return lines;
}

function parseCanonicalTree(lines) {
  function parseField(content, fieldIndent, nextIndex) {
    const separator = mappingSeparator(content);
    if (separator <= 0) unsupported('Manifest mapping entry is malformed');
    const key = parseScalar(content.slice(0, separator), { key: true });
    if (typeof key !== 'string' || key.length === 0) unsupported('Manifest mapping key is invalid');
    const remainder = content.slice(separator + 1);
    if (remainder === '') {
      if (nextIndex >= lines.length || lines[nextIndex].indent !== fieldIndent + 2) {
        unsupported('Manifest nested value has invalid indentation');
      }
      const parsed = parseNode(nextIndex, fieldIndent + 2);
      return { key, value: parsed.value, next: parsed.next };
    }
    if (!remainder.startsWith(' ') || remainder.startsWith('  ')) {
      unsupported('Manifest mapping scalar spacing is invalid');
    }
    return { key, value: parseInlineValue(remainder.slice(1)), next: nextIndex };
  }

  function addField(target, field) {
    if (Object.hasOwn(target, field.key)) unsupported('Manifest mapping contains a duplicate field');
    target[field.key] = field.value;
  }

  function parseMapping(index, indent) {
    const value = Object.create(null);
    let cursor = index;
    while (cursor < lines.length && lines[cursor].indent === indent && !lines[cursor].content.startsWith('-')) {
      const field = parseField(lines[cursor].content, indent, cursor + 1);
      addField(value, field);
      cursor = field.next;
    }
    if (Object.keys(value).length === 0) unsupported('Manifest mapping must not be empty here');
    return { value, next: cursor };
  }

  function parseSequence(index, indent) {
    const value = [];
    let cursor = index;
    while (cursor < lines.length && lines[cursor].indent === indent) {
      const content = lines[cursor].content;
      if (!content.startsWith('- ')) unsupported('Manifest sequence item is malformed');
      const item = content.slice(2);
      if (!item) unsupported('Manifest sequence item is empty');
      if (mappingSeparator(item) >= 1) {
        const mapping = Object.create(null);
        const first = parseField(item, indent + 2, cursor + 1);
        addField(mapping, first);
        cursor = first.next;
        while (cursor < lines.length && lines[cursor].indent === indent + 2) {
          if (lines[cursor].content.startsWith('-')) unsupported('Manifest list-of-mapping indentation is invalid');
          const field = parseField(lines[cursor].content, indent + 2, cursor + 1);
          addField(mapping, field);
          cursor = field.next;
        }
        value.push(mapping);
      } else {
        value.push(parseScalar(item));
        cursor += 1;
      }
      if (cursor < lines.length && lines[cursor].indent > indent) {
        unsupported('Manifest sequence contains an unsupported nested shape');
      }
    }
    return { value, next: cursor };
  }

  function parseNode(index, indent) {
    if (index >= lines.length || lines[index].indent !== indent) unsupported('Manifest contains invalid indentation');
    return lines[index].content.startsWith('-')
      ? parseSequence(index, indent)
      : parseMapping(index, indent);
  }

  const parsed = parseNode(0, 0);
  if (parsed.next !== lines.length) unsupported('Manifest contains invalid indentation or structure');
  return parsed.value;
}

export function parseCanonicalManifest(source) {
  const manifest = parseCanonicalTree(tokenize(source));
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    unsupported('Manifest must be a mapping');
  }
  if (manifest.schema_version !== 1) unsupported('Manifest schema_version must be 1');
  return manifest;
}

export function authorityRoutesFromManifest(source) {
  const manifest = parseCanonicalManifest(source);
  if (typeof manifest.capability_board !== 'string' || manifest.capability_board.length === 0) {
    unsupported('Manifest requires a capability_board route');
  }
  if (manifest.experience_index !== undefined
      && (typeof manifest.experience_index !== 'string' || manifest.experience_index.length === 0)) {
    unsupported('Manifest experience_index route must be text');
  }
  return {
    manifest,
    capabilityBoard: manifest.capability_board,
    experienceIndex: manifest.experience_index ?? DEFAULT_EXPERIENCE_INDEX,
  };
}
