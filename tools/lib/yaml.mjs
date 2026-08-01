/**
 * A deterministic parser for the restricted YAML subset used by the canonical
 * operating records under AI_DEVELOPMENT/.
 *
 * Why this exists: the operating records are YAML by protocol, the repository
 * ships zero runtime dependencies and only five locked dev packages, and adding
 * a YAML dependency for state validation would put a network install between the
 * project and its own boot files. This module keeps `npm run validate:ops`
 * runnable from a clean checkout with nothing but Node.
 *
 * Supported, deliberately and no more:
 *   - block mappings and block sequences, nested by space indentation
 *   - plain, single-quoted and double-quoted scalars
 *   - block scalars: | |- |+ > >- >+
 *   - flow collections on one line: [a, b]  {k: v}
 *   - null (`null`, `~`, empty), booleans, integers, floats
 *   - `#` comments, at line start or after whitespace outside quotes
 *
 * Deliberately rejected, because silently accepting them would let two records
 * drift apart without the validator noticing:
 *   - tab indentation, anchors, aliases, tags, multiple documents,
 *     duplicate mapping keys, inconsistent indentation
 *
 * Self-test: `node tools/yaml_selftest.mjs`
 */

export class YamlError extends Error {
  constructor(message, line) {
    super(line === undefined ? message : `line ${line + 1}: ${message}`);
    this.name = 'YamlError';
    this.line = line;
  }
}

const PLAIN_INT = /^[+-]?\d+$/;
const PLAIN_FLOAT = /^[+-]?(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)?$/;

/** Cut a trailing `# comment` that is not inside quotes. */
function stripComment(text) {
  let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\' && quote === '"') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '#' && (i === 0 || /\s/.test(text[i - 1]))) return text.slice(0, i);
  }
  return text;
}

/**
 * Index of the `:` that separates a mapping key from its value, or -1.
 * The colon must be followed by a space or end the line, and must sit outside
 * quotes and outside any flow collection.
 */
function keyColon(text) {
  let quote = null;
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\' && quote === '"') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '[' || ch === '{') depth += 1;
    else if (ch === ']' || ch === '}') depth -= 1;
    else if (ch === ':' && depth === 0 && (i + 1 === text.length || text[i + 1] === ' ')) return i;
  }
  return -1;
}

function unescapeDouble(body, line) {
  let out = '';
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const next = body[i + 1];
    i += 1;
    if (next === 'n') out += '\n';
    else if (next === 't') out += '\t';
    else if (next === 'r') out += '\r';
    else if (next === '0') out += '\0';
    else if (next === '"') out += '"';
    else if (next === '\\') out += '\\';
    else if (next === '/') out += '/';
    else if (next === 'u') {
      const hex = body.slice(i + 1, i + 5);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new YamlError(`bad \\u escape`, line);
      out += String.fromCharCode(parseInt(hex, 16));
      i += 4;
    } else throw new YamlError(`unsupported escape \\${next}`, line);
  }
  return out;
}

/** Split a flow body on top-level commas. */
function splitFlow(body, line) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (quote) {
      if (ch === '\\' && quote === '"') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '[' || ch === '{') depth += 1;
    else if (ch === ']' || ch === '}') depth -= 1;
    else if (ch === ',' && depth === 0) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
  }
  if (quote) throw new YamlError('unterminated quote in flow collection', line);
  if (depth !== 0) throw new YamlError('unbalanced brackets in flow collection', line);
  const tail = body.slice(start);
  if (tail.trim() !== '' || parts.length > 0) parts.push(tail);
  return parts;
}

function parseScalar(rawText, line) {
  const text = stripComment(rawText).trim();
  if (text === '') return null;

  if (text.startsWith('[')) {
    if (!text.endsWith(']')) throw new YamlError('unterminated flow sequence', line);
    const inner = text.slice(1, -1).trim();
    if (inner === '') return [];
    return splitFlow(inner, line).map((part) => parseScalar(part, line));
  }

  if (text.startsWith('{')) {
    if (!text.endsWith('}')) throw new YamlError('unterminated flow mapping', line);
    const inner = text.slice(1, -1).trim();
    const out = {};
    if (inner === '') return out;
    for (const part of splitFlow(inner, line)) {
      const colon = keyColon(part.trim());
      if (colon < 0) throw new YamlError(`flow mapping entry needs "key: value": ${part.trim()}`, line);
      const key = parseKey(part.trim().slice(0, colon), line);
      if (Object.prototype.hasOwnProperty.call(out, key)) throw new YamlError(`duplicate key ${key}`, line);
      out[key] = parseScalar(part.trim().slice(colon + 1), line);
    }
    return out;
  }

  if (text.startsWith('"')) {
    if (text.length < 2 || !text.endsWith('"')) throw new YamlError('unterminated double-quoted scalar', line);
    return unescapeDouble(text.slice(1, -1), line);
  }

  if (text.startsWith("'")) {
    if (text.length < 2 || !text.endsWith("'")) throw new YamlError('unterminated single-quoted scalar', line);
    return text.slice(1, -1).replace(/''/g, "'");
  }

  if (text === 'null' || text === '~') return null;
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (PLAIN_INT.test(text)) return Number(text);
  if (PLAIN_FLOAT.test(text)) return Number(text);
  return text;
}

function parseKey(rawKey, line) {
  const key = rawKey.trim();
  if (key === '') throw new YamlError('empty mapping key', line);
  if (key.startsWith('"') || key.startsWith("'")) {
    const value = parseScalar(key, line);
    if (typeof value !== 'string') throw new YamlError('quoted key must be a string', line);
    return value;
  }
  if (/[#[\]{}]/.test(key)) throw new YamlError(`unsupported character in key: ${key}`, line);
  return key;
}

export function parseYaml(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const indents = lines.map((raw, n) => {
    if (/^\s*$/.test(raw)) return -1;
    const lead = /^[ \t]*/.exec(raw)[0];
    if (lead.includes('\t')) throw new YamlError('tab indentation is not supported', n);
    return lead.length;
  });

  let i = 0;

  const isSkippable = (n) => n < lines.length && (indents[n] === -1 || lines[n].trimStart().startsWith('#'));
  const skip = () => {
    while (i < lines.length && isSkippable(i)) i += 1;
  };
  const body = (n) => lines[n].slice(indents[n]);

  function readBlockScalar(header, parentIndent, headerLine) {
    const style = header[0];
    const chomp = header.slice(1);
    if (!'|>'.includes(style)) throw new YamlError(`unsupported block scalar ${header}`, headerLine);
    if (chomp !== '' && chomp !== '-' && chomp !== '+') {
      throw new YamlError(`unsupported block scalar indicator ${header}`, headerLine);
    }

    const collected = [];
    let contentIndent = null;
    while (i < lines.length) {
      if (indents[i] === -1) {
        collected.push('');
        i += 1;
        continue;
      }
      if (indents[i] <= parentIndent) break;
      if (contentIndent === null) contentIndent = indents[i];
      if (indents[i] < contentIndent) break;
      collected.push(lines[i].slice(contentIndent));
      i += 1;
    }
    while (collected.length && collected[collected.length - 1] === '') collected.pop();
    if (!collected.length) return '';

    let out;
    if (style === '|') {
      out = collected.join('\n');
    } else {
      out = '';
      for (let n = 0; n < collected.length; n += 1) {
        const current = collected[n];
        if (n === 0) out = current;
        else if (current === '' || collected[n - 1] === '') out += `\n${current}`;
        else out += ` ${current}`;
      }
      out = out.replace(/\n{2,}/g, (match) => match.slice(1));
    }
    if (chomp === '-') return out;
    return `${out}\n`;
  }

  function parseNode(minIndent) {
    skip();
    if (i >= lines.length) return null;
    const indent = indents[i];
    if (indent < minIndent) return null;
    return body(i).startsWith('-') && (body(i).length === 1 || body(i)[1] === ' ')
      ? parseSequence(indent)
      : parseMapping(indent);
  }

  function parseMapping(indent) {
    const out = {};
    for (;;) {
      skip();
      if (i >= lines.length) break;
      if (indents[i] < indent) break;
      if (indents[i] > indent) throw new YamlError(`unexpected indentation inside mapping`, i);
      const content = body(i);
      if (content.startsWith('- ') || content === '-') {
        throw new YamlError('sequence item where a mapping key was expected', i);
      }
      const colon = keyColon(content);
      if (colon < 0) throw new YamlError(`expected "key: value", got: ${content}`, i);
      const key = parseKey(content.slice(0, colon), i);
      if (Object.prototype.hasOwnProperty.call(out, key)) throw new YamlError(`duplicate key ${key}`, i);
      const rest = content.slice(colon + 1).trim();
      const headerLine = i;
      i += 1;

      if (/^[|>][-+]?$/.test(stripComment(rest).trim()) && rest !== '') {
        out[key] = readBlockScalar(stripComment(rest).trim(), indent, headerLine);
      } else if (stripComment(rest).trim() === '') {
        const nested = parseNode(indent + 1);
        out[key] = nested;
      } else {
        out[key] = parseScalar(rest, headerLine);
      }
    }
    return out;
  }

  function parseSequence(indent) {
    const out = [];
    for (;;) {
      skip();
      if (i >= lines.length) break;
      if (indents[i] < indent) break;
      if (indents[i] > indent) throw new YamlError('unexpected indentation inside sequence', i);
      const content = body(i);
      if (!content.startsWith('-') || (content.length > 1 && content[1] !== ' ')) break;

      const match = /^-( *)(.*)$/.exec(content);
      const itemBody = match[2];
      const innerIndent = indent + 1 + match[1].length;
      const headerLine = i;

      if (stripComment(itemBody).trim() === '') {
        i += 1;
        out.push(parseNode(indent + 1));
        continue;
      }
      if (/^[|>][-+]?$/.test(stripComment(itemBody).trim())) {
        i += 1;
        out.push(readBlockScalar(stripComment(itemBody).trim(), indent, headerLine));
        continue;
      }
      if (keyColon(itemBody) >= 0) {
        // Rewrite `- key: value` as a mapping line at the item's own column so
        // the mapping parser can continue it with the following lines.
        lines[i] = ' '.repeat(innerIndent) + itemBody;
        indents[i] = innerIndent;
        out.push(parseMapping(innerIndent));
        continue;
      }
      if (itemBody.startsWith('- ')) {
        lines[i] = ' '.repeat(innerIndent) + itemBody;
        indents[i] = innerIndent;
        out.push(parseSequence(innerIndent));
        continue;
      }
      i += 1;
      out.push(parseScalar(itemBody, headerLine));
    }
    return out;
  }

  skip();
  if (i >= lines.length) return null;
  if (indents[i] !== 0) throw new YamlError('document must start at column 0', i);
  const value = parseNode(0);
  skip();
  if (i < lines.length) throw new YamlError(`trailing content: ${body(i)}`, i);
  return value;
}

/** Parse newline-delimited JSON, returning `{ value, line }` records. */
export function parseJsonl(text) {
  const out = [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  for (let n = 0; n < lines.length; n += 1) {
    const raw = lines[n];
    if (raw.trim() === '') continue;
    try {
      out.push({ value: JSON.parse(raw), line: n + 1 });
    } catch (error) {
      throw new YamlError(`invalid JSON on ledger line ${n + 1}: ${error.message}`);
    }
  }
  return out;
}
