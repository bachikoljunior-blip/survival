/**
 * Parse canonical STATE.yaml with the vendored kit's strict YAML reader.
 *
 * STATE.yaml predates the kit and uses folded block scalars (`>`), while the
 * deliberately small strict reader supports literal block scalars (`|`) only.
 * For structural gate reads, normalize mapping-value folded headers to their
 * literal equivalent before parsing. Chomp mode, indentation, mapping keys and
 * every scalar used by the gates remain unchanged; only prose folding differs.
 * The strict reader then rejects duplicate keys, including quoted/commented
 * spellings that a lexical scan can miss.
 */
import { parseYaml } from '../../.kit/lib/state/yaml.mjs';

export function normalizeStateFoldedScalars(text) {
  return String(text).replace(
    /^(\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^:#]+):\s*)>([-+]?)(\s*(?:#.*)?)$/gm,
    '$1|$2$3',
  );
}

export function parseStrictStateYaml(text, path = 'AI_DEVELOPMENT/STATE.yaml') {
  const parsed = parseYaml(normalizeStateFoldedScalars(text), { path });

  // Canonical operating-state keys are deliberately plain ASCII identifiers.
  // Reject everything else after parsing, rather than trying to enumerate all
  // YAML-equivalent spellings (tags, anchors, aliases and \x/\U escapes). Also
  // reject a nonstandard object prototype: the small vendored parser uses `{}`
  // mappings, so a raw `__proto__` key would otherwise affect inherited reads.
  const visit = (value, at) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${at}[${index}]`));
      return;
    }
    if (value === null || typeof value !== 'object') return;
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      throw new SyntaxError(`${path}: unsafe mapping prototype at ${at}`);
    }
    for (const key of Object.keys(value)) {
      if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(key) || key === '__proto__') {
        throw new SyntaxError(`${path}: unsupported mapping key ${JSON.stringify(key)} at ${at}; use a plain ASCII identifier`);
      }
      visit(value[key], `${at}.${key}`);
    }
  };
  visit(parsed, '$');
  return parsed;
}

export function ownScalar(mapping, key) {
  return mapping && typeof mapping === 'object' && !Array.isArray(mapping)
    && Object.hasOwn(mapping, key)
    ? mapping[key]
    : undefined;
}
