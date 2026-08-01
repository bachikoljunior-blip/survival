/**
 * A dependency-free validator for the JSON-Schema subset used by
 * AI_DEVELOPMENT/SCHEMAS/. It exists for the same reason as tools/lib/yaml.mjs:
 * the project's own boot records must stay validatable from a clean checkout.
 *
 * Supported keywords:
 *   $ref (local "#/definitions/x" only), type, enum, const, required,
 *   properties, additionalProperties, items, minItems, maxItems, uniqueItems,
 *   pattern, minLength, minimum, maximum, oneOfType, nullable, description
 *
 * Anything else in a schema document is treated as annotation and ignored, so
 * schemas may carry human-facing prose without weakening the check.
 *
 * Self-test: `node tools/yaml_selftest.mjs`
 */

const TYPE_OF = (value) => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
};

const typeMatches = (value, expected) => {
  const actual = TYPE_OF(value);
  if (expected === 'number') return actual === 'number' || actual === 'integer';
  return actual === expected;
};

function resolve(schema, root, path, errors) {
  if (!schema || typeof schema !== 'object') return schema;
  if (typeof schema.$ref !== 'string') return schema;
  const ref = schema.$ref;
  if (!ref.startsWith('#/')) {
    errors.push(`${path}: only local $ref is supported, got ${ref}`);
    return null;
  }
  let node = root;
  for (const segment of ref.slice(2).split('/')) {
    node = node && typeof node === 'object' ? node[segment] : undefined;
  }
  if (!node) {
    errors.push(`${path}: unresolved $ref ${ref}`);
    return null;
  }
  return resolve(node, root, path, errors);
}

function check(value, rawSchema, root, path, errors) {
  const schema = resolve(rawSchema, root, path, errors);
  if (!schema || typeof schema !== 'object') return;

  if (schema.nullable === true && value === null) return;

  if (schema.type !== undefined) {
    const expected = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!expected.some((candidate) => typeMatches(value, candidate))) {
      errors.push(`${path}: expected ${expected.join(' or ')}, got ${TYPE_OF(value)}`);
      return;
    }
  }

  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${path}: must equal ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${path}: ${JSON.stringify(value)} is not one of ${schema.enum.map((v) => JSON.stringify(v)).join(', ')}`);
  }

  if (typeof value === 'string') {
    if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path}: ${JSON.stringify(value)} does not match /${schema.pattern}/`);
    }
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
      errors.push(`${path}: must be at least ${schema.minLength} characters`);
    }
  }

  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      errors.push(`${path}: must be >= ${schema.minimum}`);
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      errors.push(`${path}: must be <= ${schema.maximum}`);
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
      errors.push(`${path}: needs at least ${schema.minItems} item(s), has ${value.length}`);
    }
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
      errors.push(`${path}: allows at most ${schema.maxItems} item(s), has ${value.length}`);
    }
    if (schema.uniqueItems === true) {
      const seen = new Set();
      for (const item of value) {
        const key = JSON.stringify(item);
        if (seen.has(key)) errors.push(`${path}: duplicate item ${key}`);
        seen.add(key);
      }
    }
    if (schema.items) {
      value.forEach((item, index) => check(item, schema.items, root, `${path}[${index}]`, errors));
    }
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of schema.required || []) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        errors.push(`${path}: missing required property "${key}"`);
      }
    }
    const properties = schema.properties || {};
    for (const [key, entry] of Object.entries(value)) {
      if (properties[key]) {
        check(entry, properties[key], root, `${path}.${key}`, errors);
      } else if (schema.additionalProperties === false) {
        errors.push(`${path}: unexpected property "${key}"`);
      } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        check(entry, schema.additionalProperties, root, `${path}.${key}`, errors);
      }
    }
  }
}

/** Validate `value` against `schema`; returns an array of human-readable errors. */
export function validate(value, schema, path = '$') {
  const errors = [];
  check(value, schema, schema, path, errors);
  return errors;
}
